import { describe, expect, it } from 'vitest';
import Handlebars from 'handlebars';
import prettier from 'prettier';
import * as plugin from '../src/plugin';

type Partials = Record<string, string>;

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

function render(source: string, data: unknown, partials: Partials = {}): string {
  const environment = Handlebars.create();

  Object.entries(partials).forEach(([name, partial]) => {
    environment.registerPartial(name, partial);
  });

  return environment.compile(source)(data);
}

async function expectRenderStable(source: string, data: unknown, partials: Partials = {}) {
  const formatted = await format(source);
  const secondPass = await format(formatted);

  expect(secondPass).toBe(formatted);
  expect(render(formatted, data, partials)).toBe(render(source, data, partials));
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

  it('preserves partial invocation output', async () => {
    await expectRenderStable('{{> greeting name=name}}\n', { name: 'Igor' }, {
      greeting: 'Hello, {{name}}!\n',
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

  it('preserves whitespace-sensitive pre output', async () => {
    const source = '<pre>\n  Hello, {{name}}!\n</pre>\n';

    await expectRenderStable(source, { name: 'Igor' });
  });

  it('preserves comment-stripped output', async () => {
    await expectRenderStable('Before{{! internal note}}After\n', {});
  });
});
