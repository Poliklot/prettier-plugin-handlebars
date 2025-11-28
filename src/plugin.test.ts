import { describe, expect, it } from 'vitest';
import prettier from 'prettier';
import * as plugin from './plugin';

async function format(source: string, overrides: prettier.Options = {}) {
  return prettier.format(source, {
    parser: 'handlebars',
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

  it('preserves data-* position when no custom order is provided', async () => {
    const input = '<a class="link" data-track="open" href="/home"></a>';
    const output = await format(input);
    expect(output).toBe('<a class="link" data-track="open" href="/home"></a>\n');
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
      "<div\n  class=\"\n    some\n    {{#if other}}\n      other\n    {{/if}}\n  \"></div>\n",
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

describe('helpers with hash pairs', () => {
  it('prints multiple hash pairs on separate lines', async () => {
    const input = `{{assign
  headTitle="Padel Stars | Страница не найдена"
  headDescription="Ошибка 404"
}}`;

    const output = await format(input);

    expect(output).toBe(`{{ assign
  headTitle="Padel Stars | Страница не найдена"
  headDescription="Ошибка 404"
}}\n`);
  });
});

describe('handlebars block attribute values', () => {
  it('expands block structures inside attribute values to separate lines', async () => {
    const input = `<input
  class="info-share-banner__referral"
  type="text"
  name="referal-code"
  readonly=""
  value="{{#if auth}}{{codeText}}{{else}}XxxxxXX00XX{{/if}} "
  {{#if auth}}
    onfocus="this.select();"
  {{/if}}
/>`;

    const output = await format(input);

    expect(output).toBe(`<input
  class=\"info-share-banner__referral\"
  type=\"text\"
  name=\"referal-code\"
  readonly=\"\"
  value=\"\n    {{#if auth}}\n      {{codeText}}\n    {{else}}\n      XxxxxXX00XX\n    {{/if}}\n  \"\n  {{#if auth}}\n    onfocus=\"this.select();\"\n  {{/if}}/>\n`);
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

  it('keeps inline block comments intact when they contain mustaches', async () => {
    const input = `<div class="card-banner" data-product-id="{{ id }}" data-type-component="product-card-banner">
  {{#if priceDiff}}
    {{!-- <span class="card-banner__discount">-{{ priceDiff }} ₽</span> --}}
  {{/if}}
</div>`;

    const output = await format(input, { printWidth: 120 });

    expect(output).toBe(`<div class=\"card-banner\" data-product-id=\"{{ id }}\" data-type-component=\"product-card-banner\">\n  {{#if priceDiff}}\n    {{!-- <span class=\"card-banner__discount\">-{{ priceDiff }} ₽</span> --}}\n  {{/if}}\n</div>\n`);
  });
});

describe('comments stability', () => {
  it('keeps multiline content untouched', async () => {
    const input = `{{!--\n	@name Example\n\n	prop: string;\n--}}`;
    const first = await format(input);
    const second = await format(first);
    expect(first).toBe(`{{!--\n	@name Example\n\n	prop: string;\n--}}\n`);
    expect(second).toBe(first);
  });

  it('trims trailing whitespace before closing dashes', async () => {
    const input = `{{!--\n	@name Example\n\n	prop: string;\n --}}`;
    const first = await format(input);
    const second = await format(first);
    expect(first).toBe(`{{!--\n	@name Example\n\n	prop: string;\n--}}\n`);
    expect(second).toBe(first);
  });
});

describe('prettier ignore', () => {
  it('skips formatting for the next node after an ignore comment', async () => {
    const input = "{{!-- prettier-ignore --}}\n" +
      "<a   href=\"{{ href }}\"  class=\"material-card__image-wrapper\" tabindex=\"-1\">\n" +
      "    <img alt=\"{{ name }}\" title=\"{{ name }}\"   class=\"material-card__image\" />\n" +
      "</a>";

    const output = await format(input);

    expect(output).toBe(`${input}\n`);
  });

  it('ignores block content without affecting surrounding nodes', async () => {
    const input = "<div>\n" +
      "  {{!-- prettier-ignore --}}\n" +
      "  <span  data-test=\"example\">  uneven spacing </span>\n" +
      "  <p>  Normalized paragraph  </p>\n" +
      "</div>";

    const output = await format(input);

      expect(output).toBe(
        "<div>\n" +
          "  {{!-- prettier-ignore --}}\n" +
          "  <span  data-test=\"example\">  uneven spacing </span>\n" +
          "  <p>Normalized paragraph</p>\n" +
          "</div>\n",
      );
  });

  it('ignores everything between prettier-ignore-start and prettier-ignore-end', async () => {
    const input =
      "{{!-- prettier-ignore-start --}}\n" +
      "<!doctype html>\n" +
      "<html lang=\"ru\">\n" +
      "\t<body\n" +
      "\t\t{{#if bodyClass}}\n" +
      "\t\t\tclass=\"{{ bodyClass }}\"\n" +
      "\t\t{{/if}}\n" +
      "\t>\n" +
      "\t\t<div\n" +
      "\t\t\tclass=\"\n" +
      "\t\t\t\twrapper\n" +
      "\t\t\t\t{{#if wrapperClass}}\n" +
      "\t\t\t\t\t{{wrapperClass}}\n" +
      "\t\t\t\t{{/if}}\n" +
      "\t\t\t\"\n" +
      "\t\t>\n" +
      "{{!-- prettier-ignore-end --}}";

    const output = await format(input);

    expect(output).toBe(`${input}\n`);
  });

  it('ignores following markup when comment is written as short form', async () => {
    const input =
      "{{! prettier-ignore }}\n" +
      "<!doctype html>\n" +
      "<html lang=\"ru\">\n" +
      "\t<body\n" +
      "\t\t{{#if bodyClass}}\n" +
      "\t\t\tclass=\"{{ bodyClass }}\"\n" +
      "\t\t{{/if}}\n" +
      "\t>\n" +
      "\t\t<div\n" +
      "\t\t\tclass=\"\n" +
      "\t\t\t\twrapper\n" +
      "\t\t\t\t{{#if wrapperClass}}\n" +
      "\t\t\t\t\t{{wrapperClass}}\n" +
      "\t\t\t\t{{/if}}\n" +
      "\t\t\t\"\n" +
      "\t\t>\n" +
      "\t\t</div>\n" +
      "\t</body>\n" +
      "</html>";

    const output = await format(input);

    expect(output).toBe(`${input}\n`);
  });

  it('ignores next node when using prettier-ignore-attribute', async () => {
    const input =
      "<div>\n" +
      "  {{!-- prettier-ignore-attribute --}}\n" +
      "  <span   class=\"  foo   bar\" data-id=\"1\">\n" +
      "  </span>\n" +
      "</div>";

    const output = await format(input);

    expect(output).toBe(`${input}\n`);
  });
});

describe('raw text elements', () => {
  it('trims trailing empty lines inside script and style blocks', async () => {
    const input = `<style>
		:root {
			--var-color: #fff;
		}

		body {
			background-color: red;
		}
	</style>
<script>
	document.addEventListener('DOMContentLoaded', () => {
		document.body.querySelectorAll('.info-share-banner .info-share-banner__referral')?.forEach(($input) => {
			$input.setAttribute('size', String($input.value.length + 5));
		});
	});
</script>`;

    const expected = `<style>
	:root {
		--var-color: #fff;
	}

	body {
		background-color: red;
	}
</style>
<script>
	document.addEventListener('DOMContentLoaded', () => {
		document.body.querySelectorAll('.info-share-banner .info-share-banner__referral')?.forEach(($input) => {
			$input.setAttribute('size', String($input.value.length + 5));
		});
	});
</script>
`;

    const firstPass = await format(input, { tabWidth: 2, useTabs: true });
    expect(firstPass).toBe(expected);

    const secondPass = await format(firstPass, { tabWidth: 2, useTabs: true });
    expect(secondPass).toBe(expected);
  });
});

describe('multiline comment indentation', () => {
  it('normalizes inner indentation while respecting surrounding depth', async () => {
    const input = `				{{!--\n						@name Слайдер с отзывами\n\n						imgLoading: "eager" | "lazy";\n\n						items: ProductDetailCommentData[];\n				--}}\n<section class="slider-section slider-section--customer-review section" data-component="slider-customer-review">\n	<link rel="stylesheet" href="@views/components/blocks/product-detail-comment/product-detail-comment.scss" />\n	<link rel="stylesheet" href="@styles/comments.scss" />\n\n	<div class="container">\n	{{!--\n		@backend\n\n		Не пропусти тут момент\n	--}}\n		<div class="slider-section__header">\n		</div>\n	</div>\n</section>`;

    const output = await format(input);

    expect(output).toMatch(
      /^{{!--\n	@name Слайдер с отзывами\n\n	imgLoading: "eager" \| "lazy";\n\n	items: ProductDetailCommentData\[];\n--}}/m,
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

describe('inline child elements', () => {
  it('keeps a single long text node inline', async () => {
    const input =
      '<span class="card-banner__discount">Достаточно длинный текст без подстановок, который всё ещё помещается в строку</span>';
    const output = await format(input, { printWidth: 120 });

    expect(output).toBe(
      '<span class=\"card-banner__discount\">Достаточно длинный текст без подстановок, который всё ещё помещается в строку</span>\n',
    );
  });

  it('breaks to multiple lines when there are several child nodes', async () => {
    const input =
      '<span class="card-banner__discount">Это довольно длинный текст с суммой {{ amount }} ₽ за единицу товара</span>';
    const output = await format(input, { printWidth: 120 });

    expect(output).toBe(
      `<span class=\"card-banner__discount\">\n  Это довольно длинный текст с суммой\n  {{ amount }}\n  ₽ за единицу товара\n</span>\n`,
    );
  });
});

describe('void elements', () => {
  it('treats source as self closing without explicit slash', async () => {
    const input =
      '<source media="(min-width:1440px)" srcset="@img/pic.avif" type="image/avif">';
    const output = await format(input);
    expect(output).toBe(`<source media=\"(min-width:1440px)\" srcset=\"@img/pic.avif\" type=\"image/avif\" />\n`);
  });

  it('avoids leading whitespace before the self-closing slash on its own line', async () => {
    const input = `<source
  media="(min-width: 650px)"
  srcset="@img/certificates/background/background.webp"
  type="image/webp"
/>`;

    const output = await format(input);

    expect(output).toBe(`<source
  media=\"(min-width: 650px)\"
  srcset=\"@img/certificates/background/background.webp\"
  type=\"image/webp\"
/>
`);
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
    {{/ifEquals}}/>
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

describe('raw text elements', () => {
  it('preserves multiline script content instead of collapsing it inline', async () => {
    const input = `<script>
  document.addEventListener('DOMContentLoaded', () => {
    console.log('ready');
  });
</script>`;

    const output = await format(input);

    expect(output).toBe(`<script>\n  document.addEventListener('DOMContentLoaded', () => {\n    console.log('ready');\n  });\n</script>\n`);
  });

  it('keeps style blocks formatted across multiple lines', async () => {
    const input = `<style>
  .banner {
    display: none;
  }
</style>`;

    const output = await format(input);

    expect(output).toBe(`<style>\n  .banner {\n    display: none;\n  }\n</style>\n`);
  });
});

describe('nested handlebars blocks and multiline attributes', () => {
  it('normalizes indentation and avoids blank lines directly inside blocks', async () => {
    const input = `<div>

{{#if buttonHas}}

{{#ifEquals titleButton "Оценить"}}
<button
	class="
		button
		button-primary-{{ colorButton }}
	"
	type="button"
	data-hystmodal="#reviewModal"
>
	{{ titleButton }}
</button>
{{/ifEquals}}

{{#ifEquals titleButton "Сделать обзор"}}
<a
	class="
		button
		button-primary-{{ colorButton }}
	"
	href="#"
>
	{{ titleButton }}
</a>
{{/ifEquals}}

{{/if}}
</div>`;

    const output = await format(input);

    expect(output).toBe(`<div>

  {{#if buttonHas}}
    {{#ifEquals titleButton \"Оценить\"}}
      <button
        class=\"
          button
          button-primary-{{ colorButton }}
        \"
        type=\"button\"
        data-hystmodal=\"#reviewModal\">
        {{ titleButton }}
      </button>
    {{/ifEquals}}

    {{#ifEquals titleButton \"Сделать обзор\"}}
      <a
        class=\"
          button
          button-primary-{{ colorButton }}
        \"
        href=\"#\">
        {{ titleButton }}
      </a>
    {{/ifEquals}}
  {{/if}}
</div>
`);
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
