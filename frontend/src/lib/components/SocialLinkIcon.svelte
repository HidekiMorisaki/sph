<script lang="ts">
	import type { SocialLinkPlatform } from '$lib/employees';

	let { platform, size = 20 }: { platform: SocialLinkPlatform; size?: number } = $props();
</script>

<svg class="social-link-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	{#if platform === 'github'}
		<path d="M15 21v-3.7c.1-1-.3-1.8-.8-2.3 2.7-.3 5.5-1.3 5.5-6A4.7 4.7 0 0 0 18.5 6a4.4 4.4 0 0 0-.1-3s-1-.3-3.3 1.2a11.4 11.4 0 0 0-6 0C6.8 2.7 5.8 3 5.8 3a4.4 4.4 0 0 0-.1 3A4.7 4.7 0 0 0 4.5 9c0 4.7 2.8 5.7 5.5 6-.4.4-.7 1-.8 1.7-.8.4-2.9 1.1-4.2-1.2M9 21v-4"/>
	{:else if platform === 'linkedin'}
		<path d="M6 9v10M6 5.5v.1M10.5 19V9m0 4.3c0-2.3 1.4-4.3 3.8-4.3 2.8 0 3.7 1.8 3.7 4.8V19"/><circle cx="6" cy="5.5" r="1" fill="currentColor" stroke="none"/>
	{:else if platform === 'x'}
		<path d="M5 4l14 16M19 4L5 20"/>
	{:else if platform === 'threads'}
		<circle cx="12" cy="12" r="9"/><path d="M16.5 8.5c-1-1-2.5-1.5-4.2-1.5-3.4 0-5.3 2.2-5.3 5.2 0 3 1.7 4.8 4.4 4.8 2.4 0 3.9-1.3 3.9-3.2 0-1.7-1.4-2.7-3.2-2.7-1.3 0-2.2.6-2.2 1.6 0 .9.7 1.5 1.6 1.5 1.7 0 2.7-1.5 2.7-3.8 0-2.1-.6-3.7-1.8-4.7"/>
	{:else if platform === 'bluesky'}
		<path d="M12 12C9.8 8.2 6.2 4.5 3.5 4.5c-1.4 0-1.8 1.2-1.5 2.7.4 2.2 2.6 4.6 5.5 5.5-2.8-.2-4.6 1.2-4.6 3.2 0 1.8 1.4 3.1 3.1 3.1 2.5 0 4.6-2.2 6-5.1 1.4 2.9 3.5 5.1 6 5.1 1.7 0 3.1-1.3 3.1-3.1 0-2-1.8-3.4-4.6-3.2 2.9-.9 5.1-3.3 5.5-5.5.3-1.5-.1-2.7-1.5-2.7-2.7 0-6.3 3.7-8.5 7.5z"/>
	{:else if platform === 'mastodon'}
		<path d="M4 17V9c0-3.2 1.6-5 4.5-5h7C18.4 4 20 5.8 20 9v8c-2.2 1.4-4.8 2-8 2-4.5 0-8-1.4-8-5.5"/><path d="M7.5 14V9.5c0-1 .6-1.5 1.5-1.5s1.5.5 1.5 1.5V13m3 0V9.5c0-1 .6-1.5 1.5-1.5s1.5.5 1.5 1.5V14M4.5 16c2 1.2 4.5 1.7 7.5 1.7"/>
	{:else if platform === 'facebook'}
		<path d="M14.5 21v-8h3l.5-3h-3.5V8.2c0-.9.3-1.7 1.8-1.7H18V3.8c-.6-.1-1.3-.2-2.2-.2-2.7 0-4.3 1.6-4.3 4.5V10H9v3h2.5v8"/>
	{:else if platform === 'instagram'}
		<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
	{:else if platform === 'youtube'}
		<path d="M21 12c0 2-.2 3.4-.5 4.2a2.7 2.7 0 0 1-1.7 1.7c-1.5.4-6.8.4-6.8.4s-5.3 0-6.8-.4a2.7 2.7 0 0 1-1.7-1.7C3.2 15.4 3 14 3 12s.2-3.4.5-4.2a2.7 2.7 0 0 1 1.7-1.7C6.7 5.7 12 5.7 12 5.7s5.3 0 6.8.4a2.7 2.7 0 0 1 1.7 1.7c.3.8.5 2.2.5 4.2z"/><path d="M10.2 9.5l4.7 2.5-4.7 2.5z"/>
	{:else if platform === 'qiita'}
		<circle cx="11.5" cy="11.5" r="7.5"/><path d="M15.5 15.5L20 20M8.5 9.5h6M8.5 12h6"/>
	{:else if platform === 'note'}
		<path d="M6 19V7h4v2c1-1.5 2.4-2.3 4.2-2.3 2.6 0 3.8 1.6 3.8 4.7V19h-4v-6.8c0-1.4-.5-2.1-1.7-2.1-1.5 0-2.3 1-2.3 3V19z"/>
	{/if}
</svg>

<style>
	.social-link-icon{display:block;flex:none}
</style>
