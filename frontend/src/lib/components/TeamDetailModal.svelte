<script lang="ts">
 import { onMount } from 'svelte';
 import { apiData } from '$lib/api';
 import type { SessionUser } from '$lib/auth';
 import type { Employee } from '$lib/employees';
 import { localeMessages } from '$lib/locale-messages';
 import { formatEmployeeName, formatTimestamp, localization } from '$lib/localization';
 import type { Team } from '$lib/teams';
 import DetailModal from './DetailModal.svelte';
 import AddButton from './AddButton.svelte';
 import DetailActionButtons from './DetailActionButtons.svelte';
 import EmployeeDetailModal from './EmployeeDetailModal.svelte';
 import MasterList from './MasterList.svelte';
 import SearchSelect from './SearchSelect.svelte';
 import StatusNotice from './StatusNotice.svelte';

 let { team, user, titleId = 'team-detail-title', returnFocus = null, onClose, onEdit, onDelete, onChanged }: { team: Team; user: SessionUser; titleId?: string; returnFocus?: HTMLElement | null; onClose: () => void; onEdit: (trigger: HTMLElement) => void; onDelete: (trigger: HTMLElement) => void; onChanged: () => void } = $props();
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
 let canAdd = $derived(user.capabilities.canAddTeamMembers);
 let canRemove = $derived(user.capabilities.canRemoveTeamMembers);
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
   await memberList?.refresh(); onChanged();
  } catch { message = 'failed'; } finally { busy = false; }
 }
 async function detail(item: Employee, trigger: HTMLElement | null) {
  try {
   const response = await fetch(`/v1/employees/${item.id}`);
   if (!response.ok) { message = 'failed'; return; }
   employeeFocus = trigger; employee = await apiData<Employee>(response);
  } catch { message = 'failed'; }
 }
 onMount(() => { if (canAdd) void loadCandidates(); });
</script>

<div hidden={Boolean(employee)}>
 <DetailModal title={team.name} {titleId} closeLabel={common.cancel} {returnFocus} {onClose}>
  {#snippet headerActions()}<DetailActionButtons editLabel={common.edit} deleteLabel={common.delete} onEdit={user.capabilities.canUpdateTeams ? onEdit : undefined} onDelete={user.capabilities.canDeleteTeams ? onDelete : undefined} />{/snippet}
  <section class="app-detail-section"><h3>{text.information}</h3><dl class="app-detail-grid"><div><dt>{text.name}</dt><dd>{team.name}</dd></div><div class="app-detail-wide"><dt>{text.description}</dt><dd class="app-detail-notes">{team.description || '-'}</dd></div><div><dt>{employeeText.createdAt}</dt><dd>{formatTimestamp(team.createdAt,$localization)}</dd></div><div><dt>{employeeText.updatedAt}</dt><dd>{formatTimestamp(team.updatedAt,$localization)}</dd></div></dl></section>
  {#if message}<StatusNotice message={text[message]} tone={message === 'failed' ? 'error' : 'success'} onDismiss={() => message = ''} />{/if}
  {#if canAdd}<section class="app-detail-section"><h3>{text.addMember}</h3>
   {#if candidateError}<StatusNotice message={text.candidatesFailed} tone="error" onDismiss={() => candidateError = false} /><button class="secondary" type="button" onclick={() => void loadCandidates()}>{text.retry}</button>{:else}<div class="member-picker"><SearchSelect label={text.employee} field="teamMember" value={selectedEmployeeId} options={[{ value: '', label: '-' },...candidateOptions]} disabled={!candidateReady || busy} onSelect={value => selectedEmployeeId = value} /><AddButton label={text.addMember} disabled={!selectedEmployeeId || busy} onclick={() => void change(Number(selectedEmployeeId),true)} /></div>{/if}
  </section>{/if}
  <section class="app-detail-section"><h3>{text.members}</h3>
   <MasterList bind:this={memberList} endpoint={`/v1/teams/${team.id}/members`} title={text.members} listHeading="" description="" initialSortBy="employeeCode" minTableWidth={560} canDetail={true} onDetail={(item,trigger) => void detail(item as Employee,trigger)} columns={[
    { key: 'employeeCode', label: employeeText.employeeCode, width: 22, value: item => item.employeeCode },
    { key: 'lastName', label: employeeText.employee, width: 35, value: item => formatEmployeeName(item as Employee,$localization) },
    { key: 'branch', label: employeeText.branchId, width: 25, value: item => item.branch?.name },
    { key: 'remove', label: '', width: 18, cell: removeAction, sortable: false }
   ]} />
  </section>
 </DetailModal>
</div>
{#snippet removeAction(item: Employee)}{#if canRemove && (user.capabilities.canRemoveTeamMembersGlobally || item.branchId === user.branchId)}<button class="remove-member" type="button" disabled={busy} onclick={() => void change(item.id,false)}>{text.removeMember}</button>{/if}{/snippet}
{#if employee}<EmployeeDetailModal {employee} titleId={titleId === 'team-detail-title' ? 'employee-detail-title' : `${titleId}-employee-detail-title`} returnFocus={employeeFocus} onClose={() => employee = null} onUpdated={updated => { employee = updated; void memberList?.refresh(); onChanged(); }} />{/if}

<style>.member-picker{display:flex;gap:12px;align-items:flex-end}.member-picker :global(.form-select-field){flex:1;min-width:0}.remove-member{border:1px solid var(--danger);border-radius:4px;padding:5px 10px;background:var(--surface);color:var(--danger);font-size:var(--font-size-support)}@media(max-width:700px){.member-picker{align-items:stretch;flex-direction:column}}</style>
