<script lang="ts">
	import { onMount } from 'svelte';
	import { t as ui } from '$lib/i18n';
	import { splitState, closeSplit, followSplit } from '$lib/stores/split';
	import { titleFromPath } from '$lib/utils/tabs';

	import { isToolbarAction, type ToolbarAction } from '$lib/editor/source/toolbar-actions';

	let { vault, onfocus }: { vault: string; onfocus?: () => void } = $props();

	let frame = $state<HTMLIFrameElement>();
	let src = $state('');
	let title = $state('');
	let dirty = $state(false);
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
			title = titleFromPath(path);
			dirty = false;
			src = urlFor(path);
		})();
	});

	onMount(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin || !frame || event.source !== frame.contentWindow) return;
			const data = event.data as { type?: string; title?: string; path?: string; dirty?: boolean; id?: number; ok?: boolean } | null;
			if (!data) return;
			if (data.type === 'helix-pane-title' && typeof data.title === 'string') title = data.title;
			else if (data.type === 'helix-pane-note' && typeof data.path === 'string') followSplit(data.path);
			else if (data.type === 'helix-pane-dirty') dirty = !!data.dirty;
			else if (data.type === 'helix-pane-flushed' && typeof data.id === 'number') pending.get(data.id)?.(data.ok !== false);
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});

	async function close() {
		if (!(await flush())) return;
		closeSplit();
	}
</script>

{#if $splitState}
	<!-- Focus entering the frame (a click or Tab into the note) makes this the pane the toolbar acts on. -->
	<section class="split-pane" aria-label={$ui('ui.split_view')} onfocusin={() => onfocus?.()}>
		<div class="split-header">
			<span class="split-title" title={$splitState.path}>{title}</span>
			{#if dirty}<span class="split-dirty" title={$ui('ui.unsaved_changes')}></span>{/if}
			<button class="split-close" type="button" aria-label={$ui('ui.close_split_view')} title={$ui('ui.close_split_view')} onclick={close}>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
			</button>
		</div>
		{#if src}
			<iframe bind:this={frame} {src} title={title}></iframe>
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
	.split-header {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
		box-sizing: border-box;
		height: var(--pane-header-h);
		padding: 0 6px 0 14px;
		background: var(--bg-primary);
		box-shadow: inset 0 -1px 0 var(--border-light);
		color: var(--text-primary);
		font-size: 13px;
	}
	.split-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.split-dirty { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
	.split-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: none;
		border-radius: 2px;
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
	}
	.split-close:hover { background: var(--bg-hover); color: var(--text-primary); }
	iframe { flex: 1; min-height: 0; width: 100%; border: 0; background: var(--bg-editor, var(--bg-primary)); }
	/* While a divider is being dragged the pointer must not be swallowed by the frame. */
	:global(body.resizing) iframe { pointer-events: none; }
</style>
