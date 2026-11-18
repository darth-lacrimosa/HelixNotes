<script lang="ts">
	import { onMount } from 'svelte';
	import { t as ui, tr as uiText } from '$lib/i18n';
	import { excalidrawLanguage, isDrawMessage, type DrawMessage } from '$lib/draw/drawing';

	let { svg, dark, language, onsave, oncancel }: {
		/** The drawing to continue editing, or null for a new one. */
		svg: string | null;
		dark: boolean;
		language: string | null | undefined;
		/** Store the exported SVG. Throwing keeps the canvas open and shows the message. */
		onsave: (svg: string) => Promise<void>;
		oncancel: () => void;
	} = $props();

	let frame = $state<HTMLIFrameElement>();
	let shown = $state(false);
	let dirty = $state(false);
	let saving = $state(false);
	let error = $state('');
	let seq = 0;
	const pending = new Map<number, { resolve: (reply: { svg: string; empty: boolean }) => void; reject: (reason: Error) => void }>();

	const origin = window.location.origin;
	const post = (message: DrawMessage) => frame?.contentWindow?.postMessage(message, origin);

	onMount(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== origin || !frame || event.source !== frame.contentWindow || !isDrawMessage(event.data)) return;
			const data = event.data;
			if (data.type === 'helix-draw-ready') post({ type: 'helix-draw-init', svg, dark, language: excalidrawLanguage(language) });
			else if (data.type === 'helix-draw-shown') shown = true;
			else if (data.type === 'helix-draw-dirty') dirty = data.dirty;
			else if (data.type === 'helix-draw-exported') { pending.get(data.id)?.resolve({ svg: data.svg, empty: data.empty }); pending.delete(data.id); }
			else if (data.type === 'helix-draw-error') { pending.get(data.id)?.reject(new Error(data.message)); pending.delete(data.id); }
		};
		window.addEventListener('message', onMessage);
		return () => {
			window.removeEventListener('message', onMessage);
			for (const request of pending.values()) request.reject(new Error('Closed'));
			pending.clear();
		};
	});

	function exportSvg(): Promise<{ svg: string; empty: boolean }> {
		const id = ++seq;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => { pending.delete(id); reject(new Error('The canvas did not answer')); }, 20_000);
			pending.set(id, {
				resolve: (reply) => { clearTimeout(timer); resolve(reply); },
				reject: (reason) => { clearTimeout(timer); reject(reason); },
			});
			post({ type: 'helix-draw-export', id });
		});
	}

	async function done() {
		if (saving || !shown) return;
		saving = true;
		error = '';
		try {
			const reply = await exportSvg();
			// Nothing was drawn: there is nothing to keep.
			if (reply.empty) { oncancel(); return; }
			await onsave(reply.svg);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			saving = false;
		}
	}

	function cancel() {
		if (saving) return;
		if (dirty && !window.confirm(uiText('ui.discard_drawing_changes'))) return;
		oncancel();
	}
</script>

<div class="draw-overlay" role="dialog" aria-modal="true" aria-label={$ui('ui.drawing')}>
	<div class="draw-bar">
		<span class="draw-title">{$ui('ui.drawing')}</span>
		{#if error}<span class="draw-error" role="alert" title={error}>{error}</span>{/if}
		<button class="draw-button" type="button" onclick={cancel} disabled={saving}>{$ui('ui.cancel')}</button>
		<button class="draw-button primary" type="button" onclick={done} disabled={saving || !shown}>{saving ? $ui('ui.saving') : $ui('ui.done')}</button>
	</div>
	<!-- Hidden until the canvas reports it is drawn: an unpainted frame is white. -->
	<iframe bind:this={frame} class:shown src={`/draw?embedded=1`} title={$ui('ui.drawing')}></iframe>
</div>

<style>
	.draw-overlay {
		position: fixed;
		inset: 0;
		z-index: 3000;
		display: flex;
		flex-direction: column;
		background: var(--bg-editor, var(--bg-primary));
	}
	.draw-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
		box-sizing: border-box;
		height: var(--pane-header-h, 44px);
		padding: 0 12px 0 16px;
		background: var(--bg-primary);
		box-shadow: inset 0 -1px 0 var(--border-light);
		color: var(--text-primary);
		font-size: 13px;
	}
	.draw-title { font-weight: 600; }
	.draw-error { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--danger, #e53e3e); text-align: right; }
	.draw-title + .draw-button { margin-left: auto; }
	.draw-button {
		padding: 5px 14px;
		border: 1px solid var(--border-color);
		border-radius: 3px;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-size: 13px;
		cursor: pointer;
	}
	.draw-button:hover:not(:disabled) { background: var(--bg-hover); }
	.draw-button:disabled { opacity: 0.5; cursor: default; }
	.draw-button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
	.draw-button.primary:hover:not(:disabled) { background: var(--accent); filter: brightness(1.1); }
	.draw-error ~ .draw-button { margin-left: 0; }
	iframe { flex: 1; min-height: 0; width: 100%; border: 0; opacity: 0; background: var(--bg-editor, var(--bg-primary)); }
	iframe.shown { opacity: 1; transition: opacity 0.1s; }
</style>
