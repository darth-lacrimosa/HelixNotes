import { EditorSelection, EditorState, StateField, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

/*
 * Live Preview tables. A top-level GFM table is drawn as an HTML table while the caret is elsewhere and
 * turns back into its Markdown source as soon as the selection touches it (like every other Live Preview
 * construct). The document is never rewritten by rendering.
 */

export type TableAlign = 'left' | 'center' | 'right' | null;
export interface ParsedTable { align: TableAlign[]; header: string[]; rows: string[][] }

export interface TablePreviewOptions { openLink?: (href: string) => void }

const inline = new MarkdownIt({ html: false, linkify: false });

function splitRow(line: string): string[] {
	let text = line.trim();
	if (text.startsWith('|')) text = text.slice(1);
	if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
	return text.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

/** Parse the Markdown source of one GFM table; null when it is not a well-formed table. */
export function parseTable(source: string): ParsedTable | null {
	const lines = source.split('\n').filter((line) => line.trim() !== '');
	if (lines.length < 2) return null;
	const header = splitRow(lines[0]);
	const delimiter = splitRow(lines[1]);
	if (!delimiter.length || !delimiter.every((cell) => /^:?-+:?$/.test(cell))) return null;
	const width = header.length;
	const align = Array.from({ length: width }, (_, index): TableAlign => {
		const cell = delimiter[index] ?? '';
		const left = cell.startsWith(':'), right = cell.endsWith(':');
		return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
	});
	const fit = (cells: string[]) => Array.from({ length: width }, (_, index) => cells[index] ?? '');
	return { align, header, rows: lines.slice(2).map((line) => fit(splitRow(line))) };
}

/** Top-level tables that should currently be drawn: all of them when read-only, else those the selection does not touch. */
export function renderedTables(state: EditorState): { from: number; to: number; table: ParsedTable }[] {
	const found: { from: number; to: number; table: ParsedTable }[] = [];
	syntaxTree(state).iterate({
		enter(ref) {
			if (ref.name === 'Document') return true;
			if (ref.name === 'Table') {
				const { from, to } = ref;
				const touched = !state.readOnly && state.selection.ranges.some((range) => range.from <= to && range.to >= from);
				const table = touched ? null : parseTable(state.sliceDoc(from, to));
				if (table) found.push({ from, to, table });
			}
			return false;
		},
	});
	return found;
}

class TableWidget extends WidgetType {
	readonly table: ParsedTable;
	readonly from: number;
	readonly source: string;
	readonly options: TablePreviewOptions;
	constructor(table: ParsedTable, from: number, source: string, options: TablePreviewOptions) {
		super(); this.table = table; this.from = from; this.source = source; this.options = options;
	}
	eq(other: TableWidget) { return this.from === other.from && this.source === other.source; }
	get estimatedHeight() { return (this.table.rows.length + 1) * 38; }
	toDOM(view: EditorView) {
		const wrap = document.createElement('div');
		wrap.className = 'lp-table-wrap';
		const table = document.createElement('table');
		table.className = 'lp-table';
		const fill = (cell: HTMLElement, text: string, align: TableAlign) => {
			cell.innerHTML = DOMPurify.sanitize(inline.renderInline(text), { ALLOWED_TAGS: ['strong', 'em', 'code', 'del', 'a', 'br'], ALLOWED_ATTR: ['href'] });
			if (align) cell.style.textAlign = align;
		};
		const head = table.createTHead().insertRow();
		head.dataset.row = '0';
		this.table.header.forEach((text, index) => fill(head.appendChild(document.createElement('th')), text, this.table.align[index]));
		const body = table.createTBody();
		this.table.rows.forEach((cells, rowIndex) => {
			const row = body.insertRow();
			row.dataset.row = String(rowIndex + 1);
			cells.forEach((text, index) => fill(row.insertCell(), text, this.table.align[index]));
		});
		wrap.appendChild(table);
		wrap.onmousedown = (event) => {
			event.preventDefault();
			const anchor = (event.target as Element).closest?.('a[href]');
			if ((event.ctrlKey || event.metaKey) && anchor && this.options.openLink) {
				this.options.openLink(anchor.getAttribute('href')!);
				return;
			}
			// Reveal the source on the clicked row (the delimiter line sits between header and body).
			const row = Number((event.target as Element).closest<HTMLElement>('tr')?.dataset.row ?? 0);
			const start = view.state.doc.lineAt(this.from).number;
			const line = view.state.doc.line(Math.min(view.state.doc.lines, start + (row === 0 ? 0 : row + 1)));
			view.dispatch({ selection: EditorSelection.cursor(Math.min(line.to, line.from + 2)), scrollIntoView: true });
			view.focus();
		};
		return wrap;
	}
	ignoreEvent() { return true; }
}

export function tablePreview(options: TablePreviewOptions = {}): Extension {
	const build = (state: EditorState): DecorationSet => {
		const ranges: Range<Decoration>[] = renderedTables(state).map(({ from, to, table }) =>
			Decoration.replace({ widget: new TableWidget(table, from, state.sliceDoc(from, to), options), block: true }).range(from, to));
		return Decoration.set(ranges, true);
	};
	const field = StateField.define<DecorationSet>({
		create: build,
		update(value, transaction) {
			return transaction.docChanged || transaction.selection || transaction.reconfigured
				|| syntaxTree(transaction.state) !== syntaxTree(transaction.startState) ? build(transaction.state) : value;
		},
		provide: (self) => EditorView.decorations.from(self),
	});
	return field;
}
