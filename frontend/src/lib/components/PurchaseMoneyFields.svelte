<script lang="ts">
	import { localization } from '#lib/localization.js';
	import { currencyOptions } from '#lib/financial-currency.js';
	import { purchaseText } from '#lib/purchase-money.js';
	import SearchSelect from './SearchSelect.svelte';
	import InfoPopover from './InfoPopover.svelte';
	import type { Snippet } from 'svelte';
	let { amount = $bindable(''), currency = $bindable(''), prefix = 'purchase', amountError = '', currencyError = '', disabled = false, required = true, help, onChange = () => {} }: {
		amount?: string; currency?: string; prefix?: string; amountError?: string; currencyError?: string; disabled?: boolean; required?: boolean; help?: Snippet; onChange?: () => void;
	} = $props();
	const text = $derived(purchaseText[$localization.displayLanguage]);
	const options = $derived([{ value: '', label: '-' }, ...currencyOptions, ...(/^[A-Z]{3}$/.test(currency) && !currencyOptions.some(c => c.value === currency) ? [{ value: currency, label: currency }] : [])]);
</script>
<div class="purchase-amount-field"><div class="purchase-amount-label"><label for={`${prefix}-amount`}>{text.amount}{#if required}<span class="required" aria-hidden="true">*</span>{/if}</label>{#if help}<InfoPopover label={text.referenceInfo}>{@render help()}</InfoPopover>{/if}</div><input id={`${prefix}-amount`} name={`${prefix}-amount`} type="text" inputmode="decimal" value={amount} placeholder="0.00" maxlength="17" {required} {disabled} class:invalid={Boolean(amountError)} aria-invalid={Boolean(amountError)} aria-describedby={amountError ? `${prefix}-amount-error` : undefined} oninput={event => { amount = event.currentTarget.value; onChange(); }} />{#if amountError}<span id={`${prefix}-amount-error`} class="field-error">{text.invalidAmount}</span>{/if}</div>
<SearchSelect label={text.currency} field={`${prefix}-currency`} value={currency} {options} {required} {disabled} searchable={false} error={currencyError ? text.invalidCurrency : ''} onSelect={value => { currency = value; onChange(); }} />

<style>
	.purchase-amount-field{display:grid;align-content:start;gap:var(--sph-space-6px);min-width:0;color:var(--text);font-size:var(--font-size-support);font-weight:var(--sph-weight-500)}
	.purchase-amount-label{display:flex;align-items:center;gap:var(--sph-space-6px);min-width:0}.purchase-amount-label label{display:inline!important;line-height:var(--sph-leading-1-5)}
</style>
