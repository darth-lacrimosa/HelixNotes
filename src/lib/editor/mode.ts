import { derived, writable } from 'svelte/store';

export type EditorMode = 'rich' | 'live' | 'source';
// Source and Live Preview use one source controller; this flag only changes its presentation.
// Preferences are per window/session, matching the existing source-mode behaviour.
// This fork edits Markdown directly: Live preview is the default everywhere. Rich text stays in the code
// (selectEditorMode('rich') still works) but no longer has any entry point in the interface.
export const sourceMode = writable(true);
export const livePreviewMode = writable(true);
export const editorMode = derived([sourceMode, livePreviewMode], ([$source, $live]): EditorMode =>
	$source ? ($live ? 'live' : 'source') : 'rich');

export function newNoteEditorMode(config: { new_note_editor_mode?: unknown; new_notes_in_source_mode?: unknown } | null | undefined): EditorMode {
	const mode = config?.new_note_editor_mode;
	// A stored "rich" preference from the upstream app resolves to Live preview.
	return mode === 'live' || mode === 'source' ? mode
		: config?.new_notes_in_source_mode === true ? 'source' : 'live';
}

export function selectEditorMode(mode: EditorMode): void {
	if (mode !== 'rich' && mode !== 'live' && mode !== 'source') return;
	if (mode !== 'rich') livePreviewMode.set(mode === 'live');
	sourceMode.set(mode !== 'rich');
}
