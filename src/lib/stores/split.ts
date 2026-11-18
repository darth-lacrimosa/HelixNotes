import { writable } from 'svelte/store';

/*
 * Split view: a second note shown beside the main editor. The second pane is the same editor running in an
 * iframe (see SplitPane), so it needs only to know which note to show. `nonce` changes when a note is chosen
 * on purpose (the pane reloads); `path` also follows links the pane itself navigates (no reload).
 */

export interface SplitState { path: string; nonce: number }

export const splitState = writable<SplitState | null>(null);

let vaultKey: string | null = null;
let owner = 0;
const storageKey = (vault: string) => `helixnotes.split.v1:${vault}`;

/** Track the split for a vault, restoring it. The returned release ignores a layout that was already replaced. */
export function setSplitVault(vault: string): () => void {
	const id = ++owner;
	vaultKey = vault;
	let saved: string | null = null;
	try { saved = localStorage.getItem(storageKey(vault)); } catch { /* storage unavailable */ }
	splitState.set(parseSplit(saved));
	return () => {
		if (owner !== id) return;
		vaultKey = null;
		splitState.set(null);
	};
}

/** Show `path` in the split pane, opening it if needed. */
export function openInSplit(path: string): void {
	splitState.update((state) => ({ path, nonce: (state?.nonce ?? 0) + 1 }));
}

export function closeSplit(): void { splitState.set(null); }

/** The pane followed a link to another note: remember it without reloading the pane. */
export function followSplit(path: string): void {
	splitState.update((state) => (state && state.path !== path ? { ...state, path } : state));
}

export function parseSplit(raw: string | null | undefined): SplitState | null {
	if (!raw) return null;
	try {
		const data = JSON.parse(raw);
		return data && data.v === 1 && typeof data.path === 'string' && data.path ? { path: data.path, nonce: 1 } : null;
	} catch {
		return null;
	}
}

splitState.subscribe((state) => {
	if (!vaultKey) return;
	try {
		if (state) localStorage.setItem(storageKey(vaultKey), JSON.stringify({ v: 1, path: state.path }));
		else localStorage.removeItem(storageKey(vaultKey));
	} catch { /* storage unavailable */ }
});
