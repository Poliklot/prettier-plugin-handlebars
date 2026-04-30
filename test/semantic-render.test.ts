import { describe, expect, it } from 'vitest';
import Handlebars from 'handlebars';
import prettier from 'prettier';
import * as plugin from '../src/plugin';

type Partials = Record<string, string>;
type Helpers = Record<string, Handlebars.HelperDelegate>;

function stripIndent(input: string): string {
  const withoutEdgeNewlines = input.replace(/^\n/, '').replace(/\s*$/, '');
  const lines = withoutEdgeNewlines.split('\n');
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^(\s*)/)?.[1].length ?? 0);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;

  return `${lines.map((line) => line.slice(minIndent)).join('\n')}\n`;
}

async function format(source: string): Promise<string> {
  return prettier.format(source, {
    parser: 'handlebars',
    plugins: [plugin as never],
    printWidth: 80,
  });
}

function render(source: string, data: unknown, partials: Partials = {}, helpers: Helpers = {}): string {
  const environment = Handlebars.create();

  Object.entries(partials).forEach(([name, partial]) => {
    environment.registerPartial(name, partial);
  });

  Object.entries(helpers).forEach(([name, helper]) => {
    environment.registerHelper(name, helper);
  });

  return environment.compile(source)(data);
}

async function expectRenderStable(source: string, data: unknown, partials: Partials = {}, helpers: Helpers = {}) {
  const formatted = await format(source);
  const secondPass = await format(formatted);

  expect(secondPass).toBe(formatted);
  expect(render(formatted, data, partials, helpers)).toBe(render(source, data, partials, helpers));
}

describe('semantic render stability', () => {
  it('preserves root-level text template output', async () => {
    await expectRenderStable('Hello, {{name}}! You have {{count}} new messages.\n', {
      name: 'Igor',
      count: 3,
    });
  });

  it('preserves inline whitespace-control output', async () => {
    await expectRenderStable('A {{~name~}} B\n', {
      name: 'Igor',
    });
  });

  it('preserves inline whitespace-control branch output', async () => {
    const source = 'A {{#if ok~}} B {{~else~}} C {{~/if}} D\n';

    await expectRenderStable(source, { ok: true });
    await expectRenderStable(source, { ok: false });
  });

  it('preserves multiline standalone block output', async () => {
    const source = stripIndent(`
      {{#if ok}}
        Hello, {{name}}!
      {{else}}
        Empty
      {{/if}}
    `);

    await expectRenderStable(source, { ok: true, name: 'Igor' });
    await expectRenderStable(source, { ok: false, name: 'Igor' });
  });

  it('preserves each block output with block params', async () => {
    const source = stripIndent(`
      {{#each items as |item index|}}
        {{index}}: {{item.name}}
      {{else}}
        empty
      {{/each}}
    `);

    await expectRenderStable(source, { items: [{ name: 'A' }, { name: 'B' }] });
    await expectRenderStable(source, { items: [] });
  });

  it('preserves escaped mustache output', async () => {
    await expectRenderStable('Hello, \\{{name}} and {{name}}!\n', {
      name: 'Igor',
    });
  });

  it('preserves inverse section output', async () => {
    const source = '{{^items}}empty{{/items}}\n';

    await expectRenderStable(source, { items: [] });
    await expectRenderStable(source, { items: ['ready'] });
  });

  it('preserves unescaped ampersand output', async () => {
    await expectRenderStable('{{& html}}\n', {
      html: '<strong>ok</strong>',
    });
  });

  it('preserves partial invocation output', async () => {
    await expectRenderStable('{{> greeting name=name}}\n', { name: 'Igor' }, {
      greeting: 'Hello, {{name}}!\n',
    });
  });

  it('preserves partial output with nested params and hashes', async () => {
    await expectRenderStable(
      '{{> card title=(concat first second) active=true}}\n',
      { first: 'A', second: 'B' },
      {
        card: '{{title}}/{{active}}',
      },
      {
        concat(...args) {
          return args.slice(0, -1).join('');
        },
      },
    );
  });

  it('preserves whitespace-control partial output', async () => {
    await expectRenderStable('A {{~> name~}} B\n', { name: 'Igor' }, {
      name: ' {{name}} ',
    });
  });

  it('preserves root-level text around partials', async () => {
    await expectRenderStable('Hello, {{> userName}}!\n', { name: 'Igor' }, {
      userName: '{{name}}',
    });
  });

  it('preserves raw block output', async () => {
    await expectRenderStable('{{{{raw}}}}{{value}}{{{{/raw}}}}\n', {
      value: 'ignored',
    });
  });

  it('preserves block partial output', async () => {
    const source = stripIndent(`
      {{#> layout title=title}}
        Hello, {{name}}!
      {{/layout}}
    `);

    await expectRenderStable(source, { title: 'Greeting', name: 'Igor' }, {
      layout: '<section><h1>{{title}}</h1>{{> @partial-block}}</section>',
    });
  });

  it('preserves inline partial definition output', async () => {
    const source = stripIndent(`
      {{#*inline "greeting"}}
        Hello, {{name}}!
      {{/inline}}
      {{> greeting}}
    `);

    await expectRenderStable(source, { name: 'Igor' });
  });

  it('preserves inline inline-partial definition output', async () => {
    const source = '{{#*inline "greeting"}}Hello, {{name}}!{{/inline}}\n{{> greeting}}\n';

    await expectRenderStable(source, { name: 'Igor' });
  });

  it('preserves helper output with quoted braces and subexpressions', async () => {
    await expectRenderStable(
      '{{wrap "a }} b" (concat first "-" second) suffix="!"}}\n',
      { first: 'A', second: 'B' },
      {},
      {
        concat(...args) {
          return args.slice(0, -1).join('');
        },
        wrap(first, second, options) {
          return `${first}:${second}${options.hash.suffix}`;
        },
      },
    );
  });

  it('preserves whitespace-sensitive pre output', async () => {
    const source = '<pre>\n  Hello, {{name}}!\n</pre>\n';

    await expectRenderStable(source, { name: 'Igor' });
  });

  it('preserves comment-stripped output', async () => {
    await expectRenderStable('Before{{! internal note}}After\n', {});
  });
});
