import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = JSON.parse(await fs.readFile(path.join(root, 'client/src/wix-assets.json'), 'utf8'));
const directory = path.join(root, 'client/public/assets/wix');
await fs.mkdir(directory, { recursive: true });
// Download display-size copies, retaining the original source URLs in the manifest.
async function download(asset) {
  const url = asset.source + '/v1/fit/w_1400,h_1400,q_85/' + asset.source.split('/').pop();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error('Expected image data');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new Error('Empty image');
      await fs.writeFile(path.join(directory, asset.file), buffer);
      console.log(asset.file + ': ' + buffer.length + ' bytes');
      return;
    } catch (error) {
      if (attempt === 2) throw new Error(asset.file + ': ' + error.message);
    }
  }
}
for (let index = 0; index < assets.length; index += 3) {
  await Promise.all(assets.slice(index, index + 3).map(download));
}
console.log('Imported ' + assets.length + ' Wix photos.');
