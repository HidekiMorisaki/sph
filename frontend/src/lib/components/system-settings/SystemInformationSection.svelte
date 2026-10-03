<script lang="ts">
	import { onMount } from 'svelte';
	import { apiData } from '$lib/api';
	import { formatDate, localization } from '$lib/localization';

	import { localeMessages } from '$lib/locale-messages';
	import { localizedReleaseText } from '$lib/system-release-text';
	let text = $derived(localeMessages[$localization.displayLanguage].systemSettings);

	type SystemInformation = {
		name: string;
		version: string;
		noticeIds: string[];
		repositoryUrl: string | null;
		revisionHistory: Array<{ version: string; releasedAt: string; changeIds: string[] }>;
	};

	let information = $state<SystemInformation | null>(null);
	let error = $state('');

	async function load() {
		try {
			const response = await fetch('/v1/system-information');
			if (!response.ok) throw new Error();
			information = await apiData<SystemInformation>(response);
		} catch {
			error = text.informationFailed;
		}
	}

	onMount(() => { void load(); });
</script>

<article class="information-card">
	<header>
		<div><h2>{text.information}</h2><p>{text.informationDescription}</p></div>
	</header>
	{#if error}
		<div class="information-state error" role="alert">{error}</div>
	{:else if !information}
		<div class="information-state">{text.informationLoading}</div>
	{:else}
		<div class="information-body">
			<dl class="information-grid">
				<div><dt>{text.systemName}</dt><dd>{information.name}</dd></div>
				<div><dt>{text.version}</dt><dd><code>{information.version}</code></dd></div>
				<div><dt>{text.repository}</dt><dd>{#if information.repositoryUrl}<a href={information.repositoryUrl} target="_blank" rel="noopener noreferrer">{information.repositoryUrl}<span class="sr-only">{text.externalWindow}</span></a>{:else}<span class="not-published">{text.notPublished}</span>{/if}</dd></div>
				<div class="version-notices"><dt>{text.versionNotices}</dt><dd>{#if information.noticeIds.length}<ul>{#each information.noticeIds as notice}<li>{localizedReleaseText(notice, $localization.displayLanguage)}</li>{/each}</ul>{:else}<span>{text.noNotices}</span>{/if}</dd></div>
			</dl>
			<section class="revision-history" aria-labelledby="revision-history-title">
				<header><h3 id="revision-history-title">{text.revisionHistory}</h3><p>{text.revisionDescription}</p></header>
				{#if information.revisionHistory.length}
					<div class="revision-list">
						{#each information.revisionHistory as revision (revision.version)}
							<details class="revision-entry" open={revision.version === information.version}>
								<summary class="revision-heading">
									<span class="revision-version">{text.version} <code>{revision.version}</code></span>
									<time datetime={revision.releasedAt}>{formatDate(revision.releasedAt, $localization)}</time>
									<svg class="revision-toggle-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l10-7z" /></svg>
								</summary>
								<ul>{#each revision.changeIds as change}<li>{localizedReleaseText(change, $localization.displayLanguage)}</li>{/each}</ul>
							</details>
						{/each}
					</div>
				{:else}
					<p class="empty-history">{text.noHistory}</p>
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
	.revision-history{margin-top:16px;overflow:hidden;background:var(--surface);border:1px solid var(--border-light);border-radius:5px}.revision-history>header{padding:12px;border-bottom:1px solid var(--border-light)}.revision-history h3,.revision-history header p{margin:0}.revision-history h3{font-size:13px}.revision-history header p{margin-top:3px;color:var(--muted);font-size:11px}.revision-list{display:grid}.revision-entry{min-width:0}.revision-entry+.revision-entry{border-top:1px solid var(--border-light)}.revision-heading{display:grid;grid-template-columns:minmax(0,1fr) auto 20px;align-items:center;gap:12px;padding:12px;cursor:pointer;list-style:none}.revision-heading::-webkit-details-marker{display:none}.revision-heading:hover{background:var(--surface-secondary)}.revision-heading:focus-visible{outline:2px solid var(--action-primary);outline-offset:-3px;border-radius:3px}.revision-version{font-size:12px;font-weight:600}.revision-toggle-icon{width:20px;height:20px;color:var(--text-secondary)}.revision-entry[open] .revision-toggle-icon{transform:rotate(90deg)}.revision-heading time{color:var(--muted);font-size:11px}.revision-entry ul{display:grid;gap:6px;margin:0;padding:0 12px 12px 30px}.revision-entry li,.empty-history{color:var(--text-secondary);font-size:11.5px;line-height:1.5}.empty-history{margin:0;padding:12px}
	@container system-information (max-width:960px){.information-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
	@container system-information (max-width:720px){.information-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
	@container system-information (max-width:480px){.information-grid{grid-template-columns:minmax(0,1fr)}}
	@container system-information (max-width:420px){.revision-heading{grid-template-columns:minmax(0,1fr) 20px;gap:5px 12px}.revision-heading time{grid-column:1;grid-row:2}.revision-toggle-icon{grid-column:2;grid-row:1 / span 2}}
</style>
