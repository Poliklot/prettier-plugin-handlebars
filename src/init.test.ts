import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyInitPlan, createInitPlan, hasCheckFailures } from './init';

const tempRoots: string[] = [];

function makeProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hbs-init-test-'));
  tempRoots.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('createInitPlan', () => {
  it('creates a recommended JSON config when no prettier config exists', () => {
    const root = makeProject({
      'package.json': JSON.stringify({
        private: true,
        devDependencies: {
          prettier: '^3.0.0',
          '@poliklot/prettier-plugin-handlebars': '^0.2.11',
        },
      }),
    });

    const plan = createInitPlan(root);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].relativePath).toBe('.prettierrc.json');

    applyInitPlan(plan);

    expect(JSON.parse(fs.readFileSync(path.join(root, '.prettierrc.json'), 'utf8'))).toEqual({
      plugins: ['@poliklot/prettier-plugin-handlebars'],
      overrides: [
        {
          files: ['*.hbs', '*.handlebars'],
          options: {
            parser: 'handlebars',
          },
        },
      ],
    });
  });

  it('updates package.json prettier config without replacing package metadata', () => {
    const root = makeProject({
      'package.json': JSON.stringify({
        name: 'fixture',
        private: true,
        devDependencies: {
          prettier: '^3.0.0',
          '@poliklot/prettier-plugin-handlebars': '^0.2.11',
        },
        prettier: {
          singleQuote: true,
        },
      }),
    });

    const plan = createInitPlan(root);
    expect(plan.changes).toHaveLength(1);

    applyInitPlan(plan);

    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(packageJson.name).toBe('fixture');
    expect(packageJson.prettier.singleQuote).toBe(true);
    expect(packageJson.prettier.plugins).toEqual(['@poliklot/prettier-plugin-handlebars']);
    expect(packageJson.prettier.overrides[0].options.parser).toBe('handlebars');
  });

  it('fails check when prettierignore skips hbs files', () => {
    const root = makeProject({
      'package.json': JSON.stringify({
        private: true,
        devDependencies: {
          prettier: '^3.0.0',
          '@poliklot/prettier-plugin-handlebars': '^0.2.11',
        },
      }),
      '.prettierrc.json': JSON.stringify({
        plugins: ['@poliklot/prettier-plugin-handlebars'],
        overrides: [
          {
            files: ['*.hbs', '*.handlebars'],
            options: {
              parser: 'handlebars',
            },
          },
        ],
      }),
      '.prettierignore': '*.hbs\n',
    });

    const plan = createInitPlan(root);
    expect(plan.changes).toHaveLength(0);
    expect(plan.warnings.some((warning) => warning.kind === 'prettierignore')).toBe(true);
    expect(hasCheckFailures(plan)).toBe(true);
  });

  it('accepts already configured CommonJS prettier configs without rewriting them', () => {
    const root = makeProject({
      'package.json': JSON.stringify({
        private: true,
        devDependencies: {
          prettier: '^3.0.0',
          '@poliklot/prettier-plugin-handlebars': '^0.2.11',
        },
      }),
      '.prettierrc.cjs': [
        'module.exports = {',
        '  plugins: ["@poliklot/prettier-plugin-handlebars"],',
        '  overrides: [',
        '    { files: ["*.hbs", "*.handlebars"], options: { parser: "handlebars" } },',
        '  ],',
        '};',
        '',
      ].join('\n'),
    });

    const plan = createInitPlan(root);
    expect(plan.changes).toHaveLength(0);
    expect(hasCheckFailures(plan)).toBe(false);
  });
});
