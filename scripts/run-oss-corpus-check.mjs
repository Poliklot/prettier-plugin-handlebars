import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const corpusRoot = path.resolve(
  process.env.OSS_CORPUS_ROOT ?? path.join(os.tmpdir(), 'hbs-oss-corpus'),
);
const skipClone = process.env.OSS_CORPUS_SKIP_CLONE === '1' || process.argv.includes('--no-clone');
const strictStress = process.env.OSS_CORPUS_STRICT_STRESS === '1';

const repos = [
  { slug: 'TryGhost/Ghost', dir: 'Ghost' },
  { slug: 'TryGhost/Casper', dir: 'Casper' },
  { slug: 'TryGhost/Source', dir: 'Source' },
  { slug: 'TryGhost/London', dir: 'London' },
  { slug: 'TryGhost/Editorial', dir: 'Editorial' },
  { slug: 'TryGhost/Massively', dir: 'Massively' },
  { slug: 'TryGhost/express-hbs', dir: 'express-hbs' },
  { slug: 'pillarjs/hbs', dir: 'hbs' },
  { slug: 'wet-boew/wet-boew', dir: 'wet-boew' },
  { slug: 'ActiveCampaign/mailmason', dir: 'mailmason' },
  { slug: 'electron/electronjs.org-old', dir: 'electronjs.org-old' },
  { slug: 'godofredoninja/simply', dir: 'simply' },
  { slug: 'godofredoninja/Mapache', dir: 'Mapache' },
  { slug: 'kathyqian/crisp', dir: 'crisp' },
];

const classicRootSpecs = [
  ['Casper'],
  ['Source'],
  ['London'],
  ['Editorial'],
  ['Massively'],
  ['express-hbs'],
  ['hbs'],
  ['Ghost', 'ghost', 'core', 'core', 'frontend'],
  ['Ghost', 'ghost', 'core', 'core', 'server'],
  ['Ghost', 'ghost', 'core', 'test', 'unit', 'frontend'],
  ['Ghost', 'ghost', 'core', 'test', 'utils', 'fixtures'],
  ['wet-boew'],
  ['mailmason'],
  ['electronjs.org-old'],
  ['simply'],
  ['Mapache'],
  ['crisp'],
];

const stressRootSpecs = [['Ghost', 'ghost', 'admin', 'app']];

const knownInvalidNonIdempotent = new Set([
  path.join(corpusRoot, 'hbs', 'test', '4.x', 'views', 'bad_layout.hbs'),
]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function cloneMissingRepos() {
  fs.mkdirSync(corpusRoot, { recursive: true });

  for (const repo of repos) {
    const target = path.join(corpusRoot, repo.dir);

    if (fs.existsSync(target)) {
      console.log(`Using existing ${repo.slug} at ${target}`);
      continue;
    }

    if (skipClone) {
      throw new Error(`Missing ${target}. Re-run without --no-clone or set OSS_CORPUS_ROOT.`);
    }

    console.log(`Cloning ${repo.slug}...`);
    const result = run(
      'git',
      ['clone', '--depth', '1', `https://github.com/${repo.slug}.git`, target],
      {
        cwd: corpusRoot,
        stdio: 'inherit',
      },
    );

    if (result.status !== 0) {
      throw new Error(`Failed to clone ${repo.slug}`);
    }
  }
}

function resolveRoots(rootSpecs, label) {
  const roots = rootSpecs.map((segments) => path.join(corpusRoot, ...segments));
  const missing = roots.filter((root) => !fs.existsSync(root));

  if (missing.length > 0) {
    throw new Error(`${label} roots are missing:\n${missing.map((root) => `- ${root}`).join('\n')}`);
  }

  return roots;
}

function runCorpus(label, roots) {
  const result = run(process.execPath, [path.join(scriptDir, 'run-corpus-check.mjs'), ...roots], {
    cwd: repoRoot,
  });

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    throw new Error(`${label} corpus check failed to run`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    process.stdout.write(result.stdout);
    throw new Error(`Could not parse ${label} corpus report: ${error.message}`);
  }
}

function flatten(report, key) {
  return report.repos.flatMap((repo) =>
    repo[key].map((item) => ({
      ...item,
      root: repo.root,
    })),
  );
}

function summarize(label, report, ignoredNonIdempotent = new Set()) {
  const totals = report.repos.reduce(
    (sum, repo) => ({
      files: sum.files + repo.total,
      failed: sum.failed + repo.failedCount,
      changed: sum.changed + repo.changedCount,
      unchanged: sum.unchanged + repo.unchangedCount,
      nonIdempotent: sum.nonIdempotent + repo.nonIdempotentCount,
    }),
    { files: 0, failed: 0, changed: 0, unchanged: 0, nonIdempotent: 0 },
  );

  const failed = flatten(report, 'failed');
  const nonIdempotent = flatten(report, 'nonIdempotent');
  const expectedNonIdempotent = nonIdempotent.filter((item) =>
    ignoredNonIdempotent.has(path.resolve(item.filePath)),
  );
  const unexpectedNonIdempotent = nonIdempotent.filter(
    (item) => !ignoredNonIdempotent.has(path.resolve(item.filePath)),
  );

  console.log(
    `${label}: ${totals.files} files, ${totals.failed} failures, ` +
      `${totals.nonIdempotent} non-idempotent, ${totals.changed} changed, ${totals.unchanged} unchanged`,
  );

  if (expectedNonIdempotent.length > 0) {
    console.log('Expected invalid fixtures:');

    for (const item of expectedNonIdempotent) {
      console.log(`- ${path.relative(corpusRoot, item.filePath)}`);
    }
  }

  return {
    totals,
    failed,
    expectedNonIdempotent,
    unexpectedNonIdempotent,
  };
}

function printProblems(label, summary) {
  const problems = [...summary.failed, ...summary.unexpectedNonIdempotent];

  if (problems.length === 0) {
    return;
  }

  console.error(`\n${label} problems:`);

  for (const item of problems.slice(0, 20)) {
    const kind = item.ok === false ? 'failed' : 'non-idempotent';
    console.error(`- ${kind}: ${item.filePath}`);
  }

  if (problems.length > 20) {
    console.error(`...and ${problems.length - 20} more`);
  }
}

cloneMissingRepos();

const classicRoots = resolveRoots(classicRootSpecs, 'Classic Handlebars');
const stressRoots = resolveRoots(stressRootSpecs, 'Ghost admin stress');

console.log(`\nOSS corpus root: ${corpusRoot}\n`);

const classicReport = runCorpus('Classic Handlebars', classicRoots);
const classicSummary = summarize('Classic Handlebars corpus', classicReport, knownInvalidNonIdempotent);

const stressReport = runCorpus('Ghost admin Glimmer/Ember stress', stressRoots);
const stressSummary = summarize('Ghost admin Glimmer/Ember stress corpus', stressReport);

printProblems('Classic Handlebars corpus', classicSummary);

if (strictStress) {
  printProblems('Ghost admin Glimmer/Ember stress corpus', stressSummary);
} else if (stressSummary.failed.length > 0 || stressSummary.unexpectedNonIdempotent.length > 0) {
  console.error(
    '\nGhost admin stress found issues, but it is non-target Glimmer/Ember syntax. ' +
      'Set OSS_CORPUS_STRICT_STRESS=1 to make it blocking.',
  );
}

const classicFailed =
  classicSummary.failed.length > 0 || classicSummary.unexpectedNonIdempotent.length > 0;
const stressFailed =
  strictStress &&
  (stressSummary.failed.length > 0 || stressSummary.unexpectedNonIdempotent.length > 0);

if (classicFailed || stressFailed) {
  process.exit(1);
}

console.log('\nOSS corpus check passed.');
