<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { t as ui } from '$lib/i18n';
	import type { SourceController } from '$lib/editor/source/controller';

	let { controller, readonly = false, numbers = false, visible = true, mobile = false, preview = false, resolveImage, openLink, context = '' }: {
		controller: SourceController;
		readonly?: boolean;
		numbers?: boolean;
		visible?: boolean;
		mobile?: boolean;
		preview?: boolean;
		resolveImage?: (href: string) => string;
		openLink?: (href: string) => void;
		context?: string;
	} = $props();
	let host: HTMLDivElement;
	onMount(() => {
		const detach = controller.attach(host);
		const measure = () => controller.view?.requestMeasure();
		const appearance = new MutationObserver(measure);
		appearance.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
		document.fonts.addEventListener('loadingdone', measure);
		return () => {
			appearance.disconnect();
			document.fonts.removeEventListener('loadingdone', measure);
			detach();
		};
	});
	$effect(() => {
		const settings = { readonly, numbers };
		untrack(() => controller.configure(settings.readonly, settings.numbers));
	});
	$effect(() => {
		const placeholder = $ui('source.placeholder'), label = $ui(preview ? 'editorMode.live' : 'source.label');
		untrack(() => controller.setLabels(placeholder, label));
	});
	$effect(() => {
		const enabled = preview && visible;
		const options = { resolveImage, openLink, context,
			checkboxLabel: $ui('livePreview.toggleTask'), imageLabel: $ui('livePreview.editImage'), copyLabel: $ui('ui.copy') };
		// Renderer callbacks must not subscribe this effect to unrelated note/config stores.
		untrack(() => controller.setLivePreview(enabled, options));
	});
	$effect(() => { if (visible) controller.view?.requestMeasure(); });
</script>

<div class="source-editor" class:mobile class:live-preview={preview} class:with-line-numbers={numbers && !preview} style:display={visible ? undefined : 'none'} bind:this={host}></div>

<style>
	.source-editor {
		width: 100%;
		height: 100%;
		min-height: 0;
		max-width: var(--editor-content-width, none);
		margin: 0 auto;
		user-select: text;
	}
	.source-editor.with-line-numbers { max-width: none; }

	/* A cleaner page: the note scrolls with the wheel, touchpad and keyboard, without a visible bar. */
	.source-editor :global(.cm-scroller) { scrollbar-width: none; }
	.source-editor :global(.cm-scroller::-webkit-scrollbar) { display: none; }

	/* Code colours: the same palette as the rich-text editor (light, then dark). */
	.source-editor {
		--hl-keyword: #d73a49; --hl-string: #032f62; --hl-number: #005cc5; --hl-comment: #6a737d; --hl-title: #6f42c1;
		--hl-type: #e36209; --hl-tag: #22863a; --hl-plain: #24292e; --hl-deletion: #b31d28; --hl-deletion-bg: #ffeef0;
	}
	:global(.dark) .source-editor {
		--hl-keyword: #ff7b72; --hl-string: #a5d6ff; --hl-number: #79c0ff; --hl-comment: #8b949e; --hl-title: #d2a8ff;
		--hl-type: #ffa657; --hl-tag: #7ee787; --hl-plain: #c9d1d9; --hl-deletion: #ffdcd7; --hl-deletion-bg: #67060c;
	}
	.source-editor :global(.lp-code-block .hljs-keyword),
	.source-editor :global(.lp-code-block .hljs-selector-tag),
	.source-editor :global(.lp-code-block .hljs-built_in),
	.source-editor :global(.lp-code-block .hljs-operator) { color: var(--hl-keyword); }
	.source-editor :global(.lp-code-block .hljs-string),
	.source-editor :global(.lp-code-block .hljs-addition),
	.source-editor :global(.lp-code-block .hljs-regexp) { color: var(--hl-string); }
	.source-editor :global(.lp-code-block .hljs-number),
	.source-editor :global(.lp-code-block .hljs-literal),
	.source-editor :global(.lp-code-block .hljs-attr),
	.source-editor :global(.lp-code-block .hljs-attribute),
	.source-editor :global(.lp-code-block .hljs-meta),
	.source-editor :global(.lp-code-block .hljs-symbol),
	.source-editor :global(.lp-code-block .hljs-bullet),
	.source-editor :global(.lp-code-block .hljs-property),
	.source-editor :global(.lp-code-block .hljs-selector-id) { color: var(--hl-number); }
	.source-editor :global(.lp-code-block .hljs-comment),
	.source-editor :global(.lp-code-block .hljs-quote) { color: var(--hl-comment); font-style: italic; }
	.source-editor :global(.lp-code-block .hljs-function),
	.source-editor :global(.lp-code-block .hljs-title),
	.source-editor :global(.lp-code-block .hljs-selector-class) { color: var(--hl-title); }
	.source-editor :global(.lp-code-block .hljs-type),
	.source-editor :global(.lp-code-block .hljs-title.class_),
	.source-editor :global(.lp-code-block .hljs-variable),
	.source-editor :global(.lp-code-block .hljs-template-variable) { color: var(--hl-type); }
	.source-editor :global(.lp-code-block .hljs-tag),
	.source-editor :global(.lp-code-block .hljs-name) { color: var(--hl-tag); }
	.source-editor :global(.lp-code-block .hljs-params),
	.source-editor :global(.lp-code-block .hljs-punctuation) { color: var(--hl-plain); }
	.source-editor :global(.lp-code-block .hljs-deletion) { color: var(--hl-deletion); background: var(--hl-deletion-bg); }
	.source-editor.mobile :global(.cm-editor) { font-size: var(--editor-font-size, 15px); }
	.source-editor.mobile :global(.cm-content) { padding: 8px 16px max(220px, var(--editor-scroll-past-end, 65vh)); }
</style>
