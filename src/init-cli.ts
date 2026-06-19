#!/usr/bin/env node
import { main } from './cli';

try {
  process.exitCode = main(process.argv.slice(2), 'hbs-prettier-init');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
