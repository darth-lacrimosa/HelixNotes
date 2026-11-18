<script lang="ts">
	import { onMount } from 'svelte';
	import { t as ui } from '$lib/i18n';
	import { splitState, closeSplit, followSplit } from '$lib/stores/split';
	import { tabsState } from '$lib/stores/tabs';

	import { isToolbarAction, type ToolbarAction } from '$lib/editor/source/toolbar-actions';

	let { vault, onfocus }: { vault: string; onfocus?: () => void } = $props();

	let frame = $state<HTMLIFrameElement>();
	let src = $state('');
	// The frame stays invisible until its note is loaded: an unpainted frame is white, which flashes on a dark theme.
	let ready = $state(false);
	let readyTimer: ReturnType<typeof setTimeout> | null = null;
	function showFrame() {
		if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
		ready = true;
	}
	let shownNonce = -1;
	let seq = 0;
	const pending = new Map<number, (ok: boolean) => void>();

	/** Ask the pane to save its note. Resolves false only when the pane reports that saving failed. */
	export function flush(): Promise<boolean> {
		const target = frame?.contentWindow;
		if (!target || !src) return Promise.resolve(true);
		const id = ++seq;
		return new Promise((resolve) => {
			// A pane that never answers (still loading, crashed) must not block closing the window.
			const timer = setTimeout(() => { pending.delete(id); resolve(true); }, 2500);
			pending.set(id, (ok) => { clearTimeout(timer); pending.delete(id); resolve(ok); });
			target.postMessage({ type: 'helix-pane-flush', id }, window.location.origin);
		});
	}

	/** Hand a toolbar action to the editor in the pane. */
	export function sendAction(action: ToolbarAction): void {
		if (!isToolbarAction(action)) return;
		frame?.contentWindow?.postMessage({ type: 'helix-pane-action', action }, window.location.origin);
	}

	const urlFor = (path: string) => `/?pane=1&note=${encodeURIComponent(path)}&vault=${encodeURIComponent(vault)}`;

	// A note chosen on purpose reloads the pane; save what the old one holds first.
	$effect(() => {
		const state = $splitState;
		if (!state || state.nonce === shownNonce) return;
		shownNonce = state.nonce;
		const path = state.path;
		void (async () => {
			if (src) await flush();
			ready = false;
			if (readyTimer) clearTimeout(readyTimer);
			// If the pane never reports in, show whatever it has rather than leave the space empty.
			readyTimer = setTimeout(showFrame, 4000);
			src = urlFor(path);
		})();
	});

	onMount(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin || !frame || event.source !== frame.contentWindow) return;
			const data = event.data as { type?: string; path?: string; id?: number; ok?: boolean } | null;
			if (!data) return;
			if (data.type === 'helix-pane-note' && typeof data.path === 'string') { followSplit(data.path); showFrame(); }
			else if (data.type === 'helix-pane-focus') onfocus?.();
			// Ctrl+W typed inside the pane closes the pane, as it closes a tab in the main editor.
			else if (data.type === 'helix-pane-close') void close();
			else if (data.type === 'helix-pane-flushed' && typeof data.id === 'number') pending.get(data.id)?.(data.ok !== false);
		};
		// Focus moving into the frame blurs this window; the frame is then the active element.
		const onWindowBlur = () => { if (frame && document.activeElement === frame) onfocus?.(); };
		window.addEventListener('message', onMessage);
		window.addEventListener('blur', onWindowBlur);
		return () => {
			window.removeEventListener('message', onMessage);
			window.removeEventListener('blur', onWindowBlur);
		};
	});

	/** Save what the pane holds, then close it. */
	export async function close() {
		if (!(await flush())) return;
		closeSplit();
	}
</script>

{#if $splitState}
	<!-- Focus entering the frame (a click or Tab into the note) makes this the pane the toolbar acts on. -->
	<section class="split-pane" aria-label={$ui('ui.split_view')} onfocusin={() => onfocus?.()}>
		<!-- Keeps the line above the editors unbroken while the main editor shows its tab bar. -->
		{#if $tabsState.tabs.length > 1}<div class="split-strip"></div>{/if}
		{#if src}
			<iframe bind:this={frame} {src} class:ready title={$ui('ui.split_view')}></iframe>
		{/if}
	</section>
{/if}

<style>
	.split-pane {
		flex: 1 1 0;
		min-width: 280px;
		display: flex;
		flex-direction: column;
		border-left: 1px solid var(--border-color);
		background: var(--bg-editor, var(--bg-primary));
	}
	.split-strip {
		flex-shrink: 0;
		height: var(--pane-header-h);
		background: var(--bg-primary);
		box-shadow: inset 0 -1px 0 var(--border-light);
	}
	iframe { flex: 1; min-height: 0; width: 100%; border: 0; background: var(--bg-editor, var(--bg-primary)); opacity: 0; }
	iframe.ready { opacity: 1; transition: opacity 0.1s; }
	/* While a divider is being dragged the pointer must not be swallowed by the frame. */
	:global(body.resizing) iframe { pointer-events: none; }
</style>
