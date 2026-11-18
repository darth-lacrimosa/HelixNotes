<script lang="ts">
	import { t as ui, label as uiLabel } from '$lib/i18n';
	import { formatCommands } from '$lib/editor/source/format';
	import type { InsertKind, ToolbarAction } from '$lib/editor/source/toolbar-actions';
	import { groupToolbarButtons, toolbarLabels, type ResolvedToolbarLayout, type ToolbarButtonId } from '$lib/editor/toolbar';

	// The toolbar holds no editor; it reports what was asked and the owner of the active editor does it.
	let { layout, disabled = false, onaction }: {
		layout: ResolvedToolbarLayout;
		disabled?: boolean;
		onaction: (action: ToolbarAction) => void;
	} = $props();

	// Colour and alignment have no Markdown form, and date/AI belong to the rich-text toolbar.
	const supported = (id: ToolbarButtonId) => id === 'heading' || id === 'insert' || id in formatCommands;
	const groups = $derived(groupToolbarButtons([...layout.main, ...layout.more].filter(supported), false));

	const icons: Record<string, string> = {
		insert: '<path d="M5 12h14"/><path d="M12 5v14"/>',
		heading: '<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>',
		bold: '<path d="M6 12h9a4 4 0 010 8H7a1 1 0 01-1-1V5a1 1 0 011-1h7a4 4 0 010 8"/>',
		italic: '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
		underline: '<path d="M6 4v6a6 6 0 0012 0V4"/><line x1="4" x2="20" y1="20" y2="20"/>',
		strike: '<path d="M16 4H9a3 3 0 00-2.83 4"/><path d="M14 12a4 4 0 010 8H6"/><line x1="4" x2="20" y1="12" y2="12"/>',
		link: '<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>',
		'bullet-list': '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
		'ordered-list': '<path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
		'task-list': '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
		undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>',
		redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/>',
		'inline-code': '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
		'code-block': '<path d="m10 9-3 3 3 3"/><path d="m14 15 3-3-3-3"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
		quote: '<path d="M17 5H3"/><path d="M21 12H8"/><path d="M21 19H8"/><path d="M3 12v7"/>',
		details: '<rect width="13" height="7" x="8" y="3" rx="1"/><path d="m2 9 3 3-3 3"/><rect width="13" height="7" x="8" y="14" rx="1"/>',
		callout: '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="5" x2="7" y2="19"/>',
		table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
		'horizontal-rule': '<path d="M5 12h14"/>',
		highlight: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 01-2.8 0l-5.2-5.2a2 2 0 010-2.8L14 4"/>',
		subscript: '<path d="m4 5 8 8"/><path d="m12 5-8 8"/><path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 00-2.62-.44c-.42.24-.74.62-.9 1.07"/>',
		superscript: '<path d="m4 19 8-8"/><path d="m12 19-8-8"/><path d="M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 00-2.617-.436c-.42.239-.738.614-.899 1.072"/>',
		indent: '<path d="M21 12H11"/><path d="M21 18H11"/><path d="M21 6H11"/><path d="m3 8 4 4-4 4"/>',
		outdent: '<path d="M21 12H11"/><path d="M21 18H11"/><path d="M21 6H11"/><path d="m7 8-4 4 4 4"/>',
	};

	let headingOpen = $state(false);
	let insertOpen = $state(false);
	const headings = [1, 2, 3, 4] as const;
	function runInsert(what: InsertKind) {
		insertOpen = false;
		if (!disabled) onaction({ kind: 'insert', what });
	}

	function runCommand(id: string) {
		if (!disabled) onaction({ kind: 'command', id });
	}
	function runHeading(level: number) {
		headingOpen = false;
		if (!disabled) onaction({ kind: 'heading', level });
	}
	// Keep the caret and selection in the editor when a button is pressed.
	function keepFocus(event: MouseEvent) {
		if (event.button === 0 && (event.target as Element).closest('button')) event.preventDefault();
	}
</script>

<svelte:window onclick={() => { headingOpen = false; insertOpen = false; }} />

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_interactive_supports_focus -->
<div class="source-toolbar" role="toolbar" aria-label={$ui('ui.formatting_options')} onmousedown={keepFocus}>
	{#each groups as group, index}
		{#if index > 0}<div class="sep"></div>{/if}
		{#each group as id (id)}
			{#if id === 'insert'}
				<div class="wrap">
					<button class="btn" type="button" {disabled} title={$ui('ui.insert')} aria-label={$ui('ui.insert')}
						aria-haspopup="menu" aria-expanded={insertOpen} onclick={(event) => { event.stopPropagation(); headingOpen = false; insertOpen = !insertOpen; }}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html icons.insert}</svg>
					</button>
					{#if insertOpen}
						<div class="menu" role="menu">
							<button type="button" role="menuitem" onclick={() => runInsert('image')}>{$ui('ui.image')}</button>
							<button type="button" role="menuitem" onclick={() => runInsert('file')}>{$ui('ui.file')}</button>
							<button type="button" role="menuitem" onclick={() => runInsert('drawing')}>{$ui('ui.drawing')}</button>
							<button type="button" role="menuitem" onclick={() => runInsert('datetime')}>{$ui('ui.date_time')}</button>
						</div>
					{/if}
				</div>
			{:else if id === 'heading'}
				<div class="wrap">
					<button class="btn" type="button" {disabled} title={$uiLabel(toolbarLabels.heading)} aria-label={$uiLabel(toolbarLabels.heading)}
						aria-haspopup="menu" aria-expanded={headingOpen} onclick={(event) => { event.stopPropagation(); insertOpen = false; headingOpen = !headingOpen; }}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html icons.heading}</svg>
					</button>
					{#if headingOpen}
						<div class="menu" role="menu">
							{#each headings as level}
								<button type="button" role="menuitem" onclick={() => runHeading(level)}>{$ui(`ui.heading_${level}`)}</button>
							{/each}
							<button type="button" role="menuitem" onclick={() => runHeading(0)}>{$ui('ui.paragraph')}</button>
						</div>
					{/if}
				</div>
			{:else}
				<button class="btn" type="button" {disabled} title={$uiLabel(toolbarLabels[id])} aria-label={$uiLabel(toolbarLabels[id])} onclick={() => runCommand(id)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html icons[id]}</svg>
				</button>
			{/if}
		{/each}
	{/each}
</div>

<style>
	.source-toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 2px;
		padding: 6px 20px;
		border-top: 1px solid var(--border-light);
		flex-shrink: 0;
	}
	.btn {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 5px 7px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 30px;
		height: 30px;
	}
	.btn svg { width: 18px; height: 18px; }
	.btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
	.btn:disabled { opacity: 0.4; cursor: default; }
	.btn:focus-visible, .menu button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	.sep { width: 1px; height: 16px; background: var(--border-color); margin: 0 3px; flex-shrink: 0; }
	.wrap { position: relative; }
	.menu {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		min-width: 140px;
		padding: 4px;
		background: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		box-shadow: var(--shadow-lg);
		z-index: 100;
	}
	.menu button {
		display: block;
		width: 100%;
		padding: 6px 12px;
		border: none;
		background: none;
		color: var(--text-primary);
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		border-radius: 4px;
	}
	.menu button:hover { background: var(--bg-hover); }
</style>
