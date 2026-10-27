<script lang="ts">
 import ActionButton from '$lib/components/ActionButton.svelte';
 import ModalActionButton from '$lib/components/ModalActionButton.svelte';
 import { operationAccess } from '$lib/operation-access';
 const allowedOperation = operationAccess();
 import { onMount } from 'svelte';
 import { apiData } from '$lib/api';
 import type { SessionUser } from '$lib/auth';
 import type { Employee } from '$lib/employees';
 import { localeMessages } from '$lib/locale-messages';
 import { formatEmployeeName, formatTimestamp, localization } from '$lib/localization';
 import type { Team } from '$lib/teams';
 import DetailModal from './DetailModal.svelte';
 import DetailTabs from '$lib/components/DetailTabs.svelte';
 import AddButton from './AddButton.svelte';
 import DetailActionButtons from './DetailActionButtons.svelte';
 import EmployeeDetailModal from './EmployeeDetailModal.svelte';
 import MasterList from './MasterList.svelte';
 import SearchSelect from './SearchSelect.svelte';
 import StatusNotice from './StatusNotice.svelte';

 let { team, user, editable = false, onChanged }: { team: Team; user: SessionUser; editable?: boolean; onChanged: () => void } = $props();
 const instanceId = $props.id();
 let text = $derived(localeMessages[$localization.displayLanguage].teams);
 let common = $derived(localeMessages[$localization.displayLanguage].common);
 let employeeText = $derived(localeMessages[$localization.displayLanguage].employees);
 let memberList = $state<MasterList>();
 let employee = $state<Employee | null>(null);
 let employeeFocus = $state<HTMLElement | null>(null);
 let candidates = $state<Employee[]>([]);
 let membershipChanges = $state<Record<number, boolean>>({});
 let selectedEmployeeId = $state('');
 let candidateReady = $state(false);
 let candidateError = $state(false);
 let busy = $state(false);
 let message = $state<'memberAdded' | 'memberRemoved' | 'failed' | ''>('');
 let canDelete = $state(false);
 async function refreshDeletePermission() { const response = await fetch(`/v1/teams/${team.id}`); if (response.ok) canDelete = (await apiData<Team>(response)).allowedOperations?.delete ?? false; else canDelete = false; }
 let canAdd = $derived(editable && user.capabilities.canAddTeamMembers);
 let canRemove = $derived(editable && user.capabilities.canRemoveTeamMembers);
 let candidateOptions = $derived(candidates.filter(item => !(membershipChanges[item.id] ?? (item.teamIds ?? []).includes(team.id)) && (user.capabilities.canAddTeamMembersGlobally || item.branchId === user.branchId)).map(item => ({ value: String(item.id), label: `${formatEmployeeName(item, $localization)} (${item.employeeCode})` })));
 async function loadCandidates() {
  candidateReady = false; candidateError = false;
  try {
   const items: Employee[] = [];
   for (let offset = 0; ; offset += 500) {
    const response = await fetch(`/v1/employees?limit=500&offset=${offset}&sortBy=employeeCode`);
    if (!response.ok) throw new Error('Candidates unavailable.');
    const payload = await response.json() as { data: Employee[]; meta: { total: number } };
    items.push(...payload.data);
    if (items.length >= payload.meta.total) break;
    if (!payload.data.length) throw new Error('Incomplete candidates.');
   }
   candidates = items; candidateReady = true;
  } catch { candidateError = true; }
 }
 async function change(employeeId: number, add: boolean) {
  busy = true; message = '';
  try {
   const response = await fetch(`/v1/teams/${team.id}/members/${employeeId}`, { method: add ? 'PUT' : 'DELETE' });
   if (!response.ok) { message = 'failed'; return; }
   membershipChanges = { ...membershipChanges, [employeeId]: add };
   message = add ? 'memberAdded' : 'memberRemoved'; selectedEmployeeId = '';
   await memberList?.refresh(); await refreshDeletePermission(); onChanged();
  } catch { message = 'failed'; } finally { busy = false; }
 }
 async function detail(item: Employee, trigger: HTMLElement | null) {
  try {
   const response = await fetch(`/v1/employees/${item.id}`);
   if (!response.ok) { message = 'failed'; return; }
   employeeFocus = trigger; employee = await apiData<Employee>(response);
  } catch { message = 'failed'; }
 }
 onMount(() => { void refreshDeletePermission(); if (canAdd) void loadCandidates(); });
</script>
{#if message}<StatusNotice message={text[message]} tone={message === 'failed' ? 'error' : 'success'} onDismiss={() => message = ''} />{/if}
  {#if canAdd}<section class="app-detail-section"><h3>{text.addMember}</h3>
   {#if candidateError}<StatusNotice message={text.candidatesFailed} tone="error" onDismiss={() => candidateError = false} /><ModalActionButton class="secondary" type="button" onclick={() => void loadCandidates()} variant="secondary" data-button-scope="button-a5657f9b17">{text.retry}</ModalActionButton>{:else}<div class="member-picker"><SearchSelect label={text.employee} field="teamMember" value={selectedEmployeeId} options={[{ value: '', label: '-' },...candidateOptions]} disabled={!candidateReady || busy} onSelect={value => selectedEmployeeId = value} /><AddButton label={text.addMember} disabled={!selectedEmployeeId || busy} onclick={() => void change(Number(selectedEmployeeId),true)} /></div>{/if}
  </section>{/if}
  <section class="app-detail-section"><h3>{text.members}</h3>
   <MasterList mobileItem={mobileMember} bind:this={memberList} endpoint={`/v1/teams/${team.id}/members`} title={text.members} listHeading="" description="" initialSortBy="employeeCode" minTableWidth={560} canDetail={true} onDetail={(item,trigger) => void detail(item as Employee,trigger)} columns={[
    { key: 'employeeCode', label: employeeText.employeeCode, width: 22, value: item => item.employeeCode },
    { key: 'lastName', label: employeeText.employee, width: 35, value: item => formatEmployeeName(item as Employee,$localization) },
    { key: 'branch', label: employeeText.branchId, width: 25, value: item => item.branch?.name },
    { key: 'remove', label: '', width: 18, cell: removeAction, sortable: false }
   ]} />
  </section>
{#snippet removeAction(item: Employee)}{#if canRemove && (user.capabilities.canRemoveTeamMembersGlobally || item.branchId === user.branchId)}<ActionButton class="remove-member" type="button" disabled={busy} onclick={() => void change(item.id,false)} variant="danger" data-button-scope="button-a5657f9b17">{text.removeMember}</ActionButton>{/if}{/snippet}
{#snippet mobileMember(item: Employee)}<div class="mobile-member"><strong>{formatEmployeeName(item,$localization)}</strong><span>{item.employeeCode} · {item.branch?.name ?? '-'}</span>{@render removeAction(item)}</div>{/snippet}
{#if employee}<EmployeeDetailModal {employee} titleId={`team-member-${instanceId}-employee-detail-title`} returnFocus={employeeFocus} onClose={() => employee = null} onUpdated={updated => { employee = updated; void memberList?.refresh(); onChanged(); }} />{/if}

<style>.mobile-member{display:flex;min-width:0;flex-direction:column;gap:4px;overflow-wrap:anywhere}.mobile-member span{font-size:var(--font-size-support);color:var(--text-secondary)}.mobile-member :global(.remove-member[data-button-scope="button-a5657f9b17"]){align-self:flex-start;min-height:44px}.member-picker{display:flex;gap:12px;align-items:flex-end}.member-picker :global(.form-select-field){flex:1;min-width:0}:global(.remove-member[data-button-scope="button-a5657f9b17"]){border:1px solid var(--danger);border-radius:4px;padding:5px 10px;background:var(--surface);color:var(--danger);font-size:var(--font-size-support)}@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.member-picker{align-items:stretch;flex-direction:column}}</style>
