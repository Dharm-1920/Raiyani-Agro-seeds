import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Run once the actual public backend URL is known. Never embeds database credentials.
const source = process.argv[2];
let backend;
try {
  backend = new URL(source);
  if (backend.protocol !== 'https:' || backend.username || backend.password || backend.search || backend.hash || backend.pathname !== '/' || ['localhost', '127.0.0.1'].includes(backend.hostname)) throw Error();
} catch {
  console.error('Usage: node scripts/prepare-vercel.mjs https://your-actual-backend.onrender.com');
  process.exit(1);
}
const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: 'vite',
  installCommand: 'npm ci',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  rewrites: [
    { source: '/api/:path*', destination: `${backend.origin}/api/:path*` },
    { source: '/uploads/:path*', destination: `${backend.origin}/uploads/:path*` },
    { source: '/((?!api(?:/|$)|uploads(?:/|$)|assets(?:/|$)).*)', destination: '/index.html' },
  ],
  headers: [{ source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] }],
};
await writeFile(fileURLToPath(new URL('../client/vercel.json', import.meta.url)), JSON.stringify(config, null, 2) + '\n');
console.log('Configured client/vercel.json for ' + backend.origin + '. Set Vercel Root Directory to client.');
