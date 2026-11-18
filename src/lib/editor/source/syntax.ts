import { GFM, type MarkdownConfig } from '@lezer/markdown';

// Recognize math as opaque source. Without these nodes CommonMark can mistake
// headings, images or emphasis inside $$ blocks for ordinary preview content.
const mathAsSource: MarkdownConfig = {
	defineNodes: [{ name: 'SourceMathBlock', block: true }, 'SourceMathInline'],
	parseBlock: [{
		name: 'SourceMathBlock', before: 'FencedCode',
		parse(context, line) {
			const text = line.text.slice(line.pos);
			if (text.trim() !== '$$') return false;
			const from = context.lineStart + line.pos;
			let to = context.lineStart + line.text.length;
			while (context.nextLine()) {
				to = context.lineStart + line.text.length;
				if (line.text.slice(line.pos).trim() === '$$') { context.nextLine(); break; }
			}
			context.addElement(context.elt('SourceMathBlock', from, to));
			return true;
		},
	}],
	parseInline: [{
		name: 'SourceMathInline', before: 'Emphasis',
		parse(context, next, from) {
			if (next !== 36 || context.char(from - 1) === 36 || /[\s$]/.test(context.slice(from + 1, from + 2))) return -1;
			for (let to = from + 1; to < Math.min(context.end, from + 30_000); to++) {
				const char = context.char(to);
				if (char === 10) return -1;
				if (char === 92) { to++; continue; }
				if (char === 36) {
					if (to === from + 1 || /\s/.test(context.slice(to - 1, to)) || context.char(to + 1) === 36 || /\d/.test(context.slice(to + 1, to + 2))) return -1;
					return context.addElement(context.elt('SourceMathInline', from, to + 1));
				}
			}
			return -1;
		},
	}],
};

// ==highlight== (Obsidian syntax). A delimiter pair, so it nests with emphasis like strikethrough does.
const HighlightDelimiter = { resolve: 'Highlight', mark: 'HighlightMark' };
const PUNCTUATION = /[!-/:-@[-`{-~]/;
const highlightMarks: MarkdownConfig = {
	defineNodes: ['Highlight', 'HighlightMark'],
	parseInline: [{
		name: 'Highlight', after: 'Emphasis',
		parse(context, next, pos) {
			if (next !== 61 || context.char(pos + 1) !== 61 || context.char(pos + 2) === 61 || context.char(pos - 1) === 61) return -1;
			const before = context.slice(pos - 1, pos), after = context.slice(pos + 2, pos + 3);
			const spaceBefore = /\s|^$/.test(before), spaceAfter = /\s|^$/.test(after);
			const punctuationBefore = PUNCTUATION.test(before), punctuationAfter = PUNCTUATION.test(after);
			return context.addDelimiter(HighlightDelimiter, pos, pos + 2,
				!spaceAfter && (!punctuationAfter || spaceBefore || punctuationBefore),
				!spaceBefore && (!punctuationBefore || spaceAfter || punctuationAfter));
		},
	}],
};

export const sourceMarkdownExtensions = [GFM, mathAsSource, highlightMarks];
