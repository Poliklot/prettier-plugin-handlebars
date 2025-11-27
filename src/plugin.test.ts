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

  it('keeps single-line block comments in block form', async () => {
    const input = '{{!-- @backend Не трогай это --}}';
    const output = await format(input);
    expect(output).toBe('{{!-- @backend Не трогай это --}}\n');
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

  it('trims trailing whitespace before closing dashes', async () => {
    const input = `{{!--\n\t@name Example\n\n\tprop: string;\n --}}`;
    const first = await format(input);
    const second = await format(first);
    expect(first).toBe(`{{!--\n\t@name Example\n\n\tprop: string;\n--}}\n`);
    expect(second).toBe(first);
  });
});

describe('multiline comment indentation', () => {
  it('normalizes inner indentation while respecting surrounding depth', async () => {
    const input = `\t\t\t\t{{!--\n\t\t\t\t\t\t@name Слайдер с отзывами\n\n\t\t\t\t\t\timgLoading: "eager" | "lazy";\n\n\t\t\t\t\t\titems: ProductDetailCommentData[];\n\t\t\t\t--}}\n<section class="slider-section slider-section--customer-review section" data-component="slider-customer-review">\n\t<link rel="stylesheet" href="@views/components/blocks/product-detail-comment/product-detail-comment.scss" />\n\t<link rel="stylesheet" href="@styles/comments.scss" />\n\n\t<div class="container">\n\t{{!--\n\t\t@backend\n\n\t\tНе пропусти тут момент\n\t--}}\n\t\t<div class="slider-section__header">\n\t\t</div>\n\t</div>\n</section>`;

    const output = await format(input);

    expect(output).toMatch(
      /^{{!--\n\t@name Слайдер с отзывами\n\n\timgLoading: "eager" \| "lazy";\n\n\titems: ProductDetailCommentData\[];\n--}}/m,
    );
    expect(output).toMatch(/\n\s*{{!--\n\s*@backend\n\n\s*Не пропусти тут момент\n\s*--}}/m);
  });
});

describe('unmatched structures', () => {
  it('does not synthesize closing tags for incomplete blocks', async () => {
    const input = `{{#if (or categoryName countView)}}\n  {{! comment}}\n  <div class="material-card__info">`;
    const output = await format(input);

    expect(output).toBe(`{{#if (or categoryName countView)}}\n{{! comment}}\n<div class=\"material-card__info\">\n`);
  });

  it('keeps lone element start tags without adding implicit closings', async () => {
    const input = `<div class="material-card__info">\nText`;
    const output = await format(input);

    expect(output).toBe(`<div class=\"material-card__info\">\nText\n`);
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

describe('line wrapping', () => {
  it('wraps long attribute lists to new lines when exceeding print width', async () => {
    const input =
      '<a class="material-card__image-wrapper" data-one="one" data-two="two" data-three="three" data-four="four" href="{{ href }}" tabindex="-1"></a>';

    const output = await format(input, { printWidth: 120 });

    expect(output).toBe(`<a
  class="material-card__image-wrapper"
  data-one="one"
  data-two="two"
  data-three="three"
  data-four="four"
  href="{{ href }}"
  tabindex="-1"
></a>
`);
  });
});

describe('element children', () => {
  it('keeps single child elements on new lines', async () => {
    const input =
      '<a class="material-card__title-block" href="{{ href }}" tabindex="-1"><span class="material-card__title">{{ name }}</span></a>';

    const output = await format(input);

    expect(output).toBe(`<a class=\"material-card__title-block\" href=\"{{ href }}\" tabindex=\"-1\">\n  <span class=\"material-card__title\">{{ name }}</span>\n</a>\n`);
  });
});

describe('blank lines', () => {
  const template = `<div>
  {{#if value}}
    <span>one</span>
  {{/if}}

  <span>two</span>
</div>`;

  it('preserves a single intentional blank line between nodes', async () => {
    const output = await format(template);

    expect(output).toBe(`<div>\n  {{#if value}}\n    <span>one</span>\n  {{/if}}\n\n  <span>two</span>\n</div>\n`);
  });

  it('reduces multiple blank lines to the configured maximum', async () => {
    const input = `<div>\n  {{#if value}}\n    <span>one</span>\n  {{/if}}\n\n\n  <span>two</span>\n</div>`;
    const output = await format(input);

    expect(output).toBe(`<div>\n  {{#if value}}\n    <span>one</span>\n  {{/if}}\n\n  <span>two</span>\n</div>\n`);
  });

  it('honors overrides that allow more than one blank line', async () => {
    const input = `<div>\n  {{#if value}}\n    <span>one</span>\n  {{/if}}\n\n\n  <span>two</span>\n</div>`;
    const output = await format(input, { maxEmptyLines: 2 });

    expect(output).toBe(`<div>\n  {{#if value}}\n    <span>one</span>\n  {{/if}}\n\n\n  <span>two</span>\n</div>\n`);
  });
});
