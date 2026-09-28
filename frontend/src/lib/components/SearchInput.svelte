<script lang="ts">
	let {
		label,
		value = '',
		placeholder = 'Search...',
		disabled = false,
		onValueChange
	}: {
		label: string;
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		onValueChange: (value: string) => void;
	} = $props();
</script>

<label class="search-box">
	<span class="sr-only">{label}</span>
	<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
	<input type="search" {value} {placeholder} {disabled} oninput={(event) => onValueChange(event.currentTarget.value)} />
</label>

<style>
	.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
	.search-box{position:relative;display:block;width:220px}
	.search-box svg{position:absolute;top:50%;left:9px;width:14px;height:14px;color:var(--muted);pointer-events:none;transform:translateY(-50%)}
	.search-box input{width:100%;height:32px;padding:0 10px 0 32px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:13px;outline:none}
	.search-box input:focus{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14)}
	.search-box input::placeholder{color:#c0c7cf}
	:global(html[data-theme='dark']) .search-box input::placeholder{color:#5a6473}
	.search-box input:disabled{cursor:not-allowed;opacity:.7}
	@media(max-width:700px){.search-box{width:100%}}
</style>
