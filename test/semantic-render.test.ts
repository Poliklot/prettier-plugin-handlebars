import { describe, expect, it } from 'vitest';
import Handlebars from 'handlebars';
import prettier from 'prettier';
import * as plugin from '../src/plugin';

type Partials = Record<string, string>;

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

  it('preserves comment-stripped output', async () => {
    await expectRenderStable('Before{{! internal note}}After\n', {});
  });
});
