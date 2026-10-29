<script lang="ts">
	import type { Snippet } from 'svelte';
	import InfoPopover from './InfoPopover.svelte';
	let { label, field, value = '', placeholder, type = 'text', inputmode, showLabel = true, required = false, disabled = false, error = '', min, max, step, maxlength, help, onkeydown, onValueChange, onCommit }: {
		label: string; field: string; value?: string; type?: 'text' | 'number' | 'time' | 'url' | 'color' | 'email' | 'tel'; inputmode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'email' | 'url'; showLabel?: boolean; required?: boolean; disabled?: boolean; error?: string;
		placeholder?: string; min?: string; max?: string; step?: string; maxlength?: number; help?: Snippet; onkeydown?: (event: KeyboardEvent) => void; onValueChange: (value: string) => void; onCommit?: () => void;
	} = $props();
</script>

{#snippet inputField(hideLabel: boolean)}
<label class="form-input-field" for={field}>
	<span class:visually-hidden={!showLabel || hideLabel}>{label}{#if required}<span class="required" aria-hidden="true"> *</span>{/if}</span>
	<input id={field} {type} {inputmode} {value} {placeholder} {required} {disabled} {min} {max} {step} {maxlength} {onkeydown} class:invalid={Boolean(error)} aria-invalid={Boolean(error)} aria-describedby={error ? `${field}-error` : undefined} oninput={event => onValueChange(event.currentTarget.value)} onchange={onCommit} />
	{#if error}<span id={`${field}-error`} class="field-error" role="alert">{error}</span>{/if}
</label>
{/snippet}
{#if help}<div class="form-input-with-help"><div class="input-help-label"><span aria-hidden="true">{label}{#if required}<span class="required"> *</span>{/if}</span><InfoPopover {label}>{@render help()}</InfoPopover></div>{@render inputField(true)}</div>{:else}{@render inputField(false)}{/if}

<style>
	.form-input-with-help{min-width:0}.input-help-label{display:flex;align-items:center;gap:var(--sph-space-4px);margin-bottom:var(--sph-space-6px);color:var(--text);font-size:var(--font-size-support);font-weight:var(--sph-weight-500)}
	input[type='color']{padding:var(--sph-space-4px);cursor:pointer}
	.form-input-field{display:block;min-width:0;color:var(--text);font-size:var(--font-size-support);font-weight:var(--sph-weight-500)}.form-input-field>span{display:block;margin-bottom:var(--sph-space-6px)}.form-input-field>.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
	input{box-sizing:border-box;width:100%;min-width:0;height:36px;margin:0;padding:0 var(--sph-space-12px);border:1px solid var(--border);border-radius:var(--sph-radius-4px);background:var(--surface);color:var(--text);font-family:inherit;font-size:var(--font-size-body);font-weight:var(--sph-weight-400);transition:border-color 150ms,box-shadow 150ms;color-scheme:light}input:hover:not(:focus){border-color:var(--muted)}input:focus{border-color:var(--sph-color-accent);box-shadow:var(--sph-shadow-focus);outline:none}input:disabled{cursor:not-allowed;opacity:.7}input.invalid{border-color:var(--danger)}input::placeholder{color:var(--sph-color-placeholder-light)}:global(html[data-theme='dark']) input{color-scheme:dark}:global(html[data-theme='dark']) input::placeholder{color:var(--sph-color-placeholder-dark)}.field-error{color:var(--danger);font-size:var(--font-size-support);line-height:var(--sph-leading-1-6)}
</style>
