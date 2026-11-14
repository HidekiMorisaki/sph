import adapter from '@sveltejs/adapter-node';
import { relative, sep } from 'node:path';
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
	plugins: [{
		// Kit sets cssMinify=true; select the reviewed minifier after its config hook.
		name: 'sph-reviewed-css-minifier',
		enforce: 'post',
		config() {
			return {
				build: { cssMinify: 'esbuild' },
				environments: {
					ssr: { build: { cssMinify: 'esbuild' } },
					client: { build: { cssMinify: 'esbuild' } }
				}
			};
		}
	}, sveltekit({adapter:adapter(),compilerOptions:{runes:({filename})=>{
        const segments=relative(import.meta.dirname,filename).toLowerCase().split(sep);
        return segments.includes('node_modules')?undefined:true;
    }}}), licenseNotice(notices)],
	css: {transformer:'postcss'},
	build: {cssMinify:'esbuild',sourcemap:false},
	worker: {format:'es',plugins:()=>[licenseNotice('/*! Highlight.js 11.12.0 notices: /licenses/highlightjs-11.12.0.txt */')]},
	server: {
		watch: { usePolling: true, interval: 1000 }
	}
});
