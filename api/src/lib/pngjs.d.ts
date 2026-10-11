declare module 'pngjs' {
	export class PNG {
		constructor(options: { width: number; height: number });
		width: number;
		height: number;
		data: Buffer;
		static sync: {
			read(data: Buffer): PNG;
			write(image: PNG): Buffer;
		};
	}
}
