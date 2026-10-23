import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: { rollupOptions: { output: { banner: '/*! Third-party notices: /licenses/THIRD_PARTY_NOTICES.txt and /licenses/jspdf-SPH-NOTICES.txt */' } } },
	server: {
		watch: { usePolling: true, interval: 1000 }
	}
});
