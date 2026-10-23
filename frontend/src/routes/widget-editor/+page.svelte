<script lang="ts">
 import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
 import WidgetEditor from '$lib/components/widgets/WidgetEditor.svelte';
 import {localization} from '$lib/localization';
</script>
<AssetManagementShell title={$localization.displayLanguage==='ja'?'ウィジェット開発':'Widget development'}>
 <WidgetEditor />
</AssetManagementShell>
