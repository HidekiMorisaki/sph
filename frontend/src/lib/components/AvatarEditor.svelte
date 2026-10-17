<script lang="ts">
	import { tick } from 'svelte';
	import { apiData } from '$lib/api';
	import { avatarImage, setAvatar } from '$lib/avatar';
	import ModalActionButton from '$lib/components/ModalActionButton.svelte';

	let { text }: { text: {
		avatar: string; avatarHint: string; avatarChoose: string; avatarRemove: string; avatarZoom: string;
		avatarHorizontal: string; avatarVertical: string; avatarCrop: string; avatarCancel: string;
		avatarSaving: string; avatarSaved: string; avatarRemoved: string; avatarInvalid: string;
		avatarTooLarge: string; avatarFailed: string; avatarRemoveFailed: string;
	} } = $props();
	let input: HTMLInputElement;
	let dialog: HTMLDialogElement;
	let preview: HTMLCanvasElement;
	let source: HTMLImageElement | null = null;
	let sourceUrl: string | null = null;
	let zoom = $state(1);
	let horizontal = $state(50);
	let vertical = $state(50);
	let saving = $state(false);
	let message = $state('');
	let error = $state(false);
	let pointerStart: { x: number; y: number; horizontal: number; vertical: number } | null = null;
	const clamp = (value: number) => Math.max(0, Math.min(100, value));

	function draw(canvas: HTMLCanvasElement) {
		if (!source) return;
		const context = canvas.getContext('2d');
		if (!context) return;
		const size = Math.min(source.naturalWidth, source.naturalHeight) / zoom;
		const left = (source.naturalWidth - size) * horizontal / 100;
		const top = (source.naturalHeight - size) * vertical / 100;
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.imageSmoothingQuality = 'high';
		context.drawImage(source, left, top, size, size, 0, 0, canvas.width, canvas.height);
	}

	$effect(() => {
		void zoom; void horizontal; void vertical;
		if (preview) draw(preview);
	});

	function close() { dialog.close(); }
	function cleanup() {
		if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		sourceUrl = null;
		source = null;
		pointerStart = null;
	}

	async function selectFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		input.value = '';
		if (!file) return;
		message = '';
		error = false;
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { message = text.avatarInvalid; error = true; return; }
		if (file.size > 5_000_000) { message = text.avatarTooLarge; error = true; return; }
		cleanup();
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = async () => {
			if (sourceUrl !== url) return;
			if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 25_000_000) {
				cleanup(); message = text.avatarInvalid; error = true; return;
			}
			source = image;
			zoom = 1; horizontal = 50; vertical = 50;
			dialog.showModal();
			await tick();
			draw(preview);
		};
		image.onerror = () => { if (sourceUrl === url) { cleanup(); message = text.avatarInvalid; error = true; } };
		sourceUrl = url;
		image.src = url;
	}

	function pointerDown(event: PointerEvent) {
		if (saving) return;
		pointerStart = { x: event.clientX, y: event.clientY, horizontal, vertical };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}
	function pointerMove(event: PointerEvent) {
		if (!pointerStart) return;
		horizontal = clamp(pointerStart.horizontal - (event.clientX - pointerStart.x) * 100 / 280);
		vertical = clamp(pointerStart.vertical - (event.clientY - pointerStart.y) * 100 / 280);
	}
	function pointerEnd() { pointerStart = null; }
	function moveWithKeyboard(event: KeyboardEvent) {
		const step = event.shiftKey ? 10 : 2;
		if (event.key === 'ArrowLeft') horizontal = clamp(horizontal - step);
		else if (event.key === 'ArrowRight') horizontal = clamp(horizontal + step);
		else if (event.key === 'ArrowUp') vertical = clamp(vertical - step);
		else if (event.key === 'ArrowDown') vertical = clamp(vertical + step);
		else return;
		event.preventDefault();
	}

	async function save() {
		if (!source || saving) return;
		saving = true;
		try {
			const canvas = document.createElement('canvas');
			canvas.width = 256; canvas.height = 256;
			draw(canvas);
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
			if (!blob) throw new Error('Unable to crop image.');
			const form = new FormData();
			form.set('image', blob, 'avatar.png');
			const response = await fetch('/v1/employees/me/avatar', { method: 'PUT', body: form });
			if (!response.ok) throw new Error('Unable to save avatar.');
			const result = await apiData<{ image: string }>(response);
			setAvatar(result.image);
			close();
			message = text.avatarSaved;
			error = false;
		} catch {
			message = text.avatarFailed;
			error = true;
		} finally { saving = false; }
	}

	async function remove() {
		if (saving) return;
		saving = true;
		try {
			const response = await fetch('/v1/employees/me/avatar', { method: 'DELETE' });
			if (!response.ok) throw new Error('Unable to remove avatar.');
			setAvatar(null);
			message = text.avatarRemoved;
			error = false;
		} catch {
			message = text.avatarRemoveFailed;
			error = true;
		} finally { saving = false; }
	}
</script>

<div class="avatar-setting">
	<div class="avatar-current">{#if $avatarImage}<img src={$avatarImage} alt="" />{:else}<svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><circle cx="16" cy="11" r="6"/><path d="M4 29c0-6.6 5.4-12 12-12s12 5.4 12 12H4z"/></svg>{/if}</div>
	<div class="avatar-actions">
		<strong>{text.avatar}</strong>
		<p>{text.avatarHint}</p>
		<div class="buttons">
			<button type="button" class="app-primary-action" onclick={() => input.click()} disabled={saving}>{text.avatarChoose}</button>
			{#if $avatarImage}<button type="button" class="remove" onclick={remove} disabled={saving}>{text.avatarRemove}</button>{/if}
		</div>
		{#if message}<p class:error role="status">{message}</p>{/if}
	</div>
	<input bind:this={input} class="file-input" type="file" accept="image/jpeg,image/png,image/webp" onchange={selectFile} tabindex="-1" aria-hidden="true" />
</div>

<dialog bind:this={dialog} onclose={cleanup} aria-label={text.avatarCrop}>
	<div class="editor">
		<h3>{text.avatarCrop}</h3>
		<div class="preview-wrap"><canvas bind:this={preview} width="280" height="280" tabindex="0" aria-label={text.avatarCrop} onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={pointerEnd} onpointercancel={pointerEnd} onkeydown={moveWithKeyboard}></canvas></div>
		<label>{text.avatarZoom}<input type="range" min="1" max="3" step="0.01" bind:value={zoom} /></label>
		<label>{text.avatarHorizontal}<input type="range" min="0" max="100" step="1" bind:value={horizontal} /></label>
		<label>{text.avatarVertical}<input type="range" min="0" max="100" step="1" bind:value={vertical} /></label>
		<div class="dialog-actions"><ModalActionButton label={text.avatarCancel} variant="secondary" onclick={close} disabled={saving} /><ModalActionButton label={saving ? text.avatarSaving : text.avatarCrop} type="button" onclick={save} disabled={saving} /></div>
	</div>
</dialog>

<style>
	.avatar-setting{display:flex;align-items:center;gap:18px;margin:18px 0 24px;padding:16px;border:1px solid var(--border);border-radius:6px;background:var(--surface-secondary)}
	.avatar-current{display:grid;place-items:center;width:72px;height:72px;flex:none;overflow:hidden;border-radius:50%;background:var(--primary);color:#fff;font-size:26px}
	.avatar-current img{width:100%;height:100%;object-fit:cover}
	.avatar-actions{min-width:0}.avatar-actions strong{font-size:var(--font-size-body)}.avatar-actions p{margin:4px 0 10px;color:var(--text-secondary);font-size:var(--font-size-support)}
	.avatar-actions p.error{color:var(--danger,#c53030)}.buttons{display:flex;flex-wrap:wrap;gap:8px}.remove{padding:8px 14px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);cursor:pointer}.remove{color:var(--danger,#c53030)}
	.file-input{display:none}
	dialog{max-width:calc(100vw - 24px);padding:0;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);box-shadow:var(--shadow)}dialog::backdrop{background:#0009}.editor{display:grid;gap:12px;width:min(360px,calc(100vw - 48px));padding:20px}.editor h3{margin:0;font-size:var(--font-size-section,18px)}.preview-wrap{position:relative;width:280px;height:280px;max-width:100%;margin:auto;border-radius:50%;overflow:hidden}.preview-wrap canvas{display:block;width:100%;height:100%;touch-action:none;cursor:move}.preview-wrap canvas:focus-visible{outline:3px solid var(--primary);outline-offset:-4px}.editor label{display:grid;gap:4px;font-size:var(--font-size-support)}.editor input[type=range]{width:100%;accent-color:var(--primary)}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
	@media(max-width:560px){.avatar-setting{align-items:flex-start;gap:12px;padding:12px}.avatar-current{width:56px;height:56px}.editor{padding:16px}}
</style>
