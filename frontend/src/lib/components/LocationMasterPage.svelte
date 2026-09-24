<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import '$lib/styles/add-button.css';
	type Branch={id:number;code:string;name:string;notes:string|null};
	type Room={id:number;code:string;name:string;notes:string|null;branchId:number;branch:Branch};
	type Location={id:number;code:string;name:string;notes:string|null;roomId:number;room:Room};
	type Tab='branches'|'rooms'|'locations';
	let { kind: tab }: { kind: Tab } = $props();
	let role=$state(''); let branches=$state<Branch[]>([]); let rooms=$state<Room[]>([]); let message=$state(''); let editingId=$state<number|null>(null);
	let form=$state({code:'',name:'',branchId:'',roomId:'',notes:''});
	let formOpen=$state(false);
	let errors=$state<Record<string,string>>({});let formError=$state('');let formElement=$state<HTMLFormElement>();
	let saving=$state(false);let dialogElement=$state<HTMLDialogElement>();let addButton=$state<HTMLButtonElement>();let returnFocus:HTMLElement|null=null;
	let list=$state<MasterList>();
	let endpoint=$derived(tab==='locations'?'/v1/storage-locations':`/v1/${tab}`);
	let columns=$derived(tab==='branches'?[{key:'code',label:'Code',value:(item:Branch)=>item.code},{key:'name',label:'Name',value:(item:Branch)=>item.name},{key:'notes',label:'Notes',value:(item:Branch)=>item.notes??''}]:tab==='rooms'?[{key:'code',label:'Code',value:(item:Room)=>item.code},{key:'name',label:'Name',value:(item:Room)=>item.name},{key:'branch',label:'Branch',value:(item:Room)=>item.branch.name},{key:'notes',label:'Notes',value:(item:Room)=>item.notes??''}]:[{key:'code',label:'Code',value:(item:Location)=>item.code},{key:'name',label:'Name',value:(item:Location)=>item.name},{key:'branch',label:'Branch',value:(item:Location)=>item.room.branch.name},{key:'room',label:'Room',value:(item:Location)=>item.room.name},{key:'notes',label:'Notes',value:(item:Location)=>item.notes??''}]);
	let canManage=$derived(role==='system_administrator'||role==='business_administrator');
	const title=$derived(tab==='branches'?'Branches':tab==='rooms'?'Rooms':'Storages');
	const resourceLabel=$derived(tab==='branches'?'branch':tab==='rooms'?'room':'storage');
	const addLabel=$derived(`Add ${resourceLabel}`);
	const modalTitle=$derived(`${editingId===null?'Add':'Edit'} ${resourceLabel}`);
	const submitLabel=$derived(editingId===null?addLabel:'Save changes');
	const formErrorTitle=$derived(`Unable to ${editingId===null?'add':'save'} ${resourceLabel}`);
	const minTableWidth=$derived(tab==='branches'?720:tab==='rooms'?820:980);
	function reset(){editingId=null;formOpen=false;errors={};formError='';form={code:'',name:'',branchId:branches[0]?String(branches[0].id):'',roomId:rooms[0]?String(rooms[0].id):'',notes:''};message='';}
	async function load(){const session=await fetch('/v1/auth/session');if(!session.ok){message='Please sign in to continue.';return;}role=(await apiData<{user:{role:string}}>(session)).user.role;const responses=await Promise.all([fetch('/v1/branches?limit=500'),fetch('/v1/rooms?limit=500')]);if(responses.some((response)=>!response.ok)){message='Unable to load location data.';return;}[branches,rooms]=await Promise.all([apiData<Branch[]>(responses[0]),apiData<Room[]>(responses[1])]);if(!editingId)reset();}
	function edit(item:Branch|Room|Location,trigger:HTMLButtonElement|null){returnFocus=trigger;editingId=item.id;formOpen=true;errors={};formError='';form={code:item.code,name:item.name,branchId:'branchId' in item?String(item.branchId):'',roomId:'roomId' in item?String(item.roomId):'',notes:item.notes??''};void tick().then(()=>formElement?.querySelector<HTMLInputElement>('[name="code"]')?.focus());}
	function add(){returnFocus=document.activeElement instanceof HTMLElement&&document.activeElement!==document.body?document.activeElement:addButton??null;reset();formOpen=true;void tick().then(()=>formElement?.querySelector<HTMLInputElement>('[name="code"]')?.focus());}
	function closeForm(){if(saving)return;const focusTarget=returnFocus;reset();void tick().then(()=>focusTarget?.focus());}
	function clearError(field:string){errors[field]='';formError='';}
	async function save(){if(saving)return;errors={...(!form.code.trim()?{code:'Code is required.'}:{}),...(!form.name.trim()?{name:'Name is required.'}:{}),...(tab==='rooms'&&!form.branchId?{branchId:'Branch is required.'}:{}),...(tab==='locations'&&!form.roomId?{roomId:'Room is required.'}:{})};if(Object.keys(errors).length){formError='Correct the highlighted fields.';await tick();formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();return;}const body=tab==='branches'?{code:form.code,name:form.name,notes:form.notes}:tab==='rooms'?{code:form.code,name:form.name,branchId:form.branchId,notes:form.notes}:{code:form.code,name:form.name,roomId:form.roomId,notes:form.notes};const focusTarget=returnFocus;saving=true;formError='';try{const response=await fetch(`${endpoint}${editingId?'/'+editingId:''}`,{method:editingId?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok){const payload=await response.json().catch(()=>null) as {error?:{details?:{field?:string}[]}}|null;const field=payload?.error?.details?.[0]?.field;if(field==='code'||field==='name'){errors[field]='This value already exists.';formError='Correct the highlighted field.';await tick();formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();}else formError='Unable to save this item. Check the fields and try again.';return;}await load();reset();await list?.refresh();void tick().then(()=>focusTarget?.focus());}catch{formError='Unable to save this item. Try again.';}finally{saving=false;}}
	async function remove(item:Branch|Room|Location){if(!confirm(`Delete ${item.name}?`))return;const response=await fetch(`${endpoint}/${item.id}`,{method:'DELETE'});if(!response.ok){message='This item is in use or could not be deleted.';return;}await load();reset();await list?.refresh();}
	function handleWindowKeydown(event:KeyboardEvent){if(event.defaultPrevented||!formOpen||!dialogElement)return;if(event.key==='Escape'){event.preventDefault();closeForm();return;}if(event.key!=='Tab')return;const focusable=[...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled])')];if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
	onMount(()=>{void load()});
</script>

{#snippet headerActions()}{#if canManage}<AddButton bind:element={addButton} label={addLabel} onclick={add} />{/if}{/snippet}

{#snippet locationFields()}
	<label><span>Code <span class="required">*</span></span><input name="code" bind:value={form.code} maxlength="64" class:invalid={!!errors.code} aria-invalid={!!errors.code} aria-describedby={errors.code?'location-code-error':undefined} oninput={()=>clearError('code')}/>{#if errors.code}<small id="location-code-error" class="field-error">{errors.code}</small>{/if}</label>
	<label><span>Name <span class="required">*</span></span><input name="name" bind:value={form.name} maxlength="128" class:invalid={!!errors.name} aria-invalid={!!errors.name} aria-describedby={errors.name?'location-name-error':undefined} oninput={()=>clearError('name')}/>{#if errors.name}<small id="location-name-error" class="field-error">{errors.name}</small>{/if}</label>
	{#if tab==='rooms'}<SearchSelect label="Branch" field="location-branch" value={form.branchId} options={branches.map((branch)=>({value:String(branch.id),label:branch.name}))} required error={errors.branchId??''} onSelect={(value)=>{form.branchId=value;clearError('branchId');}}/>{:else if tab==='locations'}<SearchSelect label="Room" field="location-room" value={form.roomId} options={rooms.map((room)=>({value:String(room.id),label:`${room.branch.name} / ${room.name}`}))} required error={errors.roomId??''} onSelect={(value)=>{form.roomId=value;clearError('roomId');}}/>{/if}
	<label class="notes-field">Notes<textarea name="notes" bind:value={form.notes} maxlength="5000" placeholder={`e.g. Notes about this ${resourceLabel}`}></textarea></label>
{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />
<AssetManagementShell {title} active="">
	<MasterPageHeader eyebrow="LOCATION CONFIGURATION" {title} description={`Maintain ${tab==='branches'?'branches':tab==='rooms'?'rooms':'storage positions'} used by assets.`} actions={headerActions} />
	{#if message}<p class="notice">{message}</p>{/if}
	<section class="panel">
		<MasterList bind:this={list} {endpoint} {columns} {title} {canManage} {minTableWidth} onEdit={(item,trigger)=>edit(item as Branch|Room|Location,trigger)} onDelete={(item)=>remove(item as Branch|Room|Location)} />
	</section>
</AssetManagementShell>

{#if canManage && formOpen}
	<div class="app-modal-backdrop" role="presentation"><dialog bind:this={dialogElement} class="location-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="location-dialog-title">
		<header><h2 id="location-dialog-title">{modalTitle}</h2><button class="app-modal-close" type="button" aria-label={`Close ${modalTitle} dialog`} disabled={saving} onclick={closeForm}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
		<form bind:this={formElement} class="app-modal-form" novalidate onsubmit={(event)=>{event.preventDefault();void save();}}>
			<div class="location-form-body app-modal-form-body">{#if formError}<div class="app-modal-error-summary" role="alert"><strong>{formErrorTitle}</strong><span>{formError}</span></div>{/if}<h3>Basic information</h3>{@render locationFields()}</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={closeForm}>Cancel</button><button class="app-primary-action" type="submit" disabled={saving}>{saving?(editingId===null?'Adding...':'Saving...'):submitLabel}</button></footer>
		</form>
	</dialog></div>
{/if}

<style>.notice{margin:0 0 14px;color:var(--danger);font-size:13px}.panel{width:100%;min-width:0;box-sizing:border-box}.location-dialog{width:min(calc(100% - 32px),560px)}.location-form-body{grid-template-columns:repeat(2,minmax(0,1fr))}.notes-field{grid-column:1/-1}.required{color:var(--danger)}.field-error{color:var(--danger);font-size:11px}@media(max-width:700px){.location-form-body{grid-template-columns:1fr}}</style>
