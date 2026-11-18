import { EditorSelection, type ChangeSpec, type EditorState, type SelectionRange, type StateCommand, type TransactionSpec } from '@codemirror/state';
import { indentLess, indentMore, redo, undo } from '@codemirror/commands';

/*
 * Formatting commands for the Markdown (Source / Live Preview) editor. Each one edits the Markdown text
 * itself, so there is no second representation: the toolbar is only a memory aid for the syntax.
 */

type Plan = (state: EditorState) => TransactionSpec | null;

function command(plan: Plan): StateCommand {
	return ({ state, dispatch }) => {
		if (state.readOnly) return false;
		const spec = plan(state);
		if (!spec) return false;
		dispatch(state.update({ ...spec, scrollIntoView: true, userEvent: 'input.format' }));
		return true;
	};
}

/** A range from `from` to `to` that keeps the direction of `like`. */
function directed(like: SelectionRange, from: number, to: number): SelectionRange {
	return like.anchor <= like.head ? EditorSelection.range(from, to) : EditorSelection.range(to, from);
}

/** Wrap or unwrap the selection with an inline marker; with no selection, insert the pair and sit between. */
export function toggleWrap(open: string, close = open): StateCommand {
	// `*` is also the first character of `**`: those belong to bold, not to italic.
	const asterisk = open === '*';
	return command((state) => state.changeByRange((range) => {
		const doc = state.doc;
		const text = doc.sliceString(range.from, range.to);
		const before = doc.sliceString(Math.max(0, range.from - open.length), range.from);
		const after = doc.sliceString(range.to, Math.min(doc.length, range.to + close.length));
		const stray = asterisk && (doc.sliceString(Math.max(0, range.from - open.length - 1), range.from - open.length) === '*'
			|| doc.sliceString(range.to + close.length, range.to + close.length + 1) === '*');
		if (before === open && after === close && !stray) {
			return {
				changes: [{ from: range.from - open.length, to: range.from }, { from: range.to, to: range.to + close.length }],
				range: directed(range, range.from - open.length, range.to - open.length),
			};
		}
		if (!range.empty && text.length >= open.length + close.length && text.startsWith(open) && text.endsWith(close)
			&& !(asterisk && text.startsWith('**'))) {
			return {
				changes: [{ from: range.from, to: range.from + open.length }, { from: range.to - close.length, to: range.to }],
				range: directed(range, range.from, range.to - open.length - close.length),
			};
		}
		if (range.empty) {
			return { changes: { from: range.from, insert: open + close }, range: EditorSelection.cursor(range.from + open.length) };
		}
		return {
			changes: [{ from: range.from, insert: open }, { from: range.to, insert: close }],
			range: directed(range, range.from + open.length, range.to + open.length),
		};
	}));
}

/** `[label](url)`: the label is the selection and `url` ends up selected, ready to be typed over. */
export const insertLink: StateCommand = command((state) => state.changeByRange((range) => {
	if (range.empty) {
		return { changes: { from: range.from, insert: '[](url)' }, range: EditorSelection.cursor(range.from + 1) };
	}
	const url = range.to + 3;
	return {
		changes: [{ from: range.from, insert: '[' }, { from: range.to, insert: '](url)' }],
		range: EditorSelection.range(url, url + 3),
	};
}));

interface LineInfo { from: number; to: number; text: string }

/** Lines touched by any selection range. A range ending at the start of a line does not include that line. */
function selectedLines(state: EditorState): LineInfo[] {
	const seen = new Set<number>();
	const lines: LineInfo[] = [];
	for (const range of state.selection.ranges) {
		const start = state.doc.lineAt(range.from).number;
		let end = state.doc.lineAt(range.to).number;
		if (end > start && range.to === state.doc.line(end).from) end--;
		for (let number = start; number <= end; number++) {
			if (seen.has(number)) continue;
			seen.add(number);
			const line = state.doc.line(number);
			lines.push({ from: line.from, to: line.to, text: line.text });
		}
	}
	return lines;
}

/** Blank lines are skipped when several lines are selected, but a lone empty line is still formatted. */
function targetLines(state: EditorState): LineInfo[] {
	const lines = selectedLines(state);
	const filled = lines.filter((line) => line.text.trim() !== '');
	return lines.length > 1 ? filled : lines;
}

const HEADING = /^#{1,6}[ \t]+/;
const BULLET = /^(\s*)[-*+][ \t]+(?!\[[ xX]\][ \t])/;
const TASK = /^(\s*)[-*+][ \t]+\[[ xX]\][ \t]+/;
const ORDERED = /^(\s*)\d+[.)][ \t]+/;
const LIST_ANY = /^(\s*)(?:[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/;
const QUOTE = /^(\s*)>[ \t]?/;

/** Heading level 1-6, or 0 for a plain paragraph. Choosing the current level again removes it. */
export function setHeading(level: number): StateCommand {
	return command((state) => {
		const lines = targetLines(state);
		if (!lines.length) return null;
		const marker = level > 0 ? `${'#'.repeat(level)} ` : '';
		const same = level > 0 && lines.every((line) => new RegExp(`^#{${level}}[ \\t]`).test(line.text));
		const changes: ChangeSpec[] = [];
		for (const line of lines) {
			const existing = HEADING.exec(line.text)?.[0].length ?? 0;
			const insert = same ? '' : marker;
			if (existing || insert) changes.push({ from: line.from, to: line.from + existing, insert });
		}
		return changes.length ? { changes } : null;
	});
}

export function toggleList(kind: 'bullet' | 'ordered' | 'task'): StateCommand {
	const detect = kind === 'bullet' ? BULLET : kind === 'task' ? TASK : ORDERED;
	return command((state) => {
		const lines = targetLines(state);
		if (!lines.length) return null;
		const remove = lines.every((line) => detect.test(line.text));
		let number = 0;
		const changes: ChangeSpec[] = lines.map((line) => {
			const existing = LIST_ANY.exec(line.text);
			const indent = existing ? existing[1].length : /^\s*/.exec(line.text)![0].length;
			const end = existing ? existing[0].length : indent;
			const marker = remove ? '' : kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${++number}. `;
			return { from: line.from + indent, to: line.from + end, insert: marker };
		});
		return { changes };
	});
}

export const toggleQuote: StateCommand = command((state) => {
	const lines = targetLines(state);
	if (!lines.length) return null;
	const remove = lines.every((line) => QUOTE.test(line.text));
	return {
		changes: lines.map((line): ChangeSpec => {
			if (!remove) return { from: line.from, insert: '> ' };
			const match = QUOTE.exec(line.text)!;
			return { from: line.from + match[1].length, to: line.from + match[0].length };
		}),
	};
});

/** Fence the selected lines, or remove the fences when the selection already sits inside a block. */
export const toggleCodeBlock: StateCommand = command((state) => {
	const { doc } = state;
	const range = state.selection.main;
	const first = doc.lineAt(range.from);
	let last = doc.lineAt(range.to);
	if (last.number > first.number && range.to === last.from) last = doc.line(last.number - 1);
	const above = first.number > 1 ? doc.line(first.number - 1) : null;
	const below = last.number < doc.lines ? doc.line(last.number + 1) : null;
	if (above && below && /^\s*(```|~~~)/.test(above.text) && /^\s*(```|~~~)\s*$/.test(below.text)) {
		return { changes: [{ from: above.from, to: first.from }, { from: last.to, to: below.to }] };
	}
	if (range.empty) {
		const atLineStart = range.from === first.from;
		const insert = `${atLineStart ? '' : '\n'}\`\`\`\n\n\`\`\``;
		return { changes: { from: range.from, insert }, selection: EditorSelection.cursor(range.from + insert.length - 4) };
	}
	return { changes: [{ from: first.from, insert: '```\n' }, { from: last.to, insert: '\n```' }] };
});

/** Insert a block on its own lines below the caret's line (or in place on an empty line). */
function insertBlock(state: EditorState, block: string, select?: (start: number) => SelectionRange): TransactionSpec {
	const line = state.doc.lineAt(state.selection.main.head);
	const blank = line.text.trim() === '';
	const from = blank ? line.from : line.to;
	const insert = `${blank ? '' : '\n\n'}${block}\n`;
	const start = from + (blank ? 0 : 2);
	return {
		changes: { from: blank ? line.from : line.to, to: blank ? line.to : line.to, insert },
		selection: select ? select(start) : EditorSelection.cursor(from + insert.length),
	};
}

export const insertRule: StateCommand = command((state) => insertBlock(state, '---'));

export function insertTable(rows = 3, columns = 3): StateCommand {
	return command((state) => {
		const cells = (fill: (column: number) => string) => `| ${Array.from({ length: columns }, (_, column) => fill(column)).join(' | ')} |`;
		const header = cells((column) => `Column ${column + 1}`);
		const body = Array.from({ length: Math.max(0, rows - 1) }, () => cells(() => ''));
		const table = [header, cells(() => '---'), ...body].join('\n');
		return insertBlock(state, table, (start) => EditorSelection.range(start + 2, start + 2 + 'Column 1'.length));
	});
}

export function insertCallout(type = 'note'): StateCommand {
	return command((state) => {
		const block = `> [!${type}]\n> `;
		return insertBlock(state, block, (start) => EditorSelection.cursor(start + block.length));
	});
}

export const insertDetails: StateCommand = command((state) => {
	const block = '<details>\n<summary>Summary</summary>\n\n\n\n</details>';
	return insertBlock(state, block, (start) => EditorSelection.cursor(start + '<details>\n<summary>Summary</summary>\n\n'.length));
});

export const formatCommands = {
	bold: toggleWrap('**'),
	italic: toggleWrap('*'),
	underline: toggleWrap('<u>', '</u>'),
	strike: toggleWrap('~~'),
	'inline-code': toggleWrap('`'),
	highlight: toggleWrap('=='),
	subscript: toggleWrap('<sub>', '</sub>'),
	superscript: toggleWrap('<sup>', '</sup>'),
	link: insertLink,
	'bullet-list': toggleList('bullet'),
	'ordered-list': toggleList('ordered'),
	'task-list': toggleList('task'),
	quote: toggleQuote,
	'code-block': toggleCodeBlock,
	'horizontal-rule': insertRule,
	table: insertTable(),
	callout: insertCallout(),
	details: insertDetails,
	indent: indentMore,
	outdent: indentLess,
	undo,
	redo,
} satisfies Record<string, StateCommand>;
