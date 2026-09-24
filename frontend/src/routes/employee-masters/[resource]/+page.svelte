<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import '$lib/styles/add-button.css';
	type Item = { id: number; code: string; name: string };
	const labels: Record<string, string> = { departments: 'Departments', 'employee-groups': 'Groups', positions: 'Positions', 'employment-types': 'Employment types', branches: 'Branches' };
	const columns = [{ key: 'code', label: 'Code', value: (item: Item) => item.code }, { key: 'name', label: 'Name', value: (item: Item) => item.name }];
	let resource = $derived(page.params.resource??'');
	let title = $derived(labels[resource] ?? 'Employee masters');
	let endpoint = $derived('/v1/' + resource);
	let canManage = $state(false);
	let list=$state<MasterList>();
	let code = $state(''); let name = $state(''); let editing = $state<Item | null>(null);
	let formOpen=$state(false);
	let message = $state(''); let errors = $state<{ code?: string; name?: string }>({});
	let codeInput = $state<HTMLInputElement>(); let nameInput = $state<HTMLInputElement>();
	function reset() { editing = null; code = ''; name = ''; errors = {}; message = ''; formOpen=false; }
	function edit(item: Item) { editing = item; code = item.code; name = item.name; errors = {}; message = ''; formOpen=true; void tick().then(() => codeInput?.focus()); }
	function add(){reset();formOpen=true;void tick().then(()=>codeInput?.focus());}
	async function save() {
		errors = { ...(!code.trim() ? { code: 'Code is required.' } : {}), ...(!name.trim() ? { name: 'Name is required.' } : {}) };
		if (Object.keys(errors).length) { await tick(); (errors.code ? codeInput : nameInput)?.focus(); return; }
		const response = await fetch(endpoint + (editing ? '/' + editing.id : ''), { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, name }) });
		if (!response.ok) { const payload=await response.json().catch(()=>null) as {error?:{details?:{field?:string}[]}}|null;const field=payload?.error?.details?.[0]?.field;if(field==='code'||field==='name'){errors={[field]:`${field==='code'?'Code':'Name'} already exists.`};await tick();(field==='code'?codeInput:nameInput)?.focus();}else message='Unable to save this item. Check the code and name.';return; }
		reset(); await list?.refresh();
	}
	async function remove(item: Item) {
		if (!confirm(`Delete ${item.name}?`)) return;
		const response = await fetch(`${endpoint}/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { message = 'This item is in use or could not be deleted.'; return; }
		await list?.refresh();
	}
	afterNavigate(() => { reset(); void (async () => { const response = await fetch('/v1/auth/session'); if (response.ok) { const session = await apiData<{ user: { role: string } }>(response); canManage = ['system_administrator', 'business_administrator'].includes(session.user.role); } })(); });
</script>

<AssetManagementShell {title} active="">
	<div class="heading"><div><p>CONFIGURATION</p><h1>{title}</h1></div>{#if canManage}<button class="app-add-button" type="button" onclick={add}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 2v12M2 8h12" /></svg>Add item</button>{/if}</div>
	<section>
		{#if canManage && formOpen}<form novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<label>Code <span class="required">*</span><input bind:this={codeInput} bind:value={code} maxlength="64" placeholder="Enter code" aria-invalid={!!errors.code} aria-describedby={errors.code ? 'code-error' : undefined} oninput={() => { errors.code = undefined; message = ''; }} />{#if errors.code}<small id="code-error" class="field-error">{errors.code}</small>{/if}</label>
			<label>Name <span class="required">*</span><input bind:this={nameInput} bind:value={name} maxlength="128" placeholder="Enter name" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined} oninput={() => { errors.name = undefined; message = ''; }} />{#if errors.name}<small id="name-error" class="field-error">{errors.name}</small>{/if}</label>
			<div class="form-actions"><button class="save" type="submit">{editing ? 'Save changes' : 'Add item'}</button><button class="cancel" type="button" onclick={reset}>Cancel</button></div>
		</form>{/if}
		{#if message}<p class="notice" role="alert">{message}</p>{/if}
		<MasterList bind:this={list} {endpoint} {columns} {title} {canManage} onEdit={(item) => edit(item as Item)} onDelete={(item) => remove(item as Item)} />
	</section>
</AssetManagementShell>
<style>
	.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}.heading p{color:#1abb9c;font-size:11px;font-weight:700}.heading h1{margin:4px 0;font-size:30px}section{width:100%;min-width:0;box-sizing:border-box}form{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:20px}label{display:grid;gap:5px;min-width:180px;font-size:12px}input{height:36px;padding:0 12px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)}input:focus{outline:0;border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14)}input[aria-invalid='true']{border-color:#d63939}.required,.field-error{color:#d63939}.field-error{font-size:11px}.form-actions{display:flex;gap:8px}.form-actions button{height:36px;padding:0 12px;border:0;border-radius:4px;color:white}.save{background:#066fd1}.cancel{background:#6c757d}.notice{color:#d63939}@media(max-width:700px){.heading{align-items:stretch;flex-direction:column}form{display:grid}label{min-width:0}}
</style>
