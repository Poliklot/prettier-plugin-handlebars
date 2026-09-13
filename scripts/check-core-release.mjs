import fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const dependency = pkg.dependencies['template-format-core'];
if (!/^[~^]?\d+\.\d+\.\d+(?:\s|$)/.test(dependency)) {
  throw new Error('Release blocked: replace the shared-core integration pin with its published registry version; see docs/shared-embedding.md.');
}
