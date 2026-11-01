<script lang="ts">
 let {label,field,showLabel=true,type='checkbox',name,checked=false,disabled=false,required=false,onChange}:{label:string;field:string;showLabel?:boolean;type?:'checkbox'|'radio';name?:string;checked?:boolean;disabled?:boolean;required?:boolean;onChange:(checked:boolean)=>void}=$props();
</script>
<label class="form-checkbox-field" for={field}>
 <input id={field} {type} {name} {checked} {disabled} {required} onchange={event=>onChange(event.currentTarget.checked)}/>
 <span class:visually-hidden={!showLabel}>{label}{#if required}<span class="required" aria-hidden="true"> *</span>{/if}</span>
</label>
<style>
 .visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.form-checkbox-field{display:flex;align-items:center;gap:var(--sph-space-8px);min-width:0;color:var(--text);font-size:var(--font-size-support);font-weight:var(--sph-weight-500);cursor:pointer}.form-checkbox-field span{overflow-wrap:anywhere}input{flex:none;width:18px;height:18px;margin:0;accent-color:var(--sph-color-accent)}input:focus-visible{outline:2px solid var(--sph-color-accent);outline-offset:2px}input:disabled{cursor:not-allowed;opacity:.7}
</style>
