import assert from 'node:assert/strict';
import test from 'node:test';
import { get } from 'svelte/store';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
};
const { closeSplit, followSplit, openInSplit, parseSplit, setSplitVault, splitState } = await import('../src/lib/stores/split.ts');

test('opening a note shows it and a deliberate choice bumps the nonce', () => {
  const release = setSplitVault('/vault-a');
  assert.equal(get(splitState), null);
  openInSplit('/vault-a/one.md');
  const first = get(splitState);
  assert.equal(first.path, '/vault-a/one.md');
  openInSplit('/vault-a/two.md');
  assert.equal(get(splitState).path, '/vault-a/two.md');
  assert.ok(get(splitState).nonce > first.nonce);
  release();
});

test('following a link keeps the pane (same nonce) but remembers the note', () => {
  const release = setSplitVault('/vault-b');
  openInSplit('/vault-b/one.md');
  const before = get(splitState);
  followSplit('/vault-b/linked.md');
  assert.deepEqual(get(splitState), { path: '/vault-b/linked.md', nonce: before.nonce });
  followSplit('/vault-b/linked.md');
  closeSplit(); followSplit('/vault-b/ignored.md');
  assert.equal(get(splitState), null);
  release();
});

test('the split is remembered per vault and cleared when closed', () => {
  let release = setSplitVault('/vault-c');
  openInSplit('/vault-c/note.md');
  release();
  release = setSplitVault('/vault-d');
  assert.equal(get(splitState), null);
  release();
  release = setSplitVault('/vault-c');
  assert.equal(get(splitState).path, '/vault-c/note.md');
  closeSplit();
  release();
  release = setSplitVault('/vault-c');
  assert.equal(get(splitState), null);
  release();
});

test('a replaced layout cannot release the newer one', () => {
  const old = setSplitVault('/vault-e');
  const current = setSplitVault('/vault-e');
  openInSplit('/vault-e/x.md');
  old();
  assert.equal(get(splitState).path, '/vault-e/x.md');
  current();
  assert.equal(get(splitState), null);
});

test('bad stored data is ignored', () => {
  for (const bad of [null, '', 'nope', '{}', '{"v":2,"path":"/x"}', '{"v":1,"path":""}']) assert.equal(parseSplit(bad), null);
  assert.deepEqual(parseSplit('{"v":1,"path":"/x.md"}'), { path: '/x.md', nonce: 1 });
});
