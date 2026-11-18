import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorSelection, EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { sourceMarkdownExtensions } from '../src/lib/editor/source/syntax.ts';
import { linkAt, previewSpans } from '../src/lib/editor/source/live-preview.ts';
import { parseTable, renderedTables } from '../src/lib/editor/source/table.ts';

// Parsing is time-sliced; finish it, then let one transaction adopt the complete tree.
const state = (doc, anchor = doc.length, head = anchor, extensions = []) => {
	const created = EditorState.create({
		doc, selection: EditorSelection.single(anchor, head), extensions: [markdown({ extensions: sourceMarkdownExtensions }), ...extensions],
	});
	ensureSyntaxTree(created, doc.length, 5000);
	return created.update({}).state;
};
const spans = (s) => previewSpans(s, [{ from: 0, to: s.doc.length }]);

test('==highlight== is a node, hides its marks away from the caret and ignores === runs', () => {
	const doc = 'plain ==marked== text\n\nlast';
	const away = state(doc, doc.length);
	assert.ok(spans(away).some((span) => span.className === 'lp-highlight' && away.sliceDoc(span.from, span.to) === '==marked=='));
	assert.deepEqual(spans(away).filter((span) => span.kind === 'hide').map((span) => away.sliceDoc(span.from, span.to)), ['==', '==']);
	const near = state(doc, 8);
	assert.ok(!spans(near).some((span) => span.kind === 'hide'));
	const runs = state('a === b === c');
	assert.ok(!spans(runs).some((span) => span.className === 'lp-highlight'));
	assert.ok(!spans(state('a ==b')).some((span) => span.className === 'lp-highlight'));
});

test('highlight nests with bold', () => {
	const s = state('==**both**==\n\nx');
	assert.ok(spans(s).some((span) => span.className === 'lp-highlight'));
	assert.ok(spans(s).some((span) => span.className === 'lp-strong'));
});

test('code blocks mark their first and last line and carry the language', () => {
	const s = state('```js\nlet a = 1;\n```\n\nafter');
	const lines = spans(s).filter((span) => span.kind === 'line' && span.className.startsWith('lp-code-block'));
	assert.deepEqual(lines.map((span) => span.className), ['lp-code-block lp-code-first', 'lp-code-block', 'lp-code-block lp-code-last']);
	assert.equal(lines[0].label, 'js');
	assert.equal(lines[1].label, undefined);
});

test('parseTable reads header, alignment and rows, padding short rows', () => {
	const table = parseTable('| A | B | C |\n|:---|:---:|---:|\n| 1 | 2 |\n| x \\| y | 4 | 5 |');
	assert.deepEqual(table.header, ['A', 'B', 'C']);
	assert.deepEqual(table.align, ['left', 'center', 'right']);
	assert.deepEqual(table.rows, [['1', '2', ''], ['x | y', '4', '5']]);
	assert.equal(parseTable('| A | B |\n| nope | nope |'), null);
	assert.equal(parseTable('just text'), null);
});

test('a table is drawn only while the selection is away from it', () => {
	const doc = 'before\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nafter';
	assert.equal(renderedTables(state(doc, doc.length)).length, 1);
	assert.equal(renderedTables(state(doc, 0)).length, 1);
	assert.equal(renderedTables(state(doc, 12)).length, 0);
	assert.equal(renderedTables(state(doc, 0, doc.length)).length, 0);
	assert.equal(renderedTables(state(doc, 12, 12, [EditorState.readOnly.of(true)])).length, 1);
});

test('tables inside quotes stay source', () => {
	const doc = '> | A | B |\n> | --- | --- |\n> | 1 | 2 |\n\nafter';
	assert.equal(renderedTables(state(doc, doc.length)).length, 0);
});

test('linkAt finds a link by position whether or not its syntax is showing', () => {
	const doc = 'see [docs](https://example.org/x) and https://bare.dev now';
	const s = state(doc);
	assert.equal(linkAt(s, doc.indexOf('docs') + 1), 'https://example.org/x');
	assert.equal(linkAt(s, doc.indexOf('example.org') + 2), 'https://example.org/x');
	assert.equal(linkAt(s, doc.indexOf('bare.dev') + 2), 'https://bare.dev');
	assert.equal(linkAt(s, 1), null);
	assert.ok(syntaxTree(s).length > 0);
});

import { fencedBlock, highlightSpans, highlightedRanges } from '../src/lib/editor/source/code-blocks.ts';

const fence = (s) => { let found; syntaxTree(s).iterate({ enter: (ref) => { if (ref.name === 'FencedCode' && !found) { found = ref.node; return false; } } }); return found; };

test('code highlighting uses the rich-text token classes and stays plain without a known language', () => {
	const spans = highlightSpans('js', 'const a = 1; // note');
	assert.ok(spans.some((span) => span.className === 'hljs-keyword' && span.from === 0 && span.to === 5));
	assert.ok(spans.some((span) => span.className === 'hljs-number'));
	assert.ok(spans.some((span) => span.className === 'hljs-comment'));
	assert.deepEqual(highlightSpans('', 'const a = 1;'), []);
	assert.deepEqual(highlightSpans('mermaid', 'graph TD'), []);
	assert.ok(highlightSpans('powershell', 'Get-ChildItem -Path .').length > 0);
});

test('fenced block ranges point at the code in the document', () => {
	const doc = 'intro\n\n```js\nconst a = 1;\nlet b;\n```\n\nafter';
	const s = state(doc);
	const block = fencedBlock(s, fence(s));
	assert.equal(block.language, 'js');
	assert.equal(block.text, 'const a = 1;\nlet b;');
	const ranges = highlightedRanges(s, fence(s));
	const keywords = ranges.filter((range) => range.className === 'hljs-keyword').map((range) => s.sliceDoc(range.from, range.to));
	assert.deepEqual(keywords, ['const', 'let']);
});

test('code inside a quote keeps its highlight on the right characters', () => {
	const doc = '> ```js\n> const a = 1;\n> ```\n\nafter';
	const s = state(doc);
	const ranges = highlightedRanges(s, fence(s));
	assert.deepEqual(ranges.filter((range) => range.className === 'hljs-keyword').map((range) => s.sliceDoc(range.from, range.to)), ['const']);
});

test('a callout draws a tinted box, replaces its header and hides the quote marks of its body', () => {
  const doc = '> [!warning] Careful now\n> first line\n> second line\n\nafter';
  const s = state(doc);
  const all = spans(s);
  const lines = all.filter((span) => span.kind === 'line' && span.className.startsWith('lp-callout'));
  assert.deepEqual(lines.map((span) => span.className), ['lp-callout lp-callout-first', 'lp-callout', 'lp-callout lp-callout-last']);
  assert.ok(lines.every((span) => span.group === 'warning'));
  assert.ok(!all.some((span) => span.className === 'lp-quote'));
  const header = all.find((span) => span.kind === 'callout');
  assert.equal(s.sliceDoc(header.from, header.to), '> [!warning] Careful now');
  assert.equal(header.callout.title, 'Careful now');
  assert.equal(header.callout.fold, 'none');
  assert.deepEqual(all.filter((span) => span.kind === 'hide').map((span) => s.sliceDoc(span.from, span.to)), ['> ', '> ']);
});

test('callout types resolve through aliases and unknown types are custom', () => {
  const group = (doc) => spans(state(doc)).find((span) => span.kind === 'callout').group;
  assert.equal(group('> [!TIP]\n> x\n\nafter'), 'tip');
  assert.equal(group('> [!caution]\n> x\n\nafter'), 'warning');
  assert.equal(group('> [!decision]\n> x\n\nafter'), 'custom');
});

test('the header shows its source while the caret is on it', () => {
  const doc = '> [!note] Title\n> body\n\nafter';
  assert.ok(!spans(state(doc, 5)).some((span) => span.kind === 'callout'));
  assert.ok(spans(state(doc, doc.length)).some((span) => span.kind === 'callout'));
});

test('a closed top-level callout keeps only its header until the caret enters it', () => {
  const doc = '> [!faq]- Why\n> hidden body\n> more\n\nafter';
  const away = state(doc, doc.length);
  const lines = spans(away).filter((span) => span.kind === 'line' && span.className.startsWith('lp-callout'));
  assert.deepEqual(lines.map((span) => span.className), ['lp-callout lp-callout-first lp-callout-last']);
  assert.equal(spans(away).find((span) => span.kind === 'callout').callout.fold, 'closed');
  assert.equal(calloutFoldRanges(away), 1);
  const inside = state(doc, 20);
  assert.equal(spans(inside).filter((span) => span.kind === 'line' && span.className.startsWith('lp-callout')).length, 3);
  assert.equal(calloutFoldRanges(inside), 0);
  assert.equal(calloutFoldRanges(state(doc, 20, 20, [EditorState.readOnly.of(true)])), 1);
});

test('nested callouts cannot be folded and ordinary quotes are not callouts', () => {
  const nested = state('> outer\n>\n> > [!note]- inner\n> > body\n\nafter');
  assert.equal(spans(nested).find((span) => span.kind === 'callout').callout.fold, 'none');
  assert.ok(spans(state('> just a quote\n\nafter')).some((span) => span.className === 'lp-quote'));
  assert.ok(!spans(state('> just a quote\n\nafter')).some((span) => span.kind === 'callout'));
});

test('quotes inside quotes get a second bar', () => {
  const classes = spans(state('> outer\n> > inner\n\nafter')).filter((span) => span.kind === 'line').map((span) => span.className);
  assert.ok(classes.includes('lp-quote'));
  assert.ok(classes.includes('lp-quote-nested'));
});

import { calloutFolds } from '../src/lib/editor/source/callouts.ts';
function calloutFoldRanges(s) {
  const field = calloutFolds();
  const folded = EditorState.create({ doc: s.doc.toString(), selection: s.selection, extensions: [markdown({ extensions: sourceMarkdownExtensions }), field, EditorState.readOnly.of(s.readOnly)] });
  ensureSyntaxTree(folded, folded.doc.length, 5000);
  const refreshed = folded.update({}).state;
  const decorations = refreshed.field(field);
  let count = 0; const cursor = decorations.iter(); while (cursor.value) { count++; cursor.next(); }
  return count;
}
