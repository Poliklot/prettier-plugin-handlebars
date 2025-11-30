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

function stripIndent(str: string): string {
  const withoutEdgeNewlines = str.replace(/^\n/, '').replace(/\s*$/, '');
  const lines = withoutEdgeNewlines.split('\n');

  const indents = lines
    .filter(line => line.trim().length > 0)
    .map(line => line.match(/^(\s*)/)![1].length);

  const minIndent = indents.length ? Math.min(...indents) : 0;

  return lines.map(line => line.slice(minIndent)).join('\n');
}

function stripIndentWithNL(str: string): string {
  return stripIndent(str) + '\n';
}

describe('attribute ordering', () => {
  it('sorts id and class first while keeping simple attributes inline', async () => {
    const input = `<div data-attribute class='block' id='main'></div>`;
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`<div id="main" class="block" data-attribute></div>`));
  });

  it('preserves data-* position when no custom order is provided', async () => {
    const input = '<a class="block__link" data-attribute="lorem" href="/home"></a>';
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`<a class="block__link" data-attribute="lorem" href="/home"></a>`));
  });
});

describe('partials', () => {
  it('prints partial without params inline', async () => {
    const input = `{{> 'blocks/header'}}`;
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`{{> 'blocks/header'}}`));
  });

  it('moves partial params to new lines', async () => {
    const input = `{{> 'blocks/header' uptitle=uptitle subtitle='sub'}}`;
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`
      {{> 'blocks/header'
        uptitle=uptitle
        subtitle='sub'
      }}
    `));
  });

  it('formats complex partial parameters across multiple lines', async () => {
    const input = `
      {{> 'blocks/product-card/product-card'
        id='0000'
        modification="big"
        name="name"
        imgSrc="@img/image.jpeg"
        href='./href.html'
        imgLoading='lazy'
        bonusesCount=100
        currentPrice="text"
        prevPrice=55068
        inBasket=false
        isFavorite=false
        isCompared=false
        buttonIsDisabled=false
        status=(parseJSON '{
          "color": "orange",
          "text": "text"
        }')
        isHit=false
        badgeHas=true
        tagsHas=true
        badge=[{ color:"orange", text:"text" }]
        tags=(parseJSON '{
              "timer": { "text": "text", "hasModification": false, "modification": "" },
              "count": { "text": "text", "hasModification": false, "modification": "" }
        }')
        withoutLinks=true
        linksTargetBlank=true
        withoutInfoList=true
        withoutMoreButtons=true
        withoutBottom=true
      }}
    `;
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`
      {{> 'blocks/product-card/product-card'
        id='0000'
        modification="big"
        name="name"
        imgSrc="@img/image.jpeg"
        href='./href.html'
        imgLoading='lazy'
        bonusesCount=100
        currentPrice="text"
        prevPrice=55068
        inBasket=false
        isFavorite=false
        isCompared=false
        buttonIsDisabled=false
        status=(parseJSON '{
          "color": "orange",
          "text": "text"
        }')
        isHit=false
        badgeHas=true
        tagsHas=true
        badge=[{ color:"orange", text:"text" }]
        tags=(parseJSON '{
          "timer": { "text": "text", "hasModification": false, "modification": "" },
          "count": { "text": "text", "hasModification": false, "modification": "" }
        }')
        withoutLinks=true
        linksTargetBlank=true
        withoutInfoList=true
        withoutMoreButtons=true
        withoutBottom=true
      }}
    `));
  });

  it('formats complex partial parameters across multiple lines 2', async () => {
    const input = `
      {{> 'blocks/product-card/product-card' id='0000'
        modification="big"
        name="name"
        imgSrc="@img/image.jpeg"
        href='./href.html' imgLoading='lazy'
        bonusesCount=100
        currentPrice="text"
        prevPrice=55068
        inBasket=false
        isFavorite=false
        isCompared=false
        buttonIsDisabled=false
        status=(parseJSON '{
                                                  "color": "orange",
                                                  "text": "text"
        }')
        isHit=false
        badgeHas=true
        tagsHas=true
        badge=[{ color:"orange", text:"text" }]
        tags=(parseJSON '{
                        "timer": { "text": "text", "hasModification": false, "modification": "" },
                        "count": { "text": "text", "hasModification": false, "modification": "" }
        }')
        withoutLinks=true linksTargetBlank=true
                  withoutInfoList=true
        withoutMoreButtons=true
        withoutBottom=true
      }}
    `;
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`
      {{> 'blocks/product-card/product-card'
        id='0000'
        modification="big"
        name="name"
        imgSrc="@img/image.jpeg"
        href='./href.html'
        imgLoading='lazy'
        bonusesCount=100
        currentPrice="text"
        prevPrice=55068
        inBasket=false
        isFavorite=false
        isCompared=false
        buttonIsDisabled=false
        status=(parseJSON '{
          "color": "orange",
          "text": "text"
        }')
        isHit=false
        badgeHas=true
        tagsHas=true
        badge=[{ color:"orange", text:"text" }]
        tags=(parseJSON '{
          "timer": { "text": "text", "hasModification": false, "modification": "" },
          "count": { "text": "text", "hasModification": false, "modification": "" }
        }')
        withoutLinks=true
        linksTargetBlank=true
        withoutInfoList=true
        withoutMoreButtons=true
        withoutBottom=true
      }}
    `));
  });
});

describe('class with condition', () => {
  it('expands conditional classes', async () => {
    const input = `<div class="block{{#if other}} block--active{{/if}}"></div>`;
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`
      <div
        class="
          block
          {{#if other}}
            block--active
          {{/if}}
        "
      ></div>
    `));
  });
});

describe('boolean attributes', () => {
  it('omits empty attribute values for data attributes', async () => {
    const input = `<a class="class" data-form-button="">Link</a>`;
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`<a class="class" data-form-button>Link</a>`));
  });
});

describe('block indentation', () => {
  it('indents nested blocks and closes correctly', async () => {
    const input = `
      {{#each items}}
      <li>
      {{#if icon}}
      lorem
      {{else}}
      ipsum
      {{/if}}
      </li>
      {{/each}}
    `;
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`
      {{#each items}}
        <li>
          {{#if icon}}
            lorem
          {{else}}
            ipsum
          {{/if}}
        </li>
      {{/each}}
    `));
  });
});

describe('mustache spacing', () => {
  it('normalizes spaces for simple mustache', async () => {
    const input = '{{value}}';
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL('{{ value }}'));
  });

  it('removes trailing space before block close', async () => {
    const input = '{{#if item }}{{/if}}';
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`
      {{#if item}}
      {{/if}}
    `));
  });
});

describe('helpers with hash pairs', () => {
  it('prints multiple hash pairs on separate lines', async () => {
    const input = `
      {{assign
        headTitle="Lorem ipsum | Page title"
        headDescription="Placeholder description"
      }}
    `;
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`
      {{ assign
        headTitle="Lorem ipsum | Page title"
        headDescription="Placeholder description"
      }}
    `));
  });
});

describe('handlebars block attribute values', () => {
  it('expands block structures inside attribute values to separate lines', async () => {
    const input = stripIndent(`
      <input
        class="form__input"
        type="text"
        name="lorem-code"
        readonly=""
        value="{{#if auth}}{{codeText}}{{else}}lorem-ipsum{{/if}} "
        {{#if auth}}
          onfocus="this.select();"
        {{/if}}
      />
    `);

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(`
        <input
          class="form__input"
          type="text"
          name="lorem-code"
          readonly=""
          value="
            {{#if auth}}
              {{codeText}}
            {{else}}
              lorem-ipsum
            {{/if}}
          "
          {{#if auth}}
            onfocus="this.select();"
          {{/if}}
        />
      `),
    );
  });
});

describe('comments', () => {
  it('preserves comments', async () => {
    const input = '{{! short comment}}';
    const output = await format(input);
    expect(output).toBe('{{! short comment}}\n');
  });

  it('keeps single-line block comments in block form', async () => {
    const input = '{{!-- @backend Do not touch this --}}';
    const output = await format(input);
    expect(output).toBe('{{!-- @backend Do not touch this --}}\n');
  });

  it('keeps inline block comments intact when they contain mustaches', async () => {
    const input = stripIndent(`
      <div class="banner" data-attribute-id="{{ id }}" data-attribute="banner">
        {{#if priceDiff}}
          {{!-- <span class="banner__discount">-{{ priceDiff }} $</span> --}}
        {{/if}}
      </div>
    `);

    const output = await format(input, { printWidth: 120 });

    expect(output).toBe(
      stripIndentWithNL(`
        <div class="banner" data-attribute-id="{{ id }}" data-attribute="banner">
          {{#if priceDiff}}
            {{!-- <span class="banner__discount">-{{ priceDiff }} $</span> --}}
          {{/if}}
        </div>
      `),
    );
  });

  it('keeps single-line HTML comments on their own line', async () => {
    const input = stripIndent(`
      <!-- comment -->
      <div class="class">
    `);

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(input),
    );
  });

  it('preserves indentation inside multiline HTML comments', async () => {
    const input = stripIndent(`
      <!--
        comment
      -->
    `);

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(input),
    );
  });

  it('leaves HTML comments with nested markup untouched', async () => {
    const input = stripIndent(`
      <!--
        <li class="class">
          <button type="button">
            <span>Lorem</span>
          </button>
        </li> 
      -->
    `);

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(input),
    );
  });

  it('retains existing spacing inside misaligned HTML comments', async () => {
    const input = stripIndent(`
      <!-- <li class="class">
                <button type="button">
                  <span>Lorem</span>
                </button>
        </li> 
      -->
    `);

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(input),
    );
  });
});

describe('comments stability', () => {
  it('keeps multiline content untouched', async () => {
    const input = stripIndent(`
      {{!--
            @name Example

             prop: string;
      --}}
    `);

    const first = await format(input);
    const second = await format(first);

    expect(first).toMatch(/^{{!--\n\s*@name Example\n\n\s*prop: string;\n--}}/);
    expect(second).toBe(first);
  });

  it('trims trailing whitespace before closing dashes', async () => {
    const input = stripIndent(`
      {{!--
            @name Example

             prop: string;
       --}}
    `);

    const first = await format(input);
    const second = await format(first);

    expect(first).toMatch(/^{{!--\n\s*@name Example\n\n\s*prop: string;\n--}}/);
    expect(second).toBe(first);
  });
});

describe('prettier ignore', () => {
  it('skips formatting for the next node after an ignore comment', async () => {
    const input = stripIndent(`
      {{!-- prettier-ignore --}}
      <a   href="{{ href }}"  class="gallery__image-wrapper" tabindex="-1">
            <img alt="{{ name }}" title="{{ name }}"   class="gallery__image" />
      </a>
    `);

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(`
        {{!-- prettier-ignore --}}
        <a   href="{{ href }}"  class="gallery__image-wrapper" tabindex="-1">
              <img alt="{{ name }}" title="{{ name }}"   class="gallery__image" />
        </a>
      `),
    );
  });

  it('ignores block content without affecting surrounding nodes', async () => {
    const input = stripIndent(`
      <div>
        {{!-- prettier-ignore --}}
        <span  data-attribute="example">  lorem ipsum </span>
        <p>  Lorem paragraph  </p>
      </div>
    `);

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(`
        <div>
          {{!-- prettier-ignore --}}
          <span  data-attribute="example">  lorem ipsum </span>
          <p>Lorem paragraph</p>
        </div>
      `),
    );
  });

  it('ignores everything between prettier-ignore-start and prettier-ignore-end', async () => {
    const input = stripIndent(`
      {{!-- prettier-ignore-start --}}
      <!doctype html>
      <html lang="en">
        <body
          {{#if bodyClass}}
            class="{{ bodyClass }}"
          {{/if}}
        >
          <div
            class="
              layout
              {{#if layoutClass}}
                {{layoutClass}}
              {{/if}}
            "
          >
      {{!-- prettier-ignore-end --}}
    `);

    const output = await format(input);

    expect(output).toBe(`${input}\n`);
  });

  it('ignores following markup when comment is written as short form', async () => {
    const input = stripIndent(`
      {{! prettier-ignore }}
      <!doctype html>
      <html lang="en">
        <body
          {{#if bodyClass}}
            class="{{ bodyClass }}"
          {{/if}}
        >
          <div
            class="
              layout
              {{#if layoutClass}}
                {{layoutClass}}
              {{/if}}
            "
          >
          </div>
        </body>
      </html>
    `);

    const output = await format(input);

    expect(output).toBe(`${input}\n`);
  });

  it('ignores next node when using prettier-ignore-attribute', async () => {
    const input = stripIndent(`
      <div>
        {{!-- prettier-ignore-attribute --}}
        <span   class="  block   block__item" data-attribute="1">
        </span>
      </div>
    `);

    const output = await format(input);

    expect(output).toBe(`${input}\n`);
  });
});

describe('raw text elements', () => {
  it('trims trailing empty lines inside script and style blocks', async () => {
    const input = stripIndent(`
      <style>
        :root {
          --var-color: #fff;
        }

        body {
          background-color: red;
        }
      </style>
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          document.body
            .querySelectorAll('.banner .form__input')
            ?.forEach($input => {
              $input.setAttribute('size', String($input.value.length + 5));
            });
        });
      </script>
    `);

    const firstPass = await format(input, { tabWidth: 2, useTabs: true });
    const secondPass = await format(firstPass, { tabWidth: 2, useTabs: true });

    expect(firstPass).toBe(secondPass);
    expect(firstPass).not.toMatch(/\n\s*\n\s*\n/);
  });
});

describe('multiline comment indentation', () => {
  it('normalizes inner indentation while respecting surrounding depth', async () => {
    const input = stripIndent(`
      {{!--
                @name Example slider

         imageLoading: "eager" | "lazy";

                        items: CommentData[];
      --}}
      <section
        class="slider slider__section slider__section--wide"
        data-attribute="slider"
      >
        <link rel="stylesheet" href="@views/components/reviews/reviews.scss" />
        <link rel="stylesheet" href="@styles/comments.scss" />

        <div class="slider__container">
          {{!--
            @backend

               Keep this placeholder
          --}}
          <div class="slider__header"></div>
        </div>
      </section>
    `);

    const output = await format(input);

    expect(output).toMatch(
      /^{{!--\n\s*@name Example slider\n\n\s*imageLoading: "eager" \| "lazy";\n\n\s*items: CommentData\[];\n--}}/m,
    );
    expect(output).toMatch(/\n\s*{{!--\n\s*@backend\n\n\s*Keep this placeholder\n\s*--}}/m);
  });
});

describe('unmatched structures', () => {
  it('does not synthesize closing tags for incomplete blocks', async () => {
    const input = stripIndent(`
      {{#if (or categoryName countView)}}
        {{! comment}}
        <div class="card__info">
    `);
    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(`
        {{#if (or categoryName countView)}}
        {{! comment}}
        <div class="card__info">
      `),
    );
  });

  it('keeps lone element start tags without adding implicit closings', async () => {
    const input = stripIndent(`
      <div class="card__info">
      lorem
    `);
    const output = await format(input);

    expect(output).toBe(stripIndentWithNL(`
      <div class="card__info">
      lorem
    `));
  });
});

describe('inline child elements', () => {
  it('keeps short inline text on a single line when within print width', async () => {
    const input =
      '<span class="banner__discount">Lorem ipsum dolor sit amet that still fits on one line</span>';
    const output = await format(input, { printWidth: 120 });

    expect(output).toBe(stripIndentWithNL(`
      <span class="banner__discount">Lorem ipsum dolor sit amet that still fits on one line</span>
    `));
  });

  it('keeps inline content containing mustache expressions on a single line when within print width', async () => {
    const input =
      '<span class="banner__discount">Lorem ipsum text with an amount {{ amount }} $ for one item</span>';
    const output = await format(input, { printWidth: 120 });

    expect(output).toBe(stripIndentWithNL(`
      <span class="banner__discount">Lorem ipsum text with an amount {{ amount }} $ for one item</span>
    `));
  });

  it('x', async () => {
    const input = stripIndent(`
											<p class="delivery-info-modal__list-item-title">Стационарные игровые приставки Бытовая техника, Мобильный транспорт</p>
    `);

    const output = await format(input, { printWidth: 80 });

    expect(output).toBe(
      stripIndentWithNL(`
											<p class="delivery-info-modal__list-item-title">
                        Стационарные игровые приставки Бытовая техника, Мобильный транспорт
                      </p>
      `),
    );
  });

  it('x1', async () => {
    const input = stripIndent(`
											<p class="delivery-info-modal__list-item-title-2 delivery-info-modal__list-item-title-1 delivery-info-modal__list-item-title">Стационарные игровые приставки Бытовая техника, Мобильный транспорт</p>
    `);

    const output = await format(input, { printWidth: 80 });

    expect(output).toBe(
      stripIndentWithNL(`
											<p 
                        class="
                          delivery-info-modal__list-item-title-2
                          delivery-info-modal__list-item-title-1
                          delivery-info-modal__list-item-title
                        "
                      >
                        Стационарные игровые приставки Бытовая техника, Мобильный транспорт
                      </p>
      `),
    );
  });
  
  it('moves the closing bracket to a new line when the opening tag wraps', async () => {
    const input = stripIndent(`
      <button class="modal__body-close-button button-primary-orange button" type="button" data-hystclose>Закрыть</button>
    `);

    const output = await format(input, { printWidth: 80 });

    expect(output).toBe(
      stripIndentWithNL(`
        <button
          class="modal__body-close-button button-primary-orange button"
          type="button"
          data-hystclose
        >
          Закрыть
        </button>
      `),
    );
  });

  it.todo('breaks inline elements with verbose class names and inline partials');
  it.todo('preserves block formatting when inline partials are already on new lines');
  it.todo('wraps inline content that mixes text, <br>, and mustache output');
  it.todo('indents inline children that contain conditional blocks');
});

describe('void elements', () => {
  it('treats source as self closing without explicit slash', async () => {
    const input = stripIndent('<source media="(min-width:1440px)" srcset="@img/pic.avif" type="image/avif">');
    const output = await format(input);
    expect(output).toBe(stripIndentWithNL(`<source media="(min-width:1440px)" srcset="@img/pic.avif" type="image/avif" />`));
  });

  it('avoids leading whitespace before the self-closing slash on its own line', async () => {
    const input = stripIndent(`<source media="(min-width: 650px)" srcset="@img/certificates/background/background.webp" type="image/webp"/>`);

    const output = await format(input);

    expect(output).toBe(stripIndentWithNL(`
      <source
        media="(min-width: 650px)"
        srcset="@img/certificates/background/background.webp"
        type="image/webp"
      />
    `));
  });
});

describe('data attribute ordering', () => {
  it('allows overriding data-* order through config', async () => {
    const input = '<div data-attribute-b="b" data-attribute-a="a" data-attribute-c="c"></div>';
    const output = await format(input, { dataAttributeOrder: ['data-attribute-c', 'data-attribute-a'] });
    expect(output).toBe(`<div data-attribute-c="c" data-attribute-a="a" data-attribute-b="b"></div>\n`);
  });
});

describe('handlebars attribute blocks', () => {
  it('preserves block-scoped attribute order and keeps simple wrappers inline', async () => {
    const input = `<a href="{{ href }}" class="gallery__image-wrapper" tabindex="-1">
  <img
    alt="{{ name }}"
    title="{{ name }}"
    class="
      gallery__image
      {{#ifEquals imgLoading 'lazy'}}
        gallery__image--lazy
      {{/ifEquals}}
    "
    {{#ifEquals imgLoading 'lazy'}}
      src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII="
      data-attribute-src="{{ imgSrc }}"
    {{/ifEquals}}
    {{#ifEquals imgLoading 'eager'}}
      src="{{ imgSrc }}"
      loading="eager"
    {{/ifEquals}}
  />
</a>`;

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(`
        <a class="gallery__image-wrapper" href="{{ href }}" tabindex="-1">
          <img
            class="
              gallery__image
              {{#ifEquals imgLoading 'lazy'}}
                gallery__image--lazy
              {{/ifEquals}}
            "
            alt="{{ name }}"
            title="{{ name }}"
            {{#ifEquals imgLoading 'lazy'}}
              src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII="
              data-attribute-src="{{ imgSrc }}"
            {{/ifEquals}}
            {{#ifEquals imgLoading 'eager'}}
              src="{{ imgSrc }}"
              loading="eager"
            {{/ifEquals}}
          />
        </a>
      `),
    );
  });
});

describe('line wrapping', () => {
  it.todo('wraps long attribute lists to new lines when exceeding print width');
  it.todo('wraps long attributes on void elements');
});

describe('element children', () => {
  it('keeps single child elements on new lines', async () => {
    const input =
      '<a class="card__title-block" href="{{ href }}" tabindex="-1"><span class="card__title">{{ name }}</span></a>';

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(`
        <a class="card__title-block" href="{{ href }}" tabindex="-1">
          <span class="card__title">{{ name }}</span>
        </a>
      `),
    );
  });

  it('avoids inlining single mustache children inside block programs', async () => {
    const input = stripIndent(`
      {{#if weight}}
        <li class="list__price-description list__price-description--mobile">{{ weight }}</li>
      {{/if}}
    `);

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(`
        {{#if weight}}
          <li class="list__price-description list__price-description--mobile">
            {{ weight }}
          </li>
        {{/if}}
      `),
    );
  });
});

describe('raw text elements', () => {
  it('preserves multiline script content instead of collapsing it inline', async () => {
    const input = stripIndent(`<script>
  document.addEventListener('DOMContentLoaded', () => {
    console.log('ready');
  });
</script>`);

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(`
        <script>
          document.addEventListener('DOMContentLoaded', () => {
            console.log('ready');
          });
        </script>
      `),
    );
  });

  it('keeps style blocks formatted across multiple lines', async () => {
    const input = stripIndent(`<style>
  .banner {
    display: none;
  }
</style>`);

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(`
        <style>
          .banner {
            display: none;
          }
        </style>
      `),
    );
  });
});

describe('nested handlebars blocks and multiline attributes', () => {
  it('normalizes indentation and avoids blank lines directly inside blocks', async () => {
    const input = stripIndent(`
      <div>

      {{#if buttonHas}}

      {{#ifEquals titleButton "Rate"}}
      <button
              class="
                      button
                      button--primary-{{ colorButton }}
              "
              type="button"
              data-attribute-modal="#modal"
      >
              {{ titleButton }}
      </button>
      {{/ifEquals}}

      {{#ifEquals titleButton "Write review"}}
      <a
              class="
                      button
                      button--primary-{{ colorButton }}
              "
              href="#"
      >
              {{ titleButton }}
      </a>
      {{/ifEquals}}

      {{/if}}
      </div>
    `);

    const output = await format(input);

    expect(output).toBe(
      stripIndentWithNL(`
        <div>

          {{#if buttonHas}}
            {{#ifEquals titleButton "Rate"}}
              <button
                class="
                  button
                  button--primary-{{ colorButton }}
                "
                type="button"
                data-attribute-modal="#modal"
              >
                {{ titleButton }}
              </button>
            {{/ifEquals}}

            {{#ifEquals titleButton "Write review"}}
              <a
                class="
                  button
                  button--primary-{{ colorButton }}
                "
                href="#"
              >
                {{ titleButton }}
              </a>
            {{/ifEquals}}
          {{/if}}
        </div>
      `),
    );
  });
});

describe('blank lines', () => {
  const template = stripIndent(`
    <div>
      {{#if value}}
        <span>one</span>
      {{/if}}

      <span>two</span>
    </div>
  `);

  it('preserves a single intentional blank line between nodes', async () => {
    const output = await format(template);

    expect(output).toBe(stripIndentWithNL(template));
  });

  it.todo('removes extra blank lines');

  it('reduces multiple blank lines to the configured maximum', async () => {
    const input = stripIndent(`
      <div>
        {{#if value}}
          <span>one</span>
        {{/if}}


        <span>two</span>
      </div>
    `);
    const output = await format(input);

    expect(output).toBe(stripIndentWithNL(template));
  });

  it('honors overrides that allow more than one blank line', async () => {
    const input = stripIndent(`
      <div>
        {{#if value}}
          <span>one</span>
        {{/if}}


        <span>two</span>
      </div>
    `);
    const output = await format(input, { maxEmptyLines: 2 });

    expect(output).toBe(stripIndentWithNL(input));
  });
});
