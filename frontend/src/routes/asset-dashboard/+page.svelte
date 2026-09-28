<script lang="ts">
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
</script>
<AssetManagementShell title="Dashboard" active="Dashboard"><MasterPageHeader title="Dashboard" description="Manage workplace assets from one place." /><section class="overview"><article><small>EMPLOYEES</small><b>Directory</b><span>Manage employee information</span></article><article><small>ASSET DATA</small><b>Inventory</b><span>Track IT assets</span></article><article><small>CONFIGURATION</small><b>Master data</b><span>Maintain shared selections</span></article></section></AssetManagementShell>
<style>.overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:2px 0 26px}.overview article{padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}small{color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.06em}.overview b{display:block;margin:8px 0 4px;font-size:20px}.overview span{color:var(--muted);font-size:13px}@media(max-width:700px){.overview{grid-template-columns:1fr}}</style>
