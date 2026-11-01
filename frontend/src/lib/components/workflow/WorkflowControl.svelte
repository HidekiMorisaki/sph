<script lang="ts">
 import FormInput from '$lib/components/FormInput.svelte';
 import FormTextarea from '$lib/components/FormTextarea.svelte';
 import SearchSelect from '$lib/components/SearchSelect.svelte';
 import DatePicker from '$lib/components/DatePicker.svelte';
 const uid=$props.id();
 let {label,field=uid,kind='text',value=$bindable(''),options=[],required=false,disabled=false,placeholder='',rows=3,maxlength,min,max,step,inputmode,error='',reset=false,beforeChange=()=>{},onValueChange}:{
  label:string;field?:string;kind?:'text'|'number'|'time'|'url'|'email'|'tel'|'textarea'|'select'|'date'|'datetime';value?:string;options?:{value:string;label:string}[];required?:boolean;disabled?:boolean;placeholder?:string;rows?:number;maxlength?:number;min?:string;max?:string;step?:string;inputmode?:'text'|'decimal'|'numeric'|'tel'|'email'|'url';error?:string;reset?:boolean;beforeChange?:()=>void;onValueChange?:(value:string)=>void;
 }=$props();
 let open=$state(false);
 function change(next:string){beforeChange();value=next;onValueChange?.(next);if(reset)value='';}
</script>
{#if kind==='select'}
 <SearchSelect {field} {label} {value} {options} {required} {disabled} {error} onSelect={change}/>
{:else if kind==='textarea'}
 <FormTextarea {field} {label} {value} {required} {disabled} {placeholder} {rows} {maxlength} {error} onValueChange={change}/>
{:else if kind==='date'||kind==='datetime'}
 <DatePicker {field} {label} {value} {required} {disabled} {error} mode={kind} {open} onToggle={()=>open=!open} onSelect={v=>{change(v);open=false;}}/>
{:else}
 <FormInput {field} {label} {value} type={kind} {inputmode} {required} {disabled} {placeholder} {maxlength} {min} {max} {step} {error} onValueChange={change}/>
{/if}
