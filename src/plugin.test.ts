import { describe, expect, it } from 'vitest';
import prettier from 'prettier';
import * as plugin from './plugin';

function format(source: string) {
  return prettier.format(source, {
    parser: 'handlebars-custom',
    plugins: [plugin as never],
    printWidth: 80,
  });
}

describe('attribute ordering', () => {
  it('sorts id and class first and breaks attributes', () => {
    const input = "<div data-attr class='c' id='main'></div>";
    const output = format(input);
    expect(output).toBe("<div\n  id=\"main\"\n  class=\"c\"\n  data-attr\n></div>\n");
  });
});

describe('partials', () => {
  it('prints partial without params inline', () => {
    const input = "{{> 'blocks/header'}}";
    const output = format(input);
    expect(output).toBe("{{> 'blocks/header'}}\n");
  });

  it('moves partial params to new lines', () => {
    const input = "{{> 'blocks/header' uptitle=uptitle subtitle='sub'}}";
    const output = format(input);
    expect(output).toBe("{{> 'blocks/header'\n    uptitle=uptitle\n    subtitle='sub'\n}}\n");
  });
});

describe('class with condition', () => {
  it('expands conditional classes', () => {
    const input = "<div class=\"some{{#if other}} other{{/if}}\"></div>";
    const output = format(input);
    expect(output).toBe(
      "<div class=\"\n  some\n  {{#if other}}\n    other\n  {{/if}}\n\"></div>\n",
    );
  });
});

describe('block indentation', () => {
  it('indents nested blocks and closes correctly', () => {
    const input = `{{#each items}}
<li>
{{#if icon}}
icon
{{else}}
no-icon
{{/if}}
</li>
{{/each}}`;

    const output = format(input);
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
  it('normalizes spaces for simple mustache', () => {
    const input = '{{value}}';
    const output = format(input);
    expect(output).toBe('{{ value }}\n');
  });

  it('removes trailing space before block close', () => {
    const input = '{{#if item }}{{/if}}';
    const output = format(input);
    expect(output).toBe('{{#if item}}\n{{/if}}\n');
  });
});

describe('comments', () => {
  it('preserves comments', () => {
    const input = '{{! short comment}}';
    const output = format(input);
    expect(output).toBe('{{! short comment }}\n');
  });
});
