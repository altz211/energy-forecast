import { mkdir, cp, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await cp('assets', 'dist/assets', { recursive: true });
