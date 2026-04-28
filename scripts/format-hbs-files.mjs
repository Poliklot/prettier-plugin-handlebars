import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import * as plugin from '../dist/plugin.js';

const args = process.argv.slice(2);
const useTabs = args.includes('--use-tabs');
const files = args.filter((arg) => arg !== '--use-tabs');

if (files.length === 0) {
  console.error('Usage: node scripts/format-hbs-files.mjs [--use-tabs] <file> [more-files...]');
  process.exit(1);
}

for (const filePath of files) {
  const source = await fs.readFile(filePath, 'utf8');
  const formatted = await prettier.format(source, {
    parser: 'handlebars',
    plugins: [plugin],
    printWidth: 80,
    useTabs,
    tabWidth: 2,
  });

  await fs.writeFile(filePath, formatted, 'utf8');
  console.log(`formatted\t${path.resolve(filePath)}`);
}
