<script lang="ts">
 import { onMount, tick, untrack } from 'svelte';
 import { apiData } from '$lib/api';
 import type { SessionUser } from '$lib/auth';
 import type { Team } from '$lib/teams';
 import { localeMessages } from '$lib/locale-messages';
 import { localization } from '$lib/localization';
 import DetailModal from './DetailModal.svelte';
 import StatusNotice from './StatusNotice.svelte';
 import TeamDetailModal from './TeamDetailModal.svelte';
 import TeamFormModal from './TeamFormModal.svelte';

 let { teamId, returnFocus, onClose, onChanged }: { teamId: number; returnFocus: HTMLElement; onClose: () => void; onChanged: () => void } = $props();
 const modalId = $props.id();
 const origin = untrack(() => returnFocus);
 let text = $derived(localeMessages[$localization.displayLanguage].teams);
 let common = $derived(localeMessages[$localization.displayLanguage].common);
 let team = $state<Team | null>(null);
 let user = $state<SessionUser | null>(null);
 let failed = $state(false);
 let editing = $state(false);
 let deleting = $state(false);
 let busy = $state(false);
 let actionFocus = $state<HTMLElement | null>(null);

 function close() {
  const target = origin;
  onClose();
  void tick().then(() => target.focus({ preventScroll: true }));
 }

 onMount(() => { void (async () => {
  try {
   const [teamResponse, sessionResponse] = await Promise.all([fetch(`/v1/teams/${teamId}`), fetch('/v1/auth/session')]);
   if (!teamResponse.ok || !sessionResponse.ok) throw new Error('Unable to load team.');
   team = await apiData<Team>(teamResponse);
   user = (await apiData<{ user: SessionUser }>(sessionResponse)).user;
  } catch { failed = true; }
 })(); });

 async function remove() {
  busy = true; failed = false;
  try {
   const response = await fetch(`/v1/teams/${teamId}`, { method: 'DELETE' });
   if (!response.ok) throw new Error('Unable to delete team.');
   onChanged(); close();
  } catch { failed = true; } finally { busy = false; }
 }
</script>

{#if team && user}
 <div hidden={editing || deleting} inert={editing || deleting}>
  <TeamDetailModal {team} {user} returnFocus={origin} titleId={`${modalId}-team-detail-title`} onClose={close} onEdit={trigger => { actionFocus = trigger; editing = true; }} onDelete={trigger => { actionFocus = trigger; failed = false; deleting = true; }} {onChanged} />
 </div>
 {#if editing}<TeamFormModal {team} returnFocus={actionFocus} onClose={() => editing = false} onSaved={saved => { team = saved; onChanged(); }} />{/if}
 {#if deleting}<DetailModal title={text.deleteTitle} titleId={`${modalId}-team-delete-title`} closeLabel={common.cancel} returnFocus={actionFocus} onClose={() => { if (!busy) deleting = false; }}>
  <p>{text.deleteHelp}</p>
  {#if failed}<StatusNotice message={text.failed} tone="error" onDismiss={() => failed = false} />{/if}
  {#snippet actions()}<button class="secondary" type="button" disabled={busy} onclick={() => { deleting = false; void tick().then(() => actionFocus?.focus({ preventScroll: true })); }}>{common.cancel}</button><button class="app-danger-action" type="button" disabled={busy} onclick={() => void remove()}>{common.delete}</button>{/snippet}
 </DetailModal>{/if}
{:else}
 <DetailModal title={text.information} titleId={`${modalId}-team-loading-title`} closeLabel={common.cancel} returnFocus={origin} onClose={close}>
  {#if failed}<StatusNotice message={text.failed} tone="error" onDismiss={close} />{:else}<p role="status">{common.loading}</p>{/if}
 </DetailModal>
{/if}
