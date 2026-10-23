<script lang="ts">
 let {label,field,value='',placeholder,rows=5,maxlength,required=false,disabled=false,error='',helpText='',onValueChange}:{label:string;field:string;value?:string;placeholder?:string;rows?:number;maxlength?:number;required?:boolean;disabled?:boolean;error?:string;helpText?:string;onValueChange:(value:string)=>void}=$props();
</script>
<label class="form-textarea-field" for={field}>
 <span>{label}{#if required}<span class="required" aria-hidden="true"> *</span>{/if}</span>
 <textarea id={field} {value} {placeholder} {rows} {maxlength} {required} {disabled} class:invalid={Boolean(error)} aria-invalid={Boolean(error)} aria-describedby={[error?`${field}-error`:'',helpText?`${field}-hint`:''].filter(Boolean).join(' ')||undefined} oninput={event=>onValueChange(event.currentTarget.value)}></textarea>
 {#if helpText}<small id={`${field}-hint`}>{helpText}</small>{/if}
 {#if error}<span id={`${field}-error`} class="field-error" role="alert">{error}</span>{/if}
</label>
<style>
 .form-textarea-field{display:grid;min-width:0;gap:6px;color:var(--text);font-size:var(--font-size-support);font-weight:500}
 textarea{box-sizing:border-box;display:block;width:100%;min-width:0;min-height:90px;margin:0;padding:8px 12px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font-family:inherit;font-size:var(--font-size-body);font-weight:400;line-height:1.5;resize:vertical;transition:border-color 150ms,box-shadow 150ms}textarea:hover:not(:focus){border-color:var(--muted)}textarea:focus{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14);outline:none}textarea:disabled{cursor:not-allowed;opacity:.7}textarea.invalid{border-color:var(--danger)}textarea::placeholder{color:#c0c7cf}:global(html[data-theme='dark']) textarea::placeholder{color:#5a6473}small{color:var(--muted);font-size:var(--font-size-support);font-weight:400;line-height:1.6}.field-error{color:var(--danger);font-size:var(--font-size-support);line-height:1.6}
</style>
