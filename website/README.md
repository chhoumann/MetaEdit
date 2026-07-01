# MetaEdit docs site

The documentation site for [MetaEdit](https://github.com/chhoumann/MetaEdit), served at
[metaedit.obsidian.guide](https://metaedit.obsidian.guide). Built with
[Astro Starlight](https://starlight.astro.build), deployed to Cloudflare Workers
(static assets, no Worker script) with `metaedit.obsidian.guide` as a custom domain.

This package is standalone on purpose: it has its own lockfile and does not
participate in the plugin's build, lint, or test pipeline.

## Commands

```bash
pnpm install        # install dependencies
pnpm run dev        # local dev server at localhost:4321
pnpm run build      # production build into dist/
pnpm run deploy     # build + wrangler deploy (needs a Cloudflare-authenticated wrangler)
```

## Layout

- `src/content/docs/` - all pages, one directory per sidebar section
  (`getting-started/`, `concepts/`, `guides/`, `api/`, `cookbook/`, `reference/`, `help/`).
  Sidebar labels come from `astro.config.mjs`; ordering within a section comes from each
  page's `sidebar.order` frontmatter.
- `src/assets/media/` - screenshots and GIFs referenced by pages. The 1.9.0 release
  assets in `docs/assets/releases/1.9.0/` are copied here; new captures are taken from a
  live Obsidian vault in dark mode ("MetaEdit Demo" staging notes).
- `src/styles/custom.css` - the theme: violet keys / teal values identity, IBM Plex
  Sans + Mono, the hero "properties card", and screenshot framing.
- `scripts/generate-og-image.mjs` - regenerates `public/og.png` (run after changing the
  tagline or branding).
- `wrangler.jsonc` - Cloudflare Workers config (assets-only + custom domain route).

## Deploying

Deploys are automatic via [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/):
the `metaedit-docs` Worker is connected to this repository (root directory `/website`,
build watch paths scoped to `website/*`), so pushes to `master` that touch `website/`
build with `pnpm run build` and deploy with `npx wrangler deploy`. Non-production
branches upload preview versions (`npx wrangler versions upload`) without touching the
custom domain. Build history lives in the Cloudflare dashboard under
Workers & Pages → metaedit-docs → Deployments.

For a manual deploy (or if Workers Builds is ever disconnected), `pnpm run deploy`
builds and pushes in one step with a locally authenticated wrangler.
