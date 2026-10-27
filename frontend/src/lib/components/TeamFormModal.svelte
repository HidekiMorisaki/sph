<script lang="ts">
 import ModalActionButton from '$lib/components/ModalActionButton.svelte';
 import TeamMembersSection from './TeamMembersSection.svelte';
 import type { SessionUser } from '$lib/auth';
 import FormTabs from '$lib/components/FormTabs.svelte';
 import { tick, untrack } from 'svelte';
 import { apiData } from '$lib/api';
 import { localeMessages } from '$lib/locale-messages';
 import { localization } from '$lib/localization';
 import type { Team } from '$lib/teams';
 import DetailModal from './DetailModal.svelte';
 import DiscardChangesDialog from './DiscardChangesDialog.svelte';
 import FormSection from './FormSection.svelte';
 import StatusNotice from './StatusNotice.svelte';

 let { team = null, user = null, onDelete, deleteError = '', returnFocus = null, onClose, onSaved }: { team?: Team | null; user?: SessionUser | null; onDelete?: (trigger: HTMLElement) => void; deleteError?: string; returnFocus?: HTMLElement | null; onClose: () => void; onSaved: (team: Team) => void | Promise<void> } = $props();
 let text = $derived(localeMessages[$localization.displayLanguage].teams);
 let common = $derived(localeMessages[$localization.displayLanguage].common);
 let name = $state(untrack(() => team?.name ?? ''));
 let description = $state(untrack(() => team?.description ?? ''));
 let initial = $state(untrack(() => JSON.stringify([team?.name ?? '', team?.description ?? ''])));
 let dirty = $derived(JSON.stringify([name,description]) !== initial);
 let saving = $state(false);
 let discard = $state(false);
 let savedNotice = $state(false);
 let formElement = $state<HTMLFormElement>();
 $effect(() => { if (dirty) savedNotice = false; });
 let error = $state<'failed' | 'nameConflict' | 'invalidName' | ''>('');
 function focusField(field: 'teamName') { void tick().then(() => document.querySelector<HTMLInputElement>(`#team-form [name=${field}]`)?.focus()); }
 function closeNow() { onClose(); void tick().then(() => returnFocus?.focus({ preventScroll: true })); }
 function close() { if (saving) return; if (dirty) discard = true; else closeNow(); }
 async function save(event: SubmitEvent) {
  event.preventDefault(); error = ''; savedNotice = false;
  if (!name.trim()) { error = 'invalidName'; focusField('teamName'); return; }
  saving = true;
  try {
   const response = await fetch(team ? `/v1/teams/${team.id}` : '/v1/teams', { method: team ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, description }) });
   if (!response.ok) { const body = await response.json().catch(() => null); error = body?.error?.code === 'TEAM_NAME_CONFLICT' ? 'nameConflict' : 'failed'; if (error === 'nameConflict') focusField('teamName'); return; }
   const saved = await apiData<Team>(response);
   name = saved.name; description = saved.description ?? '';
   initial = JSON.stringify([name,description]);
   await onSaved(saved);
   if (team) {
    savedNotice = true;
    void tick().then(() => {
     formElement?.closest('.app-detail-body')?.scrollTo({ top: 0 });
     formElement?.querySelector<HTMLElement>('.status-notice-close')?.focus({ preventScroll: true });
    });
   } else {
    onClose();
    void tick().then(() => returnFocus?.focus({ preventScroll: true }));
   }
  } catch { error = 'failed'; } finally { saving = false; }
 }
</script>

<DetailModal title={team ? text.edit : text.add} titleId="team-form-title" closeLabel={common.cancel} {returnFocus} initialFocusSelector="[name=teamName]" onClose={close}>
 {#if deleteError}<StatusNotice message={deleteError} tone="error" onDismiss={()=>deleteError=''} />{/if}<form bind:this={formElement} id="team-form" class="team-form app-modal-form app-modal-form--stacked" novalidate onsubmit={save}>
  {#if savedNotice}<StatusNotice message={text.saved} tone="success" onDismiss={() => savedNotice = false} />{/if}
  {#if error}<StatusNotice message={text[error]} tone="error" onDismiss={() => error = ''} />{/if}
<FormTabs label={text.information} kind="team"><div data-form-panel="basic">
  <FormSection title={text.information} framed columns={2}>
   <label class="wide"><span>{text.name} <span class="required">*</span></span><input name="teamName" bind:value={name} placeholder={text.nameExample} maxlength="128" required disabled={saving} class:invalid={error === 'invalidName' || error === 'nameConflict'} aria-invalid={error === 'invalidName' || error === 'nameConflict'} aria-describedby={error === 'invalidName' || error === 'nameConflict' ? 'team-name-error' : undefined} />{#if error === 'invalidName' || error === 'nameConflict'}<small id="team-name-error">{text[error]}</small>{/if}</label>
</FormSection><FormSection title={text.description} framed>   <label class="wide"><span>{text.description}</span><textarea name="teamDescription" bind:value={description} placeholder={text.descriptionExample} maxlength="5000" disabled={saving}></textarea></label>
  </FormSection>
</div><div data-form-panel="members">{#if team && user}<p>{common.relatedSaveNotice}</p><TeamMembersSection {team} {user} editable onChanged={() => { void (async () => { const response=await fetch(`/v1/teams/${team!.id}`); if(response.ok)await onSaved(await apiData<Team>(response)); })(); }}/>{:else}<p>{common.relatedAfterCreate}</p>{/if}</div></FormTabs>
 </form>
 {#snippet actions()}{#if onDelete && team?.allowedOperations?.delete}<ModalActionButton class="app-danger-action editor-delete" type="button" disabled={saving} onclick={event=>onDelete?.(event.currentTarget)} variant="danger" data-button-scope="button-8adf269538">{common.delete}</ModalActionButton>{/if}<ModalActionButton class="secondary" type="button" disabled={saving} onclick={close} variant="secondary" data-button-scope="button-8adf269538">{common.cancel}</ModalActionButton><ModalActionButton class="app-primary-action" form="team-form" type="submit" disabled={saving || (team ? !user?.capabilities.canUpdateTeams : !user?.capabilities.canCreateTeams) || (Boolean(team) && !dirty)} variant="primary" data-button-scope="button-8adf269538">{saving ? common.saving : team ? common.saveChanges : text.add}</ModalActionButton>{/snippet}
</DetailModal>
{#if discard}<DiscardChangesDialog onContinue={() => discard = false} onDiscard={closeNow} />{/if}

<style>.wide{grid-column:1/-1}.team-form small{font-size:var(--font-size-support);color:var(--muted)}</style>
