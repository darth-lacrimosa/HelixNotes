import assert from 'node:assert/strict';
import test from 'node:test';
import { get } from 'svelte/store';
import { closeSplit, followSplit, openInSplit, setSplitVault, splitState } from '../src/lib/stores/split.ts';

test('opening a note shows it and a deliberate choice bumps the nonce', () => {
  const release = setSplitVault();
  assert.equal(get(splitState), null);
  openInSplit('/vault/one.md');
  const first = get(splitState);
  assert.equal(first.path, '/vault/one.md');
  openInSplit('/vault/two.md');
  assert.equal(get(splitState).path, '/vault/two.md');
  assert.ok(get(splitState).nonce > first.nonce);
  release();
});

test('following a link keeps the pane (same nonce) but remembers the note', () => {
  const release = setSplitVault();
  openInSplit('/vault/one.md');
  const before = get(splitState);
  followSplit('/vault/linked.md');
  assert.deepEqual(get(splitState), { path: '/vault/linked.md', nonce: before.nonce });
  closeSplit(); followSplit('/vault/ignored.md');
  assert.equal(get(splitState), null);
  release();
});

test('a new layout starts without a split: it is not restored on the next start', () => {
  let release = setSplitVault();
  openInSplit('/vault/note.md');
  assert.equal(get(splitState).path, '/vault/note.md');
  release();
  release = setSplitVault();
  assert.equal(get(splitState), null);
  release();
});

test('a replaced layout cannot close the newer one', () => {
  const old = setSplitVault();
  const current = setSplitVault();
  openInSplit('/vault/x.md');
  old();
  assert.equal(get(splitState).path, '/vault/x.md');
  current();
  assert.equal(get(splitState), null);
});

test('every opening gets a new nonce, even after the split was closed', () => {
  const release = setSplitVault();
  openInSplit('/vault/same.md');
  const first = get(splitState).nonce;
  closeSplit();
  openInSplit('/vault/same.md');
  assert.ok(get(splitState).nonce > first);
  release();
});
