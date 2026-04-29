import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import * as plugin from '../dist/plugin.js';

const roots = process.argv.slice(2);
const exts = new Set(['.hbs', '.handlebars']);

if (roots.length === 0) {
  console.error('Usage: node scripts/format-hbs-tree.mjs <root> [more-roots...]');
  process.exit(1);
}

async function listTemplateFiles(root) {
  const files = [];

  async function walk(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }

        await walk(fullPath);
        continue;
      }

      if (exts.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  return files.sort();
}

let formattedCount = 0;
let changedCount = 0;

for (const root of roots) {
  const files = await listTemplateFiles(root);

  for (const filePath of files) {
    const source = await fs.readFile(filePath, 'utf8');
    const formatted = await prettier.format(source, {
      parser: 'handlebars',
      plugins: [plugin],
      printWidth: 80,
      tabWidth: 2,
    });

    formattedCount += 1;

    if (formatted !== source) {
      changedCount += 1;
      await fs.writeFile(filePath, formatted, 'utf8');
    }
  }
}

console.log(`Formatted ${formattedCount} templates; changed ${changedCount}.`);
