// Generates public/og.png (1200x630 social preview) from an inline SVG.
// Run: node scripts/generate-og-image.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
	<rect width="1200" height="630" fill="#15141d"/>
	<!-- subtle violet glow behind the card -->
	<circle cx="950" cy="180" r="340" fill="#8b74e8" opacity="0.07"/>
	<circle cx="220" cy="520" r="300" fill="#2fd6c3" opacity="0.05"/>

	<!-- :: logomark -->
	<g transform="translate(96, 96)">
		<circle cx="14" cy="16" r="14" fill="#a78bfa"/>
		<circle cx="14" cy="54" r="14" fill="#a78bfa"/>
		<circle cx="56" cy="16" r="14" fill="#2fd6c3"/>
		<circle cx="56" cy="54" r="14" fill="#2fd6c3"/>
	</g>

	<!-- wordmark -->
	<text x="196" y="152" font-family="Menlo, 'SF Mono', monospace" font-size="64" font-weight="700" letter-spacing="-2">
		<tspan fill="#a78bfa">Meta</tspan><tspan fill="#2fd6c3">Edit</tspan>
	</text>

	<text x="98" y="268" font-family="Menlo, 'SF Mono', monospace" font-size="34" fill="#ececf5">One command. Every property.</text>
	<text x="98" y="322" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#8f8da2">Edit YAML properties, inline fields, and tags in Obsidian</text>
	<text x="98" y="358" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#8f8da2">with native widgets, automation, and a developer API.</text>

	<!-- frontmatter card -->
	<g transform="translate(98, 408)">
		<rect width="1004" height="150" rx="14" fill="#232231" stroke="#3b3a4d"/>
		<text x="28" y="44" font-family="Menlo, 'SF Mono', monospace" font-size="22" fill="#5b5970" letter-spacing="4">---</text>
		<text x="28" y="82" font-family="Menlo, 'SF Mono', monospace" font-size="22">
			<tspan fill="#a78bfa">status</tspan><tspan fill="#5b5970">:</tspan><tspan fill="#2fd6c3" dx="12">Reading</tspan>
			<tspan fill="#a78bfa" dx="60">rating</tspan><tspan fill="#5b5970">:</tspan><tspan fill="#2fd6c3" dx="12">8</tspan>
			<tspan fill="#a78bfa" dx="60">started</tspan><tspan fill="#5b5970">:</tspan><tspan fill="#2fd6c3" dx="12">2026-06-14</tspan>
		</text>
		<text x="28" y="120" font-family="Menlo, 'SF Mono', monospace" font-size="22" fill="#5b5970" letter-spacing="4">---</text>
		<text x="976" y="120" text-anchor="end" font-family="Menlo, 'SF Mono', monospace" font-size="22" fill="#8f8da2">metaedit.obsidian.guide</text>
	</g>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(join(root, 'public', 'og.png'));
console.log('wrote public/og.png');
