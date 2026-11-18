import { writable } from 'svelte/store';

/*
 * Split view: a second note shown beside the main editor. The second pane is the same editor running in an
 * iframe (see SplitPane), so it needs only to know which note to show. `nonce` changes when a note is chosen
 * on purpose (the pane reloads); `path` also follows links the pane itself navigates (no reload).
 * The split is a working surface for the current session: it is not restored when the app starts again.
 */

export interface SplitState { path: string; nonce: number }

export const splitState = writable<SplitState | null>(null);

let owner = 0;

/**
 * Start a layout with no split. The returned release closes the split, but a layout that was already
 * replaced (vault switch) must not close the newer one, so a stale release does nothing.
 */
export function setSplitVault(): () => void {
	const id = ++owner;
	splitState.set(null);
	return () => {
		if (owner === id) splitState.set(null);
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
