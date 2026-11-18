import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '../..');
const res = path.join(root, 'android-app/android/app/src/main/res');
const logo = fs.readFileSync(path.join(root, 'assets/branding/leteo-yellow.svg'), 'utf8');
const firstPath = logo.match(/<path\b[^>]*\/>/)?.[0];
if (!firstPath) throw Error('No se encontró la L vectorial de Leteo.');

// The first contour of the approved wordmark is the L. Center it with enough
// margin for Android's adaptive icon mask and the web PWA maskable icon.
const vb = '213.4 279.3 12.8 13.8';
const glyph = color => firstPath.replace(/fill="[^"]+"/, `fill="${color}"`);
const iconSvg = (size, background = 'white', color = '#fbad2c') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vb}">` +
  (background === 'circle' ? '<circle cx="219.8" cy="286.2" r="6.9" fill="white"/>' :
   background === 'white' ? '<rect x="213.4" y="279.3" width="12.8" height="13.8" fill="white"/>' : '') +
  glyph(color) + '</svg>';

const densities = [['mdpi',48,108,24],['hdpi',72,162,36],['xhdpi',96,216,48],['xxhdpi',144,324,72],['xxxhdpi',192,432,96]];
for (const [density,launcher,foreground,notice] of densities) {
  const mipmap = path.join(res, `mipmap-${density}`);
  await sharp(Buffer.from(iconSvg(launcher))).png().toFile(path.join(mipmap, 'ic_launcher.png'));
  await sharp(Buffer.from(iconSvg(launcher, 'circle'))).png().toFile(path.join(mipmap, 'ic_launcher_round.png'));
  await sharp(Buffer.from(iconSvg(foreground, 'transparent'))).png().toFile(path.join(mipmap, 'ic_launcher_foreground.png'));
  const drawable = path.join(res, `drawable-${density}`);
  fs.mkdirSync(drawable, { recursive: true });
  await sharp(Buffer.from(iconSvg(notice, 'transparent', '#ffffff'))).png().toFile(path.join(drawable, 'ic_leteo_notification.png'));
}

for (const size of [192,512]) {
  await sharp(Buffer.from(iconSvg(size))).png().toFile(path.join(root, `assets/icons/icon-${size}.png`));
}
fs.writeFileSync(path.join(root, 'assets/icons/leteo-icon.svg'), iconSvg(512));

const splashPaths = fs.readdirSync(res, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name.startsWith('drawable'))
  .map(entry => path.join(res, entry.name, 'splash.png'))
  .filter(file => fs.existsSync(file));
for (const target of splashPaths) {
  const { width, height } = await sharp(target).metadata();
  const logoWidth = Math.round(Math.min(width * .35, height * .28));
  const logoBuffer = await sharp(Buffer.from(logo)).resize({ width: logoWidth }).png().toBuffer();
  const logoMeta = await sharp(logoBuffer).metadata();
  const left = Math.round((width - logoMeta.width) / 2);
  const top = Math.round((height - logoMeta.height) / 2);
  const canvas = await sharp({ create: { width, height, channels: 4, background: '#ffffff' } })
    .composite([{ input: logoBuffer, left, top }]).png().toBuffer();
  fs.writeFileSync(target, canvas);
}

const raw = path.join(res, 'raw');
fs.mkdirSync(raw, { recursive: true });
fs.copyFileSync(path.join(root, 'android-app/assets/leteo_notice.wav'), path.join(raw, 'leteo_notice.wav'));
console.log(`Identidad Leteo: iconos, ${splashPaths.length} fondos y tono Android generados.`);
