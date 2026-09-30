<script lang="ts">
	import { onMount } from 'svelte';
	import { apiData } from '$lib/api';
	import { formatDate, localization } from '$lib/localization';

	type SystemInformation = {
		name: string;
		version: string;
		notices: string[];
		repositoryUrl: string | null;
		revisionHistory: Array<{ version: string; releasedAt: string; changes: string[] }>;
	};

	let information = $state<SystemInformation | null>(null);
	let error = $state('');

	async function load() {
		try {
			const response = await fetch('/v1/system-information');
			if (!response.ok) throw new Error();
			information = await apiData<SystemInformation>(response);
		} catch {
			error = 'Unable to load system information. Refresh the page and try again.';
		}
	}

	onMount(() => { void load(); });
</script>

<article class="information-card">
	<header>
		<div><h2>System information</h2><p>View the identity, release version, publication details, and revision history of the running system.</p></div>
	</header>
	{#if error}
		<div class="information-state error" role="alert">{error}</div>
	{:else if !information}
		<div class="information-state">Loading system information…</div>
	{:else}
		<div class="information-body">
			<dl class="information-grid">
				<div><dt>System name</dt><dd>{information.name}</dd></div>
				<div><dt>Version</dt><dd><code>{information.version}</code></dd></div>
				<div><dt>Public repository</dt><dd>{#if information.repositoryUrl}<a href={information.repositoryUrl} target="_blank" rel="noopener noreferrer">{information.repositoryUrl}<span class="sr-only"> (opens in a new window)</span></a>{:else}<span class="not-published">Not published</span>{/if}</dd></div>
				<div class="version-notices"><dt>Version notices</dt><dd>{#if information.notices.length}<ul>{#each information.notices as notice}<li>{notice}</li>{/each}</ul>{:else}<span>No notices for this version.</span>{/if}</dd></div>
			</dl>
			<section class="revision-history" aria-labelledby="revision-history-title">
				<header><h3 id="revision-history-title">Revision history</h3><p>Changes published for each system version.</p></header>
				{#if information.revisionHistory.length}
					<div class="revision-list">
						{#each information.revisionHistory as revision}
							<article class="revision-entry">
								<div class="revision-heading"><h4>Version <code>{revision.version}</code></h4><time datetime={revision.releasedAt}>{formatDate(revision.releasedAt, $localization)}</time></div>
								<ul>{#each revision.changes as change}<li>{change}</li>{/each}</ul>
							</article>
						{/each}
					</div>
				{:else}
					<p class="empty-history">No revision history has been published.</p>
				{/if}
			</section>
		</div>
	{/if}
</article>

<style>
	.information-card{overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}
	.information-card>header{padding:14px 16px;border-bottom:1px solid var(--border-light)}.information-card>header h2,.information-card>header p{margin:0}.information-card>header h2{font-size:14px}.information-card>header p{margin-top:4px;color:var(--muted);font-size:11.5px}
	.information-body{container:system-information / inline-size;padding:16px;background:var(--bg)}.information-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0}.information-grid>div{min-width:0;padding:12px;background:var(--surface);border:1px solid var(--border-light);border-radius:5px}dt{color:var(--muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}dd{margin:5px 0 0;color:var(--text);font-size:13px;overflow-wrap:anywhere}code{padding:2px 6px;background:var(--surface-secondary);border:1px solid var(--border-light);border-radius:4px;color:var(--text);font:600 12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}a{color:var(--action-primary)}.not-published{color:var(--muted)}
	.information-grid>.version-notices{background:color-mix(in srgb,#f0ad4e 9%,var(--surface));border-color:color-mix(in srgb,#f0ad4e 35%,var(--border))}.version-notices ul{display:grid;gap:6px;margin:0;padding-left:18px}.version-notices li,.version-notices span{color:var(--text-secondary);font-size:11.5px;line-height:1.5}.information-state{padding:24px;color:var(--muted)}.information-state.error{color:var(--danger)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
	.revision-history{margin-top:16px;overflow:hidden;background:var(--surface);border:1px solid var(--border-light);border-radius:5px}.revision-history>header{padding:12px;border-bottom:1px solid var(--border-light)}.revision-history h3,.revision-history header p{margin:0}.revision-history h3{font-size:13px}.revision-history header p{margin-top:3px;color:var(--muted);font-size:11px}.revision-list{display:grid}.revision-entry{padding:12px}.revision-entry+.revision-entry{border-top:1px solid var(--border-light)}.revision-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.revision-heading h4{margin:0;font-size:12px}.revision-heading time{color:var(--muted);font-size:11px}.revision-entry ul{display:grid;gap:6px;margin:10px 0 0;padding-left:18px}.revision-entry li,.empty-history{color:var(--text-secondary);font-size:11.5px;line-height:1.5}.empty-history{margin:0;padding:12px}
	@container system-information (max-width:960px){.information-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
	@container system-information (max-width:720px){.information-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
	@container system-information (max-width:480px){.information-grid{grid-template-columns:minmax(0,1fr)}}
	@container system-information (max-width:420px){.revision-heading{align-items:flex-start;flex-direction:column;gap:5px}}
</style>
