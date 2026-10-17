<script lang="ts">
	import { localization } from '$lib/localization';
	import { apiData } from '$lib/api';
	let { titleId, image, refresh = 0, large = false }: { titleId: number | null; image?: string | null; refresh?: number; large?: boolean } = $props();
	let source = $state('/images/book-cover-none.svg');
	let alt = $derived(source === '/images/book-cover-none.svg'
		? $localization.displayLanguage === 'ja' ? 'カバー画像なし' : 'No cover image'
		: $localization.displayLanguage === 'ja' ? '書籍のカバー画像' : 'Book cover');
	$effect(() => {
		const id = titleId;
		void refresh;
		source = '/images/book-cover-none.svg';
		if (image !== undefined) {
			source = image?.startsWith('data:image/png;base64,') ? image : '/images/book-cover-none.svg';
			return;
		}
		if (!id) return;
		const controller = new AbortController();
		void fetch(`/v1/book-titles/${id}/cover`, { signal: controller.signal }).then(async response => {
			if (response.ok) { const value = await apiData<{ image: string | null }>(response); if (!controller.signal.aborted) source = value.image ?? '/images/book-cover-none.svg'; }
		}).catch(() => undefined);
		return () => controller.abort();
	});
</script>

<img class:large src={source} {alt} onerror={() => source = '/images/book-cover-none.svg'} />

<style>
	img{display:block;width:44px;height:59px;object-fit:contain;border-radius:5px;border:1px solid var(--border);background:var(--surface)}
	img.large{width:120px;height:160px}
</style>
