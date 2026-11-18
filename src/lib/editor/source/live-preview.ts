import { EditorSelection, EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import MarkdownIt from 'markdown-it';
import { tablePreview } from './table.ts';
import { codeBlocks } from './code-blocks.ts';
import { isDrawingHref } from '../../draw/drawing.ts';
import { calloutAt, calloutFolds, calloutGroups, CalloutHeader, type Callout } from './callouts.ts';

export interface LivePreviewOptions {
	resolveImage?: (href: string) => string;
	openLink?: (href: string) => void;
	checkboxLabel?: string;
	imageLabel?: string;
	copyLabel?: string;
	/** Open an Excalidraw drawing (a `.excalidraw.svg` image) for editing. */
	editDrawing?: (href: string) => void;
	drawingLabel?: string;
	/** Re-resolve assets after note/vault changes, even if the Markdown is identical. */
	context?: string;
}

export type PreviewSpan = {
	from: number; to: number;
	kind: 'line' | 'mark' | 'hide' | 'image' | 'checkbox' | 'bullet' | 'callout';
	className?: string; href?: string; label?: string; checked?: boolean;
	/** Callout colour group (lines) and the callout whose header this span replaces. */
	group?: string; callout?: Callout;
};
const markdown = new MarkdownIt({ html: false });

/** Never interpret raw HTML or arbitrary URI schemes as preview content. */
export function previewDestination(raw: string): string | null {
	const href = markdown.utils.unescapeAll(raw.replace(/^<([\s\S]*)>$/, '$1'));
	if (!href || /[\u0000-\u001f\u007f]/.test(href)) return null;
	if (/^[a-z]:[\\/]/i.test(href)) return href;
	if (/^[a-z][\w+.-]*:/i.test(href) && !/^(https?:|mailto:|asset:|imgproxy:|blob:)/i.test(href)
		&& !/^data:image\/(png|jpeg|gif|webp);base64,[a-z\d+/=]+$/i.test(href)) return null;
	return href;
}

/** Presentation only. Every coordinate still addresses the original Markdown document. */
export function previewSpans(state: EditorState, visible: readonly { from: number; to: number }[] = [{ from: 0, to: state.doc.length }], composing = false): PreviewSpan[] {
	const spans: PreviewSpan[] = [];
	const seen = new Set<string>();
	const selected = state.selection.ranges.map(range => ({
		from: state.doc.lineAt(range.from).from,
		to: state.doc.lineAt(range.to).to,
	}));
	const active = (from: number, to: number) => (!state.readOnly || composing) && selected.some(range => from <= range.to && to >= range.from);
	const shown = (from: number, to: number) => visible.some(range => from <= range.to && to >= range.from);
	const add = (span: PreviewSpan) => {
		if (!shown(span.from, span.to)) return;
		const key = `${span.kind}:${span.from}:${span.to}:${span.className ?? ''}`;
		if (!seen.has(key)) { seen.add(key); spans.push(span); }
	};
	const hide = (from: number, to: number) => { if (to > from) add({ from, to, kind: 'hide' }); };
	const lines = (from: number, to: number, className: string) => {
		for (const range of visible) {
			let line = state.doc.lineAt(Math.max(from, range.from));
			const end = Math.min(to, range.to);
			while (line.from <= end) {
				add({ from: line.from, to: line.from, kind: 'line', className });
				if (line.to >= state.doc.length) break;
				line = state.doc.lineAt(line.to + 1);
			}
		}
	};
	/** Code lines carry first/last markers (a rounded block) and the language on the first line. */
	const codeLines = (from: number, to: number, language: string) => {
		const first = state.doc.lineAt(from).number, last = state.doc.lineAt(to).number;
		for (let number = first; number <= last; number++) {
			const line = state.doc.line(number);
			if (!shown(line.from, line.to)) continue;
			add({ from: line.from, to: line.from, kind: 'line', label: number === first ? language : undefined,
				className: `lp-code-block${number === first ? ' lp-code-first' : ''}${number === last ? ' lp-code-last' : ''}` });
		}
	};
	/** Callout box: every line is tinted; the header becomes icon + title unless the caret is on it. */
	const headerStarts = new Map<number, number>();
	const calloutLines = (callout: Callout) => {
		const end = callout.folded ? callout.firstLine : callout.lastLine;
		for (let number = callout.firstLine; number <= end; number++) {
			const line = state.doc.line(number);
			if (!shown(line.from, line.to)) continue;
			add({ from: line.from, to: line.from, kind: 'line', group: callout.group,
				className: `lp-callout${number === callout.firstLine ? ' lp-callout-first' : ''}${number === end ? ' lp-callout-last' : ''}` });
		}
		if (!active(callout.headerFrom, callout.headerTo) && shown(callout.headerFrom, callout.headerTo)) {
			headerStarts.set(callout.firstLine, callout.headerFrom);
			add({ from: callout.headerFrom, to: callout.headerTo, kind: 'callout', group: callout.group, callout });
		}
	};
	for (const range of visible) {
		let line = state.doc.lineAt(range.from);
		while (line.from <= range.to) {
			if (!active(line.from, line.to)) add({ from: line.from, to: line.from, kind: 'line', className: 'lp-rendered' });
			if (line.to >= state.doc.length) break;
			line = state.doc.lineAt(line.to + 1);
		}
	}
	for (const range of visible) syntaxTree(state).iterate({ from: range.from, to: range.to, enter(ref) {
		const node = ref.node;
		const { from, to, name } = node;
		// Complex constructs remain literal source, not unsafe HTML or a lossy rendering.
		if (name === 'HTMLBlock' || name === 'HTMLTag' || name === 'Table' || name === 'LinkReference'
			|| name === 'SourceMathBlock' || name === 'SourceMathInline') return false;
		if (name === 'Paragraph') {
			// Bound work for very long paragraphs; CodeMirror parses visible syntax incrementally.
			if (to - from > 30_000) return false;
		}
		if (name === 'FencedCode' || name === 'CodeBlock') {
			const info = name === 'FencedCode' ? node.getChild('CodeInfo') : null;
			codeLines(from, to, info ? state.sliceDoc(info.from, info.to).trim() : '');
			if (name === 'FencedCode' && !active(from, to)) {
				for (const mark of node.getChildren('CodeMark')) {
					const line = state.doc.lineAt(mark.from);
					hide(mark.from, line.to);
				}
			}
			return false;
		}
		const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(name);
		if (heading) {
			const underline = name.startsWith('Setext') ? node.getChild('HeaderMark') : null;
			lines(from, underline ? state.doc.lineAt(underline.from).from - 1 : to, `lp-heading lp-h${heading[1]}`);
			if (!active(from, to)) for (const mark of node.getChildren('HeaderMark')) {
				let end = mark.to;
				while (state.sliceDoc(end, end + 1) === ' ') end++;
				hide(mark.from, end);
			}
		}
		if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough' || name === 'Highlight' || name === 'InlineCode') {
			const className = ({ StrongEmphasis: 'lp-strong', Emphasis: 'lp-emphasis', Strikethrough: 'lp-strike', Highlight: 'lp-highlight', InlineCode: 'lp-inline-code' })[name]!;
			add({ from, to, kind: 'mark', className });
			if (!active(from, to)) for (const mark of node.getChildren(name === 'InlineCode' ? 'CodeMark' : name === 'Strikethrough' ? 'StrikethroughMark' : name === 'Highlight' ? 'HighlightMark' : 'EmphasisMark')) hide(mark.from, mark.to);
			if (name === 'InlineCode') return false;
		}
		if (name === 'Blockquote') {
			const callout = calloutAt(state, node);
			if (callout) calloutLines(callout);
			else {
				// The first level draws the bar; each deeper level adds one more inside it.
				let depth = 1;
				for (let parent = node.parent; parent; parent = parent.parent) if (parent.name === 'Blockquote') depth++;
				lines(from, to, depth === 1 ? 'lp-quote' : 'lp-quote-nested');
			}
		}
		if (name === 'QuoteMark' && !active(from, to)) {
			// A callout header is replaced as a whole, including its own quote mark.
			const header = headerStarts.get(state.doc.lineAt(from).number);
			if (header === undefined || from < header) hide(from, to + (state.sliceDoc(to, to + 1) === ' ' ? 1 : 0));
		}
		if (name === 'HorizontalRule' && !active(from, to)) {
			lines(from, to, 'lp-rule'); hide(from, to); return false;
		}
		if (name === 'ListMark' || name === 'TaskMarker') {
			const line = state.doc.lineAt(from);
			if (active(line.from, line.to)) return;
			if (name === 'TaskMarker') {
				const checked = /[xX]/.test(state.sliceDoc(from, to));
				add({ from, to, kind: 'checkbox', checked });
				if (checked && node.parent && node.parent.to > to) add({ from: to, to: node.parent.to, kind: 'mark', className: 'lp-task-done' });
			} else if (node.parent?.parent?.name === 'BulletList') {
				const tail = state.sliceDoc(to, Math.min(line.to, to + 8));
				if (/^\s+\[[ xX]\]/.test(tail)) hide(from, to + 1);
				else add({ from, to, kind: 'bullet' });
			}
		}
		if (name === 'Link' || name === 'Image') {
			if (to - from > 30_000) return false;
			const url = node.getChild('URL');
			if (!url) return false; // Wiki/reference links remain editable literal text.
			const href = previewDestination(state.sliceDoc(url.from, url.to));
			if (!href) return false;
			const marks = node.getChildren('LinkMark');
			const close = marks.find(mark => state.sliceDoc(mark.from, mark.to) === ']');
			if (!close || active(from, to)) return false;
			if (name === 'Image') {
				if (state.doc.lineAt(from).number !== state.doc.lineAt(to).number || /^mailto:/i.test(href)) return false;
				add({ from, to, kind: 'image', href, label: state.sliceDoc(from + 2, close.from) });
				return false;
			}
			if (close.from <= from + 1) return false; // Empty labels must remain selectable source, not zero-length marks.
			hide(from, from + 1); hide(close.from, to);
			add({ from: from + 1, to: close.from, kind: 'mark', className: 'lp-link', href });
		}
	} });
	return spans;
}

/** Destination of the inline link, or bare URL, that contains `pos`, if any. */
export function linkAt(state: EditorState, pos: number): string | null {
	for (const side of [1, -1] as const) {
		let node = syntaxTree(state).resolveInner(pos, side);
		while (node.parent && node.name !== 'Link' && node.name !== 'URL') node = node.parent;
		if (node.name === 'Link') {
			const url = node.getChild('URL');
			const href = url ? previewDestination(state.sliceDoc(url.from, url.to)) : null;
			if (href) return href;
		} else if (node.name === 'URL' && node.parent?.name !== 'Image') {
			const href = previewDestination(state.sliceDoc(node.from, node.to));
			if (href) return href;
		}
	}
	return null;
}

class Bullet extends WidgetType {
	toDOM() { const span = document.createElement('span'); span.className = 'lp-bullet'; span.textContent = '•'; span.setAttribute('aria-hidden', 'true'); return span; }
}

class Checkbox extends WidgetType {
	readonly from: number;
	readonly checked: boolean;
	readonly readonly: boolean;
	readonly label: string;
	constructor(from: number, checked: boolean, readonly: boolean, label: string) {
		super(); this.from = from; this.checked = checked; this.readonly = readonly; this.label = label;
	}
	eq(other: Checkbox) { return this.from === other.from && this.checked === other.checked && this.readonly === other.readonly && this.label === other.label; }
	toDOM(view: EditorView) {
		const input = document.createElement('input');
		input.type = 'checkbox'; input.className = 'lp-checkbox'; input.checked = this.checked; input.disabled = this.readonly;
		input.dataset.sourceFrom = String(this.from);
		input.setAttribute('aria-label', this.label);
		input.onmousedown = event => event.preventDefault();
		input.onchange = () => {
			const from = Number(input.dataset.sourceFrom);
			const raw = view.state.sliceDoc(from, from + 3);
			if (view.state.readOnly || !/^\[[ xX]\]$/.test(raw)) { input.checked = /[xX]/.test(raw); return; }
			view.dispatch({ changes: { from: from + 1, to: from + 2, insert: raw[1] === ' ' ? 'x' : ' ' }, userEvent: 'input' });
		};
		return input;
	}
	updateDOM(dom: HTMLElement) {
		if (!(dom instanceof HTMLInputElement)) return false;
		dom.dataset.sourceFrom = String(this.from); dom.checked = this.checked; dom.disabled = this.readonly;
		dom.setAttribute('aria-label', this.label);
		return true;
	}
	ignoreEvent() { return true; }
}

class PreviewImage extends WidgetType {
	readonly from: number;
	readonly to: number;
	readonly src: string;
	readonly alt: string;
	readonly label: string;
	/** Set for an editable drawing: the Markdown destination, and what to call when the user wants to edit it. */
	readonly drawing: { href: string; edit?: (href: string) => void; label: string } | null;
	constructor(from: number, to: number, src: string, alt: string, label: string, drawing: { href: string; edit?: (href: string) => void; label: string } | null = null) {
		super(); this.from = from; this.to = to; this.src = src; this.alt = alt; this.label = label; this.drawing = drawing;
	}
	eq(other: PreviewImage) { return this.from === other.from && this.to === other.to && this.src === other.src && this.alt === other.alt && this.label === other.label && this.drawing?.href === other.drawing?.href; }
	get estimatedHeight() { return 160; }
	toDOM(view: EditorView) {
		const button = document.createElement('button');
		button.type = 'button'; button.className = 'lp-image'; button.setAttribute('aria-label', this.label);
		button.dataset.sourceFrom = String(this.from); button.dataset.sourceTo = String(this.to); button.dataset.previewSrc = this.src;
		const image = document.createElement('img');
		image.alt = this.alt; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
		image.crossOrigin = 'anonymous';
		const fallback = document.createElement('span'); fallback.className = 'lp-image-fallback'; fallback.textContent = this.alt || this.label;
		image.onload = () => { fallback.hidden = true; if (button.isConnected) view.requestMeasure(); };
		image.onerror = () => { image.hidden = true; fallback.hidden = false; if (button.isConnected) view.requestMeasure(); };
		button.onmousedown = event => event.preventDefault();
		button.onclick = () => { view.dispatch({ selection: EditorSelection.single(Number(button.dataset.sourceFrom), Number(button.dataset.sourceTo)), scrollIntoView: true }); view.focus(); };
		button.append(image, fallback); image.src = this.src;
		const drawing = this.drawing;
		if (drawing) {
			button.classList.add('lp-drawing');
			const edit = document.createElement('span');
			edit.className = 'lp-drawing-edit'; edit.title = drawing.label; edit.setAttribute('role', 'button'); edit.setAttribute('aria-label', drawing.label);
			edit.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
			edit.onclick = (event) => { event.stopPropagation(); event.preventDefault(); drawing.edit?.(drawing.href); };
			button.append(edit);
			// A double click is the quick way in: a single click still selects the Markdown.
			button.ondblclick = (event) => { event.preventDefault(); drawing.edit?.(drawing.href); };
		}
		return button;
	}
	updateDOM(dom: HTMLElement) {
		if (!(dom instanceof HTMLButtonElement) || dom.dataset.previewSrc !== this.src) return false;
		// Keep already loaded images stable while typing before them, but refresh source coordinates.
		dom.dataset.sourceFrom = String(this.from); dom.dataset.sourceTo = String(this.to);
		dom.setAttribute('aria-label', this.label);
		const image = dom.querySelector('img'); if (image) image.alt = this.alt;
		const fallback = dom.querySelector('.lp-image-fallback'); if (fallback) fallback.textContent = this.alt || this.label;
		return true;
	}
	destroy(dom: HTMLElement) { const image = dom.querySelector('img'); if (image) { image.onload = null; image.onerror = null; } }
	ignoreEvent() { return true; }
}

export function livePreview(options: LivePreviewOptions = {}): Extension {
	const plugin = ViewPlugin.fromClass(class {
		decorations: DecorationSet = Decoration.none;
		atomic: DecorationSet = Decoration.none;
		constructor(view: EditorView) { this.build(view); }
		update(update: ViewUpdate) {
			if (update.docChanged || update.selectionSet || update.viewportChanged || update.transactions.some(tr => tr.reconfigured)
				|| syntaxTree(update.state) !== syntaxTree(update.startState)) this.build(update.view);
		}
		build(view: EditorView) {
			const ranges: Range<Decoration>[] = [];
			for (const span of previewSpans(view.state, view.visibleRanges, view.composing)) {
				let decoration: Decoration;
				if (span.kind === 'line') decoration = Decoration.line({ attributes: span.label !== undefined ? { class: span.className!, 'data-lang': span.label || '•••' }
					: span.group ? { class: span.className!, 'data-callout-group': span.group } : { class: span.className! } });
				else if (span.kind === 'callout') decoration = Decoration.replace({ widget: new CalloutHeader(span.callout!) });
				else if (span.kind === 'mark') decoration = Decoration.mark({ class: span.className!, attributes: span.href ? { 'data-preview-href': span.href, title: span.href } : undefined });
				else {
					let widget: WidgetType | undefined;
					if (span.kind === 'bullet') widget = new Bullet();
					if (span.kind === 'checkbox') widget = new Checkbox(span.from, !!span.checked, view.state.readOnly, options.checkboxLabel ?? 'Toggle task');
					if (span.kind === 'image') {
						let src: string;
						try { src = options.resolveImage?.(span.href!) ?? span.href!; } catch { continue; }
						widget = new PreviewImage(span.from, span.to, src, span.label!, options.imageLabel ?? 'Edit image source',
							isDrawingHref(span.href!) ? { href: span.href!, edit: options.editDrawing, label: options.drawingLabel ?? 'Edit drawing' } : null);
					}
					decoration = Decoration.replace({ widget, liveAtomic: true });
				}
				ranges.push(decoration.range(span.from, span.to));
			}
			this.decorations = Decoration.set(ranges, true);
			this.atomic = this.decorations.update({ filter: (_from, _to, decoration) => !!decoration.spec.liveAtomic });
		}
	}, { decorations: value => value.decorations, provide: plugin => EditorView.atomicRanges.of(view => view.plugin(plugin)?.atomic ?? Decoration.none) });
	return [plugin, tablePreview({ openLink: options.openLink }), codeBlocks({ copyLabel: options.copyLabel }), calloutFolds(), EditorView.domEventHandlers({
		mousedown(event, view) {
			// Handle before CM moves the caret and reveals (removes) the decorated link.
			if (!(event.ctrlKey || event.metaKey) || event.button !== 0 || !options.openLink) return false;
			const marked = (event.target as Element).closest?.('[data-preview-href]')?.getAttribute('data-preview-href');
			// A link whose syntax is showing (the caret is on its line) is still a link: find it by position.
			const pos = marked ? null : view.posAtCoords({ x: event.clientX, y: event.clientY });
			const href = marked ?? (pos === null ? null : linkAt(view.state, pos));
			if (!href) return false;
			event.preventDefault(); options.openLink(href); return true;
		},
		keydown(event, view) {
			if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || !options.openLink || event.isComposing) return false;
			const href = linkAt(view.state, view.state.selection.main.head);
			if (!href) return false;
			event.preventDefault(); options.openLink(href); return true;
		},
	}), EditorView.theme({
		'&': { fontFamily: 'var(--editor-font-family, sans-serif)' },
		'.cm-scroller': { fontFamily: 'var(--editor-font-family, sans-serif)' },
		'.cm-line': { lineHeight: 'var(--editor-line-height, 1.6)' },
		'.lp-rendered span': { color: 'inherit' },
		'.lp-rendered .lp-link, .lp-rendered .lp-link span': { color: 'var(--accent)' },
		'.lp-rendered .lp-task-done, .lp-rendered .lp-task-done span': { color: 'var(--text-tertiary)', textDecoration: 'line-through' },
		'.lp-heading': { fontWeight: '700', paddingTop: '0.45em', paddingBottom: '0.2em', lineHeight: '1.35' },
		'.lp-heading span': { color: 'var(--text-primary)' },
		'.lp-h1': { fontSize: '1.9em' }, '.lp-h2': { fontSize: '1.55em' }, '.lp-h3': { fontSize: '1.3em' },
		'.lp-h4': { fontSize: '1.15em' }, '.lp-h5, .lp-h6': { fontSize: '1em' },
		'.cm-line .lp-strong': { fontWeight: '700', color: 'var(--text-primary)' },
		'.cm-line .lp-emphasis': { fontStyle: 'italic', color: 'var(--text-primary)' },
		'.lp-strike': { textDecoration: 'line-through' },
		'.lp-highlight': { background: 'var(--accent-light)', color: 'var(--text-accent)', borderRadius: '3px', padding: '0 3px' },
		'.cm-line .lp-highlight, .cm-line .lp-highlight span': { color: 'var(--text-accent)' },
		'.lp-inline-code': { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '0.9em', background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-tertiary))', borderRadius: '4px', padding: '2px 6px' },
		'.lp-code-block': { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '0.93em', lineHeight: '1.5', background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-tertiary))', padding: '0 16px' },
		'.lp-code-first': { position: 'relative', borderRadius: '3px 3px 0 0', paddingTop: '2px' },
		'.lp-code-last': { borderRadius: '0 0 3px 3px', paddingBottom: '2px' },
		'.lp-code-first.lp-code-last': { borderRadius: '3px' },
		'.lp-code-first::after': { content: 'attr(data-lang)', position: 'absolute', top: '5px', right: '34px', padding: '2px 6px', fontSize: '11px', color: 'var(--text-tertiary)', opacity: '0.6', pointerEvents: 'none' },
		'.lp-table-wrap': { overflowX: 'auto', margin: '4px 0', padding: '0 4px', cursor: 'text' },
		'.lp-table': { borderCollapse: 'collapse', width: 'auto' },
		'.lp-table th, .lp-table td': { border: '1px solid var(--border-color)', padding: '8px 12px', textAlign: 'left', verticalAlign: 'top', minWidth: '80px', lineHeight: '1.5' },
		'.lp-table th': { background: 'var(--bg-tertiary)', fontWeight: '600' },
		'.lp-table a': { color: 'var(--accent)', textDecoration: 'underline' },
		'.lp-table code': { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '0.9em', background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-tertiary))', padding: '2px 6px', borderRadius: '4px' },
		'.lp-quote': { borderLeft: '3px solid var(--accent)', paddingLeft: '16px', color: 'var(--text-secondary)' },
		// A second bar drawn inside the first for quotes within quotes.
		'.lp-quote-nested': { paddingLeft: '32px', backgroundImage: 'linear-gradient(var(--accent), var(--accent))', backgroundSize: '3px 100%', backgroundPosition: '16px 0', backgroundRepeat: 'no-repeat' },
		'.lp-callout': { '--cc': 'var(--callout-note)', padding: '0 14px', borderLeft: '3px solid rgb(var(--cc))', borderRight: '1px solid rgba(var(--cc), 0.3)', background: 'rgba(var(--cc), 0.06)', color: 'var(--text-primary)' },
		...Object.fromEntries(calloutGroups.map(group => [`.lp-callout[data-callout-group="${group}"]`, { '--cc': `var(--callout-${group})` }])),
		'.lp-callout-first': { padding: '6px 14px', borderTop: '1px solid rgba(var(--cc), 0.3)', borderRadius: '4px 4px 0 0', background: 'rgba(var(--cc), 0.1)', color: 'rgb(var(--cc))', fontWeight: '600' },
		'.lp-callout-last': { borderBottom: '1px solid rgba(var(--cc), 0.3)', borderRadius: '0 0 4px 4px', paddingBottom: '8px' },
		'.lp-callout-first.lp-callout-last': { borderRadius: '4px' },
		'.lp-callout-header': { display: 'inline-flex', alignItems: 'center', gap: '8px', width: '100%', verticalAlign: 'middle' },
		'.lp-callout-icon': { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', flex: '0 0 auto', color: 'rgb(var(--cc))' },
		'.lp-callout-title': { flex: '1 1 auto', minWidth: '0', color: 'rgb(var(--cc))', fontWeight: '600' },
		'.lp-callout-fold': { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', padding: '0', border: 'none', background: 'none', color: 'rgb(var(--cc))', borderRadius: '4px', cursor: 'pointer', transition: 'background 0.15s, transform 0.2s' },
		'.lp-callout-fold:hover': { background: 'rgba(var(--cc), 0.18)' },
		'.lp-callout-fold.closed': { transform: 'rotate(-90deg)' },
		'.lp-callout-folded': { height: '0' },
		'.lp-rule': { borderBottom: '1px solid var(--border-color)' },
		'.lp-link': { color: 'var(--accent)', textDecoration: 'underline', cursor: 'text' },
		'.lp-bullet': { color: 'var(--accent)', fontWeight: '700' },
		'.lp-checkbox': { appearance: 'none', WebkitAppearance: 'none', position: 'relative', cursor: 'pointer', verticalAlign: 'middle', width: '16px', height: '16px', margin: '0 8px 2px 0', border: '2px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-primary)', transition: 'background 0.15s, border-color 0.15s' },
		'.lp-checkbox:hover': { borderColor: 'var(--accent)' },
		'.lp-checkbox:checked': { background: 'var(--accent)', borderColor: 'var(--accent)' },
		'.lp-checkbox:checked::after': { content: '""', position: 'absolute', left: '3px', top: '0px', width: '6px', height: '10px', border: 'solid white', borderWidth: '0 2px 2px 0', transform: 'rotate(45deg)' },
		'.lp-checkbox:disabled': { cursor: 'default' },
		'.lp-image': { display: 'inline-block', border: '0', padding: '0', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', maxWidth: '100%', verticalAlign: 'middle' },
		'.lp-image img': { maxWidth: '100%', maxHeight: '360px', objectFit: 'contain', borderRadius: '4px' },
		'.lp-image:focus-visible': { outline: '2px solid var(--accent)' },
		'.lp-drawing': { position: 'relative' },
		'.lp-drawing img': { maxHeight: '520px' },
		'.lp-drawing-edit': { position: 'absolute', top: '6px', right: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '3px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', opacity: '0', transition: 'opacity 0.12s', cursor: 'pointer' },
		'.lp-drawing:hover .lp-drawing-edit, .lp-drawing:focus-visible .lp-drawing-edit': { opacity: '1' },
		'.lp-image-fallback': { fontSize: '0.9em', padding: '8px', border: '1px dashed var(--border-color)' },
		'@media (pointer: coarse)': { '.lp-checkbox': { width: '24px', height: '24px' } },
	})];
}
