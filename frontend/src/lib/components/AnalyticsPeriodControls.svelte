<script lang="ts">
	import { analyticsText } from '$lib/analytics';
	import { localization } from '$lib/localization';
	import DatePicker from './DatePicker.svelte';
	let { id, fromMonth = $bindable(), toMonth = $bindable(), maxMonth, loading, onApply }: {
		id: string; fromMonth: string; toMonth: string; maxMonth: string; loading: boolean; onApply: () => void;
	} = $props();
	let text = $derived(analyticsText($localization.displayLanguage));
	let activeField = $state<'from' | 'to' | null>(null);
	function selectMonth(field: 'from' | 'to', value: string) {
		if (field === 'from') fromMonth = value;
		else toMonth = value;
		activeField = null;
		onApply();
	}
</script>

<div class="period-controls">
	<div class="period-field"><DatePicker label={text.fromMonth} helpText={text.fromMonthHelp} helpLabel={`${text.fromMonth}: ${text.information}`} field={`${id}-from`} value={fromMonth} mode="month" min="0001-01" max={maxMonth} required disabled={loading} open={activeField === 'from'} onToggle={() => activeField = activeField === 'from' ? null : 'from'} onSelect={(value) => selectMonth('from', value)} /></div>
	<div class="period-field"><DatePicker label={text.toMonth} helpText={text.toMonthHelp} helpLabel={`${text.toMonth}: ${text.information}`} field={`${id}-to`} value={toMonth} mode="month" min="0001-01" max={maxMonth} align="end" required disabled={loading} open={activeField === 'to'} onToggle={() => activeField = activeField === 'to' ? null : 'to'} onSelect={(value) => selectMonth('to', value)} /></div>
</div>

<style>
	.period-controls{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;margin:0;min-width:0;max-width:100%}
	.period-field{min-width:0;flex:1 1 120px}
</style>
