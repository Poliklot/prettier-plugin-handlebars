import path from 'node:path';
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const cacheDir = path.join(process.cwd(), '.tmp-npm-cache');

const result = spawnSync(npmCommand, ['pack', '--dry-run'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    npm_config_cache: cacheDir,
  },
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
