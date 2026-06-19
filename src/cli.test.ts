import { describe, expect, it } from 'vitest';
import { getDefaultCommand, parseArgs, renderHelp } from './cli';

describe('cli bin aliases', () => {
  it('keeps prettier-plugin-handlebars as the explicit command CLI', () => {
    expect(getDefaultCommand('prettier-plugin-handlebars')).toBeUndefined();
    expect(parseArgs(['init', '--check']).command).toBe('init');
  });

  it('treats hbs-prettier-init as an init shortcut', () => {
    expect(getDefaultCommand('hbs-prettier-init')).toBe('init');

    const options = parseArgs(['--check'], getDefaultCommand('hbs-prettier-init'));

    expect(options.command).toBe('init');
    expect(options.check).toBe(true);
  });

  it('renders alias-specific help for hbs-prettier-init', () => {
    expect(renderHelp('hbs-prettier-init')).toContain(
      'hbs-prettier-init [--write|--check] [--cwd <dir>]',
    );
  });
});
