<script lang="ts">
	let { title, titleId }: {
		title: string;
		titleId?: string;
	} = $props();
</script>

<h1 class="sr-only" id={titleId}>{title}</h1>

<style>
	.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
