<script lang="ts">
	let { countryCode, countryName }: { countryCode: 'JP' | 'US'; countryName: string } = $props();
	const stripes = Array.from({ length: 13 }, (_, index) => index);
	const starRows = Array.from({ length: 9 }, (_, index) => ({
		y: 1.05 + index * 1.16,
		count: index % 2 === 0 ? 6 : 5,
		start: index % 2 === 0 ? 1.3 : 2.55
	}));
</script>

<span class="country-flag" role="img" aria-label={countryName} title={countryName}>
	<svg viewBox="0 0 38 20" aria-hidden="true" focusable="false">
		{#if countryCode === 'JP'}
			<rect width="38" height="20" fill="#fff" />
			<circle cx="19" cy="10" r="6" fill="#bc002d" />
		{:else}
			{#each stripes as stripe}
				<rect y={stripe * 20 / 13} width="38" height={20 / 13} fill={stripe % 2 === 0 ? '#b22234' : '#fff'} />
			{/each}
			<rect width="15.2" height={20 * 7 / 13} fill="#3c3b6e" />
			{#each starRows as row}
				{#each Array.from({ length: row.count }, (_, index) => index) as star}
					<path d="M0,-.44 .1,-.14 .42,-.14 .16,.05 .26,.37 0,.18 -.26,.37 -.16,.05 -.42,-.14 -.1,-.14Z" transform={`translate(${row.start + star * 2.5} ${row.y})`} fill="#fff" />
				{/each}
			{/each}
		{/if}
	</svg>
</span>

<style>
	.country-flag{display:inline-flex;flex:none;align-self:center;line-height:0}
	svg{display:block;width:1.9em;height:1em;border:1px solid var(--border);border-radius:2px}
</style>
