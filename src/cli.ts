#!/usr/bin/env node
import { applyInitPlan, createInitPlan, hasCheckFailures, renderInitPlan } from './init';

interface CliOptions {
  command?: string;
  cwd: string;
  write: boolean;
  check: boolean;
  help: boolean;
}

function main(argv: string[]): number {
  const options = parseArgs(argv);

  if (options.help || !options.command) {
    process.stdout.write(renderHelp());
    return options.help ? 0 : 1;
  }

  if (options.command !== 'init') {
    process.stderr.write(`Unknown command: ${options.command}\n\n`);
    process.stderr.write(renderHelp());
    return 1;
  }

  const plan = createInitPlan(options.cwd);

  if (options.write) {
    applyInitPlan(plan);
    process.stdout.write(renderInitPlan(plan, 'write'));
    return hasCheckFailures(createInitPlan(options.cwd)) ? 1 : 0;
  }

  if (options.check) {
    process.stdout.write(renderInitPlan(plan, 'check'));
    return hasCheckFailures(plan) ? 1 : 0;
  }

  process.stdout.write(renderInitPlan(plan, 'dry-run'));
  return 0;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    cwd: process.cwd(),
    write: false,
    check: false,
    help: false,
  };

  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();

    if (!arg) {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--write') {
      options.write = true;
      continue;
    }

    if (arg === '--check') {
      options.check = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.write = false;
      continue;
    }

    if (arg === '--cwd') {
      const cwd = args.shift();
      if (!cwd) {
        throw new Error('--cwd requires a directory');
      }
      options.cwd = cwd;
      continue;
    }

    if (!options.command) {
      options.command = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (options.write && options.check) {
    throw new Error('Use either --write or --check, not both.');
  }

  return options;
}

function renderHelp(): string {
  return [
    '@poliklot/prettier-plugin-handlebars',
    '',
    'Usage:',
    '  prettier-plugin-handlebars init [--write|--check] [--cwd <dir>]',
    '',
    'Commands:',
    '  init        Audit or configure a project for .hbs / .handlebars formatting.',
    '',
    'Options:',
    '  --write    Apply supported config changes. Without this flag, init is a dry run.',
    '  --check    Exit with a non-zero status when setup is incomplete.',
    '  --dry-run  Print the setup report without writing files. This is the default.',
    '  --cwd DIR  Run against another project directory.',
    '  -h, --help Show this help message.',
    '',
  ].join('\n');
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export { main, parseArgs, renderHelp };
