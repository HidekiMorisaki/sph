<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		className = ''
	}: {
		children: Snippet;
		className?: string;
	} = $props();
	let backdropElement = $state<HTMLDivElement>();
	let dragState: {
		pointerId: number;
		header: HTMLElement;
		dialog: HTMLDialogElement;
		startX: number;
		startY: number;
		startOffsetX: number;
		startOffsetY: number;
		minimumX: number;
		maximumX: number;
		minimumY: number;
		maximumY: number;
	} | null = null;
	let offsetX = 0;
	let offsetY = 0;

	function applyPosition(dialog: HTMLDialogElement) {
		dialog.style.setProperty('--app-modal-translate-x', `${offsetX}px`);
		dialog.style.setProperty('--app-modal-translate-y', `${offsetY}px`);
	}

	function resetPosition() {
		if (dragState) finishDrag(dragState.pointerId);
		offsetX = 0;
		offsetY = 0;
		backdropElement?.querySelectorAll<HTMLDialogElement>(':scope > dialog.app-modal').forEach(applyPosition);
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0 || window.matchMedia('(max-width: 700px)').matches || !backdropElement) return;
		const target = event.target;
		if (!(target instanceof Element) || target.closest('button,a,input,textarea,select,[role="button"],[data-modal-drag-ignore]')) return;
		const header = target.closest<HTMLElement>('dialog.app-modal > header');
		const dialog = header?.parentElement;
		if (!header || !(dialog instanceof HTMLDialogElement) || dialog.parentElement !== backdropElement) return;

		const dialogRect = dialog.getBoundingClientRect();
		const backdropRect = backdropElement.getBoundingClientRect();
		const edgeGap = 8;
		dragState = {
			pointerId: event.pointerId,
			header,
			dialog,
			startX: event.clientX,
			startY: event.clientY,
			startOffsetX: offsetX,
			startOffsetY: offsetY,
			minimumX: offsetX + backdropRect.left + edgeGap - dialogRect.left,
			maximumX: offsetX + backdropRect.right - edgeGap - dialogRect.right,
			minimumY: offsetY + backdropRect.top + edgeGap - dialogRect.top,
			maximumY: offsetY + backdropRect.bottom - edgeGap - dialogRect.bottom
		};
		header.setPointerCapture(event.pointerId);
		dialog.classList.add('app-modal--dragging');
		event.preventDefault();
	}

	function handlePointerMove(event: PointerEvent) {
		if (!dragState || dragState.pointerId !== event.pointerId) return;
		offsetX = Math.min(dragState.maximumX, Math.max(dragState.minimumX, dragState.startOffsetX + event.clientX - dragState.startX));
		offsetY = Math.min(dragState.maximumY, Math.max(dragState.minimumY, dragState.startOffsetY + event.clientY - dragState.startY));
		applyPosition(dragState.dialog);
		event.preventDefault();
	}

	function finishDrag(pointerId: number) {
		if (!dragState || dragState.pointerId !== pointerId) return;
		if (dragState.header.hasPointerCapture(pointerId)) dragState.header.releasePointerCapture(pointerId);
		dragState.dialog.classList.remove('app-modal--dragging');
		dragState = null;
	}
</script>

<svelte:window onresize={resetPosition} />
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={backdropElement} class={`app-modal-backdrop ${className}`.trim()} role="presentation" onpointerdown={handlePointerDown} onpointermove={handlePointerMove} onpointerup={(event) => finishDrag(event.pointerId)} onpointercancel={(event) => finishDrag(event.pointerId)}>
	{@render children()}
</div>
