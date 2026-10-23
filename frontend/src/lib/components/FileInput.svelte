<script lang="ts">
	let { label, field, accept, disabled = false, onchange }: {label:string;field:string;accept?:string;disabled?:boolean;onchange:(event:Event)=>void} = $props();
</script>
<label for={field}>{label}</label>
<input id={field} type="file" {accept} {disabled} {onchange}/>
<style>
	label{display:block;margin-bottom:6px;font-size:var(--font-size-support);font-weight:500;color:var(--text)}
	input{box-sizing:border-box;width:100%;min-width:0;height:36px;margin:0;padding:0;font-family:inherit;font-size:var(--font-size-body);font-weight:400;line-height:1.6;color:var(--text);border:1px solid var(--border);border-radius:4px;background:var(--surface)}
	input::file-selector-button{height:34px;margin-right:12px;padding:0 12px;border:0;border-right:1px solid var(--border);background:var(--surface-secondary);color:var(--text-secondary);font:inherit;cursor:pointer}
	input:hover{border-color:var(--muted)}input:focus-visible{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14);outline:none}input:disabled{opacity:.7;cursor:not-allowed}
</style>
