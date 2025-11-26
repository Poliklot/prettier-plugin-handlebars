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
  it('sorts id and class first while keeping simple attributes inline', async () => {
    const input = "<div data-attr class='c' id='main'></div>";
    const output = await format(input);
    expect(output).toBe("<div id=\"main\" class=\"c\" data-attr></div>\n");
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
    expect(output).toBe(`<source media=\"(min-width:1440px)\" srcset=\"@img/pic.avif\" type=\"image/avif\" />\n`);
  });
});

describe('data attribute ordering', () => {
  it('allows overriding data-* order through config', async () => {
    const input = '<div data-b="b" data-a="a" data-c="c"></div>';
    const output = await format(input, { dataAttributeOrder: ['data-c', 'data-a'] });
    expect(output).toBe(`<div data-c=\"c\" data-a=\"a\" data-b=\"b\"></div>\n`);
  });
});

describe('handlebars attribute blocks', () => {
  it('preserves block-scoped attribute order and keeps simple wrappers inline', async () => {
    const input = `<a href="{{ href }}" class="material-card__image-wrapper" tabindex="-1">
  <img
    alt="{{ name }}"
    title="{{ name }}"
    class="
      material-card__image
      {{#ifEquals imgLoading 'lazy'}}
        lazy
      {{/ifEquals}}
    "
    {{#ifEquals imgLoading 'lazy'}}
      src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII="
      data-src="{{ imgSrc }}"
    {{/ifEquals}}
    {{#ifEquals imgLoading 'eager'}}
      src="{{ imgSrc }}"
      loading="eager"
    {{/ifEquals}}
  />
</a>`;

    const output = await format(input);

    expect(output).toBe(`<a class="material-card__image-wrapper" href="{{ href }}" tabindex="-1">
  <img
    class="
      material-card__image
      {{#ifEquals imgLoading 'lazy'}}
        lazy
      {{/ifEquals}}
    "
    alt="{{ name }}"
    title="{{ name }}"
    {{#ifEquals imgLoading 'lazy'}}
      src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII="
      data-src="{{ imgSrc }}"
    {{/ifEquals}}
    {{#ifEquals imgLoading 'eager'}}
      src="{{ imgSrc }}"
      loading="eager"
    {{/ifEquals}}
  />
</a>
`);
  });
});
