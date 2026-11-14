<script lang="ts">
 import AssetManagementShell from '#lib/components/AssetManagementShell.svelte';
 import WidgetEditor from '#lib/components/widgets/WidgetEditor.svelte';
 import {localization} from '#lib/localization.js';
 import {localeMessages} from '#lib/locale-messages.js';
</script>
<AssetManagementShell title={localeMessages[$localization.displayLanguage].navigation.items.widgets}>
 <WidgetEditor />
</AssetManagementShell>
