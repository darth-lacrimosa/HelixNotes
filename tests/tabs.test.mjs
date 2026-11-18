import assert from 'node:assert/strict';
import test from 'node:test';
import { closeTab, emptyTabs, moveTab, observeNote, parseTabs, retitle, serializeTabs, stepTab, titleFromPath } from '../src/lib/utils/tabs.ts';

const paths = (state) => state.tabs.map((tab) => tab.path);

test('the first note opens a tab and a second note replaces the active tab', () => {
  let state = observeNote(emptyTabs, '/v/a.md', 'A');
  assert.deepEqual(paths(state), ['/v/a.md']); assert.equal(state.active, 0);
  state = observeNote(state, '/v/b.md', 'B');
  assert.deepEqual(paths(state), ['/v/b.md']); assert.equal(state.active, 0);
});

test('a requested new tab is appended and activated; an already open note just activates its tab', () => {
  let state = observeNote(emptyTabs, '/v/a.md', 'A');
  state = observeNote(state, '/v/b.md', 'B', true);
  assert.deepEqual(paths(state), ['/v/a.md', '/v/b.md']); assert.equal(state.active, 1);
  state = observeNote(state, '/v/a.md', 'A');
  assert.equal(state.tabs.length, 2); assert.equal(state.active, 0);
  state = observeNote(state, '/v/b.md', 'B', true);
  assert.equal(state.tabs.length, 2); assert.equal(state.active, 1);
});

test('with a middle tab active, opening a note replaces that tab only', () => {
  let state = { tabs: [{ path: '/1', title: '1' }, { path: '/2', title: '2' }, { path: '/3', title: '3' }], active: 1 };
  state = observeNote(state, '/9', '9');
  assert.deepEqual(paths(state), ['/1', '/9', '/3']); assert.equal(state.active, 1);
});

test('paths that differ only by slashes are the same note', () => {
  const state = observeNote(observeNote(emptyTabs, 'C:\\v\\a.md', 'A'), 'C:/v/a.md', 'A', true);
  assert.equal(state.tabs.length, 1);
});

test('no note keeps the state, and a missing title falls back to the file name', () => {
  assert.equal(observeNote(emptyTabs, null, ''), emptyTabs);
  assert.equal(observeNote(emptyTabs, '/v/Plan.md', '').tabs[0].title, 'Plan');
  assert.equal(titleFromPath('C:\\v\\sub\\Notes.md'), 'Notes');
});

test('retitle updates a known tab only', () => {
  const state = observeNote(emptyTabs, '/v/a.md', 'A');
  assert.equal(retitle(state, '/v/a.md', 'Renamed').tabs[0].title, 'Renamed');
  assert.equal(retitle(state, '/v/other.md', 'X'), state);
  assert.equal(retitle(state, '/v/a.md', 'A'), state);
});

test('closing the active tab opens its neighbour; closing another tab keeps the active note', () => {
  const state = { tabs: [{ path: '/1', title: '1' }, { path: '/2', title: '2' }, { path: '/3', title: '3' }], active: 1 };
  let result = closeTab(state, 1);
  assert.deepEqual(paths(result.state), ['/1', '/3']); assert.equal(result.state.active, 1); assert.equal(result.open, '/3');
  result = closeTab({ ...state, active: 2 }, 2);
  assert.equal(result.state.active, 1); assert.equal(result.open, '/2');
  result = closeTab(state, 0);
  assert.deepEqual(paths(result.state), ['/2', '/3']); assert.equal(result.state.active, 0); assert.equal(result.open, null);
  result = closeTab(state, 2);
  assert.equal(result.state.active, 1); assert.equal(result.open, null);
});

test('the last tab cannot be closed', () => {
  const state = observeNote(emptyTabs, '/v/a.md', 'A');
  assert.deepEqual(closeTab(state, 0), { state, open: null });
});

test('stepping wraps around', () => {
  const state = { tabs: [{ path: '/1', title: '1' }, { path: '/2', title: '2' }, { path: '/3', title: '3' }], active: 2 };
  assert.equal(stepTab(state, 1), 0); assert.equal(stepTab(state, -1), 1);
  assert.equal(stepTab({ tabs: [], active: -1 }, 1), -1);
});

test('moving a tab keeps the same tab active', () => {
  const state = { tabs: [{ path: '/1', title: '1' }, { path: '/2', title: '2' }, { path: '/3', title: '3' }], active: 1 };
  let moved = moveTab(state, 1, 2); assert.deepEqual(paths(moved), ['/1', '/3', '/2']); assert.equal(moved.active, 2);
  moved = moveTab(state, 0, 2); assert.deepEqual(paths(moved), ['/2', '/3', '/1']); assert.equal(moved.active, 0);
  moved = moveTab(state, 2, 0); assert.deepEqual(paths(moved), ['/3', '/1', '/2']); assert.equal(moved.active, 2);
  assert.equal(moveTab(state, 0, 9), state);
});

test('stored tabs survive a round trip and bad data is ignored', () => {
  const state = { tabs: [{ path: '/1', title: '1' }, { path: '/2', title: '2' }], active: 1 };
  assert.deepEqual(parseTabs(serializeTabs(state)), state);
  for (const bad of [null, '', 'nope', '{}', '{"v":2,"tabs":[]}', '{"v":1,"tabs":"x"}']) assert.deepEqual(parseTabs(bad), emptyTabs);
  assert.deepEqual(parseTabs('{"v":1,"tabs":[{"path":"/1","title":"1"},{"path":"/1","title":"dup"},{"nope":1}],"active":7}'), { tabs: [{ path: '/1', title: '1' }], active: 0 });
});
