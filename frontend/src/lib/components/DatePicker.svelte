<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { calendarText, formatDate, formatMonthYear, localization, weekdayLabels } from '$lib/localization';

	let { label, field, value, above = false, required = false, disabled = false, error = '', open = false, mode = 'date', min = '', max = '', align = 'start', helpText = '', helpLabel = '', onToggle, onSelect }: {
		label: string; field: string; value: string; above?: boolean; required?: boolean; disabled?: boolean;
		error?: string; open?: boolean; mode?: 'date' | 'month'; min?: string; max?: string; align?: 'start' | 'end'; helpText?: string; helpLabel?: string; onToggle: () => void; onSelect: (value: string) => void;
	} = $props();

	const dateIso = (date: Date) => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	function calendarDate(year: number, month: number, day: number) {
		const date = new Date(0);
		date.setHours(0, 0, 0, 0);
		date.setFullYear(year, month, day);
		return date;
	}
	let year = $state(new Date().getFullYear());
	let month = $state(new Date().getMonth());
	let choosingYear = $state(false);
	let yearPage = $state(0);
	let yearOptions = $derived(Array.from({ length: 12 }, (_, index) => yearPage + index));
	let trigger: HTMLButtonElement;
	let panel = $state<HTMLDivElement>();
	let panelStyle = $state('position:fixed;top:0;left:0;right:auto;bottom:auto;width:min(280px,calc(100vw - 16px));margin:0;visibility:hidden');
	let root = $state<HTMLDivElement>();
	let helpOpen = $state(false);
	let helpRoot = $state<HTMLSpanElement>();
	let helpTrigger = $state<HTMLButtonElement>();
	function toggleHelp() {
		if (open) onToggle();
		helpOpen = !helpOpen;
	}
	let placeholder = $derived(mode === 'month' ? 'yyyy-mm' : 'yyyy-mm-dd');
	let months = $derived.by(() => Array.from({ length: 12 }, (_, index) => ({
		iso: `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}`,
		label: new Intl.DateTimeFormat($localization.displayLanguage, { month: 'short' }).format(new Date(2000, index, 1)),
		fullLabel: formatMonthYear(year, index, $localization)
	})));
	let weekdays = $derived(weekdayLabels('compact', $localization));
	let monthYear = $derived(formatMonthYear(year, month, $localization));
	let text = $derived(calendarText($localization));
	let days = $derived.by(() => {
		const start = calendarDate(year, month, 1 - calendarDate(year, month, 1).getDay());
		return Array.from({ length: 42 }, (_, index) => {
			const date = new Date(start);
			date.setDate(start.getDate() + index);
			return { day: date.getDate(), iso: dateIso(date), inMonth: date.getMonth() === month };
		});
	});
	function positionPanel() {
		if (!panel || !trigger) return;
		const rect = trigger.getBoundingClientRect();
		const edge = 8;
		const gap = 6;
		const width = Math.min(280, window.innerWidth - edge * 2);
		const height = panel.offsetHeight;
		const spaceBelow = window.innerHeight - edge - rect.bottom;
		const spaceAbove = rect.top - edge;
		const openAbove = (above && spaceAbove >= height) || (spaceBelow < height && spaceAbove > spaceBelow);
		const top = openAbove ? rect.top - gap - height : rect.bottom + gap;
		const left = align === 'end' ? rect.right - width : rect.left;
		panelStyle = `position:fixed;top:${Math.max(edge, Math.min(top, window.innerHeight - edge - height))}px;left:${Math.max(edge, Math.min(left, window.innerWidth - edge - width))}px;right:auto;bottom:auto;width:${width}px;margin:0;visibility:visible`;
	}

	function toggle() {
		const opening = !open;
		if (!open) {
			const date = value ? new Date(`${value}${mode === 'month' ? '-01' : ''}T00:00:00`) : new Date();
			year = date.getFullYear();
			month = date.getMonth();
			choosingYear = false;
		}
		onToggle();
		if (opening) void tick().then(() => { panel?.showPopover(); positionPanel(); panel?.querySelector<HTMLButtonElement>('button[aria-pressed="true"], .year-title')?.focus(); });
	}
	function moveMonth(offset: number) {
		const date = calendarDate(year, month + offset, 1);
		year = date.getFullYear();
		month = date.getMonth();
	}
	function showYears() {
		yearPage = Math.floor(year / 12) * 12;
		choosingYear = true;
		void tick().then(() => panel?.querySelector<HTMLButtonElement>(`.year-grid button[aria-current="date"]`)?.focus());
	}
	function moveYearPage(offset: number) {
		yearPage = Math.max(0, Math.min(9996, yearPage + offset * 12));
	}
	function selectYear(selected: number) {
		year = selected;
		choosingYear = false;
		void tick().then(() => panel?.querySelector<HTMLButtonElement>('.year-title')?.focus());
	}
	function allowed(selected: string) {
		return (!min || selected >= min) && (!max || selected <= max);
	}
	function selectDate(selected: string) {
		if (selected && !allowed(selected)) return;
		onSelect(selected);
		void tick().then(() => trigger?.focus());
	}
	function localizedDateLabel(iso: string) {
		return formatDate(iso, $localization, 'long');
	}
	onMount(() => {
		const closeOutside = (event: PointerEvent) => {
			if (helpOpen && event.target instanceof Node && !helpRoot?.contains(event.target)) helpOpen = false;
			if (open && event.target instanceof Node && !root?.contains(event.target)) onToggle();
		};
		const closeHelpOnFocus = (event: FocusEvent) => {
			if (helpOpen && event.target instanceof Node && !helpRoot?.contains(event.target)) helpOpen = false;
		};
		const closeEscape = (event: KeyboardEvent) => {
			if (helpOpen && !event.defaultPrevented && event.key === 'Escape') {
				event.preventDefault();
				helpOpen = false;
				helpTrigger?.focus();
				return;
			}
			if (!open || event.defaultPrevented || event.key !== 'Escape') return;
			event.preventDefault();
			onToggle();
			void tick().then(() => trigger?.focus());
		};
		document.addEventListener('pointerdown', closeOutside);
		document.addEventListener('focusin', closeHelpOnFocus);
		document.addEventListener('keydown', closeEscape);
		return () => {
			document.removeEventListener('pointerdown', closeOutside);
			document.removeEventListener('focusin', closeHelpOnFocus);
			document.removeEventListener('keydown', closeEscape);
		};
	});
	$effect(() => {
		if (!open) return;
		const reposition = () => positionPanel();
		window.addEventListener('resize', reposition);
		window.addEventListener('scroll', reposition, true);
		return () => {
			window.removeEventListener('resize', reposition);
			window.removeEventListener('scroll', reposition, true);
		};
	});
</script>

<div bind:this={root} class="custom-date" class:above class:align-end={align === 'end'} data-field={field} role="group" aria-label={label}>
	<span class="date-label">{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}{#if helpText}
		<span bind:this={helpRoot} class="date-help">
			<button bind:this={helpTrigger} type="button" class="help-trigger" aria-label={helpLabel || label} aria-expanded={helpOpen} aria-controls={`${field}-help`} aria-describedby={helpOpen ? `${field}-help` : undefined} onclick={toggleHelp}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" /><path d="M10 9v5" /><circle class="info-dot" cx="10" cy="6" r="1" /></svg></button>
			{#if helpOpen}<span id={`${field}-help`} class="help-panel" role="note" aria-label={helpLabel || label}>{helpText}</span>{/if}
		</span>
	{/if}</span>
	<button bind:this={trigger} class="date-trigger" class:invalid={Boolean(error)} type="button" {disabled} role="combobox" aria-label={`${label}${required ? ` (${text.required})` : ''}: ${value || placeholder}`} aria-invalid={Boolean(error)} aria-describedby={error ? `${field}-error` : undefined} aria-controls={`${field}-calendar`} aria-haspopup="dialog" aria-expanded={open} onclick={toggle}>
		<span class:placeholder={!value}>{value || placeholder}</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
	</button>
	{#if open}
		<div bind:this={panel} id={`${field}-calendar`} class="calendar-panel" popover="manual" style={panelStyle} role="dialog" aria-label={`${label} ${text.calendar}`}>
			{#if choosingYear}
				<div class="year-head"><button type="button" aria-label={text.previousYears} disabled={yearPage <= 0} onclick={() => moveYearPage(-1)}>‹</button><strong>{yearPage}–{Math.min(yearPage + 11, 9999)}</strong><button type="button" aria-label={text.nextYears} disabled={yearPage + 12 > 9999} onclick={() => moveYearPage(1)}>›</button></div>
				<div class="year-grid">{#each yearOptions as option (option)}<button type="button" disabled={option < 1 || option > 9999} class:selected={option === year} aria-current={option === year ? 'date' : undefined} onclick={() => selectYear(option)}>{option}</button>{/each}</div>
				<button class="back-month" type="button" onclick={() => choosingYear = false}>{text.backToCalendar}</button>
			{:else if mode === 'month'}
				<div class="year-head"><button type="button" aria-label={text.previousYear} disabled={year <= 1} onclick={() => year -= 1}>‹</button><button class="year-title" type="button" aria-label={text.chooseYearLabel(year)} onclick={showYears}>{year}</button><button type="button" aria-label={text.nextYear} disabled={year >= 9999} onclick={() => year += 1}>›</button></div>
				<div class="year-grid month-grid">{#each months as option (option.iso)}<button type="button" disabled={!allowed(option.iso)} class:selected={option.iso === value} aria-label={option.fullLabel} aria-pressed={option.iso === value} onclick={() => selectDate(option.iso)}>{option.label}</button>{/each}</div>
				<div class="calendar-actions">{#if !required}<button type="button" onclick={() => selectDate('')}>{text.clear}</button>{/if}<button type="button" disabled={!allowed(dateIso(new Date()).slice(0, 7))} onclick={() => selectDate(dateIso(new Date()).slice(0, 7))}>{text.today}</button></div>
			{:else}
				<div class="calendar-head"><button type="button" aria-label={text.previousYear} onclick={() => year -= 1}>«</button><button type="button" aria-label={text.previousMonth} onclick={() => moveMonth(-1)}>‹</button><button class="year-title" type="button" aria-label={text.chooseYearLabel(year)} onclick={showYears}>{monthYear}</button><button type="button" aria-label={text.nextMonth} onclick={() => moveMonth(1)}>›</button><button type="button" aria-label={text.nextYear} onclick={() => year += 1}>»</button></div>
				<div class="weekdays">{#each weekdays as day}<span>{day}</span>{/each}</div>
				<div class="calendar-grid">{#each days as date (date.iso)}<button type="button" disabled={!allowed(date.iso)} class:outside={!date.inMonth} class:today={date.iso === dateIso(new Date())} class:selected={date.iso === value} aria-label={localizedDateLabel(date.iso)} aria-pressed={date.iso === value} onclick={() => selectDate(date.iso)}>{date.day}</button>{/each}</div>
				<div class="calendar-actions">{#if !required}<button type="button" onclick={() => selectDate('')}>{text.clear}</button>{/if}<button type="button" disabled={!allowed(dateIso(new Date()))} onclick={() => selectDate(dateIso(new Date()))}>{text.today}</button></div>
			{/if}
		</div>
	{/if}
	{#if error}<span id={`${field}-error`} class="field-error" role="alert">{error}</span>{/if}
</div>

<style>
	.date-help{display:inline-flex;vertical-align:middle;margin-left:5px}
	.help-trigger{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;margin:-2px 0;background:transparent!important;color:var(--muted)!important;border:0;border-radius:50%;cursor:pointer}
	.help-trigger svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5}.help-trigger .info-dot{fill:currentColor;stroke:none}
	.help-trigger:hover,.help-trigger[aria-expanded='true']{background:var(--surface-secondary)!important;color:var(--text)!important}.help-trigger:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
	.help-panel{position:absolute;top:24px;left:0;z-index:30;box-sizing:border-box;display:block;width:min(320px,calc(100vw - 80px));padding:12px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow);font-size:var(--font-size-support);font-weight:400;line-height:1.6;overflow-wrap:anywhere}
	.align-end .help-panel{left:auto;right:0}
	.align-end .calendar-panel{left:auto;right:0}.year-head .year-title{color:var(--text)!important;font-size:var(--font-size-support);font-weight:600}.calendar-panel button:disabled{opacity:.4;cursor:not-allowed}.calendar-panel button:disabled:hover{background:transparent!important;border-color:transparent}.month-grid button{height:36px}
	.custom-date{position:relative;display:block;min-width:0;color:var(--text);font-size:var(--font-size-support);font-weight:500}.custom-date>span{display:block;margin-bottom:6px}.required{margin-left:2px;color:var(--danger)}
	.date-trigger{display:flex;align-items:center;justify-content:space-between;width:100%;height:36px;margin:0;padding:0 12px;background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);border-radius:4px;text-align:left;font-size:var(--font-size-body);font-weight:400;transition:border-color 150ms,box-shadow 150ms}.date-trigger .placeholder{color:#c0c7cf}:global(html[data-theme='dark']) .date-trigger .placeholder{color:#5a6473}.date-trigger svg{width:17px;height:17px;fill:none;stroke:var(--muted);stroke-width:1.5}.date-trigger:hover:not(:focus){border-color:var(--muted)}.date-trigger:focus-visible,.date-trigger[aria-expanded='true']{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14);outline:none}.date-trigger:disabled{cursor:not-allowed;opacity:.7}.date-trigger.invalid{border-color:var(--danger)!important}
	.calendar-panel{position:fixed;box-sizing:border-box;max-height:calc(100dvh - 16px);overflow-y:auto;padding:12px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;box-shadow:0 14px 36px rgba(0,0,0,.38)}
	.calendar-head,.year-head{display:grid;grid-template-columns:30px 30px 1fr 30px 30px;align-items:center;margin-bottom:8px}.year-head{grid-template-columns:30px 1fr 30px}.year-head strong{text-align:center;font-size:var(--font-size-support)}.calendar-head button,.year-head button,.calendar-actions button,.back-month{margin:0;padding:0;background:transparent!important;color:var(--muted)!important}.calendar-head button,.year-head button{height:30px;font-size:20px}.calendar-head .year-title{color:var(--text)!important;font-size:var(--font-size-support);font-weight:600;white-space:nowrap}.calendar-head button:hover,.year-head button:hover,.calendar-actions button:hover,.back-month:hover{background:var(--surface-secondary)!important;color:var(--text)!important}
	.weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.weekdays span{padding:5px 0;color:var(--muted);font-size:var(--font-size-support);font-weight:600;text-align:center}.calendar-grid button,.year-grid button{height:31px;margin:0;padding:0;background:transparent!important;color:var(--text)!important;border:1px solid transparent;border-radius:4px;font-size:var(--font-size-body)}.calendar-grid button:hover,.year-grid button:hover{background:var(--surface-secondary)!important;border-color:var(--border)}.calendar-grid button.outside{color:var(--muted)!important;opacity:.55}.calendar-grid button.today{border-color:#1abb9c}.calendar-grid button.selected,.year-grid button.selected{background:#1abb9c!important;color:#fff!important;border-color:#1abb9c}.year-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.back-month{width:100%;margin-top:10px;padding:7px!important;font-size:var(--font-size-support)}.calendar-actions{display:flex;justify-content:space-between;margin-top:10px;padding-top:9px;border-top:1px solid var(--border)}.calendar-actions button{font-size:var(--font-size-body)}.calendar-panel button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}.field-error{display:block;color:var(--danger);font-size:var(--font-size-support);line-height:1.6}
</style>
