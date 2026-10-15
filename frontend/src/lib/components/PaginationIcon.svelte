<script lang="ts">
	let { direction }: { direction: 'first' | 'previous' | 'next' | 'last' } = $props();
</script>

<svg class="pagination-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
	{#if direction === 'first'}
		<path d="m11 5-7 7 7 7m9-14-7 7 7 7" />
	{:else if direction === 'previous'}
		<path d="m15 5-7 7 7 7" />
	{:else if direction === 'next'}
		<path d="m9 5 7 7-7 7" />
	{:else}
		<path d="m4 5 7 7-7 7m9-14 7 7-7 7" />
	{/if}
</svg>

<style>
	.pagination-icon{display:inline-block;width:16px;height:16px;flex:none;vertical-align:middle}
</style>
