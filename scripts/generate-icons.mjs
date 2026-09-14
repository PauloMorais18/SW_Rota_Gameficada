import fs from 'node:fs/promises';
import sharp from 'sharp';
await fs.mkdir('public/icons', { recursive: true });
for (const size of [192, 512]) await sharp('public/icon.svg').resize(Math.round(size * 0.72)).extend({ top: Math.floor(size * 0.14), bottom: size - Math.round(size * 0.72) - Math.floor(size * 0.14), left: Math.floor(size * 0.14), right: size - Math.round(size * 0.72) - Math.floor(size * 0.14), background: '#101a0e' }).png().toFile(`public/icons/icon-${size}.png`);
console.log('Ícones PWA gerados.');
