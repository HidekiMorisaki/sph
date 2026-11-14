<script lang="ts">
	import { localization } from '#lib/localization.js';
	import { localeMessages, formatLocaleTemplate } from '#lib/locale-messages.js';
	import {searchMessages} from '#lib/search.js';
	import { tick, type Snippet } from 'svelte';
	import InfoPopover from './InfoPopover.svelte';

	let commonText = $derived(localeMessages[$localization.displayLanguage].common);

	type Option = { value: string; label: string; searchTerms?: string[] };
	let { label, field, showLabel=true, name, value, options, onSelect, onOpen, required = false, disabled = false, error = '', searchPlaceholder, emptyText, searchable = true, help }: {
		label: string; field: string; showLabel?: boolean; name?: string; value: string; options: Option[]; onSelect: (value: string) => void; onOpen?: () => void; required?: boolean; disabled?: boolean; error?: string; searchPlaceholder?: string; emptyText?: string; searchable?: boolean; help?: Snippet;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let active = $state(0);
	let panelStyle = $state('');
	let trigger = $state<HTMLButtonElement>();
	let input = $state<HTMLInputElement>();
	let root = $state<HTMLDivElement>();
	let panel = $state<HTMLDivElement>();
	let searchPlaceholderLabel=$derived(root?.closest('.search-panel')?searchMessages[$localization.displayLanguage].notSpecified:'-');
	const optionLabel=(option:Option)=>option.value===''&&option.label==='-'?searchPlaceholderLabel:option.label;
	let normalizedQuery = $derived(query.trim().toLocaleLowerCase());
	let filtered = $derived(options.filter((option) => !normalizedQuery || [option.label, ...(option.searchTerms ?? [])].some((term) => term.toLocaleLowerCase().includes(normalizedQuery))));
	let selected = $derived(options.find((option) => option.value === value));
	let unselected = $derived(value === '' && (!selected || selected.label === '-'));

	function close(focus = false) {
		if (panel?.matches(':popover-open')) panel.hidePopover();
		open = false; query = ''; active = 0;
		if (focus) void tick().then(() => trigger?.focus());
	}
	function positionPanel() {
		if (!panel || !trigger) return;
		const rect = trigger.getBoundingClientRect();
		const gap = 4;
		const edge = 8;
		const width = Math.min(rect.width, window.innerWidth - edge * 2);
		const height = panel.offsetHeight;
		const spaceBelow = window.innerHeight - edge - rect.bottom;
		const spaceAbove = rect.top - edge;
		const openAbove = spaceBelow < height && spaceAbove > spaceBelow;
		const top = openAbove ? Math.max(edge, rect.top - gap - height) : Math.min(window.innerHeight - edge - height, rect.bottom + gap);
		const left = Math.max(edge, Math.min(rect.left, window.innerWidth - edge - width));
		panelStyle = `position:fixed;top:${Math.max(edge, top)}px;left:${left}px;right:auto;bottom:auto;width:${width}px;margin:0;visibility:visible`;
	}
	async function show(initial = '') {
		if (disabled) return;
		onOpen?.();
		query = initial; active = 0; panelStyle = 'position:fixed;top:0;left:0;right:auto;bottom:auto;margin:0;visibility:hidden'; open = true;
		await tick();
		panel?.showPopover();
		positionPanel();
		await tick(); if (searchable) input?.focus();
	}
	function choose(option: Option) { onSelect(option.value); close(true); }
	function moveActive(next: number) { active = Math.max(0, Math.min(next, filtered.length - 1)); void tick().then(() => root?.querySelectorAll<HTMLElement>('[role="option"]')[active]?.scrollIntoView({ block: 'nearest' })); }
	function triggerKeydown(event: KeyboardEvent) {
		if (disabled) return;
		if (event.key === 'Escape' && open) { event.preventDefault(); close(true); return; }
		if (event.key === 'Tab' && open) { close(); return; }
		if (open) { if (!searchable) listKeydown(event); return; }
		if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); void show(); return; }
		if (searchable && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); void show(event.key); }
	}
	function listKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
		if (event.key === 'Tab') { close(); return; }
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
			event.preventDefault(); moveActive(event.key === 'Home' ? 0 : event.key === 'End' ? filtered.length - 1 : event.key === 'ArrowDown' ? active + 1 : active - 1);
		} else if (event.key === 'Enter' && filtered[active]) { event.preventDefault(); choose(filtered[active]); }
	}
	function blur(event: FocusEvent) { if (open && !(event.relatedTarget instanceof Node && root?.contains(event.relatedTarget))) close(); }
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

<div bind:this={root} class="form-select-field" data-empty={value === ''} onfocusout={blur}>
	{#if help}<div class="form-select-label" class:visually-hidden={!showLabel}><span class:visually-hidden={!showLabel} id={`${field}-label`}>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span><InfoPopover {label}>{@render help()}</InfoPopover></div>{:else}<span class:visually-hidden={!showLabel} id={`${field}-label`}>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span>{/if}
	<div class="form-select-picker" data-field={field}>
		<button bind:this={trigger} {name} type="button" role="combobox" class="form-select-trigger" class:unselected class:invalid={Boolean(error)} {disabled} aria-labelledby={`${field}-label`} aria-haspopup="listbox" aria-controls={`${field}-options`} aria-expanded={open} aria-required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${field}-error` : undefined} onclick={() => open ? close(true) : void show()} onkeydown={triggerKeydown}><span>{selected ? optionLabel(selected) : searchPlaceholderLabel}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg></button>
		{#if open}<div bind:this={panel} class="form-select-options" popover="manual" style={panelStyle}>{#if searchable}<input bind:this={input} class="form-select-search" type="search" value={query} aria-label={formatLocaleTemplate(commonText.searchLabel, label)} aria-controls={`${field}-options`} aria-activedescendant={filtered[active] ? `${field}-option-${active}` : undefined} placeholder={searchPlaceholder ?? commonText.search} oninput={(event) => { query = event.currentTarget.value; active = 0; }} onkeydown={listKeydown} />{/if}<div id={`${field}-options`} class="option-list" role="listbox" aria-label={label}>{#each filtered as option, index}<button id={`${field}-option-${index}`} type="button" role="option" tabindex="-1" class:active={active === index} class:selected={value === option.value} aria-selected={value === option.value} onpointerdown={(event) => event.preventDefault()} onclick={() => choose(option)} onmouseenter={() => active = index} onkeydown={listKeydown}>{optionLabel(option)}</button>{:else}<p class="form-select-empty">{emptyText ?? commonText.noOptions}</p>{/each}</div></div>{/if}
	</div>
	{#if error}<small id={`${field}-error`} class="field-error" role="alert">{error}</small>{/if}
</div>

<style>
	.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.form-select-label{display:flex;align-items:center;gap:var(--sph-space-6px);min-width:0}
	.form-select-field{display:grid;align-content:start;gap:var(--sph-space-6px);min-width:0;color:var(--text);font-size:var(--font-size-support);font-weight:var(--sph-weight-500)}.form-select-picker{position:relative;min-width:0}.required,.field-error{color:var(--danger,var(--sph-color-danger))}.field-error{display:block;font-size:var(--font-size-support);line-height:var(--sph-leading-1-6)}
	.form-select-trigger{display:flex;align-items:center;justify-content:space-between;gap:var(--sph-space-8px);width:100%;height:36px;margin:0;padding:0 var(--sph-space-12px);background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);border-radius:var(--sph-radius-4px);text-align:left;font-size:var(--font-size-body);font-weight:var(--sph-weight-400);transition:border-color 150ms,box-shadow 150ms}.form-select-trigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.form-select-trigger.unselected{color:var(--sph-color-placeholder-light)!important}:global(html[data-theme='dark']) .form-select-trigger.unselected{color:var(--sph-color-placeholder-dark)!important}.form-select-trigger:hover:not(:focus):not(:disabled){border-color:var(--muted)}.form-select-trigger:focus-visible,.form-select-trigger[aria-expanded='true']{border-color:var(--sph-color-accent);outline:0;box-shadow:var(--sph-shadow-focus)}.form-select-trigger.invalid,.form-select-trigger.invalid:hover{border-color:var(--danger,var(--sph-color-danger))}.form-select-trigger.invalid:focus-visible{box-shadow:var(--sph-shadow-focus-invalid)}.form-select-trigger:disabled{cursor:not-allowed;opacity:.7}.form-select-trigger svg{flex:none;width:10px;height:6px;fill:none;stroke:var(--sph-color-input-muted);stroke-width:1.5}.form-select-trigger[aria-expanded='true'] svg{transform:rotate(180deg)}
	.form-select-options{z-index:1400;max-height:calc(100dvh - 16px);padding:var(--sph-space-3px);overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:var(--sph-radius-6px);box-shadow:var(--sph-shadow-select)}.form-select-search{display:block;width:100%;height:30px;margin:0 0 var(--sph-space-3px);padding:0 var(--sph-space-8px);background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--sph-radius-4px);font-size:var(--font-size-body);outline:none}.form-select-search::placeholder{color:var(--sph-color-placeholder-light)}:global(html[data-theme='dark']) .form-select-search::placeholder{color:var(--sph-color-placeholder-dark)}.form-select-search:focus{border-color:var(--sph-color-accent);box-shadow:var(--sph-shadow-focus-small)}.option-list{max-height:164px;overflow-y:auto}.option-list button{display:block;width:100%;min-height:32px;margin:0;padding:var(--sph-space-5px) var(--sph-space-7px);background:transparent!important;color:var(--text)!important;border:0;border-radius:var(--sph-radius-3px);text-align:left;font-size:var(--font-size-body);line-height:var(--sph-leading-1-4)}.option-list button:hover,.option-list button:focus-visible,.option-list button.active{background:var(--surface-secondary)!important;outline:0}.option-list button:hover{background:var(--surface-hover,var(--surface-secondary))!important;outline:0}.option-list button.selected{background:var(--sph-color-accent)!important;color:var(--sph-color-on-emphasis)!important}.form-select-empty{margin:var(--sph-space-6px);color:var(--muted);font-size:var(--font-size-support);font-weight:var(--sph-weight-400)}
</style>
