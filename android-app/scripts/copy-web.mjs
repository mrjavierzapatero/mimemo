import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.resolve(import.meta.dirname, '../www');
const files = [
  'index.html', 'branding.css', 'calendar.css', 'agenda.js', 'calendar.js', 'waveform.js',
  'calendar-ui.js', 'manifest.json',
  'assets/icons/PHOSPHOR-LICENSE.txt', 'assets/icons/leteo-icon.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
  'assets/branding/leteo-yellow.svg', 'assets/branding/wave-idle.svg',
  'assets/branding/wave-recording.svg', 'Branding/SVG/logo_leteo_negro.svg'
];

fs.rmSync(out, { recursive: true, force: true });
for (const rel of files) {
  const src = path.join(root, rel);
  if (!fs.statSync(src).isFile()) throw new Error(`Falta el activo público ${rel}`);
  const dst = path.join(out, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
const htmlFile = path.join(out, 'index.html');
let html = fs.readFileSync(htmlFile, 'utf8');
const worker = /if\(navigator\.serviceWorker\) navigator\.serviceWorker\.register\('sw\.js[^']*'\)\.catch\(function\(\)\{\}\);/;
if (!worker.test(html)) throw new Error('No se encontró el registro del service worker web');
html = html.replace(worker, '/* Los activos Android se empaquetan dentro de la app. */');
html = html.replace('</body>', '  <script src="notifications.js"></script>\n  <script src="speech.js"></script>\n</body>');
fs.writeFileSync(htmlFile, html);
console.log(`Paquete Android: ${files.length} archivos públicos copiados.`);
