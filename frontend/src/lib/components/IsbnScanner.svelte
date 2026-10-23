<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { localization } from '$lib/localization';
	import { decodeIsbnFrame, loadIsbnDecoder } from '$lib/isbn-scanner';
	import SearchSelect from '$lib/components/SearchSelect.svelte';

	let { onRead, onClose }: { onRead: (isbn: string) => void; onClose: () => void } = $props();
	let video: HTMLVideoElement;
	let closeButton: HTMLButtonElement;
	let stream: MediaStream | undefined;
	let request = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	let phase = $state<'starting' | 'reading' | 'error'>('starting');
	let error = $state<'https' | 'unsupported' | 'permission' | 'missing' | 'busy' | 'failed' | 'interrupted'>('failed');
	let devices = $state<Array<{ value: string; label: string }>>([]);
	let selectedDevice = $state('');
	let previous = '';
	let matches = 0;
	const id = $props.id();
	const messages = {
		ja: { title: 'ISBNバーコードを読み取る', camera: 'カメラ', cameraNumber: 'カメラ', close: '読み取りを閉じる', starting: 'カメラを準備しています…', reading: '本のISBNバーコード全体を映してください。明るい場所で、反射を避けて少しずつ距離を調整してください。', privacy: '映像はこの端末内だけで処理され、送信・保存されません。', retry: '再試行', https: 'この接続ではカメラを利用できません。HTTPSでアクセスするか、ISBNを手入力してください。', unsupported: 'このブラウザーではカメラを利用できません。別のブラウザーを使うか、ISBNを手入力してください。', permission: 'カメラの使用が許可されていません。ブラウザーの設定で許可して再試行するか、ISBNを手入力してください。', missing: '利用できるカメラが見つかりません。カメラを接続するか、ISBNを手入力してください。', busy: 'カメラを開始できません。他のアプリでのカメラ使用を終了して再試行するか、ISBNを手入力してください。', failed: '読み取りを開始できませんでした。再試行するか、ISBNを手入力してください。', interrupted: '読み取りを停止しました。再試行するか、ISBNを手入力してください。' },
		en: { title: 'Scan ISBN barcode', camera: 'Camera', cameraNumber: 'Camera', close: 'Close scanner', starting: 'Starting camera…', reading: 'Show the entire ISBN barcode. Use good lighting, avoid glare and slowly adjust the distance.', privacy: 'Video is processed only on this device. It is not uploaded or saved.', retry: 'Retry', https: 'Camera access requires HTTPS. Open a secure connection or enter the ISBN manually.', unsupported: 'Camera access is unavailable in this browser. Use another browser or enter the ISBN manually.', permission: 'Camera permission was not granted. Allow it in your browser settings and retry, or enter the ISBN manually.', missing: 'No camera is available. Connect a camera or enter the ISBN manually.', busy: 'Unable to start the camera. Close other apps using it and retry, or enter the ISBN manually.', failed: 'Unable to start scanning. Retry or enter the ISBN manually.', interrupted: 'Scanning stopped. Retry or enter the ISBN manually.' }
	};
	let text = $derived(messages[$localization.displayLanguage]);

	function stop() {
		request++;
		clearTimeout(timer);
		stream?.getTracks().forEach(track => track.stop());
		stream = undefined;
		if (video) { video.pause(); video.srcObject = null; }
		previous = ''; matches = 0;
	}
	function fail(reason: typeof error) { stop(); error = reason; phase = 'error'; }
	async function start(device = '') {
		stop();
		const current = request;
		phase = 'starting';
		if (!window.isSecureContext) { fail('https'); return; }
		if (!navigator.mediaDevices?.getUserMedia) { fail('unsupported'); return; }
		try {
			const decoder = await loadIsbnDecoder();
			if (disposed || current !== request) return;
			const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
				...(device ? { deviceId: { exact: device } } : { facingMode: { ideal: 'environment' } }),
				width: { ideal: 1280 }, height: { ideal: 720 }
			} });
			// A permission prompt may resolve after the scanner was closed.
			if (disposed || current !== request) { media.getTracks().forEach(track => track.stop()); return; }
			stream = media;
			media.getVideoTracks().forEach(track => track.addEventListener('ended', () => { if (!disposed && current === request) fail('interrupted'); }, { once: true }));
			video.srcObject = media;
			await video.play();
			if (disposed || current !== request) return;
			selectedDevice = media.getVideoTracks()[0]?.getSettings().deviceId ?? '';
			try {
				const available = await navigator.mediaDevices.enumerateDevices();
				if (disposed || current !== request) return;
				devices = available.filter(item => item.kind === 'videoinput' && item.deviceId).map((item, index) => ({ value: item.deviceId, label: item.label || `${text.cameraNumber} ${index + 1}` }));
			} catch { /* Reading still works when camera enumeration is unavailable. */ }
			phase = 'reading';
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d', { willReadFrequently: true });
			if (!context) throw new Error('Canvas unavailable');
			const scan = async () => {
				if (disposed || current !== request) return;
				try {
					if (video.readyState >= 2 && video.videoWidth > 0) {
						canvas.width = Math.min(1280, video.videoWidth);
						canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
						context.drawImage(video, 0, 0, canvas.width, canvas.height);
						const isbn = await decodeIsbnFrame(decoder, canvas.toDataURL('image/jpeg', 0.9));
						if (disposed || current !== request) return;
						if (isbn) { matches = isbn === previous ? matches + 1 : 1; previous = isbn; }
						else { previous = ''; matches = 0; }
						if (isbn && matches >= 2) { stop(); onRead(isbn); return; }
					}
					timer = setTimeout(() => void scan(), 250);
				} catch { if (!disposed && current === request) fail('failed'); }
			};
			void scan();
		} catch (cause) {
			if (disposed || current !== request) return;
			const name = cause instanceof Error ? cause.name : '';
			fail(name === 'NotAllowedError' || name === 'SecurityError' ? 'permission' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : name === 'NotReadableError' ? 'busy' : 'failed');
		}
	}
	function close() { stop(); onClose(); }
	function suspend() { if (document.hidden && phase !== 'error') fail('interrupted'); }
	onMount(() => {
		void tick().then(() => closeButton?.focus());
		void start();
		document.addEventListener('visibilitychange', suspend);
		return () => { disposed = true; stop(); document.removeEventListener('visibilitychange', suspend); };
	});
</script>

<section class="isbn-scanner" aria-labelledby={`${id}-title`}>
	<header><h3 id={`${id}-title`}>{text.title}</h3><button bind:this={closeButton} type="button" class="scan-close" onclick={close}>{text.close}</button></header>
	{#if devices.length > 1 && phase !== 'starting'}<SearchSelect label={text.camera} field={`${id}-camera`} value={selectedDevice} options={devices} onSelect={value => void start(value)} />{/if}
	<video bind:this={video} muted playsinline autoplay aria-label={text.title} hidden={phase !== 'reading'}></video>
	<p role={phase === 'error' ? 'alert' : 'status'}>{phase === 'error' ? text[error] : phase === 'starting' ? text.starting : text.reading}</p>
	{#if phase === 'error' && !['https', 'unsupported'].includes(error)}<button type="button" class="scan-retry" onclick={() => void start(selectedDevice)}>{text.retry}</button>{/if}
	<p class="privacy">{text.privacy}</p>
</section>

<style>
	.isbn-scanner{grid-column:1/-1;display:grid;min-width:0;gap:12px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:6px}
	header{display:flex;align-items:center;justify-content:space-between;gap:12px}h3{margin:0;font-size:var(--font-size-subsection)}
	video{width:100%;max-height:min(300px,35dvh);object-fit:contain;background:#111;border-radius:4px}video[hidden]{display:none}
	p{margin:0;overflow-wrap:anywhere;color:var(--text-secondary);font-size:var(--font-size-support)}.privacy{color:var(--muted)}
	button{justify-self:start;min-height:44px;padding:8px 12px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font:inherit;cursor:pointer}.scan-close{flex:none}
	button:hover{background:var(--surface-hover,var(--surface-secondary))}button:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
	@media(max-width:480px){header{align-items:start;flex-direction:column}}
</style>
