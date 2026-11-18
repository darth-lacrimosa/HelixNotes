import { EditorState, StateField, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { calloutGroup, calloutIcon, calloutLabel } from '../callouts.ts';

/*
 * Obsidian-style callouts in Live Preview: a blockquote whose first line is `[!type] Title`. The box is drawn
 * with line decorations and the header line is swapped for an icon + title while the caret is elsewhere.
 * A trailing `+` / `-` on the type makes a top-level callout foldable; the marker stays in the Markdown,
 * exactly as the rich-text editor writes it.
 */

type SyntaxNode = ReturnType<typeof syntaxTree>['topNode'];

export interface Callout {
	type: string;
	group: string;
	title: string;
	/** `none` for plain callouts and for nested ones, which cannot be folded. */
	fold: 'none' | 'open' | 'closed';
	headerFrom: number;
	headerTo: number;
	firstLine: number;
	lastLine: number;
	/** Closed, top-level and not being edited: its body is hidden. */
	folded: boolean;
}

const HEADER = /^>[ \t]?\[!([\w-]+)\]([-+]?)[ \t]*(.*)$/;

/** The callout described by a Blockquote node, or null when it is an ordinary quote. */
export function calloutAt(state: EditorState, node: SyntaxNode): Callout | null {
	if (node.name !== 'Blockquote') return null;
	const first = state.doc.lineAt(node.from);
	const match = HEADER.exec(state.sliceDoc(node.from, first.to));
	if (!match) return null;
	const last = state.doc.lineAt(node.to);
	const topLevel = node.parent?.name === 'Document';
	const marker = match[2];
	const fold = !topLevel || !marker ? 'none' : marker === '-' ? 'closed' : 'open';
	const touched = !state.readOnly && state.selection.ranges.some((range) => range.from <= node.to && range.to >= node.from);
	return {
		type: match[1].toLowerCase(), group: calloutGroup(match[1]), title: match[3].trim(), fold,
		headerFrom: node.from, headerTo: first.to, firstLine: first.number, lastLine: last.number,
		folded: fold === 'closed' && last.number > first.number && !touched,
	};
}

const CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

export class CalloutHeader extends WidgetType {
	readonly callout: Callout;
	constructor(callout: Callout) { super(); this.callout = callout; }
	eq(other: CalloutHeader) {
		const a = this.callout, b = other.callout;
		return a.type === b.type && a.title === b.title && a.fold === b.fold && a.group === b.group;
	}
	toDOM(view: EditorView) {
		const { type, title, fold } = this.callout;
		const wrap = document.createElement('span');
		wrap.className = 'lp-callout-header';
		const icon = document.createElement('span');
		icon.className = 'lp-callout-icon';
		icon.setAttribute('aria-hidden', 'true');
		icon.innerHTML = calloutIcon(type, 18);
		const label = document.createElement('span');
		label.className = 'lp-callout-title';
		label.textContent = title || calloutLabel(type);
		wrap.append(icon, label);
		if (fold !== 'none') {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = `lp-callout-fold${fold === 'closed' ? ' closed' : ''}`;
			button.setAttribute('aria-expanded', String(fold === 'open'));
			button.setAttribute('aria-label', fold === 'open' ? 'Collapse' : 'Expand');
			button.innerHTML = CHEVRON;
			button.onmousedown = (event) => event.preventDefault();
			button.onclick = (event) => {
				event.preventDefault();
				event.stopPropagation();
				// Read the marker from the current document: the widget may be older than the text.
				const from = view.posAtDOM(wrap);
				const line = view.state.doc.lineAt(from);
				const text = view.state.sliceDoc(from, line.to);
				const close = text.indexOf(']');
				const at = from + close + 1;
				const marker = view.state.sliceDoc(at, at + 1);
				if (close < 0 || (marker !== '+' && marker !== '-')) return;
				view.dispatch({ changes: { from: at, to: at + 1, insert: marker === '-' ? '+' : '-' }, userEvent: 'input' });
			};
			wrap.append(button);
		}
		return wrap;
	}
	// Only the fold button handles its own events; a click elsewhere in the header reveals the source.
	ignoreEvent(event: Event) { return !!(event.target as Element | null)?.closest?.('.lp-callout-fold'); }
}

class FoldedBody extends WidgetType {
	eq() { return true; }
	toDOM() { const element = document.createElement('div'); element.className = 'lp-callout-folded'; element.setAttribute('aria-hidden', 'true'); return element; }
}

/** Hides the body of closed callouts (block-level, so it must come from a state field). */
export function calloutFolds(): Extension {
	const widget = new FoldedBody();
	const build = (state: EditorState): DecorationSet => {
		const ranges: Range<Decoration>[] = [];
		syntaxTree(state).iterate({
			enter(ref) {
				if (ref.name === 'Document') return true;
				if (ref.name === 'Blockquote') {
					const callout = calloutAt(state, ref.node);
					if (callout?.folded) {
						ranges.push(Decoration.replace({ widget, block: true })
							.range(state.doc.line(callout.firstLine + 1).from, state.doc.line(callout.lastLine).to));
					}
				}
				return false;
			},
		});
		return Decoration.set(ranges, true);
	};
	return StateField.define<DecorationSet>({
		create: build,
		update(value, transaction) {
			return transaction.docChanged || transaction.selection || transaction.reconfigured
				|| syntaxTree(transaction.state) !== syntaxTree(transaction.startState) ? build(transaction.state) : value;
		},
		provide: (self) => EditorView.decorations.from(self),
	});
}

export const calloutGroups = ['note', 'abstract', 'info', 'todo', 'tip', 'success', 'question', 'warning', 'failure', 'danger', 'bug', 'example', 'quote', 'custom'] as const;
