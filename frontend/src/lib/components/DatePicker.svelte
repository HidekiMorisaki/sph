<script lang="ts">
	import { tick } from 'svelte';

	let { label, field, value, above = false, required = false, disabled = false, error = '', open = false, onToggle, onSelect }: {
		label: string; field: string; value: string; above?: boolean; required?: boolean; disabled?: boolean;
		error?: string; open?: boolean; onToggle: () => void; onSelect: (value: string) => void;
	} = $props();

	const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	const dateIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	let year = $state(new Date().getFullYear());
	let month = $state(new Date().getMonth());
	let choosingYear = $state(false);
	let yearPage = $state(0);
	let trigger: HTMLButtonElement;
	let panel = $state<HTMLDivElement>();
	let days = $derived.by(() => {
		const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());
		return Array.from({ length: 42 }, (_, index) => {
			const date = new Date(start);
			date.setDate(start.getDate() + index);
			return { day: date.getDate(), iso: dateIso(date), inMonth: date.getMonth() === month };
		});
	});

	function toggle() {
		if (!open) {
			const date = value ? new Date(`${value}T00:00:00`) : new Date();
			year = date.getFullYear();
			month = date.getMonth();
			choosingYear = false;
		}
		onToggle();
	}
	function moveMonth(offset: number) {
		const date = new Date(year, month + offset, 1);
		year = date.getFullYear();
		month = date.getMonth();
	}
	function showYears() {
		yearPage = Math.floor(year / 12) * 12;
		choosingYear = true;
		void tick().then(() => panel?.querySelector<HTMLButtonElement>(`.year-grid button[aria-current="date"]`)?.focus());
	}
	function selectYear(selected: number) {
		year = selected;
		choosingYear = false;
		void tick().then(() => panel?.querySelector<HTMLButtonElement>('.year-title')?.focus());
	}
	function selectDate(selected: string) {
		onSelect(selected);
		void tick().then(() => trigger?.focus());
	}
</script>

<div class="custom-date" class:above data-field={field} role="group" aria-label={label}>
	<span>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span>
	<button bind:this={trigger} class="date-trigger" class:invalid={Boolean(error)} type="button" {disabled} role="combobox" aria-label={`${label}${required ? ' (required)' : ''}: ${value || 'yyyy-mm-dd'}`} aria-invalid={Boolean(error)} aria-describedby={error ? `${field}-error` : undefined} aria-controls={`${field}-calendar`} aria-haspopup="dialog" aria-expanded={open} onclick={toggle}>
		<span class:placeholder={!value}>{value || 'yyyy-mm-dd'}</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
	</button>
	{#if open}
		<div bind:this={panel} id={`${field}-calendar`} class="calendar-panel" role="dialog" aria-label={`${label} calendar`}>
			{#if choosingYear}
				<div class="year-head"><button type="button" aria-label="Previous 12 years" onclick={() => yearPage -= 12}>‹</button><strong>{yearPage}–{yearPage + 11}</strong><button type="button" aria-label="Next 12 years" onclick={() => yearPage += 12}>›</button></div>
				<div class="year-grid">{#each Array.from({ length: 12 }, (_, index) => yearPage + index) as option}<button type="button" class:selected={option === year} aria-current={option === year ? 'date' : undefined} onclick={() => selectYear(option)}>{option}</button>{/each}</div>
				<button class="back-month" type="button" onclick={() => choosingYear = false}>Back to calendar</button>
			{:else}
				<div class="calendar-head"><button type="button" aria-label="Previous year" onclick={() => year -= 1}>«</button><button type="button" aria-label="Previous month" onclick={() => moveMonth(-1)}>‹</button><button class="year-title" type="button" aria-label={`Choose year, ${year}`} onclick={showYears}>{months[month]} {year}</button><button type="button" aria-label="Next month" onclick={() => moveMonth(1)}>›</button><button type="button" aria-label="Next year" onclick={() => year += 1}>»</button></div>
				<div class="weekdays">{#each weekdays as day}<span>{day}</span>{/each}</div>
				<div class="calendar-grid">{#each days as date}<button type="button" class:outside={!date.inMonth} class:today={date.iso === dateIso(new Date())} class:selected={date.iso === value} aria-label={date.iso} aria-pressed={date.iso === value} onclick={() => selectDate(date.iso)}>{date.day}</button>{/each}</div>
				<div class="calendar-actions">{#if !required}<button type="button" onclick={() => selectDate('')}>Clear</button>{/if}<button type="button" onclick={() => selectDate(dateIso(new Date()))}>Today</button></div>
			{/if}
		</div>
	{/if}
	{#if error}<span id={`${field}-error`} class="field-error" role="alert">{error}</span>{/if}
</div>

<style>
	.custom-date{position:relative;display:block;min-width:0;color:var(--text);font-size:12px;font-weight:500}.custom-date>span{display:block;margin-bottom:6px}.required{margin-left:2px;color:var(--danger)}
	.date-trigger{display:flex;align-items:center;justify-content:space-between;width:100%;height:36px;margin:0;padding:0 12px;background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);border-radius:4px;text-align:left;font-size:13px;font-weight:400;transition:border-color 150ms,box-shadow 150ms}.date-trigger .placeholder{color:#c0c7cf}:global(html[data-theme='dark']) .date-trigger .placeholder{color:#5a6473}.date-trigger svg{width:17px;height:17px;fill:none;stroke:var(--muted);stroke-width:1.5}.date-trigger:hover:not(:focus){border-color:var(--muted)}.date-trigger:focus-visible,.date-trigger[aria-expanded='true']{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14);outline:none}.date-trigger:disabled{cursor:not-allowed;opacity:.7}.date-trigger.invalid{border-color:var(--danger)!important}
	.calendar-panel{position:absolute;top:calc(100% + 6px);left:0;z-index:20;width:min(280px,calc(100vw - 80px));padding:12px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;box-shadow:0 14px 36px rgba(0,0,0,.38)}.above .calendar-panel{top:auto;bottom:calc(100% + 6px)}
	.calendar-head,.year-head{display:grid;grid-template-columns:30px 30px 1fr 30px 30px;align-items:center;margin-bottom:8px}.year-head{grid-template-columns:30px 1fr 30px}.year-head strong{text-align:center;font-size:13px}.calendar-head button,.year-head button,.calendar-actions button,.back-month{margin:0;padding:0;background:transparent!important;color:var(--muted)!important}.calendar-head button,.year-head button{height:30px;font-size:20px}.calendar-head .year-title{color:var(--text)!important;font-size:12px;font-weight:600;white-space:nowrap}.calendar-head button:hover,.year-head button:hover,.calendar-actions button:hover,.back-month:hover{background:var(--surface-secondary)!important;color:var(--text)!important}
	.weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.weekdays span{padding:5px 0;color:var(--muted);font-size:10px;font-weight:600;text-align:center}.calendar-grid button,.year-grid button{height:31px;margin:0;padding:0;background:transparent!important;color:var(--text)!important;border:1px solid transparent;border-radius:4px;font-size:12px}.calendar-grid button:hover,.year-grid button:hover{background:var(--surface-secondary)!important;border-color:var(--border)}.calendar-grid button.outside{color:var(--muted)!important;opacity:.55}.calendar-grid button.today{border-color:#1abb9c}.calendar-grid button.selected,.year-grid button.selected{background:#1abb9c!important;color:#fff!important;border-color:#1abb9c}.year-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.back-month{width:100%;margin-top:10px;padding:7px!important;font-size:11px}.calendar-actions{display:flex;justify-content:space-between;margin-top:10px;padding-top:9px;border-top:1px solid var(--border)}.calendar-actions button{font-size:11px}.calendar-panel button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}.field-error{display:block;color:var(--danger);font-size:11px;line-height:1.35}
</style>
