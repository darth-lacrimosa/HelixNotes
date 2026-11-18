export const prerender = false;
export const ssr = false;

// A split-view pane is this same app inside an iframe of the main window. Tauri's IPC bridge is installed on
// the top frame, so a same-origin child borrows it; without this the pane could not read or save notes.
if (typeof window !== 'undefined' && window.parent !== window) {
	try {
		const parent = window.parent as unknown as Record<string, unknown>;
		const self = window as unknown as Record<string, unknown>;
		for (const key of ['__TAURI_INTERNALS__', '__TAURI_EVENT_PLUGIN_INTERNALS__']) {
			if (!self[key] && parent[key]) self[key] = parent[key];
		}
	} catch {
		// A cross-origin parent exposes nothing to borrow.
	}
}
