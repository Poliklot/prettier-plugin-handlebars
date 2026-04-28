import { describe, expect, it } from 'vitest';
import prettier from 'prettier';
import * as plugin from '../src/plugin';

async function format(source: string, overrides: prettier.Options = {}) {
  return prettier.format(source, {
    parser: 'handlebars',
    plugins: [plugin as never],
    printWidth: 80,
    ...overrides,
  });
}

function stripIndent(input: string): string {
  const withoutEdgeNewlines = input.replace(/^\n/, '').replace(/\s*$/, '');
  const lines = withoutEdgeNewlines.split('\n');
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^(\s*)/)?.[1].length ?? 0);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;

  return lines.map((line) => line.slice(minIndent)).join('\n');
}

async function expectStableFormat(source: string, expected: string, overrides: prettier.Options = {}) {
  const firstPass = await format(source, overrides);
  expect(firstPass).toBe(`${stripIndent(expected)}\n`);

  const secondPass = await format(firstPass, overrides);
  expect(secondPass).toBe(firstPass);
}

describe('simple formatter coverage', () => {
  it('normalizes spacing for short handlebars comments', async () => {
    await expectStableFormat('{{!note}}', '{{! note}}');
  });

  it('preserves triple-stash expressions', async () => {
    await expectStableFormat('{{{ html }}}', '{{{ html }}}');
  });

  it('normalizes unquoted attributes on void elements', async () => {
    await expectStableFormat('<input disabled type=text>', '<input disabled type="text" />');
  });

  it('formats custom elements without treating them as void tags', async () => {
    await expectStableFormat(
      '<product-card data-view=grid></product-card>',
      '<product-card data-view="grid"></product-card>',
    );
  });

  it('expands partials with hash pairs onto separate lines', async () => {
    await expectStableFormat(
      '{{> card title=title}}',
      `
        {{> card
          title=title
        }}
      `,
    );
  });
});

describe('medium formatter coverage', () => {
  it('formats if-else blocks with nested child elements', async () => {
    await expectStableFormat(
      '{{#if user}}<span>{{ user.name }}</span>{{else}}<em>Guest</em>{{/if}}',
      `
        {{#if user}}
          <span>
            {{ user.name }}
          </span>
        {{else}}
          <em>Guest</em>
        {{/if}}
      `,
    );
  });

  it('keeps html comments on their own line inside elements', async () => {
    await expectStableFormat(
      '<div><!-- keep --><span>{{ value }}</span></div>',
      `
        <div>
          <!-- keep -->
          <span>{{ value }}</span>
        </div>
      `,
    );
  });

  it('prints handlebars comment blocks inside opening tags on separate lines', async () => {
    await expectStableFormat(
      '<div {{!-- note --}} hidden></div>',
      `
        <div
          {{!-- note --}}
          hidden
        ></div>
      `,
    );
  });

  it('respects custom data attribute ordering while keeping id and class first', async () => {
    await expectStableFormat(
      '<div data-b="b" data-a="a" class="x" id="y"></div>',
      '<div id="y" class="x" data-a="a" data-b="b"></div>',
      { dataAttributeOrder: ['data-a'] },
    );
  });

  it('keeps multiline formatting stable for top-level html comments followed by markup', async () => {
    await expectStableFormat(
      '<!-- keep --><section><p>Text</p></section>',
      `
        <!-- keep -->
        <section>
          <p>Text</p>
        </section>
      `,
    );
  });
});
