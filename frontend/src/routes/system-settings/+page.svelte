<script lang="ts">
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import { productName } from '$lib/brand';
</script>

<svelte:head><title>System settings · {productName}</title></svelte:head>

<AssetManagementShell title="System settings">
	<div class="preview">
		<p>ADMIN · DEMO</p>
		<h1>System settings</h1>
		<section aria-labelledby="preview-heading">
			<h2 id="preview-heading">System configuration</h2>
			<p>System-wide settings will be available here.</p>
		</section>
	</div>
</AssetManagementShell>

<style>
	.preview>p{margin:0 0 5px;color:var(--primary);font-size:11px;font-weight:700;letter-spacing:.09em}
	.preview h1{margin:0 0 26px;font-size:28px}
	.preview section{max-width:720px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:7px;box-shadow:var(--shadow)}
	.preview h2{margin:0 0 8px;font-size:17px}
	.preview section p{margin:0;color:var(--muted);font-size:13px}
</style>
