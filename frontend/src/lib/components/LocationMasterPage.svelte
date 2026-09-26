<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import { googleMapsHref } from '$lib/branchMaps';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import EmployeeDetailModal from '$lib/components/EmployeeDetailModal.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import type { Employee } from '$lib/employees';
	import { formSnapshot } from '$lib/modalForm';
	import '$lib/styles/add-button.css';
	type EmployeeRef={id:number;employeeCode:string;firstName:string;middleName:string|null;lastName:string};
	type Branch={id:number;name:string;openedOn:string|null;closedOn:string|null;postalCode:string|null;prefecture:string|null;city:string|null;streetAddress:string|null;buildingName:string|null;phoneNumber1:string|null;phoneNumber1Label:string|null;phoneNumber2:string|null;phoneNumber2Label:string|null;faxNumber1:string|null;faxNumber1Label:string|null;faxNumber2:string|null;faxNumber2Label:string|null;managerEmployeeId:number|null;deputyManagerEmployeeId:number|null;manager?:EmployeeRef|null;deputyManager?:EmployeeRef|null;notes:string|null};
	type Room={id:number;name:string;notes:string|null;branchId:number;branch:Branch};
	type Storage={id:number;name:string;notes:string|null;branchId:number;roomId:number;room:Room};
	type Tab='branches'|'rooms'|'locations';
	let { kind: tab }: { kind: Tab } = $props();
	let role=$state(''); let branches=$state<Branch[]>([]); let rooms=$state<Room[]>([]); let employees=$state<EmployeeRef[]>([]); let message=$state(''); let editingId=$state<number|null>(null);
	let form=$state({name:'',openedOn:'',closedOn:'',postalCode:'',prefecture:'',city:'',streetAddress:'',buildingName:'',phoneNumber1:'',phoneNumber1Label:'',phoneNumber2:'',phoneNumber2Label:'',faxNumber1:'',faxNumber1Label:'',faxNumber2:'',faxNumber2Label:'',managerEmployeeId:'',deputyManagerEmployeeId:'',branchId:'',roomId:'',notes:''});
	let formOpen=$state(false);
	let activeDateField=$state<'openedOn'|'closedOn'|null>(null);
	let detailBranch=$state<Branch|null>(null);
	let detailEmployee=$state<Employee|null>(null);
	let employeeDetailReturnFocus=$state<HTMLElement|null>(null);
	let errors=$state<Record<string,string>>({});let formError=$state('');let formElement=$state<HTMLFormElement>();
	let saving=$state(false);let dialogElement=$state<HTMLDialogElement>();let addButton=$state<HTMLButtonElement>();let returnFocus=$state<HTMLElement|null>(null);
	let initialSnapshot=$state('');let confirmingDiscard=$state(false);
	let list=$state<MasterList>();
	let endpoint=$derived(tab==='locations'?'/v1/storage':`/v1/${tab}`);
	function contactLines(first:string|null,firstLabel:string|null,second:string|null,secondLabel:string|null){return [[first,firstLabel],[second,secondLabel]].filter((entry):entry is [string,string|null]=>Boolean(entry[0])).map(([number,label])=>`${number}${label?` : ${label}`:''}`).join('\n');}
	function employeeName(employee:EmployeeRef|null|undefined){return employee?[employee.firstName,employee.middleName,employee.lastName].filter(Boolean).join(' '):'';}
	function dateValue(value:string|null|undefined){return value?value.slice(0,10):'';}
	let columns=$derived(tab==='rooms'?[{key:'name',label:'Name',value:(item:Room)=>item.name},{key:'branch',label:'Branch',value:(item:Room)=>item.branch.name},{key:'notes',label:'Notes',value:(item:Room)=>item.notes??''}]:[{key:'name',label:'Name',value:(item:Storage)=>item.name},{key:'branch',label:'Branch',value:(item:Storage)=>item.room.branch.name},{key:'room',label:'Room',value:(item:Storage)=>item.room.name},{key:'notes',label:'Notes',value:(item:Storage)=>item.notes??''}]);
	let canManage=$derived(role==='system_administrator'||(tab!=='branches'&&role==='business_administrator'));
	const title=$derived(tab==='branches'?'Branches':tab==='rooms'?'Rooms':'Storages');
	const resourceLabel=$derived(tab==='branches'?'branch':tab==='rooms'?'room':'storage');
	const addLabel=$derived(`Add ${resourceLabel}`);
	const modalTitle=$derived(`${editingId===null?'Add':'Edit'} ${resourceLabel}`);
	const submitLabel=$derived(editingId===null?addLabel:'Save changes');
	const formErrorTitle=$derived(`Unable to ${editingId===null?'add':'save'} ${resourceLabel}`);
	const minTableWidth=$derived(tab==='branches'?1320:tab==='rooms'?820:980);
	let availableRooms=$derived(rooms.filter((room)=>String(room.branchId)===form.branchId));
	let employeeOptions=$derived([{value:'',label:'-'},...employees.map((employee)=>({value:String(employee.id),label:`${employeeName(employee)} (${employee.employeeCode})`,searchTerms:[employeeName(employee),employee.employeeCode]}))]);
	let hasUnsavedChanges=$derived(editingId!==null&&initialSnapshot!==''&&formSnapshot(form)!==initialSnapshot);
	function emptyForm(){const branchId=branches[0]?String(branches[0].id):'';return {name:'',openedOn:'',closedOn:'',postalCode:'',prefecture:'',city:'',streetAddress:'',buildingName:'',phoneNumber1:'',phoneNumber1Label:'',phoneNumber2:'',phoneNumber2Label:'',faxNumber1:'',faxNumber1Label:'',faxNumber2:'',faxNumber2Label:'',managerEmployeeId:'',deputyManagerEmployeeId:'',branchId,roomId:rooms.find((room)=>String(room.branchId)===branchId)?String(rooms.find((room)=>String(room.branchId)===branchId)!.id):'',notes:''};}
	function reset(clearMessage=true){editingId=null;formOpen=false;activeDateField=null;errors={};formError='';form=emptyForm();initialSnapshot='';confirmingDiscard=false;if(clearMessage)message='';}
	async function loadEmployees(){const collected:EmployeeRef[]=[];let offset=0,total=1;while(offset<total){const response=await fetch(`/v1/employees?limit=500&offset=${offset}&sortBy=employee&sortOrder=asc`);if(!response.ok)throw new Error();const payload=await response.json() as {data:EmployeeRef[];meta?:{total?:number}};collected.push(...payload.data);offset+=payload.data.length;total=payload.meta?.total??collected.length;if(!payload.data.length)break;}employees=collected;}
	async function load(){const session=await fetch('/v1/auth/session');if(!session.ok){message='Please sign in to continue.';return;}role=(await apiData<{user:{role:string}}>(session)).user.role;const responses=await Promise.all([fetch('/v1/branches?limit=500'),fetch('/v1/rooms?limit=500')]);if(responses.some((response)=>!response.ok)){message='Unable to load location data.';return;}[branches,rooms]=await Promise.all([apiData<Branch[]>(responses[0]),apiData<Room[]>(responses[1])]);if(tab==='branches'&&role==='system_administrator'){try{await loadEmployees();}catch{message='Unable to load employee options.';}}if(!editingId)reset(false);}
	function edit(item:Branch|Room|Storage,trigger:HTMLButtonElement|null){returnFocus=trigger;editingId=item.id;formOpen=true;activeDateField=null;errors={};formError='';form={...emptyForm(),name:item.name,...('postalCode' in item?{openedOn:dateValue(item.openedOn),closedOn:dateValue(item.closedOn),postalCode:item.postalCode??'',prefecture:item.prefecture??'',city:item.city??'',streetAddress:item.streetAddress??'',buildingName:item.buildingName??'',phoneNumber1:item.phoneNumber1??'',phoneNumber1Label:item.phoneNumber1Label??'',phoneNumber2:item.phoneNumber2??'',phoneNumber2Label:item.phoneNumber2Label??'',faxNumber1:item.faxNumber1??'',faxNumber1Label:item.faxNumber1Label??'',faxNumber2:item.faxNumber2??'',faxNumber2Label:item.faxNumber2Label??'',managerEmployeeId:item.managerEmployeeId?String(item.managerEmployeeId):'',deputyManagerEmployeeId:item.deputyManagerEmployeeId?String(item.deputyManagerEmployeeId):''}:{}),branchId:'branchId' in item?String(item.branchId):'',roomId:'roomId' in item?String(item.roomId):'',notes:item.notes??''};initialSnapshot=formSnapshot(form);confirmingDiscard=false;void tick().then(()=>formElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());}
	function showDetail(item:Branch,trigger:HTMLButtonElement|null){returnFocus=trigger;detailBranch=item;}
	function add(){returnFocus=document.activeElement instanceof HTMLElement&&document.activeElement!==document.body?document.activeElement:addButton??null;reset();formOpen=true;void tick().then(()=>formElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());}
	function closeFormImmediately(){if(saving)return;confirmingDiscard=false;const focusTarget=returnFocus;reset();void tick().then(()=>focusTarget?.focus());}
	function requestCloseForm(){if(saving)return;activeDateField=null;if(hasUnsavedChanges){confirmingDiscard=true;return;}closeFormImmediately();}
	function closeDetail(){detailBranch=null;}
	function closeEmployeeDetail(){detailEmployee=null;}
	async function showEmployeeDetail(employeeId:number,trigger:HTMLButtonElement){
		employeeDetailReturnFocus=trigger;message='';
		try{const response=await fetch(`/v1/employees/${employeeId}`);if(!response.ok)throw new Error();detailEmployee=await apiData<Employee>(response);}
		catch{message='Unable to load employee details.';employeeDetailReturnFocus=null;}
	}
	function display(value:string|null){return value?.trim()??'';}
	function clearError(field:string){errors[field]='';formError='';}
	async function save(){
		if(saving)return;
		errors={...(!form.name.trim()?{name:'Name is required.'}:{}),...((tab==='rooms'||tab==='locations')&&!form.branchId?{branchId:'Branch is required.'}:{}),...(tab==='locations'&&!form.roomId?{roomId:'Room is required.'}:{})};
		if(tab==='branches'){
			if(form.openedOn&&form.closedOn&&form.closedOn<form.openedOn)errors.closedOn='Closing date cannot be before opening date.';
			if(form.postalCode&&!/^\d{3}-?\d{4}$/.test(form.postalCode.trim()))errors.postalCode='Use a Japanese postal code such as 100-0001.';
			const phonePattern=/^[+0-9][0-9 ()-]{6,31}$/;
			for(const field of ['phoneNumber1','phoneNumber2','faxNumber1','faxNumber2'] as const)if(form[field]&&!phonePattern.test(form[field].trim()))errors[field]='Enter a valid phone number.';
			if(form.phoneNumber1Label&&!form.phoneNumber1)errors.phoneNumber1='Enter a phone number for this label.';
			if((form.phoneNumber2||form.phoneNumber2Label)&&!form.phoneNumber1)errors.phoneNumber1='Enter Phone 1 before Phone 2.';
			if(form.phoneNumber2Label&&!form.phoneNumber2)errors.phoneNumber2='Enter a phone number for this label.';
			if(form.phoneNumber1&&form.phoneNumber1.trim()===form.phoneNumber2.trim())errors.phoneNumber2='Enter a different phone number.';
			if(form.faxNumber1Label&&!form.faxNumber1)errors.faxNumber1='Enter a fax number for this label.';
			if((form.faxNumber2||form.faxNumber2Label)&&!form.faxNumber1)errors.faxNumber1='Enter Fax 1 before Fax 2.';
			if(form.faxNumber2Label&&!form.faxNumber2)errors.faxNumber2='Enter a fax number for this label.';
			if(form.faxNumber1&&form.faxNumber1.trim()===form.faxNumber2.trim())errors.faxNumber2='Enter a different fax number.';
			if(form.deputyManagerEmployeeId&&!form.managerEmployeeId)errors.managerEmployeeId='Select a primary responsible person first.';
			if(form.managerEmployeeId&&form.managerEmployeeId===form.deputyManagerEmployeeId)errors.deputyManagerEmployeeId='Select a different employee.';
		}
		if(Object.keys(errors).length){formError='Correct the highlighted fields.';await tick();formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();return;}
		if(tab==='branches'&&form.closedOn&&!confirm('Saving a closing date will close this branch and remove it from active lists. Continue?'))return;
		const body=tab==='branches'?{name:form.name,openedOn:form.openedOn,closedOn:form.closedOn,postalCode:form.postalCode,prefecture:form.prefecture,city:form.city,streetAddress:form.streetAddress,buildingName:form.buildingName,phoneNumber1:form.phoneNumber1,phoneNumber1Label:form.phoneNumber1Label,phoneNumber2:form.phoneNumber2,phoneNumber2Label:form.phoneNumber2Label,faxNumber1:form.faxNumber1,faxNumber1Label:form.faxNumber1Label,faxNumber2:form.faxNumber2,faxNumber2Label:form.faxNumber2Label,managerEmployeeId:form.managerEmployeeId,deputyManagerEmployeeId:form.deputyManagerEmployeeId,notes:form.notes}:tab==='rooms'?{name:form.name,branchId:form.branchId,notes:form.notes}:{name:form.name,branchId:form.branchId,roomId:form.roomId,notes:form.notes};
		const focusTarget=tab==='branches'&&form.closedOn?(addButton??returnFocus):returnFocus;saving=true;formError='';
		try{const response=await fetch(`${endpoint}${editingId?'/'+editingId:''}`,{method:editingId?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok){const payload=await response.json().catch(()=>null) as {error?:{code?:string;details?:{field?:string;reason?:string}[]}}|null;const detail=payload?.error?.details?.[0];if(detail?.field&&detail.field in form){errors[detail.field]=detail.field==='name'?'This value already exists.':detail.reason??'Select a valid value.';formError='Correct the highlighted field.';await tick();formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();}else if(payload?.error?.code==='RESOURCE_IN_USE')formError='Reassign or remove active employees and rooms before closing this branch.';else formError='Unable to save this item. Check the fields and try again.';return;}await load();reset();await list?.refresh();void tick().then(()=>focusTarget?.focus());}catch{formError='Unable to save this item. Try again.';}finally{saving=false;}
	}
	async function remove(item:Branch|Room|Storage){if(!confirm(`Delete ${item.name}?`))return;const response=await fetch(`${endpoint}/${item.id}`,{method:'DELETE'});if(!response.ok){message='This item is in use or could not be deleted.';return;}await load();reset();await list?.refresh();}
	function handleWindowKeydown(event:KeyboardEvent){if(event.defaultPrevented||confirmingDiscard||!formOpen||!dialogElement)return;if(event.key==='Escape'){event.preventDefault();if(activeDateField)activeDateField=null;else requestCloseForm();return;}if(event.key!=='Tab')return;const focusable=[...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled])')];if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
	onMount(()=>{void load()});
</script>

{#snippet headerActions()}{#if canManage}<AddButton bind:element={addButton} label={addLabel} onclick={add} />{/if}{/snippet}
{#snippet responsiblePeopleCell(item:Branch)}<div class="responsible-people">{#if item.manager}<button type="button" aria-label={`View primary responsible person ${employeeName(item.manager)}`} onclick={(event)=>void showEmployeeDetail(item.manager!.id,event.currentTarget)}>{employeeName(item.manager)}</button>{/if}{#if item.deputyManager}<button type="button" aria-label={`View deputy responsible person ${employeeName(item.deputyManager)}`} onclick={(event)=>void showEmployeeDetail(item.deputyManager!.id,event.currentTarget)}>{employeeName(item.deputyManager)}</button>{/if}{#if !item.manager&&!item.deputyManager}<span>-</span>{/if}</div>{/snippet}

{#snippet nameField()}
	<label><span>Name <span class="required">*</span></span><input name="name" bind:value={form.name} maxlength="128" class:invalid={!!errors.name} aria-invalid={!!errors.name} aria-describedby={errors.name?'location-name-error':undefined} oninput={()=>clearError('name')}/>{#if errors.name}<small id="location-name-error" class="field-error">{errors.name}</small>{/if}</label>
{/snippet}

{#snippet branchFormSections()}
	<FormSection title="Basic information" columns={2} framed>
		{@render nameField()}
		<DatePicker label="Opening date" field="openedOn" value={form.openedOn} error={errors.openedOn??''} open={activeDateField==='openedOn'} onToggle={()=>activeDateField=activeDateField==='openedOn'?null:'openedOn'} onSelect={(value)=>{form.openedOn=value;activeDateField=null;clearError('openedOn');clearError('closedOn');}} />
		<DatePicker label="Closing date" field="closedOn" value={form.closedOn} error={errors.closedOn??''} open={activeDateField==='closedOn'} onToggle={()=>activeDateField=activeDateField==='closedOn'?null:'closedOn'} onSelect={(value)=>{form.closedOn=value;activeDateField=null;clearError('closedOn');}} />
	</FormSection>
	<FormSection title="Responsibility" framed>
		<SearchSelect label="Responsible person (primary)" field="managerEmployeeId" value={form.managerEmployeeId} options={employeeOptions} error={errors.managerEmployeeId??''} onSelect={(value)=>{form.managerEmployeeId=value;if(!value)form.deputyManagerEmployeeId='';clearError('managerEmployeeId');clearError('deputyManagerEmployeeId');}} />
		<SearchSelect label="Responsible person (deputy)" field="deputyManagerEmployeeId" value={form.deputyManagerEmployeeId} options={employeeOptions.filter((option)=>!option.value||option.value!==form.managerEmployeeId)} error={errors.deputyManagerEmployeeId??''} onSelect={(value)=>{form.deputyManagerEmployeeId=value;clearError('deputyManagerEmployeeId');}} />
	</FormSection>
	<FormSection title="Address" framed>
		<label><span>Postal code</span><input name="postalCode" bind:value={form.postalCode} maxlength="8" placeholder="e.g. 100-0001" class:invalid={!!errors.postalCode} aria-invalid={!!errors.postalCode} aria-describedby={errors.postalCode?'branch-postal-code-error':undefined} oninput={()=>clearError('postalCode')}/>{#if errors.postalCode}<small id="branch-postal-code-error" class="field-error">{errors.postalCode}</small>{/if}</label>
		<label><span>Prefecture</span><input name="prefecture" bind:value={form.prefecture} maxlength="64" placeholder="e.g. Tokyo" oninput={()=>clearError('prefecture')}/></label>
		<label><span>City</span><input name="city" bind:value={form.city} maxlength="128" placeholder="e.g. Chiyoda" oninput={()=>clearError('city')}/></label>
		<label><span>Street address</span><input name="streetAddress" bind:value={form.streetAddress} maxlength="255" placeholder="e.g. Chiyoda 1-1" oninput={()=>clearError('streetAddress')}/></label>
		<label><span>Building name</span><input name="buildingName" bind:value={form.buildingName} maxlength="255" placeholder="e.g. Main Building 3F" oninput={()=>clearError('buildingName')}/></label>
	</FormSection>
	<FormSection title="Contact information" framed>
		<label><span>Phone 1</span><input name="phoneNumber1" type="tel" bind:value={form.phoneNumber1} maxlength="32" placeholder="e.g. 03-1234-5678" class:invalid={!!errors.phoneNumber1} aria-invalid={!!errors.phoneNumber1} aria-describedby={errors.phoneNumber1?'branch-phone-1-error':undefined} oninput={()=>clearError('phoneNumber1')}/>{#if errors.phoneNumber1}<small id="branch-phone-1-error" class="field-error">{errors.phoneNumber1}</small>{/if}</label>
		<label><span>Phone 1 label</span><input name="phoneNumber1Label" bind:value={form.phoneNumber1Label} maxlength="128" placeholder="e.g. Main" oninput={()=>clearError('phoneNumber1Label')}/></label>
		<label><span>Phone 2</span><input name="phoneNumber2" type="tel" bind:value={form.phoneNumber2} maxlength="32" placeholder="e.g. 03-1234-5679" class:invalid={!!errors.phoneNumber2} aria-invalid={!!errors.phoneNumber2} aria-describedby={errors.phoneNumber2?'branch-phone-2-error':undefined} oninput={()=>clearError('phoneNumber2')}/>{#if errors.phoneNumber2}<small id="branch-phone-2-error" class="field-error">{errors.phoneNumber2}</small>{/if}</label>
		<label><span>Phone 2 label</span><input name="phoneNumber2Label" bind:value={form.phoneNumber2Label} maxlength="128" placeholder="e.g. Development" oninput={()=>clearError('phoneNumber2Label')}/></label>
		<label><span>Fax 1</span><input name="faxNumber1" type="tel" bind:value={form.faxNumber1} maxlength="32" placeholder="e.g. 03-1234-5680" class:invalid={!!errors.faxNumber1} aria-invalid={!!errors.faxNumber1} aria-describedby={errors.faxNumber1?'branch-fax-1-error':undefined} oninput={()=>clearError('faxNumber1')}/>{#if errors.faxNumber1}<small id="branch-fax-1-error" class="field-error">{errors.faxNumber1}</small>{/if}</label>
		<label><span>Fax 1 label</span><input name="faxNumber1Label" bind:value={form.faxNumber1Label} maxlength="128" placeholder="e.g. Main" oninput={()=>clearError('faxNumber1Label')}/></label>
		<label><span>Fax 2</span><input name="faxNumber2" type="tel" bind:value={form.faxNumber2} maxlength="32" placeholder="e.g. 03-1234-5681" class:invalid={!!errors.faxNumber2} aria-invalid={!!errors.faxNumber2} aria-describedby={errors.faxNumber2?'branch-fax-2-error':undefined} oninput={()=>clearError('faxNumber2')}/>{#if errors.faxNumber2}<small id="branch-fax-2-error" class="field-error">{errors.faxNumber2}</small>{/if}</label>
		<label><span>Fax 2 label</span><input name="faxNumber2Label" bind:value={form.faxNumber2Label} maxlength="128" placeholder="e.g. Development" oninput={()=>clearError('faxNumber2Label')}/></label>
	</FormSection>
	<FormSection title="Additional information" framed><label class="notes-field">Notes<textarea name="notes" bind:value={form.notes} maxlength="5000" placeholder="e.g. Notes about this branch"></textarea></label></FormSection>
{/snippet}

{#snippet locationFields()}
	{@render nameField()}
	{#if tab==='rooms'||tab==='locations'}<SearchSelect label="Branch" field="location-branch" value={form.branchId} options={branches.map((branch)=>({value:String(branch.id),label:branch.name}))} required error={errors.branchId??''} onSelect={(value)=>{form.branchId=value;if(tab==='locations')form.roomId='';clearError('branchId');clearError('roomId');}}/>{/if}
	{#if tab==='locations'}<SearchSelect label="Room" field="location-room" value={form.roomId} options={availableRooms.map((room)=>({value:String(room.id),label:room.name}))} required error={errors.roomId??''} onSelect={(value)=>{form.roomId=value;clearError('roomId');}}/>{/if}
{/snippet}

{#snippet locationNotesField()}
	<label class="notes-field">Notes<textarea name="notes" bind:value={form.notes} maxlength="5000" placeholder={`e.g. Notes about this ${resourceLabel}`}></textarea></label>
{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />
<AssetManagementShell {title} active="">
	<MasterPageHeader {title} description={`Maintain ${tab==='branches'?'branches':tab==='rooms'?'rooms':'storage positions'} used by assets.`} actions={headerActions} />
	{#if message}<p class="notice">{message}</p>{/if}
	<section class="panel" class:branch-panel={tab==='branches'}>
		<MasterList bind:this={list} {endpoint} columns={tab==='branches'?[{key:'name',label:'Name',width:13,value:(item:Branch)=>item.name},{key:'responsiblePerson',label:'Responsible person',width:14,sortable:false,cell:responsiblePeopleCell},{key:'postalCode',label:'Postal code',width:10,value:(item:Branch)=>item.postalCode??''},{key:'prefecture',label:'Prefecture',width:10,value:(item:Branch)=>item.prefecture??''},{key:'city',label:'City',width:8,value:(item:Branch)=>item.city??''},{key:'streetAddress',label:'Street address',width:14,value:(item:Branch)=>item.streetAddress??''},{key:'phoneNumber1',label:'Phone',width:12,value:(item:Branch)=>contactLines(item.phoneNumber1,item.phoneNumber1Label,item.phoneNumber2,item.phoneNumber2Label)},{key:'faxNumber1',label:'Fax',width:9,value:(item:Branch)=>contactLines(item.faxNumber1,item.faxNumber1Label,item.faxNumber2,item.faxNumber2Label)},{key:'openedOn',label:'Opening date',width:10,value:(item:Branch)=>dateValue(item.openedOn)}]:columns} {title} {canManage} {minTableWidth} initialSortBy="name" onDetail={tab==='branches'?(item,trigger)=>showDetail(item as Branch,trigger):undefined} onEdit={(item,trigger)=>edit(item as Branch|Room|Storage,trigger)} onDelete={(item)=>remove(item as Branch|Room|Storage)} />
	</section>
</AssetManagementShell>

{#if detailEmployee}<EmployeeDetailModal employee={detailEmployee} returnFocus={employeeDetailReturnFocus} onClose={closeEmployeeDetail} />{/if}

{#if detailBranch}
	{@const mapHref=googleMapsHref(detailBranch)}
	<DetailModal title="Branch detail" titleId="branch-detail-title" closeLabel="Close branch detail" returnFocus={returnFocus} compact dialogClass="branch-detail-dialog" onClose={closeDetail}>
		<section class="app-detail-section"><h3>Basic information</h3><dl class="app-detail-grid"><div><dt>Name</dt><dd>{detailBranch.name}</dd></div><div><dt>Opening date</dt><dd>{display(dateValue(detailBranch.openedOn))}</dd></div><div><dt>Closing date</dt><dd>{display(dateValue(detailBranch.closedOn))}</dd></div></dl></section>
		<section class="app-detail-section"><h3>Responsibility</h3><dl class="app-detail-grid"><div><dt>Responsible person (primary)</dt><dd>{employeeName(detailBranch.manager)}</dd></div><div><dt>Responsible person (deputy)</dt><dd>{employeeName(detailBranch.deputyManager)}</dd></div></dl></section>
		<section class="app-detail-section"><div class="branch-detail-section-header"><h3>Address</h3>{#if mapHref}<a class="branch-map-link" href={mapHref} target="_blank" rel="noopener noreferrer" aria-label={`Open ${detailBranch.name} address in Google Maps`}>Open in Google Maps<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 3h7v7M13 3 5 11M11 9v4H3V5h4" /></svg></a>{/if}</div><dl class="app-detail-grid"><div><dt>Postal code</dt><dd>{display(detailBranch.postalCode)}</dd></div><div><dt>Prefecture</dt><dd>{display(detailBranch.prefecture)}</dd></div><div><dt>City</dt><dd>{display(detailBranch.city)}</dd></div><div><dt>Street address</dt><dd>{display(detailBranch.streetAddress)}</dd></div><div><dt>Building name</dt><dd>{display(detailBranch.buildingName)}</dd></div></dl></section>
		<section class="app-detail-section"><h3>Contact information</h3><dl class="app-detail-grid"><div><dt>{detailBranch.phoneNumber1Label?`Phone (${detailBranch.phoneNumber1Label})`:'Phone 1'}</dt><dd>{display(detailBranch.phoneNumber1)}</dd></div><div><dt>{detailBranch.phoneNumber2Label?`Phone (${detailBranch.phoneNumber2Label})`:'Phone 2'}</dt><dd>{display(detailBranch.phoneNumber2)}</dd></div><div><dt>{detailBranch.faxNumber1Label?`Fax (${detailBranch.faxNumber1Label})`:'Fax 1'}</dt><dd>{display(detailBranch.faxNumber1)}</dd></div><div><dt>{detailBranch.faxNumber2Label?`Fax (${detailBranch.faxNumber2Label})`:'Fax 2'}</dt><dd>{display(detailBranch.faxNumber2)}</dd></div></dl></section>
		<section class="app-detail-section"><h3>Additional information</h3><dl class="app-detail-grid"><div class="app-detail-wide"><dt>Notes</dt><dd class="app-detail-notes">{display(detailBranch.notes)}</dd></div></dl></section>
	</DetailModal>
{/if}

{#if canManage && formOpen}
	<ModalBackdrop onDismiss={requestCloseForm} disabled={saving}><dialog bind:this={dialogElement} class="location-dialog app-modal app-modal--compact" class:branch-dialog={tab==='branches'} open aria-modal="true" aria-labelledby="location-dialog-title">
		<header><h2 id="location-dialog-title">{modalTitle}</h2><button class="app-modal-close" type="button" aria-label={`Close ${modalTitle} dialog`} disabled={saving} onclick={requestCloseForm}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
		<form bind:this={formElement} class="app-modal-form" novalidate onsubmit={(event)=>{event.preventDefault();void save();}}>
			<div class="location-form-body app-modal-form-body">{#if formError}<div class="app-modal-error-summary" role="alert"><strong>{formErrorTitle}</strong><span>{formError}</span></div>{/if}{#if tab==='branches'}{@render branchFormSections()}{:else}<FormSection title="Basic information" columns={2} framed>{@render locationFields()}</FormSection><FormSection title="Additional information" columns={2} framed>{@render locationNotesField()}</FormSection>{/if}</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseForm}>Cancel</button><button class="app-primary-action" type="submit" disabled={saving}>{saving?(editingId===null?'Adding...':'Saving...'):submitLabel}</button></footer>
		</form>
	</dialog></ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={()=>confirmingDiscard=false} onDiscard={closeFormImmediately}/>{/if}
{/if}

<style>.notice{margin:0 0 14px;color:var(--danger);font-size:13px}.panel{width:100%;min-width:0;box-sizing:border-box}.branch-panel :global(table th),.branch-panel :global(table td){padding-right:10px;padding-left:10px}.branch-panel :global(table tbody td:nth-child(7)),.branch-panel :global(table tbody td:nth-child(8)){white-space:pre-line}.responsible-people{display:grid;justify-items:start;gap:3px}.responsible-people button{margin:0;padding:0;background:transparent!important;color:var(--action-primary)!important;border:0;text-align:left;font:inherit;text-decoration:none}.responsible-people button:hover{text-decoration:underline}.responsible-people button:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}.branch-detail-section-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px}.branch-detail-section-header h3{margin:0}.branch-map-link{display:inline-flex;align-items:center;gap:5px;color:var(--action-primary);font-size:12px;font-weight:600;text-decoration:none}.branch-map-link:hover{text-decoration:underline}.branch-map-link:focus-visible{outline:2px solid var(--action-primary);outline-offset:3px}.branch-map-link svg{width:14px;height:14px;flex:none}.location-dialog{width:min(calc(100% - 32px),560px)}.location-dialog.branch-dialog{width:min(calc(100% - 32px),900px)}:global(.branch-detail-dialog){width:min(calc(100% - 32px),760px)}.location-form-body{grid-template-columns:repeat(2,minmax(0,1fr))}.branch-dialog .location-form-body{grid-template-columns:1fr;gap:16px}.notes-field{grid-column:1/-1}.required{color:var(--danger)}.field-error{color:var(--danger);font-size:11px}@media(max-width:700px){.branch-detail-section-header{align-items:flex-start;flex-direction:column}.location-form-body,.branch-dialog .location-form-body{grid-template-columns:1fr}}</style>
