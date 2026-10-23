<script lang="ts">
 let {label,field,checked=false,disabled=false,required=false,onChange}:{label:string;field:string;checked?:boolean;disabled?:boolean;required?:boolean;onChange:(checked:boolean)=>void}=$props();
</script>
<label class="form-checkbox-field" for={field}>
 <input id={field} type="checkbox" {checked} {disabled} {required} onchange={event=>onChange(event.currentTarget.checked)}/>
 <span>{label}{#if required}<span class="required" aria-hidden="true"> *</span>{/if}</span>
</label>
<style>
 .form-checkbox-field{display:flex;align-items:center;gap:8px;min-width:0;color:var(--text);font-size:var(--font-size-support);font-weight:500;cursor:pointer}.form-checkbox-field span{overflow-wrap:anywhere}input{flex:none;width:18px;height:18px;margin:0;accent-color:#1abb9c}input:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}input:disabled{cursor:not-allowed;opacity:.7}
</style>
