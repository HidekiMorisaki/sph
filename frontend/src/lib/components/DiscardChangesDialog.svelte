<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ModalBackdrop from './ModalBackdrop.svelte';

	let { onContinue, onDiscard }: { onContinue: () => void; onDiscard: () => void } = $props();
	let dialogElement = $state<HTMLDialogElement>();
	let continueButton = $state<HTMLButtonElement>();
	let previousFocus: HTMLElement | null = null;

	function continueEditing() {
		onContinue();
		void tick().then(() => previousFocus?.focus());
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || !dialogElement) return;
		const openDialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
		if (openDialogs.at(-1) !== dialogElement) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			continueEditing();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled])')];
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}

	onMount(() => {
		previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		void tick().then(() => continueButton?.focus());
	});
</script>

<svelte:window onkeydown={handleKeydown} />
<ModalBackdrop className="app-modal-backdrop--confirmation" onDismiss={continueEditing}>
	<dialog bind:this={dialogElement} class="app-modal app-modal--compact app-confirm-dialog" open aria-modal="true" aria-labelledby="discard-changes-title" aria-describedby="discard-changes-description">
		<header><h2 id="discard-changes-title">Discard changes?</h2></header>
		<div class="app-confirm-body"><p id="discard-changes-description">Your unsaved changes will be lost. Are you sure you want to close this form?</p></div>
		<footer class="app-modal-footer"><button bind:this={continueButton} class="secondary" type="button" onclick={continueEditing}>Continue editing</button><button class="app-danger-action" type="button" onclick={onDiscard}>Discard changes</button></footer>
	</dialog>
</ModalBackdrop>
