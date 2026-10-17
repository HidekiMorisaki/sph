<script lang="ts">
	let {
		label,
		variant = 'primary',
		size = 'default',
		type = 'button',
		disabled = false,
		ariaLabel,
		form,
		onclick
	}: {
		label: string;
		variant?: 'primary' | 'secondary' | 'danger';
		size?: 'default' | 'field';
		type?: 'button' | 'submit';
		disabled?: boolean;
		ariaLabel?: string;
		form?: string;
		onclick?: (event: MouseEvent) => void;
	} = $props();

	const variantClass = {
		primary: 'app-primary-action',
		secondary: 'secondary',
		danger: 'app-danger-action'
	};
</script>

<button class={`app-modal-action app-modal-action--${size} ${variantClass[variant]}`.trim()} {type} {disabled} aria-label={ariaLabel} {form} {onclick}>
	{label}
</button>

<style>
	.app-modal-action{display:inline-flex;align-items:center;justify-content:center;justify-self:start;line-height:1}
	.app-modal-action.secondary{height:32px;min-height:32px;padding:0 12px;border:1px solid var(--border);border-radius:4px;background:var(--surface)!important;color:var(--text-secondary)!important;font-family:inherit;font-size:var(--font-size-body);font-weight:500;box-shadow:var(--shadow)}
	.app-modal-action.app-modal-action--field{height:36px;min-height:36px}
	.app-modal-action:disabled{cursor:not-allowed;opacity:.65}
</style>
