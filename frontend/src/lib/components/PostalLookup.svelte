<script lang="ts">
	import { addressLabels, validPostalCode, type AddressCountry, type PostalCandidate } from '$lib/postal-address';
	import { apiData } from '$lib/api';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let { countryCode, postalCode, language, onSelect }: {
		countryCode: AddressCountry;
		postalCode: string;
		language: 'ja' | 'en';
		onSelect: (candidate: PostalCandidate) => void;
	} = $props();
	let candidates = $state<PostalCandidate[]>([]);
	let lookupState = $state<'idle' | 'loading' | 'empty' | 'error'>('idle');
	let serial = 0;
	let first = true;
	let labels = $derived(addressLabels(countryCode, language));

	async function lookup(country: AddressCountry, postal: string, requestId: number) {
		lookupState = 'loading';
		try {
			const params = new URLSearchParams({ countryCode: country, postalCode: postal });
			const response = await fetch(`/v1/postal-addresses?${params}`);
			if (!response.ok) throw new Error('lookup failed');
			const found = await apiData<PostalCandidate[]>(response);
			if (requestId !== serial) return;
			candidates = found;
			lookupState = found.length ? 'idle' : 'empty';
		} catch {
			if (requestId === serial) { candidates = []; lookupState = 'error'; }
		}
	}

	$effect(() => {
		const country = countryCode;
		const postal = postalCode.trim();
		const requestId = ++serial;
		candidates = [];
		lookupState = 'idle';
		if (first) { first = false; return; }
		if (!validPostalCode(country, postal)) return;
		const timer = window.setTimeout(() => void lookup(country, postal, requestId), 450);
		return () => window.clearTimeout(timer);
	});
</script>

<div class="postal-lookup" aria-live="polite">
	{#if lookupState === 'loading'}<LoadingSpinner label={language === 'ja' ? '住所を検索中…' : 'Looking up address…'} inline />{/if}
	{#if lookupState === 'empty'}<small>{language === 'ja' ? '該当する住所はありません。手入力できます。' : 'No address found. You can enter it manually.'}</small>{/if}
	{#if lookupState === 'error'}<small>{language === 'ja' ? '住所を取得できませんでした。手入力できます。' : 'Address lookup is unavailable. You can enter it manually.'}</small>{/if}
	{#if candidates.length}
		<div class="postal-options"><span>{language === 'ja' ? '住所を選択してください' : 'Choose an address'}</span>
			{#each candidates as candidate, index}<button type="button" onclick={() => { onSelect(candidate); candidates = []; }} aria-label={`${labels.region}: ${candidate.prefecture}, ${candidate.city} ${candidate.streetAddress}`}>{candidate.prefecture} {candidate.city} {candidate.streetAddress}</button>{/each}
		</div>
	{/if}
	{#if postalCode.trim()}<small class="source">{language === 'ja' ? '住所データ：' : 'Address data: '}{#if countryCode === 'JP'}<a href="https://zipcloud.ibsnet.co.jp/" target="_blank" rel="noopener noreferrer">zipcloud</a>{:else}<a href="https://api.zippopotam.us/" target="_blank" rel="noopener noreferrer">Zippopotam.us</a> · <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>{/if}</small>{/if}
</div>

<style>
	.postal-lookup{grid-column:1/-1;display:grid;gap:6px;color:var(--muted);font-size:var(--font-size-support)}
	.postal-options{display:grid;gap:5px;padding:10px;border:1px solid var(--border);border-radius:5px;background:var(--surface)}
	.postal-options button{text-align:left;padding:7px 9px;border:1px solid var(--border);border-radius:5px;color:var(--text);background:var(--surface);cursor:pointer}
	.postal-options button:hover,.postal-options button:focus-visible{border-color:var(--action-primary);outline:2px solid var(--action-primary);outline-offset:1px}
	.source a{color:var(--action-primary)}
</style>
