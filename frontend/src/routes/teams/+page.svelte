<script lang="ts">
 import { onMount, tick } from 'svelte';
 import { page } from '$app/state';
 import { apiData } from '$lib/api';
 import type { SessionUser } from '$lib/auth';
 import type { Team } from '$lib/teams';
 import { localeMessages } from '$lib/locale-messages';
 import { localization } from '$lib/localization';
 import AddButton from '$lib/components/AddButton.svelte';
 import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
 import DetailModal from '$lib/components/DetailModal.svelte';
 import MasterList from '$lib/components/MasterList.svelte';
 import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
 import StatusNotice from '$lib/components/StatusNotice.svelte';
 import TeamDetailModal from '$lib/components/TeamDetailModal.svelte';
 import TeamFormModal from '$lib/components/TeamFormModal.svelte';
 import ViewportListPage from '$lib/components/ViewportListPage.svelte';

 let text = $derived(localeMessages[$localization.displayLanguage].teams);
 let common = $derived(localeMessages[$localization.displayLanguage].common);
 let user = $state<SessionUser | null>(null);
 let list = $state<MasterList>();
 let selected = $state<Team | null>(null);
 let editing = $state<Team | null>(null);
 let formOpen = $state(false);
 let deleting = $state(false);
 let busy = $state(false);
 let returnFocus = $state<HTMLElement | null>(null);
 let formReturnFocus = $state<HTMLElement | null>(null);
 let deleteReturnFocus = $state<HTMLElement | null>(null);
 let message = $state<'saved' | 'removed' | 'failed' | ''>('');
 let loadedQueryTeam = $state('');
 $effect(() => {
  const id = page.url.searchParams.get('team') ?? '';
  if (!user?.id || id === loadedQueryTeam) return;
  loadedQueryTeam = id;
  if (/^[1-9]\d*$/.test(id)) void open({ id: Number(id) } as Team,null);
 });
 async function open(item: Team, trigger: HTMLElement | null) {
  try { const response = await fetch(`/v1/teams/${item.id}`); if (!response.ok) throw new Error(); selected = await apiData<Team>(response); returnFocus = trigger; } catch { message = 'failed'; }
 }
 function closeDetail() { selected = null; void tick().then(() => returnFocus?.focus({ preventScroll: true })); }
 async function saved(item: Team) {
  if (editing) { selected = item; editing = item; message = ''; }
  else message = 'saved';
  await list?.refresh();
 }
 async function remove() {
  if (!selected) return; busy = true;
  try { const response = await fetch(`/v1/teams/${selected.id}`, { method: 'DELETE' }); if (!response.ok) { message = 'failed'; deleting = false; return; } deleting = false; selected = null; message = 'removed'; await list?.refresh(); void tick().then(() => returnFocus?.focus()); } catch { message = 'failed'; deleting = false; } finally { busy = false; }
 }
 onMount(() => { void (async () => {
  try {
   const response = await fetch('/v1/auth/session'); if (!response.ok) throw new Error(); user = (await apiData<{ user: SessionUser }>(response)).user;
  } catch { message = 'failed'; }
 })(); });
</script>

{#snippet listActions()}{#if user?.capabilities.canCreateTeams}<AddButton label={text.add} onclick={event => { formReturnFocus = event.currentTarget as HTMLElement; editing = null; formOpen = true; }} />{/if}{/snippet}
<AssetManagementShell title={text.title}>
 <ViewportListPage>
  <MasterPageHeader title={text.title} />
  {#if message}<StatusNotice message={text[message]} tone={message === 'failed' ? 'error' : 'success'} onDismiss={() => message = ''} />{/if}
  <MasterList bind:this={list} mobileItem={mobileTeam} endpoint="/v1/teams" title={text.title} listHeading={text.title} headerActions={listActions} description={text.introduction} initialSortBy="name" minTableWidth={680} canDetail={true} onDetail={(item,trigger) => void open(item as Team,trigger)} columns={[
   { key: 'name', label: text.name, width: 40, value: item => item.name },
   { key: 'description', label: text.description, width: 45, value: item => item.description },
   { key: 'memberCount', label: text.memberCount, width: 15, align: 'center', value: item => item.memberCount }
  ]} />
 </ViewportListPage>
</AssetManagementShell>
{#snippet mobileTeam(item: Team)}<div class="mobile-team"><strong>{item.name}</strong><span>{text.memberCount}: {item.memberCount}</span>{#if item.description}<p>{item.description}</p>{/if}</div>{/snippet}
{#if selected && user}{#key selected.id}<div hidden={formOpen || deleting}><TeamDetailModal team={selected} {user} {returnFocus} onClose={closeDetail} onEdit={trigger => { formReturnFocus = trigger; editing = selected; formOpen = true; }} onDelete={trigger => { deleteReturnFocus = trigger; deleting = true; }} onChanged={() => void list?.refresh()} /></div>{/key}{/if}
{#if formOpen}<TeamFormModal team={editing} returnFocus={formReturnFocus} onClose={() => formOpen = false} onSaved={saved} />{/if}
{#if deleting && selected}<DetailModal title={text.deleteTitle} titleId="team-delete-title" closeLabel={common.cancel} returnFocus={deleteReturnFocus} onClose={() => { if (!busy) deleting = false; }}><p>{text.deleteHelp}</p>{#snippet actions()}<button class="secondary" type="button" disabled={busy} onclick={() => { deleting = false; void tick().then(() => deleteReturnFocus?.focus()); }}>{common.cancel}</button><button class="app-danger-action" type="button" disabled={busy} onclick={() => void remove()}>{common.delete}</button>{/snippet}</DetailModal>{/if}
<style>.mobile-team{display:flex;min-width:0;flex-direction:column;gap:3px;overflow-wrap:anywhere}.mobile-team span,.mobile-team p{margin:0;color:var(--text-secondary);font-size:var(--font-size-support)}.mobile-team p{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden}</style>
