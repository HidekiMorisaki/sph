<script lang="ts">
	let { label, field, value = '', placeholder, type = 'text', showLabel = true, disabled = false, error = '', min, max, step, maxlength, onkeydown, onValueChange }: {
		label: string; field: string; value?: string; type?: 'text' | 'number' | 'time'; showLabel?: boolean; disabled?: boolean; error?: string;
		placeholder?: string; min?: string; max?: string; step?: string; maxlength?: number; onkeydown?: (event: KeyboardEvent) => void; onValueChange: (value: string) => void;
	} = $props();
</script>

<label class="form-input-field" for={field}>
	<span class:visually-hidden={!showLabel}>{label}</span>
	<input id={field} {type} {value} {placeholder} {disabled} {min} {max} {step} {maxlength} {onkeydown} class:invalid={Boolean(error)} aria-invalid={Boolean(error)} aria-describedby={error ? `${field}-error` : undefined} oninput={event => onValueChange(event.currentTarget.value)} />
	{#if error}<span id={`${field}-error`} class="field-error" role="alert">{error}</span>{/if}
</label>

<style>
	.form-input-field{display:block;min-width:0;color:var(--text);font-size:var(--font-size-support);font-weight:500}.form-input-field>span{display:block;margin-bottom:6px}.form-input-field>.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
	input{box-sizing:border-box;width:100%;min-width:0;height:36px;margin:0;padding:0 12px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font-family:inherit;font-size:var(--font-size-body);font-weight:400;transition:border-color 150ms,box-shadow 150ms;color-scheme:light}input:hover:not(:focus){border-color:var(--muted)}input:focus{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14);outline:none}input:disabled{cursor:not-allowed;opacity:.7}input.invalid{border-color:var(--danger)}input::placeholder{color:#c0c7cf}:global(html[data-theme='dark']) input{color-scheme:dark}:global(html[data-theme='dark']) input::placeholder{color:#5a6473}.field-error{color:var(--danger);font-size:var(--font-size-support);line-height:1.6}
</style>
