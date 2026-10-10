<script lang="ts">
	import { masterReason } from '$lib/master-reasons';
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import { googleMapsHref } from '$lib/branchMaps';
	import AddButton from '$lib/components/AddButton.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import EmployeeDetailModal from '$lib/components/EmployeeDetailModal.svelte';
	import MasterHistorySection from '$lib/components/MasterHistorySection.svelte';
	import MasterRecordDetailModal from '$lib/components/MasterRecordDetailModal.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { formatDate, formatEmployeeName, localization } from '$lib/localization';
	import { formSnapshot } from '$lib/modalForm';
	import type { Employee } from '$lib/employees';
	import '$lib/styles/add-button.css';

	let text = $derived(localeMessages[$localization.displayLanguage].masters);
	let commonText = $derived(localeMessages[$localization.displayLanguage].common);
	function m(key: string | undefined): string { return key ? text[key as keyof typeof text] ?? text.invalidValue : ''; }
	function t(key: keyof typeof text, ...values: (string | number)[]) { return formatLocaleTemplate(text[key], ...values); }
	type EmployeeRef={id:number;employeeCode:string;firstName:string;middleName:string|null;lastName:string};
	type Branch={id:number;name:string;sortOrder:number;usageCount?:number;openedOn:string|null;closedOn:string|null;postalCode:string|null;prefecture:string|null;city:string|null;streetAddress:string|null;buildingName:string|null;phoneNumber1:string|null;phoneNumber1Label:string|null;phoneNumber2:string|null;phoneNumber2Label:string|null;faxNumber1:string|null;faxNumber1Label:string|null;faxNumber2:string|null;faxNumber2Label:string|null;managerEmployeeId:number|null;deputyManagerEmployeeId:number|null;manager?:EmployeeRef|null;deputyManager?:EmployeeRef|null;notes:string|null};
	type Room={id:number;name:string;sortOrder:number;usageCount?:number;notes:string|null;branchId:number;branch:Branch};
	type Storage={id:number;name:string;sortOrder:number;usageCount?:number;notes:string|null;branchId:number;roomId:number;room:Room};
	type Tab='branches'|'rooms'|'locations';
	let { kind: tab }: { kind: Tab } = $props();
	let canManageAdministration=$state(false);let canManageSystemSettings=$state(false);let canCreateBranches=$state(false);let canDeleteBranches=$state(false);let canReorderLocations=$state(false); let branches=$state<Branch[]>([]); let rooms=$state<Room[]>([]); let employees=$state<EmployeeRef[]>([]); let message=$state(''); let editingId=$state<number|null>(null);
	let form=$state({name:'',openedOn:'',closedOn:'',postalCode:'',prefecture:'',city:'',streetAddress:'',buildingName:'',phoneNumber1:'',phoneNumber1Label:'',phoneNumber2:'',phoneNumber2Label:'',faxNumber1:'',faxNumber1Label:'',faxNumber2:'',faxNumber2Label:'',managerEmployeeId:'',deputyManagerEmployeeId:'',branchId:'',roomId:'',notes:''});
	let formOpen=$state(false);
	let activeDateField=$state<'openedOn'|'closedOn'|null>(null);
	let detailBranch=$state<Branch|null>(null);
	let detailEmployee=$state<Employee|null>(null);
	let detailEmployeeLoading=$state(false);
	let detailEmployeeError=$state(false);
	let employeeReturnRole=$state<'primary'|'deputy'|null>(null);
	let employeeRequestId=0;
	let detailRoom=$state<Room|null>(null);
	let detailStorage=$state<Storage|null>(null);
	let errors=$state<Record<string,string>>({});let formError=$state('');let formElement=$state<HTMLFormElement>();
	let saving=$state(false);let dialogElement=$state<HTMLDialogElement>();let addButton=$state<HTMLButtonElement>();let returnFocus=$state<HTMLElement|null>(null);
	let initialSnapshot=$state('');let confirmingDiscard=$state(false);
	let list=$state<MasterList>();
	let endpoint=$derived(tab==='locations'?'/v1/storage':`/v1/${tab}`);
	function employeeName(employee:EmployeeRef|null|undefined){return employee?formatEmployeeName(employee,$localization):'';}
	function dateValue(value:string|null|undefined){return value?value.slice(0,10):'';}
	function locationName(item:Branch|Room|Storage){return 'room' in item?`${item.room.branch.name} > ${item.room.name} > ${item.name}`:'branch' in item?`${item.branch.name} > ${item.name}`:item.name;}
	let columns=$derived([{key:'name',label:text.name,width:86,sortable:false,value:(item:Branch|Room|Storage)=>item.name}]);
	let treeParent=$derived(tab==='rooms'?(item:{id:number;[key:string]:unknown})=>{
		const room=item as Room;
		return {id:room.branchId,label:room.branch.name,order:room.branch.sortOrder};
	}:tab==='locations'?(item:{id:number;[key:string]:unknown})=>{
		const storage=item as Storage;
		return {id:storage.roomId,label:storage.room.name,order:storage.room.sortOrder,ancestor:{id:storage.room.branchId,label:storage.room.branch.name,order:storage.room.branch.sortOrder}};
	}:undefined);
	let canManage=$derived(tab==='branches'?canManageSystemSettings:canManageAdministration);
	let reorderEndpoint=$derived(canReorderLocations?`/v1/location-orders/${tab==='locations'?'storages':tab}`:undefined);
	const title=$derived(tab==='branches'?text.branches:tab==='rooms'?text.rooms:text.storages);
	const sectionDescription=$derived(tab==='branches'?text.branchesSectionDescription:tab==='rooms'?text.roomsSectionDescription:text.storagesSectionDescription);
	const resourceLabel=$derived(tab==='branches'?text.branchItem:tab==='rooms'?text.roomItem:text.storageItem);
	const addLabel=$derived(t('addItem',resourceLabel));
	const modalTitle=$derived(t(editingId===null?'addItem':'editItem',resourceLabel));
	const submitLabel=$derived(editingId===null?addLabel:text.saveChanges);
	const formErrorTitle=$derived(t(editingId===null?'addFailedTitle':'saveFailedTitle',resourceLabel));
	const minTableWidth=0;
	let availableRooms=$derived(rooms.filter((room)=>String(room.branchId)===form.branchId));
	let employeeOptions=$derived([{value:'',label:'-'},...employees.map((employee)=>({value:String(employee.id),label:`${employeeName(employee)} (${employee.employeeCode})`,searchTerms:[employeeName(employee),employee.employeeCode]}))]);
	let hasDraftChanges=$derived(initialSnapshot!==''&&formSnapshot(form)!==initialSnapshot);
	let hasUnsavedChanges=$derived(editingId!==null&&hasDraftChanges);
	function emptyForm(){const branchId=branches[0]?String(branches[0].id):'';return {name:'',openedOn:'',closedOn:'',postalCode:'',prefecture:'',city:'',streetAddress:'',buildingName:'',phoneNumber1:'',phoneNumber1Label:'',phoneNumber2:'',phoneNumber2Label:'',faxNumber1:'',faxNumber1Label:'',faxNumber2:'',faxNumber2Label:'',managerEmployeeId:'',deputyManagerEmployeeId:'',branchId,roomId:rooms.find((room)=>String(room.branchId)===branchId)?String(rooms.find((room)=>String(room.branchId)===branchId)!.id):'',notes:''};}
	function reset(clearMessage=true){editingId=null;formOpen=false;activeDateField=null;errors={};formError='';form=emptyForm();initialSnapshot='';confirmingDiscard=false;if(clearMessage)message='';}
	async function loadEmployees(){const collected:EmployeeRef[]=[];let offset=0,total=1;while(offset<total){const response=await fetch(`/v1/employees?limit=500&offset=${offset}&sortBy=employee&sortOrder=asc`);if(!response.ok)throw new Error();const payload=await response.json() as {data:EmployeeRef[];meta?:{total?:number}};collected.push(...payload.data);offset+=payload.data.length;total=payload.meta?.total??collected.length;if(!payload.data.length)break;}employees=collected;}
	async function load(){const session=await fetch('/v1/auth/session');if(!session.ok){message='signInRequired';return;}const capabilities=(await apiData<{user:{capabilities:{canManageMasters:boolean;canManageBranches:boolean;canCreateBranches:boolean;canDeleteBranches:boolean}}}>(session)).user.capabilities;canManageAdministration=capabilities.canManageMasters||capabilities.canManageBranches;canManageSystemSettings=capabilities.canManageBranches;canCreateBranches=capabilities.canCreateBranches;canDeleteBranches=capabilities.canDeleteBranches;canReorderLocations=capabilities.canManageMasters;if(tab==='branches')canReorderLocations=canCreateBranches;const responses=await Promise.all([fetch('/v1/branches?limit=500'),fetch('/v1/rooms?limit=500')]);if(responses.some((response)=>!response.ok)){message='locationsFailed';return;}[branches,rooms]=await Promise.all([apiData<Branch[]>(responses[0]),apiData<Room[]>(responses[1])]);if(tab==='branches'&&canManageSystemSettings){try{await loadEmployees();}catch{message='employeesFailed';}}if(!formOpen)reset(false);}
	function edit(item:Branch|Room|Storage,trigger:HTMLButtonElement|null){returnFocus=trigger;editingId=item.id;formOpen=true;activeDateField=null;errors={};formError='';form={...emptyForm(),name:item.name,...('postalCode' in item?{openedOn:dateValue(item.openedOn),closedOn:dateValue(item.closedOn),postalCode:item.postalCode??'',prefecture:item.prefecture??'',city:item.city??'',streetAddress:item.streetAddress??'',buildingName:item.buildingName??'',phoneNumber1:item.phoneNumber1??'',phoneNumber1Label:item.phoneNumber1Label??'',phoneNumber2:item.phoneNumber2??'',phoneNumber2Label:item.phoneNumber2Label??'',faxNumber1:item.faxNumber1??'',faxNumber1Label:item.faxNumber1Label??'',faxNumber2:item.faxNumber2??'',faxNumber2Label:item.faxNumber2Label??'',managerEmployeeId:item.managerEmployeeId?String(item.managerEmployeeId):'',deputyManagerEmployeeId:item.deputyManagerEmployeeId?String(item.deputyManagerEmployeeId):''}:{}),branchId:'branchId' in item?String(item.branchId):'',roomId:'roomId' in item?String(item.roomId):'',notes:item.notes??''};initialSnapshot=formSnapshot(form);confirmingDiscard=false;void tick().then(()=>formElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());}
	function showDetail(item:Branch|Room|Storage,trigger:HTMLElement|null){returnFocus=trigger;detailBranch=tab==='branches'?item as Branch:null;detailRoom=tab==='rooms'?item as Room:null;detailStorage=tab==='locations'?item as Storage:null;}
	function add(){returnFocus=document.activeElement instanceof HTMLElement&&document.activeElement!==document.body?document.activeElement:addButton??null;reset();initialSnapshot=formSnapshot(form);formOpen=true;void tick().then(()=>formElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());}
	function closeFormImmediately(){if(saving)return;confirmingDiscard=false;const focusTarget=returnFocus;reset();void tick().then(()=>focusTarget?.focus());}
	function requestCloseForm(){if(saving)return;activeDateField=null;if(hasUnsavedChanges){confirmingDiscard=true;return;}closeFormImmediately();}
	function closeDetail(){employeeRequestId++;detailBranch=null;detailRoom=null;detailStorage=null;detailEmployeeLoading=false;detailEmployeeError=false;}
	async function openEmployeeDetail(employee:EmployeeRef,role:'primary'|'deputy'){
		if(detailEmployeeLoading)return;
		const requestId=++employeeRequestId;
		detailEmployeeLoading=true;detailEmployeeError=false;
		try{
			const response=await fetch(`/v1/employees/${employee.id}`,{cache:'no-store'});
			if(!response.ok)throw new Error('Unable to load employee detail.');
			const loaded=await apiData<Employee>(response);
			if(requestId!==employeeRequestId||!detailBranch)return;
			employeeReturnRole=role;
			detailEmployee=loaded;
		}catch{if(requestId===employeeRequestId)detailEmployeeError=true;}
		finally{if(requestId===employeeRequestId)detailEmployeeLoading=false;}
	}
	function closeEmployeeDetail(){
		detailEmployee=null;
		const role=employeeReturnRole;
		employeeReturnRole=null;
		if(typeof document==='undefined')return;
		void tick().then(()=>tick()).then(()=>{
			if(role)document.querySelector<HTMLButtonElement>(`.branch-detail-dialog [data-responsibility="${role}"]`)?.focus();
		});
	}
	function display(value:string|null){return value?.trim()??'';}
	function clearError(field:string){errors[field]='';formError='';}
	function notifyRelatedSections(){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('location-master-changed',{detail:tab}));}
	async function save(){
		if(saving)return;
		errors={...(!form.name.trim()?{name:'nameRequired'}:{}),...((tab==='rooms'||tab==='locations')&&!form.branchId?{branchId:'branchRequired'}:{}),...(tab==='locations'&&!form.roomId?{roomId:'roomRequired'}:{})};
		if(tab==='branches'){
			if(form.openedOn&&form.closedOn&&form.closedOn<form.openedOn)errors.closedOn='closingDateInvalid';
			if(form.postalCode&&!/^\d{3}-?\d{4}$/.test(form.postalCode.trim()))errors.postalCode='postalInvalid';
			const phonePattern=/^[+0-9][0-9 ()-]{6,31}$/;
			for(const field of ['phoneNumber1','phoneNumber2','faxNumber1','faxNumber2'] as const)if(form[field]&&!phonePattern.test(form[field].trim()))errors[field]='phoneInvalid';
			if(form.phoneNumber1Label&&!form.phoneNumber1)errors.phoneNumber1='phoneLabelRequired';
			if((form.phoneNumber2||form.phoneNumber2Label)&&!form.phoneNumber1)errors.phoneNumber1='phone1First';
			if(form.phoneNumber2Label&&!form.phoneNumber2)errors.phoneNumber2='phoneLabelRequired';
			if(form.phoneNumber1&&form.phoneNumber1.trim()===form.phoneNumber2.trim())errors.phoneNumber2='phoneDifferent';
			if(form.faxNumber1Label&&!form.faxNumber1)errors.faxNumber1='faxLabelRequired';
			if((form.faxNumber2||form.faxNumber2Label)&&!form.faxNumber1)errors.faxNumber1='fax1First';
			if(form.faxNumber2Label&&!form.faxNumber2)errors.faxNumber2='faxLabelRequired';
			if(form.faxNumber1&&form.faxNumber1.trim()===form.faxNumber2.trim())errors.faxNumber2='faxDifferent';
			if(form.deputyManagerEmployeeId&&!form.managerEmployeeId)errors.managerEmployeeId='primaryFirst';
			if(form.managerEmployeeId&&form.managerEmployeeId===form.deputyManagerEmployeeId)errors.deputyManagerEmployeeId='employeeDifferent';
		}
		if(Object.keys(errors).length){formError='correctFields';await tick();formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();return;}
		if(tab==='branches'&&form.closedOn&&!confirm(text.closeBranchConfirm))return;
		const body=tab==='branches'?{name:form.name,openedOn:form.openedOn,closedOn:form.closedOn,postalCode:form.postalCode,prefecture:form.prefecture,city:form.city,streetAddress:form.streetAddress,buildingName:form.buildingName,phoneNumber1:form.phoneNumber1,phoneNumber1Label:form.phoneNumber1Label,phoneNumber2:form.phoneNumber2,phoneNumber2Label:form.phoneNumber2Label,faxNumber1:form.faxNumber1,faxNumber1Label:form.faxNumber1Label,faxNumber2:form.faxNumber2,faxNumber2Label:form.faxNumber2Label,managerEmployeeId:form.managerEmployeeId,deputyManagerEmployeeId:form.deputyManagerEmployeeId,notes:form.notes}:tab==='rooms'?{name:form.name,branchId:form.branchId,notes:form.notes}:{name:form.name,branchId:form.branchId,roomId:form.roomId,notes:form.notes};
		const focusTarget=tab==='branches'&&form.closedOn?(addButton??returnFocus):returnFocus;saving=true;formError='';
		try{const response=await fetch(`${endpoint}${editingId?'/'+editingId:''}`,{method:editingId?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok){const payload=await response.json().catch(()=>null) as {error?:{code?:string;details?:{field?:string;reason?:string}[]}}|null;const detail=payload?.error?.details?.[0];if(detail?.field&&detail.field in form){errors[detail.field]=detail.field==='name'?'valueDuplicate':masterReason(detail.reason);formError='correctField';await tick();formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();}else if(payload?.error?.code==='RESOURCE_IN_USE')formError='branchInUse';else formError='saveFieldsFailed';return;}await load();reset();await list?.refresh();notifyRelatedSections();void tick().then(()=>focusTarget?.focus());}catch{formError='saveRetry';}finally{saving=false;}
	}
	async function remove(item:Branch|Room|Storage){if(tab==='branches'&&!canDeleteBranches)return;if(item.usageCount&&item.usageCount>0){message='deleteInUse';return;}message='';if(!confirm(t('deleteConfirm', item.name)))return;const response=await fetch(`${endpoint}/${item.id}`,{method:'DELETE'});if(!response.ok){message=response.status===409?'deleteInUse':response.status===403?'deleteForbidden':'deleteFailed';return;}await load();reset();await list?.refresh();notifyRelatedSections();}
	function handleWindowKeydown(event:KeyboardEvent){if(event.defaultPrevented||confirmingDiscard||!formOpen||!dialogElement)return;if(event.key==='Escape'){event.preventDefault();if(activeDateField)activeDateField=null;else if(editingId===null&&hasDraftChanges&&!saving)confirmingDiscard=true;else requestCloseForm();return;}if(event.key!=='Tab')return;const focusable=[...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled])')];if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
	onMount(()=>{
		void load();
		const handleRelatedChange=(event:Event)=>{if((event as CustomEvent<Tab>).detail!==tab)void load().then(()=>list?.refresh());};
		window.addEventListener('location-master-changed',handleRelatedChange);
		return ()=>window.removeEventListener('location-master-changed',handleRelatedChange);
	});
</script>

{#snippet headerActions()}{#if canManage && (tab!=='branches'||canCreateBranches)}<AddButton bind:element={addButton} label={text.addButton} ariaLabel={addLabel} onclick={add} />{/if}{/snippet}

{#snippet nameField()}
	<label><span>{text.name} <span class="required">*</span></span><input name="name" bind:value={form.name} maxlength="128" class:invalid={!!errors.name} aria-invalid={!!errors.name} aria-describedby={errors.name?'location-name-error':undefined} oninput={()=>clearError('name')}/>{#if errors.name}<small id="location-name-error" class="field-error">{m(errors.name)}</small>{/if}</label>
{/snippet}

{#snippet branchFormSections()}
	<FormSection title={text.basicInformation} columns={2} framed>
		{@render nameField()}
		<DatePicker label={text.openingDate} field="openedOn" value={form.openedOn} error={m(errors.openedOn??'')} open={activeDateField==='openedOn'} onToggle={()=>activeDateField=activeDateField==='openedOn'?null:'openedOn'} onSelect={(value)=>{form.openedOn=value;activeDateField=null;clearError('openedOn');clearError('closedOn');}} />
		<DatePicker label={text.closingDate} field="closedOn" value={form.closedOn} error={m(errors.closedOn??'')} open={activeDateField==='closedOn'} onToggle={()=>activeDateField=activeDateField==='closedOn'?null:'closedOn'} onSelect={(value)=>{form.closedOn=value;activeDateField=null;clearError('closedOn');}} />
	</FormSection>
	<FormSection title={text.responsibility} framed>
		<SearchSelect label={text.primaryPerson} field="managerEmployeeId" value={form.managerEmployeeId} options={employeeOptions} error={m(errors.managerEmployeeId??'')} onSelect={(value)=>{form.managerEmployeeId=value;if(!value)form.deputyManagerEmployeeId='';clearError('managerEmployeeId');clearError('deputyManagerEmployeeId');}} />
		<SearchSelect label={text.deputyPerson} field="deputyManagerEmployeeId" value={form.deputyManagerEmployeeId} options={employeeOptions.filter((option)=>!option.value||option.value!==form.managerEmployeeId)} error={m(errors.deputyManagerEmployeeId??'')} onSelect={(value)=>{form.deputyManagerEmployeeId=value;clearError('deputyManagerEmployeeId');}} />
	</FormSection>
	<FormSection title={text.address} framed>
		<label><span>{text.postalCode}</span><input name="postalCode" bind:value={form.postalCode} maxlength="8" placeholder={text.postalExample} class:invalid={!!errors.postalCode} aria-invalid={!!errors.postalCode} aria-describedby={errors.postalCode?'branch-postal-code-error':undefined} oninput={()=>clearError('postalCode')}/>{#if errors.postalCode}<small id="branch-postal-code-error" class="field-error">{m(errors.postalCode)}</small>{/if}</label>
		<label><span>{text.prefecture}</span><input name="prefecture" bind:value={form.prefecture} maxlength="64" placeholder={text.prefectureExample} oninput={()=>clearError('prefecture')}/></label>
		<label><span>{text.city}</span><input name="city" bind:value={form.city} maxlength="128" placeholder={text.cityExample} oninput={()=>clearError('city')}/></label>
		<label><span>{text.streetAddress}</span><input name="streetAddress" bind:value={form.streetAddress} maxlength="255" placeholder={text.streetExample} oninput={()=>clearError('streetAddress')}/></label>
		<label><span>{text.buildingName}</span><input name="buildingName" bind:value={form.buildingName} maxlength="255" placeholder={text.buildingExample} oninput={()=>clearError('buildingName')}/></label>
	</FormSection>
	<FormSection title={text.contactInformation} framed>
		<label><span>{text.phone1}</span><input name="phoneNumber1" type="tel" bind:value={form.phoneNumber1} maxlength="32" placeholder={text.phone1Example} class:invalid={!!errors.phoneNumber1} aria-invalid={!!errors.phoneNumber1} aria-describedby={errors.phoneNumber1?'branch-phone-1-error':undefined} oninput={()=>clearError('phoneNumber1')}/>{#if errors.phoneNumber1}<small id="branch-phone-1-error" class="field-error">{m(errors.phoneNumber1)}</small>{/if}</label>
		<label><span>{text.phone1Label}</span><input name="phoneNumber1Label" bind:value={form.phoneNumber1Label} maxlength="128" placeholder={text.mainExample} oninput={()=>clearError('phoneNumber1Label')}/></label>
		<label><span>{text.phone2}</span><input name="phoneNumber2" type="tel" bind:value={form.phoneNumber2} maxlength="32" placeholder={text.phone2Example} class:invalid={!!errors.phoneNumber2} aria-invalid={!!errors.phoneNumber2} aria-describedby={errors.phoneNumber2?'branch-phone-2-error':undefined} oninput={()=>clearError('phoneNumber2')}/>{#if errors.phoneNumber2}<small id="branch-phone-2-error" class="field-error">{m(errors.phoneNumber2)}</small>{/if}</label>
		<label><span>{text.phone2Label}</span><input name="phoneNumber2Label" bind:value={form.phoneNumber2Label} maxlength="128" placeholder={text.developmentExample} oninput={()=>clearError('phoneNumber2Label')}/></label>
		<label><span>{text.fax1}</span><input name="faxNumber1" type="tel" bind:value={form.faxNumber1} maxlength="32" placeholder={text.fax1Example} class:invalid={!!errors.faxNumber1} aria-invalid={!!errors.faxNumber1} aria-describedby={errors.faxNumber1?'branch-fax-1-error':undefined} oninput={()=>clearError('faxNumber1')}/>{#if errors.faxNumber1}<small id="branch-fax-1-error" class="field-error">{m(errors.faxNumber1)}</small>{/if}</label>
		<label><span>{text.fax1Label}</span><input name="faxNumber1Label" bind:value={form.faxNumber1Label} maxlength="128" placeholder={text.mainExample} oninput={()=>clearError('faxNumber1Label')}/></label>
		<label><span>{text.fax2}</span><input name="faxNumber2" type="tel" bind:value={form.faxNumber2} maxlength="32" placeholder={text.fax2Example} class:invalid={!!errors.faxNumber2} aria-invalid={!!errors.faxNumber2} aria-describedby={errors.faxNumber2?'branch-fax-2-error':undefined} oninput={()=>clearError('faxNumber2')}/>{#if errors.faxNumber2}<small id="branch-fax-2-error" class="field-error">{m(errors.faxNumber2)}</small>{/if}</label>
		<label><span>{text.fax2Label}</span><input name="faxNumber2Label" bind:value={form.faxNumber2Label} maxlength="128" placeholder={text.developmentExample} oninput={()=>clearError('faxNumber2Label')}/></label>
	</FormSection>
	<FormSection title={text.additionalInformation} framed><label class="notes-field">{text.notes}<textarea name="notes" bind:value={form.notes} maxlength="5000" placeholder={text.branchNotesExample}></textarea></label></FormSection>
{/snippet}

{#snippet locationFields()}
	{@render nameField()}
	{#if tab==='rooms'||tab==='locations'}<SearchSelect label={text.branch} field="location-branch" value={form.branchId} options={branches.map((branch)=>({value:String(branch.id),label:branch.name}))} required error={m(errors.branchId??'')} onSelect={(value)=>{form.branchId=value;if(tab==='locations')form.roomId='';clearError('branchId');clearError('roomId');}}/>{/if}
	{#if tab==='locations'}<SearchSelect label={text.room} field="location-room" value={form.roomId} options={availableRooms.map((room)=>({value:String(room.id),label:room.name}))} required error={m(errors.roomId??'')} onSelect={(value)=>{form.roomId=value;clearError('roomId');}}/>{/if}
{/snippet}

{#snippet locationNotesField()}
	<label class="notes-field">{text.notes}<textarea name="notes" bind:value={form.notes} maxlength="5000" placeholder={t('notesExample',resourceLabel)}></textarea></label>
{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />
{#if message}<StatusNotice message={m(message)} tone="error" onDismiss={() => message = ''} />{/if}
<div class="panel">
		<MasterList bind:this={list} {endpoint} {columns} {title} listHeading={title} description={sectionDescription} {canManage} canDelete={tab!=='branches'||canDeleteBranches} {minTableWidth} actionWidth={14} {headerActions} {treeParent} unpaged showNameIcon initialSortBy="sortOrder" {reorderEndpoint} reorderHint={text.reorderHint} reorderSavingLabel={text.reorderSaving} onReorderError={(reason)=>message=reason==='conflict'?'reorderConflict':reason==='forbidden'?'reorderForbidden':'reorderFailed'} onReordered={notifyRelatedSections} actionLabel={(item)=>locationName(item as Branch|Room|Storage)} onDetail={(item,trigger)=>showDetail(item as Branch|Room|Storage,trigger)} onEdit={(item,trigger)=>edit(item as Branch|Room|Storage,trigger)} onDelete={(item)=>remove(item as Branch|Room|Storage)} />
</div>

{#if detailBranch && !detailEmployee}
	{@const mapHref=googleMapsHref(detailBranch)}
	{@const primaryManager=detailBranch.manager}
	{@const deputyManager=detailBranch.deputyManager}
	<DetailModal title={text.branchDetail} titleId="branch-detail-title" closeLabel={text.branchDetailClose} returnFocus={returnFocus} compact dialogClass="branch-detail-dialog" onClose={closeDetail}>
		<section class="app-detail-section"><h3>{text.basicInformation}</h3><dl class="app-detail-grid"><div><dt>{text.name}</dt><dd>{detailBranch.name}</dd></div><div><dt>{text.openingDate}</dt><dd>{display(formatDate(detailBranch.openedOn,$localization))}</dd></div><div><dt>{text.closingDate}</dt><dd>{display(formatDate(detailBranch.closedOn,$localization))}</dd></div></dl></section>
		<section class="app-detail-section"><h3>{text.responsibility}</h3>{#if detailEmployeeError}<StatusNotice message={text.employeeDetailFailed} tone="error" onDismiss={()=>detailEmployeeError=false} />{/if}<dl class="app-detail-grid"><div><dt>{text.primaryPerson}</dt><dd>{#if primaryManager}<button class="branch-person-link" type="button" data-responsibility="primary" disabled={detailEmployeeLoading} aria-label={t('primaryDetails',employeeName(primaryManager))} onclick={()=>void openEmployeeDetail(primaryManager,'primary')}>{employeeName(primaryManager)}</button>{/if}</dd></div><div><dt>{text.deputyPerson}</dt><dd>{#if deputyManager}<button class="branch-person-link" type="button" data-responsibility="deputy" disabled={detailEmployeeLoading} aria-label={t('deputyDetails',employeeName(deputyManager))} onclick={()=>void openEmployeeDetail(deputyManager,'deputy')}>{employeeName(deputyManager)}</button>{/if}</dd></div></dl></section>
		<section class="app-detail-section"><div class="branch-detail-section-header"><h3>{text.address}</h3>{#if mapHref}<a class="branch-map-link" href={mapHref} target="_blank" rel="noopener noreferrer" aria-label={t('mapLabel',detailBranch.name)}>{text.openMap}<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 3h7v7M13 3 5 11M11 9v4H3V5h4" /></svg></a>{/if}</div><dl class="app-detail-grid"><div><dt>{text.postalCode}</dt><dd>{display(detailBranch.postalCode)}</dd></div><div><dt>{text.prefecture}</dt><dd>{display(detailBranch.prefecture)}</dd></div><div><dt>{text.city}</dt><dd>{display(detailBranch.city)}</dd></div><div><dt>{text.streetAddress}</dt><dd>{display(detailBranch.streetAddress)}</dd></div><div><dt>{text.buildingName}</dt><dd>{display(detailBranch.buildingName)}</dd></div></dl></section>
		<section class="app-detail-section"><h3>{text.contactInformation}</h3><dl class="app-detail-grid"><div><dt>{detailBranch.phoneNumber1Label?t('phoneLabel',detailBranch.phoneNumber1Label):text.phone1}</dt><dd>{display(detailBranch.phoneNumber1)}</dd></div><div><dt>{detailBranch.phoneNumber2Label?t('phoneLabel',detailBranch.phoneNumber2Label):text.phone2}</dt><dd>{display(detailBranch.phoneNumber2)}</dd></div><div><dt>{detailBranch.faxNumber1Label?t('faxLabel',detailBranch.faxNumber1Label):text.fax1}</dt><dd>{display(detailBranch.faxNumber1)}</dd></div><div><dt>{detailBranch.faxNumber2Label?t('faxLabel',detailBranch.faxNumber2Label):text.fax2}</dt><dd>{display(detailBranch.faxNumber2)}</dd></div></dl></section>
		<section class="app-detail-section"><h3>{text.additionalInformation}</h3><dl class="app-detail-grid"><div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{display(detailBranch.notes)}</dd></div></dl></section>
		<MasterHistorySection endpoint="/v1/branches" itemId={detailBranch.id} fieldLabels={{ name: text.name, openedOn: text.openingDate, closedOn: text.closingDate, postalCode: text.postalCode, prefecture: text.prefecture, city: text.city, streetAddress: text.streetAddress, buildingName: text.buildingName, phoneNumber1: text.phone1, phoneNumber1Label: text.phone1, phoneNumber2: text.phone2, phoneNumber2Label: text.phone2, faxNumber1: text.fax1, faxNumber1Label: text.fax1, faxNumber2: text.fax2, faxNumber2Label: text.fax2, managerEmployeeId: text.primaryPerson, deputyManagerEmployeeId: text.deputyPerson, notes: text.notes, sortOrder: text.sortOrder }} dateFields={['openedOn','closedOn']} />
	</DetailModal>
{/if}
{#if detailEmployee}<EmployeeDetailModal employee={detailEmployee} onClose={closeEmployeeDetail} />{/if}
{#if detailRoom}<MasterRecordDetailModal title={`${text.rooms} ${commonText.detail}`} titleId="room-detail-title" sectionTitle={text.basicInformation} closeLabel={commonText.close} returnFocus={returnFocus} endpoint="/v1/rooms" itemId={detailRoom.id} fields={[{key:'name',label:text.name,value:detailRoom.name},{key:'branchId',label:text.branch,value:detailRoom.branch.name},{key:'notes',label:text.notes,value:detailRoom.notes}]} onClose={closeDetail} />{/if}
{#if detailStorage}<MasterRecordDetailModal title={`${text.storages} ${commonText.detail}`} titleId="storage-detail-title" sectionTitle={text.basicInformation} closeLabel={commonText.close} returnFocus={returnFocus} endpoint="/v1/storage" itemId={detailStorage.id} fields={[{key:'name',label:text.name,value:detailStorage.name},{key:'roomId',label:text.room,value:detailStorage.room.name},{key:'notes',label:text.notes,value:detailStorage.notes}]} onClose={closeDetail} />{/if}

{#if canManage && formOpen}
	<ModalBackdrop><dialog bind:this={dialogElement} class="location-dialog app-modal app-modal--compact" class:branch-dialog={tab==='branches'} open aria-modal="true" aria-labelledby="location-dialog-title">
		<header><h2 id="location-dialog-title">{modalTitle}</h2><button class="app-modal-close" type="button" aria-label={t('closeDialog',modalTitle)} disabled={saving} onclick={requestCloseForm}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
		<form bind:this={formElement} class="app-modal-form" novalidate onsubmit={(event)=>{event.preventDefault();void save();}}>
			<div class="location-form-body app-modal-form-body">{#if formError}<StatusNotice title={formErrorTitle} message={m(formError)} tone="error" onDismiss={() => formError = ''} />{/if}{#if tab==='branches'}{@render branchFormSections()}{:else}<FormSection title={text.basicInformation} columns={2} framed>{@render locationFields()}</FormSection><FormSection title={text.additionalInformation} columns={2} framed>{@render locationNotesField()}</FormSection>{/if}</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseForm}>{text.cancel}</button><button class="app-primary-action" type="submit" disabled={saving||(editingId!==null&&!hasUnsavedChanges)}>{saving?(editingId===null?text.adding:text.saving):submitLabel}</button></footer>
		</form>
	</dialog></ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={()=>confirmingDiscard=false} onDiscard={closeFormImmediately}/>{/if}
{/if}

<style>.panel{width:100%;min-width:0;box-sizing:border-box}.panel :global(.master-list){height:100%;max-height:none;overflow:visible}.panel :global(.master-scroll){overflow:visible}.panel :global(thead){display:none}.panel :global(th),.panel :global(td){padding-right:6px;padding-left:6px;overflow-wrap:anywhere}.panel :global(td:first-child){padding-left:10px}.panel :global(.tree-child td:first-child){padding-left:38px}.panel :global(.tree-grandchild td:first-child){padding-left:58px}.panel :global(.master-header){flex-wrap:wrap}.panel :global(.actions-cell){padding-right:6px;padding-left:2px}.branch-detail-section-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px}.branch-detail-section-header h3{margin:0}.branch-map-link,.branch-person-link{color:var(--action-primary);font-size:var(--font-size-body);font-weight:600;text-decoration:none}.branch-map-link{display:inline-flex;align-items:center;gap:5px}.branch-person-link{padding:0;border:0;background:none;cursor:pointer;text-align:left}.branch-map-link:hover,.branch-person-link:hover{text-decoration:underline}.branch-map-link:focus-visible,.branch-person-link:focus-visible{outline:2px solid var(--action-primary);outline-offset:3px}.branch-person-link:disabled{cursor:wait;opacity:.6}.branch-map-link svg{width:14px;height:14px;flex:none}.location-dialog{width:min(calc(100% - 32px),560px)}.location-dialog.branch-dialog{width:min(calc(100% - 32px),900px)}:global(.branch-detail-dialog){width:min(calc(100% - 32px),760px)}.location-form-body{grid-template-columns:repeat(2,minmax(0,1fr))}.branch-dialog .location-form-body{grid-template-columns:1fr;gap:16px}.notes-field{grid-column:1/-1}.required{color:var(--danger)}.field-error{color:var(--danger);font-size:var(--font-size-support)}@media(max-width:700px){.branch-detail-section-header{align-items:flex-start;flex-direction:column}.location-form-body,.branch-dialog .location-form-body{grid-template-columns:1fr}}</style>
