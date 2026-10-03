<script lang="ts">
	import { onMount } from 'svelte';
	import type { SessionUser } from '$lib/auth';
	import { readSessionUser } from '$lib/client-session';
	import { applyLocalization, localization } from '$lib/localization';
	import { localeMessages } from '$lib/locale-messages';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import MyPage from '$lib/components/MyPage.svelte';

	let user = $state<SessionUser | null>(null);
	let failed = $state(false);
	let collapsed = $state(false);
	function toggleSidebar() {
		collapsed = !collapsed;
		localStorage.setItem('asset-sidebar-collapsed', String(collapsed));
		document.documentElement.dataset.assetSidebarCollapsed = String(collapsed);
	}
	async function logout() {
		await fetch('/v1/auth/logout', { method: 'POST' });
		window.location.assign('/');
	}
	onMount(() => {
		let mounted = true;
		collapsed = localStorage.getItem('asset-sidebar-collapsed') === 'true';
		document.documentElement.dataset.assetSidebarCollapsed = String(collapsed);
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

<PageTitle title={localeMessages[$localization.displayLanguage].myPage.title} />
{#if user}
	<MyPage {user} {collapsed} onToggleSidebar={toggleSidebar} onLogout={logout} />
{:else}
	<main class="page-state"><p role={failed ? 'alert' : 'status'}>{failed ? localeMessages[$localization.displayLanguage].common.loadFailed : localeMessages[$localization.displayLanguage].common.loading}</p></main>
{/if}

<style>
	.page-state{min-height:100vh;display:grid;place-items:center;padding:24px;color:var(--muted)}
</style>
