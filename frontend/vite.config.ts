import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

// Append after minification so license links survive the client/worker build.
// Appending leaves all existing source-map line/column positions unchanged.
function licenseNotice(banner: string): Plugin {
	return { name: 'sph-original-license-notices', apply: 'build', enforce: 'post', augmentChunkHash: () => banner, generateBundle(_options, bundle) {
		for (const output of Object.values(bundle)) if (output.type === 'chunk') output.code += '\n' + banner + '\n';
	} };
}
const notices = '/*! Third-party notices: /licenses/THIRD_PARTY_NOTICES.txt, /licenses/jspdf-SPH-NOTICES.txt, /licenses/highlightjs-11.12.0.txt and /licenses/dependency-security-patches.txt */';

export default defineConfig({
	plugins: [sveltekit(), licenseNotice(notices)],
	worker: {format:'es',plugins:()=>[licenseNotice('/*! Highlight.js 11.12.0 notices: /licenses/highlightjs-11.12.0.txt */')]},
	server: {
		watch: { usePolling: true, interval: 1000 }
	}
});
