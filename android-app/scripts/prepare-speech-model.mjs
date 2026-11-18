import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = new URL('../android/app/build/generated/leteoSpeechAssets/', import.meta.url);
const model = fileURLToPath(new URL('leteo-model-es.zip', directory));
const checksum = '09b239888f633ef2f0b4e09736e3d9936acfd810bc65d53fad45261762c6511f';
const verified = file => existsSync(file) &&
  createHash('sha256').update(readFileSync(file)).digest('hex') === checksum;

if (!verified(model)) {
  mkdirSync(directory, { recursive: true });
  const partial = model + '.download';
  try {
    execFileSync('curl', [
      '--fail', '--location', '--silent', '--show-error', '--max-time', '360', '--retry', '2',
      'https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip', '--output', partial
    ], { stdio: 'inherit' });
    if (!verified(partial)) throw new Error('El modelo español de Vosk no coincide con el hash fijado.');
    renameSync(partial, model);
  } finally {
    rmSync(partial, { force: true });
  }
}
