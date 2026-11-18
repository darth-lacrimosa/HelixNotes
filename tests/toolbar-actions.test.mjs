import assert from 'node:assert/strict';
import test from 'node:test';
import { isToolbarAction } from '../src/lib/editor/source/toolbar-actions.ts';

test('known toolbar actions are accepted', () => {
  for (const action of [
    { kind: 'command', id: 'bold' },
    { kind: 'heading', level: 0 },
    { kind: 'heading', level: 3 },
    { kind: 'insert', what: 'image' },
    { kind: 'insert', what: 'file' },
    { kind: 'insert', what: 'datetime' },
    { kind: 'insert', what: 'drawing' },
    { kind: 'insert-file', file: new File(['x'], 'x.png') },
  ]) assert.equal(isToolbarAction(action), true, JSON.stringify(action));
});

test('anything else, such as a stray message from another frame, is rejected', () => {
  for (const value of [null, undefined, 'bold', 3, {}, { kind: 'command' }, { kind: 'command', id: 5 },
    { kind: 'heading', level: 7 }, { kind: 'heading', level: 1.5 }, { kind: 'heading', level: '2' },
    { kind: 'insert', what: 'secret' }, { kind: 'insert-file', file: 'not a file' }, { kind: 'format-disk' }]) {
    assert.equal(isToolbarAction(value), false, JSON.stringify(value));
  }
});
