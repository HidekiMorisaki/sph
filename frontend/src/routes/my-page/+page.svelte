<script lang="ts">
	import { onMount } from 'svelte';
	import type { SessionUser } from '#lib/auth.js';
	import { readSessionUser } from '#lib/client-session.js';
	import { applyLocalization, localization } from '#lib/localization.js';
	import { localeMessages } from '#lib/locale-messages.js';
	import AssetManagementShell from '#lib/components/AssetManagementShell.svelte';
	import MyPage from '#lib/components/MyPage.svelte';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';

	let user = $state<SessionUser | null>(null);
	let failed = $state(false);
	onMount(() => {
		let mounted = true;
		void (async () => {
			try {
				const current = await readSessionUser();
				if (!mounted) return;
				if (!current) { window.location.assign('/'); return; }
				await applyLocalization(current);
				if (mounted) user = current;
			} catch { if (mounted) failed = true; }
		})();
		return () => { mounted = false; };
	});
</script>

<AssetManagementShell title={localeMessages[$localization.displayLanguage].myPage.title}>
	{#if user}
		<MyPage {user} />
	{:else}
		<div class="page-state">{#if failed}<p role="alert">{localeMessages[$localization.displayLanguage].common.loadFailed}</p>{:else}<LoadingSpinner />{/if}</div>
	{/if}
</AssetManagementShell>

<style>
	.page-state{min-height:100vh;display:grid;place-items:center;padding:var(--sph-space-24px);color:var(--muted)}
</style>
