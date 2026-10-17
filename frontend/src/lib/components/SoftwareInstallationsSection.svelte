<script lang="ts">
	import PaginationIcon from '$lib/components/PaginationIcon.svelte';
	import '$lib/styles/table-scroll.css';
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { localization, formatEmployeeName } from '$lib/localization';
	import AddButton from '$lib/components/AddButton.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import '$lib/styles/page-size-picker.css';

	type Capabilities = { canCreateSoftwareInstallations: boolean; canEndSoftwareInstallations: boolean; canCreateSoftwareUsage: boolean; canEndSoftwareUsage: boolean };
	type Target = { id: number; assetTag?: string; employeeCode?: string; firstName?: string; middleName?: string | null; lastName?: string };
	type Installation = { id: number; installationNo: number; assetId: number; installedOn: string; removedOn: string | null; notes: string | null; asset: { assetTag: string }; _count: { users: number } };
	type Usage = { id: number; usageNo: number; employeeId: number; startedOn: string; endedOn: string | null; notes: string | null; employee: { employeeCode: string; firstName: string; middleName: string | null; lastName: string } };
	type Meta = { total: number; hasMore: boolean };
	let { contractId, capabilities, onChanged }: { contractId: number; capabilities: Capabilities; onChanged: () => Promise<void> } = $props();
	let text = $derived(localeMessages[$localization.displayLanguage].software);
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	let installations = $state<Installation[]>([]);
	let users = $state<Usage[]>([]);
	let selected = $state<Installation | null>(null);
	let installationMeta = $state<Meta>({ total: 0, hasMore: false });
	let usageMeta = $state<Meta>({ total: 0, hasMore: false });
	let installationOffset = $state(0);
	let usageOffset = $state(0);
	let pageSize = $state(10);
	let installationSearch = $state('');
	let usageSearch = $state('');
	let installationSort = $state('installedOn');
	let usageSort = $state('startedOn');
	let targets = $state<Target[]>([]);
	let targetSearch = $state('');
	let installationSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let usageSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let targetSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let targetRequest = 0;
	let mode = $state<'installation' | 'remove' | 'usage' | 'endUsage' | null>(null);
	let endingUsage = $state<Usage | null>(null);
	let targetId = $state('');
	let recordDate = $state('');
	let openDate = $state(false);
	let fieldErrors = $state<Record<string, string>>({});
	let notes = $state('');
	let saving = $state(false);
	let error = $state('');
	let notice = $state('');
	let loading = $state(true);
	const today = () => new Date().toISOString().slice(0, 10);
	const date = (value: string | null) => value ? value.slice(0, 10) : '';
	function userName(item: Usage) { return `${formatEmployeeName(item.employee, $localization)} (${item.employee.employeeCode})`; }
	function targetName(item: Target) { return item.assetTag ?? `${formatEmployeeName({ firstName: item.firstName ?? '', middleName: item.middleName ?? null, lastName: item.lastName ?? '' }, $localization)} (${item.employeeCode ?? ''})`; }
	async function loadInstallations() {
		const params = new URLSearchParams({ limit: String(pageSize), offset: String(installationOffset), sortBy: installationSort, sortOrder: 'desc', q: installationSearch });
		const response = await fetch(`/v1/software-contracts/${contractId}/installations?${params}`);
		if (!response.ok) throw new Error(text.loadFailed);
		const payload = await response.json();
		installations = payload.data;
		installationMeta = payload.meta;
		if (selected) selected = installations.find((item: Installation) => item.id === selected?.id) ?? null;
	}
	async function loadUsers() {
		if (!selected) { users = []; return; }
		const params = new URLSearchParams({ limit: String(pageSize), offset: String(usageOffset), sortBy: usageSort, sortOrder: 'desc', q: usageSearch });
		const response = await fetch(`/v1/software-contracts/${contractId}/installations/${selected.id}/users?${params}`);
		if (!response.ok) throw new Error(text.loadFailed);
		const payload = await response.json();
		users = payload.data;
		usageMeta = payload.meta;
	}
	async function loadTargets(kind: 'asset' | 'employee') {
		const request = ++targetRequest;
		const response = await fetch(`/v1/software-assignment-targets?kind=${kind}&limit=100&q=${encodeURIComponent(targetSearch)}`);
		if (!response.ok) throw new Error(text.loadFailed);
		const items = await apiData<Target[]>(response);
		if (request === targetRequest) targets = items;
	}
	function searchInstallations(value: string) { installationSearch = value; installationOffset = 0; if (installationSearchTimer) clearTimeout(installationSearchTimer); installationSearchTimer = setTimeout(() => { void refresh(); }, 350); }
	function searchUsers(value: string) { usageSearch = value; usageOffset = 0; if (usageSearchTimer) clearTimeout(usageSearchTimer); usageSearchTimer = setTimeout(() => { void loadUsers().catch(() => error = text.loadFailed); }, 350); }
	function searchTargets(value: string) { targetSearch = value; if (targetSearchTimer) clearTimeout(targetSearchTimer); targetSearchTimer = setTimeout(() => { void loadTargets(mode === 'installation' ? 'asset' : 'employee').catch(() => error = text.loadFailed); }, 350); }
	function changePageSize(value: string) { const next = Number(value); if (![10, 20, 30, 40, 50].includes(next)) return; pageSize = next; installationOffset = 0; usageOffset = 0; void refresh(); }
	async function refresh() { try { await loadInstallations(); await loadUsers(); } catch { error = text.loadFailed; } }
	onMount(() => { void refresh().finally(() => loading = false); return () => { if (installationSearchTimer) clearTimeout(installationSearchTimer); if (usageSearchTimer) clearTimeout(usageSearchTimer); if (targetSearchTimer) clearTimeout(targetSearchTimer); }; });
	async function selectInstallation(item: Installation) { selected = item; usageOffset = 0; usageSearch = ''; mode = null; error = ''; await refresh(); }
	function open(next: typeof mode, item: Usage | null = null) {
		mode = next; endingUsage = item; targetId = ''; targetSearch = ''; targets = []; recordDate = today(); openDate = false; fieldErrors = {}; notes = ''; error = ''; notice = '';
		if (next === 'installation' || next === 'usage') void loadTargets(next === 'installation' ? 'asset' : 'employee').catch(() => error = text.loadFailed);
		void tick().then(() => document.getElementById('software-observation-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
	}
	function clearFieldError(field: string) { if (!fieldErrors[field]) return; const next = { ...fieldErrors }; delete next[field]; fieldErrors = next; if (!Object.keys(next).length) error = ''; }
	function showFieldErrors(fields: Record<string, string>) { fieldErrors = fields; error = text.correctFields; void tick().then(() => { const field = Object.keys(fields)[0]; const target = document.querySelector<HTMLElement>(`#software-observation-form .form-select-picker[data-field="${field}"] .form-select-trigger, #software-observation-form .custom-date[data-field="${field}"] .date-trigger`); target?.scrollIntoView({ block: 'nearest' }); target?.focus(); }); }
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!mode || saving) return;
		const fields: Record<string, string> = {};
		if ((mode === 'installation' || mode === 'usage') && !targetId) fields.targetId = formatLocaleTemplate(text.requiredField, mode === 'installation' ? text.asset : text.employee);
		if (!recordDate) fields.recordDate = formatLocaleTemplate(text.requiredField, mode === 'installation' ? text.installedOn : mode === 'remove' ? text.removedOn : mode === 'usage' ? text.startedOn : text.endedOn);
		else if (recordDate > today()) fields.recordDate = formatLocaleTemplate(text.invalidValue, mode === 'installation' ? text.installedOn : mode === 'remove' ? text.removedOn : mode === 'usage' ? text.startedOn : text.endedOn);
		if (Object.keys(fields).length) { showFieldErrors(fields); return; }
		saving = true; error = ''; notice = '';
		try {
			let path = `/v1/software-contracts/${contractId}/installations`;
			let method = 'POST';
			let body: Record<string, unknown>;
			if (mode === 'installation') body = { assetId: Number(targetId), installedOn: recordDate, notes };
			else if (mode === 'remove' && selected) { path += `/${selected.id}`; method = 'PATCH'; body = { removedOn: recordDate }; }
			else if (mode === 'usage' && selected) { path += `/${selected.id}/users`; body = { employeeId: Number(targetId), startedOn: recordDate, notes }; }
			else if (mode === 'endUsage' && selected && endingUsage) { path += `/${selected.id}/users/${endingUsage.id}`; method = 'PATCH'; body = { endedOn: recordDate }; }
			else return;
			const response = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			if (!response.ok) throw new Error(text.saveFailed);
			mode = null; notice = text.saved;
			await refresh();
			await onChanged();
		} catch { error = text.saveFailed; }
		finally { saving = false; }
	}
</script>

<section class="observations" aria-labelledby="installations-title">
	<div class="section-heading"><h3 id="installations-title">{text.installations}</h3>{#if capabilities.canCreateSoftwareInstallations}<AddButton label={text.addInstallation} onclick={() => open('installation')} />{/if}</div>
	<p class="help">{text.observationNote} {text.allRecords}</p>
	{#if notice}<p class="notice" role="status">{notice}</p>{/if}
	{#if error && !mode}<p class="error" role="alert">{error}</p>{/if}
	<div class="toolbar"><SearchInput label={text.searchInstallations} value={installationSearch} onValueChange={searchInstallations} /><SearchSelect label={text.sortInstallations} field="installationSort" value={installationSort} options={[{ value: 'installedOn', label: text.installedOn }, { value: 'installationNo', label: text.installationNumber }, { value: 'removedOn', label: text.removedOn }]} searchable={false} onSelect={(value) => { installationSort = value; installationOffset = 0; void refresh(); }} /><label class="page-size">{common.showPrefix} <select class="page-size-trigger" aria-label={common.entriesPerPage} value={pageSize} onchange={(event) => changePageSize(event.currentTarget.value)}>{#each [10, 20, 30, 40, 50] as size}<option value={size}>{size}</option>{/each}</select> {common.showSuffix}</label></div>
	<div class="table-wrap app-table-scroll app-table-scroll--bounded"><table><thead><tr><th>{text.asset}</th><th>{text.installedOn}</th><th>{text.removedOn}</th><th>{text.activeUsers}</th><th></th></tr></thead><tbody>{#each installations as item}<tr><td>{item.asset.assetTag}</td><td>{date(item.installedOn)}</td><td>{date(item.removedOn)}</td><td>{item._count.users}</td><td><button type="button" class="text-button" onclick={() => void selectInstallation(item)}>{text.details}</button></td></tr>{:else}<tr><td colspan="5">{#if loading}<LoadingSpinner label={text.loading} compact />{:else}{text.noInstallations}{/if}</td></tr>{/each}</tbody></table></div>
	<div class="paging"><span>{formatLocaleTemplate(text.showing, installationMeta.total ? installationOffset + 1 : 0, installationOffset + installations.length, installationMeta.total)}</span><button type="button" disabled={installationOffset === 0} onclick={() => { installationOffset = 0; void refresh(); }} aria-label={common.firstPage}><PaginationIcon direction="first" /></button><button type="button" disabled={installationOffset === 0} onclick={() => { installationOffset -= pageSize; void refresh(); }} aria-label={common.previousPage}><PaginationIcon direction="previous" /></button><span>{Math.floor(installationOffset / pageSize) + 1} / {Math.max(1, Math.ceil(installationMeta.total / pageSize))}</span><button type="button" disabled={!installationMeta.hasMore} onclick={() => { installationOffset += pageSize; void refresh(); }} aria-label={common.nextPage}><PaginationIcon direction="next" /></button><button type="button" disabled={!installationMeta.hasMore} onclick={() => { installationOffset = (Math.ceil(installationMeta.total / pageSize) - 1) * pageSize; void refresh(); }} aria-label={common.lastPage}><PaginationIcon direction="last" /></button></div>
	{#if selected}<div class="usage-panel"><div class="section-heading"><h3>{text.installationDetails}: {selected.asset.assetTag}</h3><div class="actions">{#if !selected.removedOn && capabilities.canCreateSoftwareUsage}<AddButton label={text.addUsage} onclick={() => open('usage')} />{/if}{#if !selected.removedOn && capabilities.canEndSoftwareInstallations}<button type="button" onclick={() => open('remove')}>{text.endInstallation}</button>{/if}<button type="button" onclick={() => { selected = null; users = []; mode = null; }}>{text.close}</button></div></div>
		<div class="toolbar"><SearchInput label={text.searchUsage} value={usageSearch} onValueChange={searchUsers} /><SearchSelect label={text.sortUsage} field="usageSort" value={usageSort} options={[{ value: 'startedOn', label: text.startedOn }, { value: 'usageNo', label: text.details }, { value: 'endedOn', label: text.endedOn }]} searchable={false} onSelect={(value) => { usageSort = value; usageOffset = 0; void loadUsers().catch(() => error = text.loadFailed); }} /></div>
		<div class="table-wrap app-table-scroll app-table-scroll--bounded"><table><thead><tr><th>{text.employee}</th><th>{text.startedOn}</th><th>{text.endedOn}</th><th></th></tr></thead><tbody>{#each users as item}<tr><td>{userName(item)}</td><td>{date(item.startedOn)}</td><td>{date(item.endedOn)}</td><td>{#if !item.endedOn && capabilities.canEndSoftwareUsage}<button type="button" class="text-button" onclick={() => open('endUsage', item)}>{text.endUsage}</button>{/if}</td></tr>{:else}<tr><td colspan="4">{text.noUsage}</td></tr>{/each}</tbody></table></div>
		<div class="paging"><span>{formatLocaleTemplate(text.showing, usageMeta.total ? usageOffset + 1 : 0, usageOffset + users.length, usageMeta.total)}</span><button type="button" disabled={usageOffset === 0} onclick={() => { usageOffset = 0; void loadUsers().catch(() => error = text.loadFailed); }} aria-label={common.firstPage}><PaginationIcon direction="first" /></button><button type="button" disabled={usageOffset === 0} onclick={() => { usageOffset -= pageSize; void loadUsers().catch(() => error = text.loadFailed); }} aria-label={common.previousPage}><PaginationIcon direction="previous" /></button><span>{Math.floor(usageOffset / pageSize) + 1} / {Math.max(1, Math.ceil(usageMeta.total / pageSize))}</span><button type="button" disabled={!usageMeta.hasMore} onclick={() => { usageOffset += pageSize; void loadUsers().catch(() => error = text.loadFailed); }} aria-label={common.nextPage}><PaginationIcon direction="next" /></button><button type="button" disabled={!usageMeta.hasMore} onclick={() => { usageOffset = (Math.ceil(usageMeta.total / pageSize) - 1) * pageSize; void loadUsers().catch(() => error = text.loadFailed); }} aria-label={common.lastPage}><PaginationIcon direction="last" /></button></div>
	</div>{/if}
	{#if mode}
		<form id="software-observation-form" class="observation-form" novalidate onsubmit={save}>
			<h3>{mode === 'installation' ? text.addInstallation : mode === 'remove' ? text.endInstallation : mode === 'usage' ? text.addUsage : text.endUsage}</h3>
			{#if error}<StatusNotice message={error} tone="error" onDismiss={() => error = ''} />{/if}
			<FormSection title={mode === 'installation' || mode === 'usage' ? text.target : text.release} framed>
				{#if mode === 'remove'}<p class="wide help">{text.endingInstallationNote}</p>{/if}
				{#if mode === 'installation' || mode === 'usage'}
					<SearchInput label={text.targetSearch} value={targetSearch} placeholder={text.targetSearch} onValueChange={searchTargets} />
					<SearchSelect label={mode === 'installation' ? text.asset : text.employee} field="targetId" value={targetId} options={[{ value: '', label: '-' }, ...targets.map((target) => ({ value: String(target.id), label: targetName(target) }))]} required error={fieldErrors.targetId ?? ''} onOpen={() => openDate = false} onSelect={(value) => { targetId = value; clearFieldError('targetId'); }} />
				{/if}
				<DatePicker label={mode === 'installation' ? text.installedOn : mode === 'remove' ? text.removedOn : mode === 'usage' ? text.startedOn : text.endedOn} field="recordDate" value={recordDate} max={today()} required error={fieldErrors.recordDate ?? ''} open={openDate} onToggle={() => openDate = !openDate} onSelect={(value) => { recordDate = value; openDate = false; clearFieldError('recordDate'); }} />
				{#if mode === 'installation' || mode === 'usage'}<label class="wide">{text.notes}<textarea bind:value={notes} maxlength="5000" placeholder={text.notesExample}></textarea></label>{/if}
			</FormSection>
			<div class="form-actions"><button type="button" class="secondary" disabled={saving} onclick={() => mode = null}>{text.cancel}</button><button type="submit" class="app-primary-action" disabled={saving}>{mode === 'installation' || mode === 'usage' ? text.record : text.end}</button></div>
		</form>
	{/if}
</section>

<style>
	.observation-form textarea::placeholder{color:#c0c7cf}:global(html[data-theme='dark']) .observation-form textarea::placeholder{color:#5a6473}
	.observations{margin-top:0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}.section-heading h3{margin:0;font-size:var(--font-size-subsection)}.actions{display:flex;gap:8px;flex-wrap:wrap}.help{font-size:var(--font-size-support);color:var(--muted)}.toolbar{display:flex;align-items:end;gap:16px;flex-wrap:wrap;margin:16px 0}.toolbar :global(.search-box){flex:none;align-self:end}.toolbar :global(.form-select-field){width:220px}.toolbar .page-size{margin-left:auto}.observation-form label{display:flex;flex-direction:column;gap:5px;min-width:190px}.observation-form textarea{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:0 12px;min-height:36px}.observation-form textarea:focus{border-color:#1abb9c;outline:none;box-shadow:0 0 0 3px rgba(26,187,156,.14)}.table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:6px}table{width:100%;min-width:550px;border-collapse:collapse}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);font-size:var(--font-size-body)}th{font-size:var(--font-size-support);color:var(--muted);background:var(--surface-secondary)}.text-button{border:0;background:none;color:var(--action-primary);text-decoration:underline;cursor:pointer;font:inherit}.paging{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin:12px 0;font-size:var(--font-size-support);color:var(--muted)}button:not(.text-button):not(.app-add-button):not(.app-primary-action):not(.secondary){font:inherit;cursor:pointer;border:1px solid var(--border);background:var(--surface-secondary);color:var(--text);border-radius:4px;padding:7px 10px}button:disabled{opacity:.5}.usage-panel,.observation-form{border:1px solid var(--border);border-radius:6px;padding:16px;margin-top:20px}.observation-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.observation-form h3,.form-actions{grid-column:1/-1}.observation-form :global(.app-form-section){grid-column:1/-1}.observation-form .wide{grid-column:1/-1}.observation-form h3{margin:0;font-size:var(--font-size-subsection)}.observation-form textarea{min-height:90px}.observation-form .secondary{min-height:32px;padding:0 12px;background:var(--surface);color:var(--text-secondary);border:1px solid var(--border)}.form-actions{display:flex;justify-content:flex-end;gap:8px}.error{color:var(--danger)}.notice{color:var(--text)}@media(max-width:750px){.observation-form{grid-template-columns:1fr}.paging{flex-wrap:wrap;justify-content:flex-start}}
</style>
