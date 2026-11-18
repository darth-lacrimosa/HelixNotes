import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorSelection, EditorState } from '@codemirror/state';
import { formatCommands, insertTable, setHeading, toggleList, toggleWrap } from '../src/lib/editor/source/format.ts';

/** Run a command on `doc` with selection [anchor, head]; return the text and selection afterwards. */
function run(command, doc, anchor = 0, head = anchor, extensions = []) {
	let state = EditorState.create({ doc, selection: EditorSelection.single(anchor, head), extensions });
	const handled = command({ state, dispatch: (transaction) => { state = transaction.state; } });
	const { anchor: a, head: h } = state.selection.main;
	return { handled, text: state.doc.toString(), anchor: a, head: h };
}

test('inline markers wrap a selection and keep it selected', () => {
	const result = run(formatCommands.bold, 'a word here', 2, 6);
	assert.equal(result.text, 'a **word** here');
	assert.deepEqual([result.anchor, result.head], [4, 8]);
});

test('the same marker toggles off, from outside or inside the selection', () => {
	assert.equal(run(formatCommands.bold, 'a **word** here', 4, 8).text, 'a word here');
	assert.equal(run(formatCommands.bold, 'a **word** here', 2, 10).text, 'a word here');
	assert.equal(run(formatCommands.strike, '~~x~~', 2, 3).text, 'x');
});

test('with no selection the pair is inserted and the caret sits between', () => {
	const result = run(formatCommands.italic, 'ab', 1);
	assert.equal(result.text, 'a**b');
	assert.equal(run(formatCommands['inline-code'], 'ab', 1).text, 'a``b');
	assert.deepEqual([result.anchor, result.head], [2, 2]);
	const empty = run(formatCommands.highlight, '');
	assert.equal(empty.text, '====');
	assert.equal(empty.anchor, 2);
	// With the caret between a pair it toggles back off.
	assert.equal(run(formatCommands.highlight, '====', 2).text, '');
});

test('italic does not take one asterisk away from bold', () => {
	assert.equal(run(formatCommands.italic, '**word**', 2, 6).text, '***word***');
	assert.equal(run(formatCommands.italic, '*word*', 1, 5).text, 'word');
});

test('underline, subscript and superscript use HTML tags', () => {
	assert.equal(run(formatCommands.underline, 'x', 0, 1).text, '<u>x</u>');
	assert.equal(run(formatCommands.subscript, 'x', 0, 1).text, '<sub>x</sub>');
	assert.equal(run(formatCommands.superscript, '<sup>x</sup>', 5, 6).text, 'x');
});

test('a link wraps the selection and selects the url', () => {
	const result = run(formatCommands.link, 'see docs now', 4, 8);
	assert.equal(result.text, 'see [docs](url) now');
	assert.equal(result.text.slice(result.anchor, result.head), 'url');
	const empty = run(formatCommands.link, '', 0);
	assert.equal(empty.text, '[](url)');
	assert.equal(empty.anchor, 1);
});

test('headings replace the previous level and toggle off on repeat', () => {
	assert.equal(run(setHeading(2), 'Title').text, '## Title');
	assert.equal(run(setHeading(1), '### Title').text, '# Title');
	assert.equal(run(setHeading(2), '## Title').text, 'Title');
	assert.equal(run(setHeading(0), '### Title').text, 'Title');
});

test('lists number lines, skip blank ones and toggle off', () => {
	assert.equal(run(formatCommands['bullet-list'], 'a\nb', 0, 3).text, '- a\n- b');
	assert.equal(run(formatCommands['ordered-list'], 'a\n\nb', 0, 4).text, '1. a\n\n2. b');
	assert.equal(run(formatCommands['task-list'], 'a').text, '- [ ] a');
	assert.equal(run(formatCommands['bullet-list'], '- a\n- b', 0, 7).text, 'a\nb');
});

test('switching list kind replaces the marker and keeps indentation', () => {
	assert.equal(run(toggleList('ordered'), '  - item').text, '  1. item');
	assert.equal(run(toggleList('bullet'), '- [x] done').text, '- done');
	assert.equal(run(toggleList('task'), '- item').text, '- [ ] item');
});

test('quotes toggle per line', () => {
	assert.equal(run(formatCommands.quote, 'a\nb', 0, 3).text, '> a\n> b');
	assert.equal(run(formatCommands.quote, '> a\n> b', 0, 7).text, 'a\nb');
});

test('code blocks fence the selected lines and unfence on repeat', () => {
	assert.equal(run(formatCommands['code-block'], 'a\nb', 0, 3).text, '```\na\nb\n```');
	assert.equal(run(formatCommands['code-block'], '```\na\n```', 4, 5).text, 'a');
	const empty = run(formatCommands['code-block'], '');
	assert.equal(empty.text, '```\n\n```');
	assert.equal(empty.anchor, 4);
});

test('blocks are inserted on their own lines', () => {
	assert.equal(run(formatCommands['horizontal-rule'], 'text', 4).text, 'text\n\n---\n');
	assert.equal(run(formatCommands['horizontal-rule'], '').text, '---\n');
	const table = run(insertTable(3, 2), '');
	assert.equal(table.text, '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n|  |  |\n');
	assert.equal(table.text.slice(table.anchor, table.head), 'Column 1');
	assert.match(run(formatCommands.callout, 'x', 1).text, /^x\n\n> \[!note\]\n> \n$/);
});

test('nothing changes in a read-only document', () => {
	const result = run(formatCommands.bold, 'word', 0, 4, [EditorState.readOnly.of(true)]);
	assert.equal(result.handled, false);
	assert.equal(result.text, 'word');
});

test('toggleWrap accepts a custom pair', () => {
	assert.equal(run(toggleWrap('(', ')'), 'x', 0, 1).text, '(x)');
});
