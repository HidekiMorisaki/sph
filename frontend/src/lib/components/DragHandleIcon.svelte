<script lang="ts">
 let { size = 20, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<svg class={`${className} drag-handle-icon`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" focusable="false">
 <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
 <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
 <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
</svg>

<style>svg{display:block;flex:none}</style>
