<script lang="ts">
	import { tick } from 'svelte';
	import { t as ui } from '$lib/i18n';
	import { editorDirty } from '$lib/stores/app';
	import { tabsState } from '$lib/stores/tabs';

	let { onselect, onclose }: { onselect: (path: string) => void; onclose: (index: number) => void } = $props();
	let list = $state<HTMLDivElement>();

	// Keep the active tab in view when there are more tabs than fit.
	$effect(() => {
		const index = $tabsState.active;
		void tick().then(() => list?.querySelector<HTMLElement>(`[data-tab="${index}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
	});

	function keydown(event: KeyboardEvent, index: number, path: string) {
		if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onselect(path); }
		else if (event.key === 'Delete') { event.preventDefault(); onclose(index); }
	}
	// Middle click closes a tab, as in a browser.
	function aux(event: MouseEvent, index: number) {
		if (event.button !== 1) return;
		event.preventDefault();
		onclose(index);
	}
</script>

{#if $tabsState.tabs.length > 1}
	<div class="tab-bar" role="tablist" aria-label={$ui('ui.tabs')} bind:this={list}>
		{#each $tabsState.tabs as tab, index (tab.path)}
			{@const active = index === $tabsState.active}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="tab" class:active role="tab" tabindex={active ? 0 : -1} aria-selected={active} data-tab={index} title={tab.path}
				onclick={() => onselect(tab.path)} onkeydown={(event) => keydown(event, index, tab.path)}
				onmousedown={(event) => { if (event.button === 1) event.preventDefault(); }} onauxclick={(event) => aux(event, index)}>
				<span class="title">{tab.title}</span>
				<button class="close" class:dirty={active && $editorDirty} type="button" tabindex="-1" aria-label={$ui('ui.close_tab')} title={$ui('ui.close_tab')}
					onclick={(event) => { event.stopPropagation(); onclose(index); }}>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
					<span class="dot" aria-hidden="true"></span>
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.tab-bar {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		flex-shrink: 0;
		padding: 4px 8px 0;
		overflow-x: auto;
		scrollbar-width: none;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border-light);
	}
	.tab-bar::-webkit-scrollbar { display: none; }
	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 0 1 180px;
		min-width: 96px;
		height: 30px;
		padding: 0 6px 0 12px;
		box-sizing: border-box;
		border: 1px solid transparent;
		border-bottom: none;
		border-radius: 6px 6px 0 0;
		color: var(--text-secondary);
		font-size: 13px;
		cursor: pointer;
		user-select: none;
	}
	.tab:hover { background: var(--bg-hover); color: var(--text-primary); }
	.tab.active {
		background: var(--bg-editor, var(--bg-primary));
		color: var(--text-primary);
		border-color: var(--border-light);
		box-shadow: inset 0 2px 0 var(--accent);
		margin-bottom: -1px;
	}
	.tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	.title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.close {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex: 0 0 auto;
		padding: 0;
		border: none;
		border-radius: 4px;
		background: none;
		color: inherit;
		cursor: pointer;
		opacity: 0;
	}
	.tab:hover .close, .tab.active .close, .close:focus-visible { opacity: 0.7; }
	.close:hover { opacity: 1; background: var(--bg-hover); }
	.dot { display: none; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
	/* An unsaved note shows a dot in place of the cross until the pointer is over it. */
	.close.dirty { opacity: 1; }
	.close.dirty svg { display: none; }
	.close.dirty .dot { display: block; }
	.close.dirty:hover svg { display: block; }
	.close.dirty:hover .dot { display: none; }
</style>
