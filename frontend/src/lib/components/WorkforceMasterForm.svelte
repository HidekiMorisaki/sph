<script lang="ts">
 import ModalActionButton from '$lib/components/ModalActionButton.svelte';
 import FormTabs from '$lib/components/FormTabs.svelte';
 import { untrack,tick,onMount } from 'svelte';
 import { apiData } from '$lib/api';
 import { localeMessages } from '$lib/locale-messages';
 import { localization } from '$lib/localization';
 import { clientTextFields,workforceOptions,type WorkforceMaster } from '$lib/workforce';
 import SearchSelect from './SearchSelect.svelte';
 import DatePicker from './DatePicker.svelte';
 import PostalLookup from './PostalLookup.svelte';
 import {addressLabels,type AddressCountry} from '$lib/postal-address';
 import DetailModal from './DetailModal.svelte';
 import DiscardChangesDialog from './DiscardChangesDialog.svelte';
 import FormSection from './FormSection.svelte';
 import StatusNotice from './StatusNotice.svelte';
 let {kind,item=null,returnFocus=null,onClose,onSaved,onDelete,deleteError=''}:{kind:'skills'|'projects'|'clients';item?:WorkforceMaster|null;returnFocus?:HTMLElement|null;onClose:()=>void;onDelete?:(trigger:HTMLElement)=>void;deleteError?:string;onSaved:(item:WorkforceMaster)=>Promise<void>}=$props();
 let text=$derived(localeMessages[$localization.displayLanguage].workforce);
 let common=$derived(localeMessages[$localization.displayLanguage].common);
 function example(field:string){
  if(field==='postalCode')return address.postalExample;
  if(field==='prefecture')return address.regionExample;
  if(fields.countryCode==='US'&&['city','streetAddress','buildingName','phoneNumber1','phoneNumber2','faxNumber1','faxNumber2'].includes(field))return text.usExamples[field as keyof typeof text.usExamples];
  return text.examples[field as keyof typeof text.examples];
 }
 let name=$state(untrack(()=>item?.name??'')),category=$state(untrack(()=>item?.category??'')),description=$state(untrack(()=>item?.description??''));
 let clientId=$state(untrack(()=>String(item?.clientId??'')));
 let contractStartsOn=$state(untrack(()=>item?.contractStartsOn?.slice(0,10)??'')),contractEndsOn=$state(untrack(()=>item?.contractEndsOn?.slice(0,10)??''));
 let fields=$state<Record<string,string>>(untrack(()=>Object.fromEntries([...clientTextFields,'countryCode','notes'].map(key=>[key,String(item?.[key as keyof WorkforceMaster]??(key==='countryCode'?'JP':''))]))));
 let address=$derived(addressLabels(fields.countryCode as AddressCountry,$localization.displayLanguage));
 let clients=$state<WorkforceMaster[]>([]),loading=$state(untrack(()=>kind==='projects')),activeDate=$state('');
 let extraInitial=$state(untrack(()=>JSON.stringify([clientId,contractStartsOn,contractEndsOn,fields])));
 onMount(()=>{void(async()=>{try{
  if(kind==='projects')clients=await workforceOptions('clients');
 }catch{error=text.loadFailed;}finally{loading=false;}})();});
 let initial=$state(untrack(()=>JSON.stringify([item?.name??'',item?.category??'',item?.description??''])));
 let dirty=$derived(JSON.stringify([name,category,description])!==initial || JSON.stringify([clientId,contractStartsOn,contractEndsOn,fields])!==extraInitial);
 let busy=$state(false),discard=$state(false),saved=$state(false),error=$state('');
 $effect(()=>{if(dirty)saved=false;});
 function closeNow(){onClose();void tick().then(()=>returnFocus?.focus({preventScroll:true}));}
 function close(){if(busy)return;if(dirty)discard=true;else closeNow();}
 async function save(event:SubmitEvent){
  event.preventDefault();error='';saved=false;
  if(!name.trim()||(kind==='projects'&&(!clientId||!contractStartsOn||(contractEndsOn&&contractEndsOn<contractStartsOn)))){error=text.invalid;return;}
  busy=true;
  try{
   const response=await fetch('/v1/'+kind+(item?'/'+item.id:''),{method:item?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(kind==='clients'?{...fields,name}:kind==='projects'?{name,description,clientId:Number(clientId),contractStartsOn,contractEndsOn:contractEndsOn||null}:{name,category,description})});
   if(!response.ok){const payload=await response.json().catch(()=>null);error=payload?.error?.code==='DUPLICATE_VALUE'?text.duplicate:payload?.error?.code==='VALIDATION_ERROR'?text.invalid:text.failed;return;}
   const result=await apiData<WorkforceMaster>(response);name=result.name;category=result.category??'';description=result.description??'';initial=JSON.stringify([name,category,description]);
   extraInitial=JSON.stringify([clientId,contractStartsOn,contractEndsOn,fields]);await onSaved(result);if(item)saved=true;else closeNow();
  }catch{error=text.failed;}finally{busy=false;}
 }
</script>
<DetailModal title={(item?text.edit:text.add)+' · '+text[kind]} titleId="workforce-master-form-title" closeLabel={common.cancel} {returnFocus} onClose={close}>
 {#if deleteError}<StatusNotice message={deleteError} tone="error" onDismiss={()=>deleteError=''} />{/if}<form id="workforce-master-form" class="app-modal-form app-modal-form--stacked" onsubmit={save}>
  {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''} />{/if}
  {#if saved}<StatusNotice message={text.saved} tone="success" onDismiss={()=>saved=false} />{/if}
{#snippet sections()}<div data-form-panel="basic">
<FormSection title={text.information} framed columns={2}>
   <label class:wide={kind==='projects'}><span>{text.name} <span class="required">*</span></span><input name="workforceName" bind:value={name} placeholder={text.nameExamples[kind]} maxlength="128" required disabled={busy}/></label>
   {#if kind==='skills'}<label><span>{text.category}</span><input name="skillCategory" bind:value={category} placeholder={text.examples.category} maxlength="128" disabled={busy}/></label>{/if}
   {#if kind==='projects'}
    <SearchSelect label={text.clientId} field="projectClient" value={clientId} required disabled={busy||loading} options={clients.map(client=>({value:String(client.id),label:client.name+' · '+client.companyName}))} onSelect={value=>clientId=value}/>
    {#each ['contractStartsOn','contractEndsOn'] as field}<DatePicker label={text[field as 'contractStartsOn'|'contractEndsOn']} {field} value={field==='contractStartsOn'?contractStartsOn:contractEndsOn} required={field==='contractStartsOn'} disabled={busy} open={activeDate===field} onToggle={()=>activeDate=activeDate===field?'':field} onSelect={value=>{if(field==='contractStartsOn')contractStartsOn=value;else contractEndsOn=value;activeDate='';}}/>{/each}
   {/if}
   {#if kind==='clients'}
    {#each clientTextFields.slice(0,1) as field}<label><span>{text[field]}{#if field==='companyName'} <span class="required">*</span>{/if}</span><input name={field} bind:value={fields[field]} placeholder={example(field)} required={field==='companyName'} type={field==='contactEmail'?'email':field==='contactMobile'?'tel':'text'} maxlength={field==='contactEmail'?254:field==='contactMobile'?32:128} disabled={busy}/></label>{/each}
   {/if}
   {#if kind==='skills'}<label class="wide"><span>{text.description}</span><textarea bind:value={description} placeholder={text.examples.description} maxlength="5000" disabled={busy}></textarea></label>{/if}
  </FormSection>{#if kind==='projects'}<FormSection title={text.description} framed><label class="wide"><span>{text.description}</span><textarea bind:value={description} placeholder={text.examples.description} maxlength="5000" disabled={busy}></textarea></label></FormSection>{/if}{#if kind==='clients'}<FormSection title={text.notes} framed>
    <label class="wide"><span>{text.notes}</span><textarea name="notes" bind:value={fields.notes} placeholder={text.examples.notes} maxlength="5000" disabled={busy}></textarea></label>
  </FormSection>{/if}
</div>{#if kind==='clients'}<div data-form-panel="contact">
<FormSection title={text.addressContact} framed columns={2}>{#each clientTextFields.slice(1,5) as field}<label><span>{text[field]}{#if field==='companyName'} <span class="required">*</span>{/if}</span><input name={field} bind:value={fields[field]} placeholder={example(field)} required={field==='companyName'} type={field==='contactEmail'?'email':field==='contactMobile'?'tel':'text'} maxlength={field==='contactEmail'?254:field==='contactMobile'?32:128} disabled={busy}/></label>{/each}
    <SearchSelect label={text.countryCode} field="countryCode" value={fields.countryCode} disabled={busy} options={[{value:'JP',label:$localization.displayLanguage==='ja'?'日本':'Japan'},{value:'US',label:$localization.displayLanguage==='ja'?'米国':'United States'}]} onSelect={value=>{fields.countryCode=value;fields.postalCode='';fields.prefecture='';fields.city='';fields.streetAddress='';}}/>
    {#each clientTextFields.slice(5) as field}<label><span>{field==='postalCode'?address.postal:field==='prefecture'?address.region:text[field]}</span><input name={field} bind:value={fields[field]} placeholder={example(field)} maxlength={field==='postalCode'?10:field==='prefecture'?64:field==='streetAddress'||field==='buildingName'?255:field.includes('Label')?128:field.startsWith('phone')||field.startsWith('fax')?32:128} disabled={busy}/></label>
     {#if field==='postalCode'}<PostalLookup countryCode={fields.countryCode as AddressCountry} postalCode={fields.postalCode} language={$localization.displayLanguage} onSelect={candidate=>{fields.prefecture=candidate.prefecture;fields.city=candidate.city;if(fields.countryCode==='JP')fields.streetAddress=candidate.streetAddress;}}/>{/if}
    {/each}
  </FormSection>
</div>{/if}{/snippet}
{#if kind==='skills'}{@render sections()}{:else}<FormTabs label={text[kind]} kind={kind==='clients'?'client':'basic'}>{@render sections()}</FormTabs>{/if}
 </form>
 {#snippet actions()}{#if onDelete && item}<ModalActionButton class="app-danger-action editor-delete" type="button" disabled={busy} onclick={()=>void onDelete(document.activeElement as HTMLElement)} variant="danger" data-button-scope="button-5d08da6a60">{common.delete}</ModalActionButton>{/if}<ModalActionButton type="button" class="secondary" disabled={busy} onclick={close} variant="secondary" data-button-scope="button-5d08da6a60">{common.cancel}</ModalActionButton><ModalActionButton type="submit" form="workforce-master-form" class="app-primary-action" disabled={busy||loading||(Boolean(item)&&!dirty)} variant="primary" data-button-scope="button-5d08da6a60">{busy?common.saving:item?common.saveChanges:text.add}</ModalActionButton>{/snippet}
</DetailModal>
{#if discard}<DiscardChangesDialog onContinue={()=>discard=false} onDiscard={closeNow}/>{/if}
<style>.wide{grid-column:1/-1}</style>
