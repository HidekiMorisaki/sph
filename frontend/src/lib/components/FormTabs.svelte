<script lang="ts">
	import { stickyTabBackdrop } from '$lib/sticky-tab-backdrop';
	import { onMount, tick, type Snippet } from 'svelte';
	import PageTabs from './PageTabs.svelte';
	import { modalTabs, initialEditorTab, type ModalTabKind } from '$lib/modal-tabs';
	import { localization } from '$lib/localization';
	import { formTabsSize } from '$lib/form-tabs-size';
	let { label, children, kind = 'basic', formId, formPanels = ['basic'] }: { label: string; children: Snippet; kind?: ModalTabKind; formId?: string; formPanels?: string[] } = $props();
	const instanceId = $props.id();
	const prefix = `form-${instanceId}`;
	let host: HTMLDivElement;
	let panels: HTMLDivElement;
	let tabs = $state<Array<{ id: string; label: string }>>([]);
	let active = $state(initialEditorTab());
	let sections: HTMLElement[] = [];
	let synchronize: (() => void) | undefined;
	$effect(() => { kind; $localization.displayLanguage; synchronize?.(); });
	function apply() {
		for (const [index, section] of sections.entries()) {
			const id = section.dataset.formPanel ?? 'basic';
			section.id = `${prefix}-${id}`;
			section.setAttribute('role', 'tabpanel');
			section.setAttribute('aria-labelledby', `${prefix}-${id}-tab`);
			section.hidden = id !== active;
			section.inert = id !== active;
		}
	}
	$effect(() => { active; apply(); });
	onMount(() => {
		let disposed = false;
		let lastErrors = '';
		let invalidTarget: HTMLElement | null = null;
		function reveal(target: HTMLElement) {
			const index = sections.findIndex(section => section.contains(target));
			if (index < 0) return;
			active = sections[index].dataset.formPanel ?? 'basic';
			apply();
			void tick().then(() => {
				if (disposed || !target.isConnected) return;
				const control = target.matches('input:not([type=hidden]),button,select,textarea') ? target
					: target.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]),button:not([disabled]),select,textarea');
				control?.focus();
			});
		}
		function sync() {
			sections = [...panels.querySelectorAll<HTMLElement>('[data-form-panel]')]
				.filter(section => section.closest('[data-form-tabs-root]') === host);
			const next = modalTabs(kind, $localization.displayLanguage).filter(tab => sections.some(section => section.dataset.formPanel === tab.id));
			if (JSON.stringify(next) !== JSON.stringify(tabs)) tabs = next;
			if (!next.some(tab => tab.id === active)) active = next[0]?.id ?? '';
			apply();
			if (formId) for (const section of sections.filter(section => formPanels.includes(section.dataset.formPanel ?? ''))) {
				for (const control of section.querySelectorAll<HTMLElement>('input,select,textarea,button')) {
					if (!control.closest('form') && control.getAttribute('form') !== formId) control.setAttribute('form', formId);
				}
			}
			const errors = [...panels.querySelectorAll<HTMLElement>('[aria-invalid="true"],.invalid')];
			const signature = errors.map(element => `${element.getAttribute('name') ?? element.id}:${element.getAttribute('aria-describedby') ?? ''}`).join('|');
			if (signature && signature !== lastErrors && errors[0]) reveal(errors[0]);
			lastErrors = signature;
		}
		function invalid(event: Event) {
			event.preventDefault();
			if (invalidTarget || !(event.target instanceof HTMLElement)) return;
			invalidTarget = event.target;
			reveal(invalidTarget);
			void tick().then(() => { invalidTarget = null; });
		}
		function submitted() {
			lastErrors = '';
			void tick().then(() => { if (!disposed) sync(); });
		}
		synchronize = sync;
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(panels, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-invalid', 'aria-describedby'] });
		host.addEventListener('invalid', invalid, true);
		const form = formId ? document.getElementById(formId) : host.closest('form');
		form?.addEventListener('submit', submitted, true);
		return () => { disposed = true; observer.disconnect(); host.removeEventListener('invalid', invalid, true); form?.removeEventListener('submit', submitted, true); };
	});
</script>

<div class="form-tabs" data-form-tabs-root data-active={active} bind:this={host} use:formTabsSize>
	<div class="form-tabs-card" use:stickyTabBackdrop><PageTabs {tabs} bind:active {label} idPrefix={prefix} /></div>
	<div class="form-tabs-panels" bind:this={panels}>{@render children()}</div>
</div>

<style>
	.form-tabs{display:grid;gap:var(--sph-space-16px);min-width:0;grid-column:1/-1}
	.form-tabs-card{position:sticky;top:0;z-index:3;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--sph-radius-6px)}
	.form-tabs-card::before{content:"";position:absolute;top:calc(-1px - var(--sticky-tab-backdrop-height,24px));left:-25px;right:-25px;height:var(--sticky-tab-backdrop-height,24px);background:var(--bg);pointer-events:none}
	.form-tabs-card :global(.page-tabs){margin:0;border:0;border-radius:var(--sph-radius-6px)}
	.form-tabs-panels{display:grid;gap:var(--sph-space-16px);min-width:0;position:relative}
	.form-tabs-panels > :global([data-form-panel]){display:grid;gap:var(--sph-space-16px);min-width:0}
	.form-tabs-panels > :global([data-form-panel][hidden]){display:none!important}
	.form-tabs:global([data-measuring]) .form-tabs-panels > :global([data-form-panel]){display:grid!important;position:absolute;inset:0 0 auto;visibility:hidden}
	@media(max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.form-tabs-card::before{left:-17px;right:-17px}}
</style>
