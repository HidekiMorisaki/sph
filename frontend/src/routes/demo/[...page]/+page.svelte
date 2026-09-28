<script lang="ts">import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import { productName } from '$lib/brand';
	import { page } from '$app/state';
	let label = $derived((page.params.page ?? 'preview').split('-').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' '));
</script>
<svelte:head><title>{label} · {productName}</title></svelte:head>
<AssetManagementShell title={label} active=""><div class="preview"><p>GENTELELLA PREVIEW</p><h1>{label}</h1><section><h2>{label}</h2><span>This destination is ready for the {productName} implementation.</span></section></div></AssetManagementShell>
<style>.preview{min-height:60vh;padding:0;background:var(--bg);color:var(--text)}.preview>p{color:#1abb9c;font-size:11px;font-weight:700;letter-spacing:.09em}.preview h1{margin:5px 0 26px;font-size:28px}.preview section{max-width:720px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:7px;box-shadow:var(--shadow)}.preview h2{margin:0 0 8px;font-size:17px}.preview span{color:var(--muted);font-size:13px}</style>
