<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';

	let {
		title,
		titleId,
		pretitle = '',
		closeLabel,
		returnFocus = null,
		compact = false,
		dialogClass = '',
		actions,
		children,
		onClose
	}: {
		title: string;
		titleId: string;
		pretitle?: string;
		closeLabel: string;
		returnFocus?: HTMLElement | null;
		compact?: boolean;
		dialogClass?: string;
		actions?: Snippet;
		children: Snippet;
		onClose: () => void;
	} = $props();

	let dialogElement = $state<HTMLDialogElement>();

	function close() {
		onClose();
		void tick().then(() => returnFocus?.focus());
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || !dialogElement) return;
		const openDialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
		if (openDialogs.at(-1) !== dialogElement) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		if (event.key !== 'Tab') return;

		const focusable = [...dialogElement.querySelectorAll<HTMLElement>(
			'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
		)].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (!dialogElement.contains(document.activeElement)) {
			event.preventDefault();
			(event.shiftKey ? last : first).focus();
		} else if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	onMount(() => void tick().then(() => dialogElement?.querySelector<HTMLButtonElement>('.app-modal-close')?.focus()));
</script>

<svelte:window onkeydown={handleKeydown} />
<div class="app-modal-backdrop" role="presentation">
	<dialog bind:this={dialogElement} class={`app-modal app-detail-modal ${dialogClass}`} class:app-modal--compact={compact} open aria-modal="true" aria-labelledby={titleId}>
		<header>
			<div>
				{#if pretitle}<p class="app-detail-pretitle">{pretitle}</p>{/if}
				<h2 id={titleId}>{title}</h2>
			</div>
			<button class="app-modal-close" type="button" aria-label={closeLabel} onclick={close}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
			</button>
		</header>
		<div class="app-detail-body">{@render children()}</div>
		{#if actions}<footer class="app-modal-footer app-detail-actions">{@render actions()}</footer>{/if}
	</dialog>
</div>
