<script lang="ts">
 import type { SessionUser } from '#lib/auth.js';
 import type { Team } from '#lib/teams.js';
 import { localeMessages } from '#lib/locale-messages.js';
 import { formatTimestamp, localization } from '#lib/localization.js';
 import DetailModal from './DetailModal.svelte';
 import DetailTabs from './DetailTabs.svelte';
 import DetailActionButtons from './DetailActionButtons.svelte';
 import TeamMembersSection from './TeamMembersSection.svelte';
 let {team,user,titleId='team-detail-title',returnFocus=null,onClose,onEdit,onDelete,onChanged}:{team:Team;user:SessionUser;titleId?:string;returnFocus?:HTMLElement|null;onClose:()=>void;onEdit:(trigger:HTMLElement)=>void;onDelete:(trigger:HTMLElement)=>void;onChanged:()=>void}=$props();
 let text=$derived(localeMessages[$localization.displayLanguage].teams),common=$derived(localeMessages[$localization.displayLanguage].common),employeeText=$derived(localeMessages[$localization.displayLanguage].employees);
</script>
{#snippet teamInformation()}<section class="app-detail-section"><h3>{text.information}</h3><dl class="app-detail-grid"><div><dt>{text.name}</dt><dd>{team.name}</dd></div><div class="app-detail-wide"><dt>{text.description}</dt><dd class="app-detail-notes">{team.description || '-'}</dd></div><div><dt>{employeeText.createdAt}</dt><dd>{formatTimestamp(team.createdAt,$localization)}</dd></div><div><dt>{employeeText.updatedAt}</dt><dd>{formatTimestamp(team.updatedAt,$localization)}</dd></div></dl></section>
  {/snippet}

{#snippet members()}<TeamMembersSection {team} {user} {onChanged}/>{/snippet}
<DetailModal title={team.name} {titleId} closeLabel={common.cancel} {returnFocus} {onClose}>
 {#snippet headerActions()}<DetailActionButtons editing={false} editLabel={common.edit} deleteLabel={common.delete} onEdit={user.capabilities.canUpdateTeams || user.capabilities.canAddTeamMembers || user.capabilities.canRemoveTeamMembers || team.allowedOperations?.delete ? onEdit : undefined}/>{/snippet}
 <DetailTabs kind="team" label={team.name} tabs={[{id:'basic',label:text.information,content:teamInformation},{id:'members',label:text.members,content:members}]}/>
</DetailModal>
