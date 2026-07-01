// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

// https://astro.build/config
export default defineConfig({
	site: 'https://metaedit.obsidian.guide',
	integrations: [
		starlight({
			plugins: [starlightLinksValidator()],
			title: 'MetaEdit',
			description:
				'MetaEdit is an Obsidian plugin for editing note metadata: YAML properties, inline Dataview fields, and tags - from one menu, with Obsidian’s native property widgets.',
			logo: {
				src: './src/assets/logo.svg',
				alt: 'MetaEdit',
			},
			favicon: '/favicon.svg',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/chhoumann/MetaEdit',
				},
			],
			editLink: {
				baseUrl: 'https://github.com/chhoumann/MetaEdit/edit/master/website/',
			},
			lastUpdated: true,
			customCss: [
				'@fontsource/ibm-plex-sans/400.css',
				'@fontsource/ibm-plex-sans/400-italic.css',
				'@fontsource/ibm-plex-sans/500.css',
				'@fontsource/ibm-plex-sans/600.css',
				'@fontsource/ibm-plex-sans/700.css',
				'@fontsource/ibm-plex-mono/400.css',
				'@fontsource/ibm-plex-mono/500.css',
				'@fontsource/ibm-plex-mono/600.css',
				'./src/styles/custom.css',
			],
			sidebar: [
				{
					label: 'Getting started',
					items: [{ autogenerate: { directory: 'getting-started' } }],
				},
				{
					label: 'Concepts',
					items: [{ autogenerate: { directory: 'concepts' } }],
				},
				{
					label: 'Guides',
					items: [{ autogenerate: { directory: 'guides' } }],
				},
				{
					label: 'Developer API',
					items: [{ autogenerate: { directory: 'api' } }],
				},
				{
					label: 'Cookbook',
					items: [{ autogenerate: { directory: 'cookbook' } }],
				},
				{
					label: 'Reference',
					items: [{ autogenerate: { directory: 'reference' } }],
				},
				{
					label: 'Help',
					items: [{ autogenerate: { directory: 'help' } }],
				},
			],
			head: [
				{
					tag: 'meta',
					attrs: { name: 'theme-color', content: '#8b74e8' },
				},
				{
					tag: 'meta',
					attrs: { property: 'og:image', content: 'https://metaedit.obsidian.guide/og.png' },
				},
				{
					tag: 'meta',
					attrs: { name: 'twitter:card', content: 'summary_large_image' },
				},
				{
					tag: 'meta',
					attrs: { name: 'twitter:image', content: 'https://metaedit.obsidian.guide/og.png' },
				},
			],
		}),
	],
});
