<script lang="ts">
	import { tick } from 'svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import { formSnapshot } from '$lib/modalForm';

	import { localeMessages } from '$lib/locale-messages';
	import { systemSettingError, systemSettingReason } from '$lib/system-setting-errors';
	import { localization } from '$lib/localization';
	let text = $derived(localeMessages[$localization.displayLanguage].systemSettings);
	let common = $derived(localeMessages[$localization.displayLanguage].common);

	type Role = { id: number; name: string; createdAt: string; updatedAt: string };
	type RoleField = 'name';

	let { onNotice = (_message: string) => undefined }: { onNotice?: (message: string) => void } = $props();
	let list = $state<MasterList>();
	let selected = $state<Role | null>(null);
	let name = $state('');
	let errors = $state<Partial<Record<RoleField, string>>>({});
	let formError = $state('');
	let saving = $state(false);
	let dialogElement = $state<HTMLDialogElement>();
	let returnFocus = $state<HTMLElement | null>(null);
	let initialSnapshot = $state('');
	let confirmingDiscard = $state(false);
	let hasUnsavedChanges = $derived(Boolean(selected) && initialSnapshot !== '' && formSnapshot({ name }) !== initialSnapshot);

	let columns = $derived([
		{ key: 'name', label: text.name, width: 90, value: (item: Role) => item.name }
	]);

	function openEdit(item: Role, trigger: HTMLButtonElement | null) {
		returnFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
		selected = item;
		name = item.name;
		errors = {};
		formError = '';
		confirmingDiscard = false;
		initialSnapshot = formSnapshot({ name });
		void tick().then(() => dialogElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());
	}

	function closeImmediately() {
		if (saving) return;
		confirmingDiscard = false;
		selected = null;
		initialSnapshot = '';
		void tick().then(() => returnFocus?.focus());
	}

	function requestClose() {
		if (saving) return;
		if (hasUnsavedChanges) { confirmingDiscard = true; return; }
		closeImmediately();
	}

	function updateName(value: string) {
		name = value;
		if (errors.name) errors = {};
		if (!Object.keys(errors).length) formError = '';
	}

	function validate() {
		const next: Partial<Record<RoleField, string>> = {};
		if (!name.trim()) next.name = text.nameRequired;
		else if (name.trim().length > 128) next.name = text.nameLength;
		errors = next;
		if (!Object.keys(next).length) return true;
		formError = text.correctFields;
		void tick().then(() => dialogElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());
		return false;
	}

	async function save() {
		if (!selected || !validate()) return;
		saving = true;
		formError = '';
		try {
			const response = await fetch(`/v1/roles/${selected.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: name.trim() })
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { code?: string; details?: Array<{ field?: string; reason: string }> } } | null;
				errors = Object.fromEntries((payload?.error?.details ?? []).flatMap((detail) => detail.field === 'name' ? [['name', systemSettingReason(detail.reason, text, 'role')]] : []));
				formError = response.status === 403 ? text.roleForbidden : systemSettingError(payload?.error?.code, response.status, text, 'role', text.roleSaveFailed);
				if (errors.name) void tick().then(() => dialogElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());
				return;
			}
			selected = null;
			initialSnapshot = '';
			onNotice(text.roleSaved);
			await list?.refresh();
			void tick().then(() => returnFocus?.focus());
		} catch {
			formError = text.roleSaveRetry;
		} finally {
			saving = false;
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard || !selected || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); requestClose(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')].filter((item) => item.getClientRects().length);
		const first = focusable[0], last = focusable.at(-1);
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<MasterList bind:this={list} endpoint="/v1/roles" title={text.roles} listHeading={text.roles} description={text.rolesDescription} {columns} canEdit initialSortBy="name" sortStorageKey="system-settings-sort:/v1/roles" pageSizeStorageKey="roles-page-size" minTableWidth={0} actionWidth={10} onEdit={(item, trigger) => openEdit(item as Role, trigger)} emptyLabel={text.noRoles} />

{#if selected}
	<ModalBackdrop onDismiss={requestClose} disabled={saving}>
		<dialog bind:this={dialogElement} class="role-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="role-dialog-title">
			<header><h2 id="role-dialog-title">{text.editRole}</h2><button class="app-modal-close" type="button" aria-label={text.closeRoleDialog} disabled={saving} onclick={requestClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
			<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
				<div class="app-modal-form-body role-form-body">
					{#if formError}<div class="app-modal-error-summary" role="alert"><strong>{text.roleSaveHeading}</strong><span>{formError}</span></div>{/if}
					<FormSection title={text.roleInformation} framed columns={2}>
						<label><span>{text.name} <span class="required" aria-hidden="true">*</span></span><input name="name" value={name} required maxlength="128" class:invalid={Boolean(errors.name)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'role-name-error' : undefined} oninput={(event) => updateName(event.currentTarget.value)} />{#if errors.name}<span class="field-error" id="role-name-error" role="alert">{errors.name}</span>{/if}</label>
					</FormSection>
					<p class="permission-note">{text.permissionNote}</p>
				</div>
				<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestClose}>{common.cancel}</button><button class="app-primary-action" type="submit" disabled={saving}>{saving ? common.saving : common.saveChanges}</button></footer>
			</form>
		</dialog>
	</ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeImmediately} />{/if}
{/if}

<style>
	.role-dialog{width:min(100%,720px)}.role-form-body{grid-template-columns:1fr}.permission-note{margin:0;padding:10px 12px;background:var(--surface-secondary);color:var(--muted);border:1px solid var(--border-light);border-radius:5px;font-size:11.5px;line-height:1.5}
</style>
