// The browser-only distribution and its notices are vendored under static/vendor.
type DecodeResult = { codeResult?: { code?: string | null }; barcodes?: DecodeResult[] };
type Quagga = { decodeSingle: (options: Record<string, unknown>, callback: (result: DecodeResult | DecodeResult[] | null) => void) => unknown };
let loading: Promise<Quagga> | undefined;
let decoding: Promise<unknown> = Promise.resolve();

export function isbnFromBarcode(value: string | null | undefined): string | null {
	if (!value || !/^(978|979)\d{10}$/.test(value)) return null;
	const sum = [...value].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
	return sum % 10 === 0 ? value : null;
}

export function loadIsbnDecoder(): Promise<Quagga> {
	if (loading) return loading;
	loading = new Promise<Quagga>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = '/vendor/quagga2-1.12.1/quagga.min.js';
		script.async = true;
		script.onload = () => {
			const quagga = (window as Window & { Quagga?: Quagga }).Quagga;
			if (quagga) resolve(quagga);
			else { script.remove(); reject(new Error('Decoder unavailable')); }
		};
		script.onerror = () => { script.remove(); reject(new Error('Decoder unavailable')); };
		document.head.append(script);
	}).catch(error => { loading = undefined; throw error; });
	return loading;
}

// Quagga keeps internal state: serialize frames even across close/reopen cycles.
export async function decodeIsbnFrame(decoder: Quagga, source: string): Promise<string | null> {
	const result = decoding.catch(() => {}).then(() => new Promise<string | null>((resolve, reject) => {
		try {
			const pending = decoder.decodeSingle({ src: source, numOfWorkers: 0, locate: true,
				inputStream: { size: 1280 }, locator: { halfSample: false, patchSize: 'medium' },
				decoder: { readers: ['ean_reader'], multiple: true } }, result => {
				const results = Array.isArray(result) ? result : [result, ...(result?.barcodes ?? [])];
				const codes = results.map(item => isbnFromBarcode(item?.codeResult?.code));
				resolve(codes.find(code => code !== null) ?? null);
			});
			// Newer browser distributions also return a promise; handle load failures.
			if (pending && typeof (pending as Promise<unknown>).catch === 'function') void (pending as Promise<unknown>).catch(reject);
		} catch (error) { reject(error); }
	}));
	decoding = result;
	return result;
}
