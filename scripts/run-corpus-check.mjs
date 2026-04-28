import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import * as plugin from '../dist/plugin.js';

const [, , ...roots] = process.argv;

if (roots.length === 0) {
  console.error('Usage: node scripts/run-corpus-check.mjs <root> [more-roots...]');
  process.exit(1);
}

const exts = new Set(['.hbs', '.handlebars']);

function normalizeForCompare(text) {
  return text.replace(/\r\n?/g, '\n');
}

function countLines(text) {
  if (text.length === 0) {
    return 0;
  }

  return text.split('\n').length;
}

function countChangedLines(before, after) {
  const a = normalizeForCompare(before).split('\n');
  const b = normalizeForCompare(after).split('\n');
  const max = Math.max(a.length, b.length);
  let changed = 0;

  for (let index = 0; index < max; index += 1) {
    if ((a[index] ?? '') !== (b[index] ?? '')) {
      changed += 1;
    }
  }

  return changed;
}

async function listTemplateFiles(root) {
  const files = [];

  async function walk(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
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

async function analyzeFile(filePath) {
  const source = await fs.readFile(filePath, 'utf8');
  const normalizedSource = normalizeForCompare(source);

  try {
    const formatted = await prettier.format(source, {
      parser: 'handlebars',
      plugins: [plugin],
      printWidth: 80,
    });

    const secondPass = await prettier.format(formatted, {
      parser: 'handlebars',
      plugins: [plugin],
      printWidth: 80,
    });

    const changed = normalizeForCompare(formatted) !== normalizedSource;
    const idempotent = secondPass === formatted;

    return {
      filePath,
      ok: true,
      changed,
      idempotent,
      sourceLines: countLines(normalizedSource),
      formattedLines: countLines(normalizeForCompare(formatted)),
      lineDelta: countLines(normalizeForCompare(formatted)) - countLines(normalizedSource),
      changedLines: changed ? countChangedLines(normalizedSource, formatted) : 0,
    };
  } catch (error) {
    return {
      filePath,
      ok: false,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  }
}

function summarizeRepo(root, results) {
  const total = results.length;
  const failed = results.filter((item) => !item.ok);
  const changed = results.filter((item) => item.ok && item.changed);
  const nonIdempotent = results.filter((item) => item.ok && !item.idempotent);

  const topChanged = changed
    .slice()
    .sort((left, right) => {
      if (right.changedLines !== left.changedLines) {
        return right.changedLines - left.changedLines;
      }

      if (right.lineDelta !== left.lineDelta) {
        return Math.abs(right.lineDelta) - Math.abs(left.lineDelta);
      }

      return left.filePath.localeCompare(right.filePath);
    })
    .slice(0, 15)
    .map((item) => ({
      filePath: item.filePath,
      changedLines: item.changedLines,
      lineDelta: item.lineDelta,
      sourceLines: item.sourceLines,
      formattedLines: item.formattedLines,
    }));

  return {
    root,
    total,
    failedCount: failed.length,
    changedCount: changed.length,
    unchangedCount: total - failed.length - changed.length,
    nonIdempotentCount: nonIdempotent.length,
    failed,
    nonIdempotent,
    topChanged,
  };
}

const startedAt = new Date().toISOString();
const repos = [];

for (const root of roots) {
  const files = await listTemplateFiles(root);
  const results = [];

  for (const filePath of files) {
    results.push(await analyzeFile(filePath));
  }

  repos.push(summarizeRepo(root, results));
}

const report = {
  startedAt,
  finishedAt: new Date().toISOString(),
  repos,
};

console.log(JSON.stringify(report, null, 2));
