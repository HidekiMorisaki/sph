<script lang="ts">
	import { onMount } from 'svelte';
	import { apiData } from '$lib/api';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { formatDate, localization } from '$lib/localization';

	import { formatLocaleTemplate, localeMessages } from '$lib/locale-messages';
	import { localizedReleaseText } from '$lib/system-release-text';
	let text = $derived(localeMessages[$localization.displayLanguage].systemSettings);
	type ChangeGroup = 'newFeatures' | 'improvements' | 'bugFixes';
	const changeGroupNames: ChangeGroup[] = ['newFeatures', 'improvements', 'bugFixes'];
	function changeGroupLabel(group: ChangeGroup) {
		return group === 'newFeatures' ? text.revisionNewFeatures : group === 'improvements' ? text.revisionImprovements : text.revisionBugFixes;
	}

	type SystemInformation = {
		name: string;
		version: string;
		noticeIds: string[];
		repositoryUrl: string | null;
		revisionHistory: Array<{ version: string; releasedAt: string | null; changeIds?: string[]; changeGroups?: Record<ChangeGroup, string[]> }>;
	};
	type AvailableUpdate = { version: string; url: string };
	type ReleaseCheck = { releaseStatus: 'latest' | 'update_available' | 'unavailable'; availableUpdate: AvailableUpdate | null };

	let information = $state<SystemInformation | null>(null);
	let availableUpdate = $state<AvailableUpdate | null>(null);
	let releaseStatus = $state<'checking' | ReleaseCheck['releaseStatus']>('checking');
	let error = $state('');
	let errorDismissed = $state(false);

	async function loadLatestRelease() {
		try {
			const response = await fetch('/v1/system-information/latest-release');
			if (!response.ok) throw new Error();
			const result = await apiData<ReleaseCheck>(response);
			availableUpdate = result.availableUpdate;
			releaseStatus = result.releaseStatus;
		} catch {
			releaseStatus = 'unavailable';
		}
	}

	async function load() {
		try {
			const response = await fetch('/v1/system-information');
			if (!response.ok) throw new Error();
			information = await apiData<SystemInformation>(response);
			void loadLatestRelease();
		} catch {
			error = text.informationFailed;
		}
	}

	onMount(() => { void load(); });
</script>

<div class="information-card">
	{#if error}
		{#if !errorDismissed}<StatusNotice message={error} tone="error" onDismiss={() => errorDismissed = true} />{/if}
	{:else if !information}
		<div class="information-state">{text.informationLoading}</div>
	{:else}
		<div class="information-body">
			<dl class="information-grid">
				<div><dt>{text.systemName}</dt><dd>{information.name}</dd></div>
				<div><dt>{text.version}</dt><dd class="version-value">
					{#if information.revisionHistory[0]?.releasedAt === null}
						<p>{formatLocaleTemplate(text.developmentVersion, information.version)}</p>
					{:else}
						<p>{formatLocaleTemplate(text.installedVersion, information.version)}</p>
						<p class="release-status">
							{#if releaseStatus === 'update_available' && availableUpdate}<a href={availableUpdate.url} target="_blank" rel="noopener noreferrer">{formatLocaleTemplate(text.availableVersion, availableUpdate.version)}<span class="sr-only">{text.externalWindow}</span></a>
							{:else if releaseStatus === 'latest'}{text.latestVersion}
							{:else if releaseStatus === 'unavailable'}{text.versionUnavailable}
							{:else}{text.versionChecking}{/if}
						</p>
					{/if}
				</dd></div>
				<div><dt>{text.repository}</dt><dd>{#if information.repositoryUrl}<a href={information.repositoryUrl} target="_blank" rel="noopener noreferrer">{information.repositoryUrl}<span class="sr-only">{text.externalWindow}</span></a>{:else}<span class="not-published">{text.notPublished}</span>{/if}</dd></div>
				<div class="version-notices"><dt>{text.versionNotices}</dt><dd>{#each information.noticeIds as notice}<p>{localizedReleaseText(notice, $localization.displayLanguage)}</p>{:else}<span>{text.noNotices}</span>{/each}</dd></div>
			</dl>
			<section class="revision-history" aria-labelledby="revision-history-title">
				<header><h2 id="revision-history-title">{text.revisionHistory}</h2></header>
				{#if information.revisionHistory.length}
					<div class="revision-list">
						{#each information.revisionHistory as revision (revision.version)}
							<details class="revision-entry" open={revision.version === information.version}>
								<summary class="revision-heading">
									<span class="revision-version">{text.version} <code>{revision.version}</code></span>
									{#if revision.releasedAt}<time datetime={revision.releasedAt}>{formatDate(revision.releasedAt, $localization)}</time>{:else}<span class="unreleased-date">{text.unreleased}</span>{/if}
									<svg class="revision-toggle-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l10-7z" /></svg>
								</summary>
								{#if revision.changeGroups}
									<div class="revision-groups">{#each changeGroupNames as group}{@const changes = revision.changeGroups[group]}{#if changes.length}<section class="revision-group" aria-labelledby={`revision-${revision.version}-${group}`}><h3 id={`revision-${revision.version}-${group}`}>{changeGroupLabel(group)}</h3><ul>{#each changes as change}<li>{localizedReleaseText(change, $localization.displayLanguage)}</li>{/each}</ul></section>{/if}{/each}</div>
								{:else}<ul>{#each revision.changeIds ?? [] as change}<li>{localizedReleaseText(change, $localization.displayLanguage)}</li>{/each}</ul>{/if}
							</details>
						{/each}
					</div>
				{:else}
					<p class="empty-history">{text.noHistory}</p>
				{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	.version-value p{margin:0}
	.version-value p+p{margin-top:4px}
	.version-value a{font-weight:600;text-decoration:underline;text-underline-offset:2px}
	.version-value a:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}
	.information-card{overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}
	.information-body{container:system-information / inline-size;padding:16px;background:var(--bg)}.information-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0}.information-grid>div{min-width:0;padding:12px;background:var(--surface);border:1px solid var(--border-light);border-radius:5px}dt{color:var(--muted);font-size:var(--font-size-support);font-weight:600;text-transform:uppercase;letter-spacing:.04em}dd{margin:5px 0 0;color:var(--text);font-size:var(--font-size-body);line-height:1.6;overflow-wrap:anywhere}code{padding:2px 6px;background:var(--surface-secondary);border:1px solid var(--border-light);border-radius:4px;color:var(--text);font:600 1rem/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}a{color:var(--action-primary)}.not-published{color:var(--muted)}
	.information-grid>.version-notices{background:color-mix(in srgb,#f0ad4e 9%,var(--surface));border-color:color-mix(in srgb,#f0ad4e 35%,var(--border))}.version-notices dd{color:var(--text-secondary);font-size:var(--font-size-support);line-height:1.6}.version-notices p{margin:0}.version-notices p+p{margin-top:8px}.information-state{padding:24px;color:var(--muted)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
	.revision-history{margin-top:16px;overflow:hidden;background:var(--surface);border:1px solid var(--border-light);border-radius:5px}.revision-history>header{padding:12px;border-bottom:1px solid var(--border-light)}.revision-history h2{margin:0;font-size:var(--font-size-subsection)}.revision-list{display:grid}.revision-entry{min-width:0}.revision-entry+.revision-entry{border-top:1px solid var(--border-light)}.revision-heading{display:grid;grid-template-columns:minmax(0,1fr) auto 24px;align-items:center;gap:12px;padding:12px;background:var(--surface-secondary);cursor:pointer;list-style:none}.revision-heading::-webkit-details-marker{display:none}.revision-heading:hover{background:color-mix(in srgb,var(--action-primary) 8%,var(--surface-secondary))}.revision-heading:focus-visible{outline:2px solid var(--action-primary);outline-offset:-3px;border-radius:3px}.revision-version{font-size:var(--font-size-body);font-weight:600}.revision-version code{font-size:var(--font-size-body)}.revision-toggle-icon{width:24px;height:24px;color:var(--text-secondary)}.revision-entry[open] .revision-toggle-icon{transform:rotate(90deg)}.revision-heading time,.revision-heading .unreleased-date{color:var(--muted);font-size:var(--font-size-support)}.revision-entry ul{display:grid;gap:9px;margin:0;padding:0 12px 12px 30px}.revision-entry li,.empty-history{color:var(--text-secondary);font-size:var(--font-size-body);line-height:1.6}.empty-history{margin:0;padding:12px}
	.revision-groups{display:grid;gap:14px;padding:2px 12px 14px}.revision-group{min-width:0}.revision-group h3{margin:0 0 7px;font-size:var(--font-size-body)}.revision-group ul{padding:0 0 0 22px}
	@container system-information (max-width:960px){.information-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
	@container system-information (max-width:720px){.information-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
	@container system-information (max-width:480px){.information-grid{grid-template-columns:minmax(0,1fr)}}
	@container system-information (max-width:420px){.revision-heading{grid-template-columns:minmax(0,1fr) 24px;gap:5px 12px}.revision-heading time{grid-column:1;grid-row:2}.revision-toggle-icon{grid-column:2;grid-row:1 / span 2}}
</style>
