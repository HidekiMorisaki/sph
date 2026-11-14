<script lang="ts">import {page} from '$app/state';import ProjectWorkspace from '#lib/components/projects/ProjectWorkspace.svelte';</script>
{#key page.params.id}<ProjectWorkspace view="tickets"/>{/key}
