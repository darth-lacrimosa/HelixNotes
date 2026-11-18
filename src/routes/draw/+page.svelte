<script lang="ts">
	import { onMount } from 'svelte';

	let host: HTMLDivElement;
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let message = $state('');

	// The canvas (React and Excalidraw) is fetched only now. This page is meant to run in its own frame, which is
	// thrown away when the drawing is closed, so none of it stays in the memory of the main app.
	onMount(() => {
		let cancelled = false;
		let dispose: (() => void) | undefined;
		const dark = new URLSearchParams(window.location.search).get('dark') === '1';
		void (async () => {
			try {
				const { mountExcalidraw } = await import('$lib/draw/mount');
				if (cancelled) return;
				dispose = mountExcalidraw(host, { dark });
				status = 'ready';
			} catch (error) {
				message = String(error);
				status = 'error';
			}
		})();
		return () => { cancelled = true; dispose?.(); };
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
