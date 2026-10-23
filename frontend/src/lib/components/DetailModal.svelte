<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import ModalBackdrop from './ModalBackdrop.svelte';
	import ModalHeader from './ModalHeader.svelte';
	import { rememberDetailReturn, takeDetailReturn, forgetDetailReturn } from '$lib/detail-modal-return';

	let {
		title,
		titleId,
		pretitle = '',
		closeLabel,
		returnFocus = null,
		initialFocusSelector = '.app-modal-close',
		initialFocusFromPointer = false,
		compact = false,
		compactHeader = false,
		dialogClass = '',
		headerActions,
		actions,
		children,
		onClose
	}: {
		title: string;
		titleId: string;
		pretitle?: string;
		closeLabel: string;
		returnFocus?: HTMLElement | null;
		initialFocusSelector?: string;
		initialFocusFromPointer?: boolean;
		compact?: boolean;
		compactHeader?: boolean;
		dialogClass?: string;
		headerActions?: Snippet;
		actions?: Snippet;
		children: Snippet;
		onClose: () => void;
	} = $props();

	let dialogElement = $state<HTMLDialogElement>();
	let keyboardUsed = $state(false);

	function close() {
		const target = returnFocus;
		forgetDetailReturn(target, titleId);
		onClose();
		void tick().then(() => target?.focus({ preventScroll: true }));
	}

	function rememberAction(event: MouseEvent) {
		const button = event.target instanceof Element ? event.target.closest('button') : null;
		const selector = button?.classList.contains('detail-header-edit') ? '.detail-header-edit'
			: button?.classList.contains('detail-header-delete') ? '.detail-header-delete' : null;
		if (selector && dialogElement) rememberDetailReturn(returnFocus, titleId, dialogElement, selector);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || !dialogElement) return;
		const openDialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
		if (openDialogs.at(-1) !== dialogElement) return;
		keyboardUsed = true;
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

	onMount(() => void tick().then(() => {
		const state = takeDetailReturn(returnFocus, titleId);
		const body = dialogElement?.querySelector<HTMLElement>('.app-detail-body');
		if (state && body) { body.scrollTop = state.scrollTop; body.scrollLeft = state.scrollLeft; }
		(dialogElement?.querySelector<HTMLElement>(state?.selector ?? initialFocusSelector))?.focus({ preventScroll: Boolean(state) });
	}));
</script>

<svelte:window onkeydown={handleKeydown} />
<ModalBackdrop>
	<dialog bind:this={dialogElement} class={`app-modal app-detail-modal ${dialogClass}`} class:app-modal--pointer-focus={initialFocusFromPointer && !keyboardUsed} class:app-modal--compact={compact} class:app-modal--compact-header={compactHeader} open aria-modal="true" aria-labelledby={titleId}>
		{#if !pretitle && !headerActions}
			<ModalHeader {title} {titleId} {closeLabel} onClose={close} />
		{:else}
		<header>
			<div>
				{#if pretitle}<p class="app-detail-pretitle">{pretitle}</p>{/if}
				<h2 id={titleId}>{title}</h2>
			</div>
			<div class="app-detail-header-actions" onclickcapture={rememberAction}>{#if headerActions}{@render headerActions()}{/if}<button class="app-modal-close" type="button" aria-label={closeLabel} onclick={close}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
			</button></div>
		</header>
		{/if}
		<div class="app-detail-body">{@render children()}</div>
		{#if actions}<footer class="app-modal-footer app-detail-actions">{@render actions()}</footer>{/if}
	</dialog>
</ModalBackdrop>

<style>
	/* Pointer input inside a sandboxed iframe does not update host focus modality. */
	.app-modal--pointer-focus :global(.app-modal-close:focus-visible){outline:none!important}
	.app-detail-header-actions{display:flex;align-items:center;gap:4px;flex:none}
</style>
