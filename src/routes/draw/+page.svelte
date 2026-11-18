<script lang="ts">
	import { onMount } from 'svelte';
	import { isDrawMessage, type DrawMessage } from '$lib/draw/drawing';
	import type { DrawHandle } from '$lib/draw/mount';

	let host: HTMLDivElement;
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let message = $state('');

	// This page runs in its own frame, opened by the editor and thrown away when the drawing is closed.
	// React and Excalidraw are fetched only here, so none of it stays in the memory of the main app.
	onMount(() => {
		let cancelled = false;
		let handle: DrawHandle | undefined;
		const embedded = window.parent !== window;
		const params = new URLSearchParams(window.location.search);
		const post = (reply: DrawMessage) => window.parent.postMessage(reply, window.location.origin);

		async function start(init: { svg: string | null; dark: boolean; language: string }) {
			if (handle || cancelled) return;
			try {
				const { mountExcalidraw } = await import('$lib/draw/mount');
				if (cancelled) return;
				handle = await mountExcalidraw(host, { ...init, onDirty: (dirty) => { if (embedded) post({ type: 'helix-draw-dirty', dirty }); } });
				status = 'ready';
				if (embedded) post({ type: 'helix-draw-shown' });
			} catch (error) {
				message = String(error);
				status = 'error';
			}
		}

		async function onMessage(event: MessageEvent) {
			if (event.source !== window.parent || event.origin !== window.location.origin || !isDrawMessage(event.data)) return;
			const data = event.data;
			if (data.type === 'helix-draw-init') {
				await start({ svg: data.svg, dark: data.dark, language: data.language });
			} else if (data.type === 'helix-draw-export') {
				try {
					if (!handle) throw new Error('The canvas is not ready yet');
					const result = await handle.exportSvg();
					post({ type: 'helix-draw-exported', id: data.id, svg: result.svg, empty: result.empty });
				} catch (error) {
					post({ type: 'helix-draw-error', id: data.id, message: String(error) });
				}
			}
		}

		if (embedded) {
			window.addEventListener('message', onMessage);
			post({ type: 'helix-draw-ready' });
		} else {
			// Opened on its own (development): a blank canvas.
			void start({ svg: null, dark: params.get('dark') === '1', language: 'en' });
		}
		return () => { cancelled = true; window.removeEventListener('message', onMessage); handle?.unmount(); };
	});
</script>

<div class="draw-root" bind:this={host}></div>
{#if status !== 'ready'}
	<p class="draw-status">{status === 'error' ? message : 'Loading…'}</p>
{/if}

<style>
	:global(html, body) { margin: 0; height: 100%; overflow: hidden; }
	.draw-root { position: fixed; inset: 0; }
	.draw-status { position: fixed; left: 16px; top: 12px; margin: 0; font: 13px sans-serif; color: #888; }
</style>
