import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, exportToSvg, loadFromBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

// Fonts are served with the app (static/excalidraw-assets/fonts) so drawing works offline.
(window as unknown as Record<string, unknown>).EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';

export interface DrawHandle {
	/** The scene as an SVG image with the scene itself embedded, so it can be opened for editing again. */
	exportSvg(): Promise<{ svg: string; empty: boolean }>;
	unmount(): void;
}

export interface DrawOptions {
	/** An existing drawing (an SVG with an embedded scene) to continue editing; null starts a blank canvas. */
	svg: string | null;
	dark: boolean;
	/** An Excalidraw language code such as `de-DE`. */
	language: string;
	onDirty?: (dirty: boolean) => void;
}

interface LoadedScene { elements: readonly { id: string; version: number; isDeleted?: boolean }[]; files: unknown }

interface ApiLike {
	getSceneElements(): readonly { id: string; version: number; isDeleted?: boolean }[];
	getAppState(): Record<string, unknown>;
	getFiles(): Record<string, unknown>;
}

/** Mount the Excalidraw canvas into `element`. */
export async function mountExcalidraw(element: HTMLElement, options: DrawOptions): Promise<DrawHandle> {
	let initial: LoadedScene | null = null;
	if (options.svg) {
		try {
			initial = (await loadFromBlob(new Blob([options.svg], { type: 'image/svg+xml' }), null, null)) as unknown as LoadedScene;
		} catch (error) {
			// An SVG that carries no scene opens as a blank canvas rather than failing.
			console.warn('The drawing has no editable scene:', error);
		}
	}

	let api: ApiLike | null = null;
	const signature = (elements: readonly { id: string; version: number; isDeleted?: boolean }[]) =>
		elements.filter((element) => !element.isDeleted).map((element) => `${element.id}:${element.version}`).join(',');
	const baseline = initial ? signature(initial.elements) : '';
	let dirty = false;

	const root = createRoot(element);
	const canvas = Excalidraw as unknown as React.ComponentType<Record<string, unknown>>;
	root.render(React.createElement(canvas, {
		excalidrawAPI: (value: ApiLike) => { api = value; },
		initialData: initial ? { elements: initial.elements, files: initial.files, scrollToContent: true } : null,
		theme: options.dark ? 'dark' : 'light',
		langCode: options.language,
		// Files and export belong to the note, not to the canvas.
		UIOptions: { canvasActions: { loadScene: false, export: false, saveAsImage: false, saveToActiveFile: false } },
		onChange: (elements: readonly { id: string; version: number; isDeleted?: boolean }[]) => {
			const changed = signature(elements) !== baseline;
			if (changed !== dirty) { dirty = changed; options.onDirty?.(dirty); }
		},
	}));

	return {
		async exportSvg() {
			if (!api) throw new Error('The canvas is not ready yet');
			const elements = api.getSceneElements().filter((element) => !element.isDeleted);
			if (!elements.length) return { svg: '', empty: true };
			// Light colours and a transparent background; the dark theme draws the picture inverted, as Excalidraw does itself.
			const appState = { ...api.getAppState(), exportBackground: false, exportWithDarkMode: false, exportEmbedScene: true };
			const files = api.getFiles();
			const render = (skipInliningFonts: boolean) => exportToSvg({
				elements, appState, files, exportPadding: 16, skipInliningFonts,
			} as never);
			let node: SVGSVGElement;
			try {
				node = await render(false);
			} catch (error) {
				// Inlining fonts needs WebAssembly and a worker; without them the picture still exports, using system fonts.
				console.warn('Embedding fonts failed; exporting without them:', error);
				node = await render(true);
			}
			return { svg: new XMLSerializer().serializeToString(node), empty: false };
		},
		unmount: () => root.unmount(),
	};
}
