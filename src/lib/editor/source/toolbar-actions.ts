/*
 * What the formatting toolbar asks an editor to do. The toolbar does not hold an editor: it emits these actions
 * and whoever owns the active editor performs them, so one toolbar can drive either pane of a split view.
 * Actions are plain data so they can cross into the second pane (an iframe) by postMessage.
 */
export type InsertKind = 'image' | 'file' | 'datetime';

export type ToolbarAction =
	| { kind: 'command'; id: string }
	| { kind: 'heading'; level: number }
	| { kind: 'insert'; what: InsertKind }
	| { kind: 'insert-file'; file: File };

/** Whether `value` (typically a message from another frame) is an action this app understands. */
export function isToolbarAction(value: unknown): value is ToolbarAction {
	if (!value || typeof value !== 'object') return false;
	const action = value as Record<string, unknown>;
	switch (action.kind) {
		case 'command': return typeof action.id === 'string';
		case 'heading': return typeof action.level === 'number' && Number.isInteger(action.level) && action.level >= 0 && action.level <= 6;
		case 'insert': return action.what === 'image' || action.what === 'file' || action.what === 'datetime';
		case 'insert-file': return typeof File !== 'undefined' && action.file instanceof File;
		default: return false;
	}
}
