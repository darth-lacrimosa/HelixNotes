/*
 * Drawings are Excalidraw scenes stored as `*.excalidraw.svg`: an ordinary SVG image that also carries the scene
 * inside it, so a note embeds it like any picture and it can still be opened for editing.
 */

/** Whether a Markdown image destination points at an editable drawing. */
export function isDrawingHref(href: string): boolean {
	const path = href.split(/[?#]/)[0];
	return /\.excalidraw\.svg$/i.test(path);
}

const pad = (value: number) => String(value).padStart(2, '0');

/** A readable, sortable name for a new drawing: `drawing-2026-11-19-0905.excalidraw.svg`. */
export function newDrawingName(now = new Date()): string {
	return `drawing-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.excalidraw.svg`;
}

export function svgToBytes(svg: string): number[] {
	return Array.from(new TextEncoder().encode(svg));
}

/** Language codes of the app mapped to Excalidraw's interface languages. */
export function excalidrawLanguage(language: string | null | undefined): string {
	const map: Record<string, string> = {
		de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', nl: 'nl-NL', ru: 'ru-RU', 'pt-BR': 'pt-BR', 'pt-PT': 'pt-PT',
	};
	return (language && map[language]) || 'en';
}

/** Messages between the editor and the canvas page. Both sides check the sender, so only these shapes are accepted. */
export type DrawMessage =
	| { type: 'helix-draw-ready' }
	| { type: 'helix-draw-shown' }
	| { type: 'helix-draw-init'; svg: string | null; dark: boolean; language: string }
	| { type: 'helix-draw-export'; id: number }
	| { type: 'helix-draw-exported'; id: number; svg: string; empty: boolean }
	| { type: 'helix-draw-error'; id: number; message: string }
	| { type: 'helix-draw-dirty'; dirty: boolean };

const drawTypes = new Set(['helix-draw-ready', 'helix-draw-shown', 'helix-draw-init', 'helix-draw-export', 'helix-draw-exported', 'helix-draw-error', 'helix-draw-dirty']);

export function isDrawMessage(value: unknown): value is DrawMessage {
	if (!value || typeof value !== 'object') return false;
	const message = value as Record<string, unknown>;
	if (typeof message.type !== 'string' || !drawTypes.has(message.type)) return false;
	switch (message.type) {
		case 'helix-draw-init': return (message.svg === null || typeof message.svg === 'string') && typeof message.dark === 'boolean' && typeof message.language === 'string';
		case 'helix-draw-export': return typeof message.id === 'number';
		case 'helix-draw-exported': return typeof message.id === 'number' && typeof message.svg === 'string' && typeof message.empty === 'boolean';
		case 'helix-draw-error': return typeof message.id === 'number' && typeof message.message === 'string';
		case 'helix-draw-dirty': return typeof message.dirty === 'boolean';
		default: return true;
	}
}
