import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const prettierBin = process.platform === 'win32'
  ? path.join('node_modules', '.bin', 'prettier.cmd')
  : path.join('node_modules', '.bin', 'prettier');
const prettierVersion = process.env.PRETTIER_VERSION || 'latest';
const keepTemp = process.env.KEEP_INSTALL_SMOKE === '1';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: 'inherit',
  });

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.error) {
    throw result.error;
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`${label} mismatch`);
    console.error('--- expected ---');
    console.error(expected);
    console.error('--- actual ---');
    console.error(actual);
    process.exit(1);
  }
}

const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'prettier-plugin-hbs-install-'));
const npmCache = path.join(smokeRoot, 'npm-cache');
const projectRoot = path.join(smokeRoot, 'project');

try {
  await fs.mkdir(npmCache, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });

  run(npmCommand, ['pack', '--pack-destination', smokeRoot], {
    cwd: repoRoot,
    env: {
      npm_config_cache: npmCache,
    },
  });

  const tarball = (await fs.readdir(smokeRoot)).find((entry) => entry.endsWith('.tgz'));
  if (!tarball) {
    throw new Error('npm pack did not produce a tarball');
  }

  await fs.writeFile(
    path.join(projectRoot, 'package.json'),
    `${JSON.stringify({ private: true, type: 'commonjs', devDependencies: {} }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(projectRoot, '.prettierrc.cjs'),
    [
      'module.exports = {',
      '  plugins: ["@poliklot/prettier-plugin-handlebars"],',
      '  overrides: [',
      '    {',
      '      files: ["*.hbs", "*.handlebars"],',
      '      options: {',
      '        parser: "handlebars",',
      '      },',
      '    },',
      '  ],',
      '};',
      '',
    ].join('\n'),
  );
  await fs.writeFile(
    path.join(projectRoot, 'sample.hbs'),
    [
      '{{value}}',
      '{{ assign foo=bar }}',
      '{{ foo-bar arg=this.foo ~}}',
      '<div class="box {{#if active}}box--active{{/if}} {{value}}"></div>',
      '',
    ].join('\n'),
  );

  run(npmCommand, ['install', '--save-dev', `prettier@${prettierVersion}`, path.join(smokeRoot, tarball)], {
    cwd: projectRoot,
    env: {
      npm_config_cache: npmCache,
    },
  });

  run(path.join(projectRoot, prettierBin), ['--write', 'sample.hbs'], { cwd: projectRoot });

  const formatted = await fs.readFile(path.join(projectRoot, 'sample.hbs'), 'utf8');
  const expected = [
    '{{ value }}',
    '{{assign foo=bar}}',
    '{{foo-bar arg=this.foo ~}}',
    '<div',
    '  class="',
    '    box',
    '    {{#if active}}',
    '      box--active',
    '    {{/if}}',
    '    {{ value }}',
    '  "',
    '></div>',
    '',
  ].join('\n');
  assertEqual(formatted, expected, 'Formatted sample');

  const pluginPackagePath = path.join(
    projectRoot,
    'node_modules',
    '@poliklot',
    'prettier-plugin-handlebars',
    'package.json',
  );
  const pluginPackage = JSON.parse(await fs.readFile(pluginPackagePath, 'utf8'));

  if (pluginPackage.dependencies?.handlebars) {
    console.error('The packed plugin still declares handlebars as a runtime dependency.');
    process.exit(1);
  }

  if (await pathExists(path.join(projectRoot, 'node_modules', 'handlebars'))) {
    console.error('The install smoke unexpectedly installed node_modules/handlebars.');
    process.exit(1);
  }

  console.log(`Install smoke passed with prettier@${prettierVersion}.`);
} finally {
  if (keepTemp) {
    console.log(`Keeping install smoke directory: ${smokeRoot}`);
  } else {
    await fs.rm(smokeRoot, { recursive: true, force: true });
  }
}
