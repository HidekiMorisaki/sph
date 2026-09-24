<script lang="ts">
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import { productName } from '$lib/brand';
</script>

<svelte:head><title>System settings · {productName}</title></svelte:head>

<AssetManagementShell title="System settings">
	<div class="preview">
		<MasterPageHeader eyebrow="SITE MANAGEMENT" title="System settings" description="Review system-wide configuration." />
		<section aria-labelledby="preview-heading">
			<h2 id="preview-heading">System configuration</h2>
			<p>System-wide settings will be available here.</p>
		</section>
	</div>
</AssetManagementShell>

<style>
	.preview section{width:100%;padding:14px 16px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}
	.preview h2{margin:0 0 8px;font-size:14px}
	.preview section p{margin:0;color:var(--muted);font-size:13px}
</style>
