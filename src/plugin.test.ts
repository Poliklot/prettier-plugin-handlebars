import { describe, expect, it } from 'vitest';
import prettier from 'prettier';
import * as plugin from './plugin';

async function format(source: string, overrides: prettier.Options = {}) {
  return prettier.format(source, {
    parser: 'handlebars-custom',
    plugins: [plugin as never],
    printWidth: 80,
    ...overrides,
  });
}

describe('attribute ordering', () => {
  it('sorts id and class first and breaks attributes', async () => {
    const input = "<div data-attr class='c' id='main'></div>";
    const output = await format(input);
    expect(output).toBe("<div\n  id=\"main\"\n  class=\"c\"\n  data-attr\n></div>\n");
  });
});

describe('partials', () => {
  it('prints partial without params inline', async () => {
    const input = "{{> 'blocks/header'}}";
    const output = await format(input);
    expect(output).toBe("{{> 'blocks/header'}}\n");
  });

  it('moves partial params to new lines', async () => {
    const input = "{{> 'blocks/header' uptitle=uptitle subtitle='sub'}}";
    const output = await format(input);
    expect(output).toBe("{{> 'blocks/header'\n  uptitle=uptitle\n  subtitle='sub'\n}}\n");
  });
});

describe('class with condition', () => {
  it('expands conditional classes', async () => {
    const input = "<div class=\"some{{#if other}} other{{/if}}\"></div>";
    const output = await format(input);
    expect(output).toBe(
      "<div\n  class=\"\n    some\n    {{#if other}}\n      other\n    {{/if}}\n  \"\n></div>\n",
    );
  });
});

describe('block indentation', () => {
  it('indents nested blocks and closes correctly', async () => {
    const input = `{{#each items}}
<li>
{{#if icon}}
icon
{{else}}
no-icon
{{/if}}
</li>
{{/each}}`;

    const output = await format(input);
    expect(output).toBe(
      `{{#each items}}
  <li>
    {{#if icon}}
      icon
    {{else}}
      no-icon
    {{/if}}
  </li>
{{/each}}
`,
    );
  });
});

describe('mustache spacing', () => {
  it('normalizes spaces for simple mustache', async () => {
    const input = '{{value}}';
    const output = await format(input);
    expect(output).toBe('{{ value }}\n');
  });

  it('removes trailing space before block close', async () => {
    const input = '{{#if item }}{{/if}}';
    const output = await format(input);
    expect(output).toBe('{{#if item}}\n{{/if}}\n');
  });
});

describe('comments', () => {
  it('preserves comments', async () => {
    const input = '{{! short comment}}';
    const output = await format(input);
    expect(output).toBe('{{! short comment}}\n');
  });
});

describe('comments stability', () => {
  it('keeps multiline content untouched', async () => {
    const input = `{{!--\n\t@name Example\n\n\tprop: string;\n--}}`;
    const first = await format(input);
    const second = await format(first);
    expect(first).toBe(`{{!--\n\t@name Example\n\n\tprop: string;\n--}}\n`);
    expect(second).toBe(first);
  });
});

describe('void elements', () => {
  it('treats source as self closing without explicit slash', async () => {
    const input =
      '<source media="(min-width:1440px)" srcset="@img/pic.avif" type="image/avif">';
    const output = await format(input);
    expect(output).toBe(
      `<source\n  media=\"(min-width:1440px)\"\n  srcset=\"@img/pic.avif\"\n  type=\"image/avif\"\n/>\n`,
    );
  });
});

describe('data attribute ordering', () => {
  it('allows overriding data-* order through config', async () => {
    const input = '<div data-b="b" data-a="a" data-c="c"></div>';
    const output = await format(input, { dataAttributeOrder: ['data-c', 'data-a'] });
    expect(output).toBe(
      `<div\n  data-c=\"c\"\n  data-a=\"a\"\n  data-b=\"b\"\n></div>\n`,
    );
  });
});
