<script lang="ts">
	import { localization } from '$lib/localization';
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { tick } from 'svelte';

	let commonText = $derived(localeMessages[$localization.displayLanguage].common);

	export type MultiSelectOption = { value: string; label: string; searchTerms?: string[] };
	let { label, field, values, options, onChange, onOpen, required = false, disabled = false, error = '', searchPlaceholder, emptyText, placeholder = '-' }: {
		label: string; field: string; values: string[]; options: MultiSelectOption[]; onChange: (values: string[]) => void; onOpen?: () => void; required?: boolean; disabled?: boolean; error?: string; searchPlaceholder?: string; emptyText?: string; placeholder?: string;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let above = $state(false);
	let active = $state(0);
	let trigger = $state<HTMLButtonElement>();
	let input = $state<HTMLInputElement>();
	let root = $state<HTMLDivElement>();
	let normalizedQuery = $derived(query.trim().toLocaleLowerCase());
	let filtered = $derived(options.filter((option) => !normalizedQuery || [option.label, ...(option.searchTerms ?? [])].some((term) => term.toLocaleLowerCase().includes(normalizedQuery))));
	let selected = $derived(values.flatMap((value) => { const option = options.find((candidate) => candidate.value === value); return option ? [option] : []; }));

	function close(focus = false) { open = false; query = ''; active = 0; if (focus) void tick().then(() => trigger?.focus()); }
	async function show(initial = '') {
		if (disabled) return;
		onOpen?.();
		const rect = trigger?.getBoundingClientRect();
		const scrollBody = trigger?.closest('.app-modal-form-body');
		const bounds = scrollBody?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
		const spaceBelow = rect ? bounds.bottom - rect.bottom : 0;
		const spaceAbove = rect ? rect.top - bounds.top : 0;
		above = Boolean(rect && spaceBelow < 244 && spaceAbove > spaceBelow);
		query = initial; active = 0; open = true; await tick(); input?.focus();
	}
	function toggle(option: MultiSelectOption) {
		onChange(values.includes(option.value) ? values.filter((value) => value !== option.value) : [...values, option.value]);
		void tick().then(() => input?.focus());
	}
	function moveActive(next: number) { active = Math.max(0, Math.min(next, filtered.length - 1)); void tick().then(() => root?.querySelectorAll<HTMLElement>('[role="option"]')[active]?.scrollIntoView({ block: 'nearest' })); }
	function triggerKeydown(event: KeyboardEvent) {
		if (disabled) return;
		if (event.key === 'Escape' && open) { event.preventDefault(); close(true); return; }
		if (event.key === 'Tab' && open) { close(); return; }
		if (open) return;
		if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); void show(); return; }
		if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); void show(event.key); }
	}
	function listKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
		if (event.key === 'Tab') { close(); return; }
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
			event.preventDefault(); moveActive(event.key === 'Home' ? 0 : event.key === 'End' ? filtered.length - 1 : event.key === 'ArrowDown' ? active + 1 : active - 1);
		} else if ((event.key === 'Enter' || event.key === ' ') && filtered[active]) { event.preventDefault(); toggle(filtered[active]); }
	}
	function blur(event: FocusEvent) { if (open && !(event.relatedTarget instanceof Node && root?.contains(event.relatedTarget))) close(); }
</script>

<div bind:this={root} class="form-multi-select-field" onfocusout={blur}>
	<span id={`${field}-label`}>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span>
	<div class="form-multi-select-picker" class:above data-field={field}>
		<button bind:this={trigger} type="button" role="combobox" class="form-multi-select-trigger" class:unselected={!selected.length} class:invalid={Boolean(error)} {disabled} aria-labelledby={`${field}-label`} aria-haspopup="listbox" aria-controls={`${field}-options`} aria-expanded={open} aria-required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${field}-error` : undefined} onclick={() => open ? close(true) : void show()} onkeydown={triggerKeydown}><span>{selected.length ? selected.map((option) => option.label).join(', ') : placeholder}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg></button>
		{#if open}<div class="form-multi-select-options"><input bind:this={input} class="form-multi-select-search" type="search" value={query} aria-label={formatLocaleTemplate(commonText.searchLabel, label)} aria-controls={`${field}-options`} aria-activedescendant={filtered[active] ? `${field}-option-${active}` : undefined} placeholder={searchPlaceholder ?? commonText.search} oninput={(event) => { query = event.currentTarget.value; active = 0; }} onkeydown={listKeydown} />{#if selected.length}<div class="selected-values" aria-label={formatLocaleTemplate(commonText.selectedLabel, label)}>{#each selected as option}<span>{option.label}<button type="button" aria-label={formatLocaleTemplate(commonText.removeOption, option.label)} disabled={disabled} onpointerdown={(event) => event.preventDefault()} onclick={() => toggle(option)}>×</button></span>{/each}</div>{/if}<div id={`${field}-options`} class="option-list" role="listbox" aria-label={label} aria-multiselectable="true">{#each filtered as option, index}<button id={`${field}-option-${index}`} type="button" role="option" tabindex="-1" class:active={active === index} class:selected={values.includes(option.value)} aria-selected={values.includes(option.value)} onpointerdown={(event) => event.preventDefault()} onclick={() => toggle(option)} onmouseenter={() => active = index}>{option.label}</button>{:else}<p class="form-multi-select-empty">{emptyText ?? commonText.noOptions}</p>{/each}</div></div>{/if}
	</div>
	{#if error}<small id={`${field}-error`} class="field-error" role="alert">{error}</small>{/if}
</div>

<style>
	.form-multi-select-field{display:grid;gap:6px;min-width:0;color:var(--text);font-size:12px;font-weight:500}.form-multi-select-picker{position:relative;min-width:0}.required,.field-error{color:var(--danger,#d63939)}.field-error{display:block;font-size:11px;line-height:1.35}
	.form-multi-select-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:36px;margin:0;padding:0 12px;background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);border-radius:4px;text-align:left;font-size:13px;font-weight:400}.form-multi-select-trigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.form-multi-select-trigger.unselected{color:#c0c7cf!important}:global(html[data-theme='dark']) .form-multi-select-trigger.unselected{color:#5a6473!important}.form-multi-select-trigger:focus-visible,.form-multi-select-trigger[aria-expanded='true']{border-color:#1abb9c;outline:0;box-shadow:0 0 0 3px rgba(26,187,156,.14)}.form-multi-select-trigger.invalid{border-color:var(--danger,#d63939)}.form-multi-select-trigger:disabled{cursor:not-allowed;opacity:.7}.form-multi-select-trigger svg{flex:none;width:10px;height:6px;fill:none;stroke:#9ba5b1;stroke-width:1.5}.form-multi-select-trigger[aria-expanded='true'] svg{transform:rotate(180deg)}
	.form-multi-select-options{position:absolute;top:calc(100% + 4px);left:0;z-index:30;width:100%;padding:3px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:0 8px 18px rgba(15,23,42,.18)}.form-multi-select-picker.above .form-multi-select-options{top:auto;bottom:calc(100% + 4px)}.form-multi-select-search{display:block;width:100%;height:30px;margin:0 0 3px;padding:0 8px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:12px;outline:none}.form-multi-select-search:focus{border-color:#1abb9c;box-shadow:0 0 0 2px rgba(26,187,156,.14)}.option-list{max-height:164px;overflow-y:auto}.option-list button{display:block;width:100%;min-height:28px;margin:0;padding:5px 7px;background:transparent!important;color:var(--text)!important;border:0;border-radius:3px;text-align:left;font-size:12px;line-height:18px}.option-list button:hover,.option-list button:focus-visible,.option-list button.active{background:var(--surface-secondary)!important;outline:0}.option-list button.selected{background:#1abb9c!important;color:#fff!important}.form-multi-select-empty{margin:6px;color:var(--muted);font-size:12px;font-weight:400}
	.selected-values{display:flex;min-width:0;align-items:center;gap:4px;margin:0 0 3px;padding:3px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}.selected-values>span{display:inline-flex;flex:none;align-items:center;gap:4px;min-height:22px;padding:2px 5px 2px 8px;background:rgba(26,187,156,.12);color:#169f85;border:1px solid rgba(26,187,156,.28);border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap}.selected-values button{display:grid;width:16px;height:16px;margin:0;padding:0;place-items:center;background:transparent!important;color:inherit!important;border:0;border-radius:50%;font-size:14px;line-height:1}.selected-values button:hover,.selected-values button:focus-visible{background:rgba(26,187,156,.16)!important;outline:0}
</style>
