import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
	}, sveltekit({adapter:adapter()})],
	css: {transformer:'postcss'},
	build: {cssMinify:'esbuild',sourcemap:false},
	server: {
		allowedHosts: ['api', 'gateway']
	}
});
