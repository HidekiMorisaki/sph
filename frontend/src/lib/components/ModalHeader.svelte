<script lang="ts">
	let {
		title,
		titleId,
		closeLabel,
		disabled = false,
		onClose
	}: {
		title: string;
		titleId: string;
		closeLabel: string;
		disabled?: boolean;
		onClose: () => void;
	} = $props();
</script>

<header>
	<h2 id={titleId}>{title}</h2>
	<button class="app-modal-close" type="button" aria-label={closeLabel} {disabled} onclick={onClose}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
	</button>
</header>
