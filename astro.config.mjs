// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import vue from "@astrojs/vue";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://rls-poc-astro.rls-webdev.workers.dev",
	integrations: [tailwind(), mdx(), sitemap(), vue()],
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
	}),
});
