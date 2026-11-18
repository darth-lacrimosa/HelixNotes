/*
 * Note tabs. Pure state transitions: the interface asks for a note, these functions decide which tab holds it.
 * Like a file explorer in Obsidian, opening a note replaces the active tab; a new tab is opened on request.
 */

export interface Tab { path: string; title: string }
export interface TabsState { tabs: Tab[]; active: number }

export const emptyTabs: TabsState = { tabs: [], active: -1 };

const normal = (path: string) => path.replace(/\\/g, '/');
const same = (a: string, b: string) => normal(a) === normal(b);

/** A readable fallback title: the file name without its extension. */
export function titleFromPath(path: string): string {
	const name = normal(path).split('/').pop() ?? path;
	return name.replace(/\.(md|markdown|txt)$/i, '') || name;
}

/** The note `path` became the open note. Activates its tab, or replaces the active tab, or adds one. */
export function observeNote(state: TabsState, path: string | null, title: string, inNewTab = false): TabsState {
	if (!path) return state;
	const label = title || titleFromPath(path);
	const existing = state.tabs.findIndex((tab) => same(tab.path, path));
	if (existing >= 0) {
		const tabs = state.tabs[existing].title === label && state.tabs[existing].path === path
			? state.tabs : state.tabs.map((tab, index) => (index === existing ? { path, title: label } : tab));
		return tabs === state.tabs && state.active === existing ? state : { tabs, active: existing };
	}
	if (inNewTab || state.active < 0 || state.active >= state.tabs.length) {
		return { tabs: [...state.tabs, { path, title: label }], active: state.tabs.length };
	}
	return { tabs: state.tabs.map((tab, index) => (index === state.active ? { path, title: label } : tab)), active: state.active };
}

/** The open note was renamed or retitled: keep its tab's label current. */
export function retitle(state: TabsState, path: string, title: string): TabsState {
	const index = state.tabs.findIndex((tab) => same(tab.path, path));
	if (index < 0 || !title || state.tabs[index].title === title) return state;
	return { ...state, tabs: state.tabs.map((tab, i) => (i === index ? { ...tab, title } : tab)) };
}

/** Close a tab. `open` is the note to show next when the active tab was closed. The last tab cannot be closed. */
export function closeTab(state: TabsState, index: number): { state: TabsState; open: string | null } {
	if (state.tabs.length <= 1 || index < 0 || index >= state.tabs.length) return { state, open: null };
	const tabs = state.tabs.filter((_, i) => i !== index);
	if (index === state.active) {
		const next = Math.min(index, tabs.length - 1);
		return { state: { tabs, active: next }, open: tabs[next].path };
	}
	return { state: { tabs, active: index < state.active ? state.active - 1 : state.active }, open: null };
}

/** Index of the tab `delta` steps away from the active one, wrapping around. */
export function stepTab(state: TabsState, delta: number): number {
	const count = state.tabs.length;
	if (!count) return -1;
	return (((state.active < 0 ? 0 : state.active) + delta) % count + count) % count;
}

export function moveTab(state: TabsState, from: number, to: number): TabsState {
	const count = state.tabs.length;
	if (from < 0 || from >= count || to < 0 || to >= count || from === to) return state;
	const tabs = state.tabs.slice();
	const [moved] = tabs.splice(from, 1);
	tabs.splice(to, 0, moved);
	const active = state.active === from ? to : from < state.active && to >= state.active ? state.active - 1
		: from > state.active && to <= state.active ? state.active + 1 : state.active;
	return { tabs, active };
}

export function serializeTabs(state: TabsState): string {
	return JSON.stringify({ v: 1, tabs: state.tabs, active: state.active });
}

/** Read stored tabs, tolerating anything unexpected. */
export function parseTabs(raw: string | null | undefined): TabsState {
	if (!raw) return emptyTabs;
	try {
		const data = JSON.parse(raw);
		if (!data || data.v !== 1 || !Array.isArray(data.tabs)) return emptyTabs;
		const tabs: Tab[] = [];
		for (const item of data.tabs) {
			if (item && typeof item.path === 'string' && item.path && typeof item.title === 'string'
				&& !tabs.some((tab) => same(tab.path, item.path))) tabs.push({ path: item.path, title: item.title });
		}
		const active = Number.isInteger(data.active) && data.active >= 0 && data.active < tabs.length ? data.active : tabs.length ? 0 : -1;
		return { tabs, active };
	} catch {
		return emptyTabs;
	}
}
