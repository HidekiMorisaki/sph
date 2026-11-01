<script lang="ts">
 import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
 import WidgetEditor from '$lib/components/widgets/WidgetEditor.svelte';
 import {localization} from '$lib/localization';
 import {localeMessages} from '$lib/locale-messages';
</script>
<AssetManagementShell title={localeMessages[$localization.displayLanguage].navigation.items.widgets}>
 <WidgetEditor />
</AssetManagementShell>
