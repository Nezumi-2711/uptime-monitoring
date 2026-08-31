import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const assets = path.join(import.meta.dirname, 'assets');
const output = path.join(root, 'public');
const iconSource = path.join(assets, 'icon.svg');
const ogSource = path.join(assets, 'og.svg');

await mkdir(output, { recursive: true });
await copyFile(iconSource, path.join(output, 'favicon.svg'));

async function renderIcon(name: string, size: number) {
	await sharp(iconSource).resize(size, size).png().toFile(path.join(output, name));
}

async function renderMaskableIcon() {
	const icon = await sharp(iconSource).resize(512, 512).png().toBuffer();
	await sharp({ create: { width: 512, height: 512, channels: 4, background: '#24b47e' } })
		.composite([{ input: icon }])
		.png()
		.toFile(path.join(output, 'icon-512-maskable.png'));
}

await Promise.all([
	renderIcon('apple-touch-icon.png', 180),
	renderIcon('icon-192.png', 192),
	renderIcon('icon-512.png', 512),
	renderMaskableIcon(),
	sharp(ogSource).resize(1200, 630).png().toFile(path.join(output, 'og.png')),
]);

const faviconPngs = await Promise.all([16, 32, 48].map((size) => sharp(iconSource).resize(size, size).png().toBuffer()));
await writeFile(path.join(output, 'favicon.ico'), await pngToIco(faviconPngs));

console.log(`Generated Upwatch icons in ${output}`);
