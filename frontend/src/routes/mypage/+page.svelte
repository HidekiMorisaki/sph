<script lang="ts">
	import { onMount } from 'svelte';
	import type { SessionUser } from '$lib/auth';
	import { readSessionUser } from '$lib/client-session';
	import { applyLocalization, localization } from '$lib/localization';
	import { localeMessages } from '$lib/locale-messages';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MyPage from '$lib/components/MyPage.svelte';

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
		<div class="page-state"><p role={failed ? 'alert' : 'status'}>{failed ? localeMessages[$localization.displayLanguage].common.loadFailed : localeMessages[$localization.displayLanguage].common.loading}</p></div>
	{/if}
</AssetManagementShell>

<style>
	.page-state{min-height:100vh;display:grid;place-items:center;padding:24px;color:var(--muted)}
</style>
