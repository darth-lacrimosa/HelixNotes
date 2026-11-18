import { get, writable } from 'svelte/store';
import { activeNote, activeNotePath } from './app';
import { emptyTabs, observeNote, parseTabs, retitle, serializeTabs, type TabsState } from '../utils/tabs';

/*
 * Open-note tabs for the current vault. They follow `activeNotePath`, so every way of opening a note
 * (list, search, links, switcher) gets a tab without knowing about tabs. Tabs are remembered per vault.
 */

export const tabsState = writable<TabsState>(emptyTabs);

let vaultKey: string | null = null;
let newTabRequested = false;
const storageKey = (vault: string) => `helixnotes.tabs.v1:${vault}`;

let owner = 0;

/**
 * Start tracking tabs for a vault, restoring its saved tabs. Returns a release function; a layout that is
 * replaced by a newer one (vault switch) must not stop the newer layout's tracking, so a stale release does nothing.
 */
export function setTabsVault(vault: string): () => void {
	const id = ++owner;
	vaultKey = vault;
	let saved: string | null = null;
	try { saved = localStorage.getItem(storageKey(vault)); } catch { /* storage unavailable */ }
	tabsState.set(parseTabs(saved));
	return () => {
		if (owner !== id) return;
		vaultKey = null;
		tabsState.set(emptyTabs);
	};
}

/** The next note that becomes active should get its own tab instead of replacing the current one. */
export function requestNewTab(): void { newTabRequested = true; }
export function clearNewTabRequest(): void { newTabRequested = false; }

tabsState.subscribe((state) => {
	if (!vaultKey) return;
	try { localStorage.setItem(storageKey(vaultKey), serializeTabs(state)); } catch { /* storage unavailable */ }
});

activeNotePath.subscribe((path) => {
	if (!vaultKey || !path) return;
	const note = get(activeNote);
	const title = note && note.path === path ? note.meta.title : '';
	tabsState.update((state) => observeNote(state, path, title, newTabRequested));
});

activeNote.subscribe((note) => {
	if (!vaultKey || !note) return;
	tabsState.update((state) => retitle(state, note.path, note.meta.title));
});
