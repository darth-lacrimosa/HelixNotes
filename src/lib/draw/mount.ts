import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

// Fonts are served with the app (static/excalidraw-assets/fonts) so drawing works offline.
(window as unknown as Record<string, unknown>).EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';

/** Mount the Excalidraw canvas into `element`. Returns a function that unmounts it. */
export function mountExcalidraw(element: HTMLElement, options: { dark?: boolean } = {}): () => void {
	const root = createRoot(element);
	root.render(React.createElement(Excalidraw, { theme: options.dark ? 'dark' : 'light' }));
	return () => root.unmount();
}
