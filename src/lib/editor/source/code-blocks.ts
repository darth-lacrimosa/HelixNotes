import { EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { common, createLowlight } from 'lowlight';
import powershell from 'highlight.js/lib/languages/powershell';

/*
 * Live Preview code blocks: the same highlighter and colour classes as the rich-text editor, plus a copy
 * button. Everything is presentation; the document text is never touched.
 */

/** One highlighter for every editor, with the same grammars the rich-text editor offers. */
export const codeLowlight = createLowlight(common);
codeLowlight.register('powershell', powershell);

type SyntaxNode = ReturnType<typeof syntaxTree>['topNode'];
interface HastNode { type: string; value?: string; properties?: { className?: unknown }; children?: HastNode[] }
export type TokenSpan = { from: number; to: number; className: string };

const MAX_HIGHLIGHT = 20_000;
const cache = new Map<string, TokenSpan[]>();

/** Token spans (relative offsets) for `text`. Unlabelled or unknown languages stay plain, as in rich text. */
export function highlightSpans(language: string, text: string): TokenSpan[] {
	if (!language || text.length > MAX_HIGHLIGHT || !codeLowlight.registered(language)) return [];
	const key = `${language}\u0000${text}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const spans: TokenSpan[] = [];
	let offset = 0;
	const visit = (nodes: HastNode[], inherited: string) => {
		for (const child of nodes) {
			if (child.type === 'element' && child.children) {
				const classes = child.properties?.className;
				const own = Array.isArray(classes) ? classes.join(' ') : typeof classes === 'string' ? classes : '';
				visit(child.children, [inherited, own].filter(Boolean).join(' '));
			} else if (child.type === 'text' && child.value !== undefined) {
				const end = offset + child.value.length;
				if (inherited && end > offset) spans.push({ from: offset, to: end, className: inherited });
				offset = end;
			}
		}
	};
	visit(codeLowlight.highlight(language, text).children as HastNode[], '');
	if (cache.size >= 64) cache.delete(cache.keys().next().value!);
	cache.set(key, spans);
	return spans;
}

export interface FencedBlock { language: string; segments: { from: number; to: number }[]; text: string }

/** The code of a fenced block. Lines inside quotes or lists are separate segments, joined by newlines. */
export function fencedBlock(state: EditorState, node: SyntaxNode): FencedBlock {
	const info = node.getChild('CodeInfo');
	const language = info ? state.sliceDoc(info.from, info.to).trim().split(/\s+/)[0] ?? '' : '';
	const segments = node.getChildren('CodeText').map((part) => ({ from: part.from, to: part.to }));
	return { language, segments, text: segments.map((part) => state.sliceDoc(part.from, part.to)).join('\n') };
}

/** Highlight classes of a fenced block as document ranges. */
export function highlightedRanges(state: EditorState, node: SyntaxNode): TokenSpan[] {
	const block = fencedBlock(state, node);
	const out: TokenSpan[] = [];
	for (const span of highlightSpans(block.language, block.text)) {
		let base = 0;
		for (const part of block.segments) {
			const length = part.to - part.from;
			const from = Math.max(span.from, base), to = Math.min(span.to, base + length);
			if (to > from) out.push({ from: part.from + (from - base), to: part.from + (to - base), className: span.className });
			base += length + 1;
		}
	}
	return out;
}

const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

class CopyCode extends WidgetType {
	readonly label: string;
	constructor(label: string) { super(); this.label = label; }
	eq(other: CopyCode) { return this.label === other.label; }
	toDOM(view: EditorView) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'lp-code-copy';
		button.title = this.label;
		button.setAttribute('aria-label', this.label);
		button.innerHTML = COPY_ICON;
		button.onmousedown = (event) => event.preventDefault();
		button.onclick = (event) => {
			event.preventDefault();
			event.stopPropagation();
			// The widget sits on the opening fence line; read the block from the current document.
			const line = view.state.doc.lineAt(view.posAtDOM(button));
			let node = syntaxTree(view.state).resolveInner(line.to, -1);
			while (node.parent && node.name !== 'FencedCode') node = node.parent;
			if (node.name !== 'FencedCode') return;
			void navigator.clipboard.writeText(fencedBlock(view.state, node).text).then(() => {
				if (!button.isConnected) return;
				button.innerHTML = CHECK_ICON;
				button.classList.add('copied');
				setTimeout(() => { button.innerHTML = COPY_ICON; button.classList.remove('copied'); }, 1500);
			}).catch((error) => console.error('Failed to copy code:', error));
		};
		return button;
	}
	ignoreEvent() { return true; }
}

export function codeBlocks(options: { copyLabel?: string } = {}): Extension {
	const widget = new CopyCode(options.copyLabel ?? 'Copy code');
	const plugin = ViewPlugin.fromClass(class {
		decorations: DecorationSet = Decoration.none;
		constructor(view: EditorView) { this.build(view); }
		update(update: ViewUpdate) {
			// The selection does not change tokens, so moving the caret never re-highlights.
			if (update.docChanged || update.viewportChanged || update.transactions.some((tr) => tr.reconfigured)
				|| syntaxTree(update.state) !== syntaxTree(update.startState)) this.build(update.view);
		}
		build(view: EditorView) {
			const ranges: Range<Decoration>[] = [];
			const seen = new Set<number>();
			for (const visible of view.visibleRanges) {
				syntaxTree(view.state).iterate({
					from: visible.from, to: visible.to,
					enter: (ref) => {
						if (ref.name !== 'FencedCode') return;
						if (seen.has(ref.from)) return false;
						seen.add(ref.from);
						ranges.push(Decoration.widget({ widget, side: -1 }).range(view.state.doc.lineAt(ref.from).from));
						for (const span of highlightedRanges(view.state, ref.node)) {
							ranges.push(Decoration.mark({ class: span.className }).range(span.from, span.to));
						}
						return false;
					},
				});
			}
			this.decorations = Decoration.set(ranges, true);
		}
	}, { decorations: (value) => value.decorations });
	return [plugin, EditorView.theme({
		'.lp-code-copy': {
			position: 'absolute', top: '5px', right: '5px', zIndex: '2', display: 'flex', alignItems: 'center', justifyContent: 'center',
			padding: '2px 6px', lineHeight: '0', border: '1px solid transparent', borderRadius: '3px', background: 'transparent',
			color: 'var(--text-tertiary)', cursor: 'pointer', opacity: '0.5',
			transition: 'opacity 0.15s, background 0.15s, border-color 0.15s, color 0.15s',
		},
		'.lp-code-copy svg': { width: '1em', height: '1em' },
		'.lp-code-copy:hover': { opacity: '1', background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' },
		'.lp-code-copy.copied': { opacity: '1', color: 'var(--text-accent)', background: 'var(--accent-light)', borderColor: 'var(--text-accent)' },
	})];
}
