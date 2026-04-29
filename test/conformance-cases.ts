export interface ConformanceCase {
  id: string;
  name: string;
  area: string;
  priority: 'release-blocker' | 'high' | 'medium';
  rationale: string;
  source: string;
  expected?: string;
  options?: Record<string, unknown>;
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

function withTrailingNewline(input: string): string {
  return `${stripIndent(input)}\n`;
}

export const readyCases: ConformanceCase[] = [
  {
    id: 'partial-nested-json',
    name: 'formats partials with nested JSON-like hash values',
    area: 'core-syntax',
    priority: 'high',
    rationale: 'Partial invocations often carry large structured payloads in real component libraries.',
    source: stripIndent(`
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
    `),
    expected: withTrailingNewline(`
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
    `),
  },
  {
    id: 'ignore-range',
    name: 'preserves explicit ignore ranges with mixed HTML and Handlebars',
    area: 'ignore',
    priority: 'high',
    rationale: 'Large legacy templates need a safe escape hatch during migration.',
    source: stripIndent(`
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
    `),
    expected: withTrailingNewline(`
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
    `),
  },
  {
    id: 'raw-text-elements',
    name: 'keeps script and style content multiline and stable',
    area: 'html-interop',
    priority: 'high',
    rationale: 'Real templates often embed CSS and JS, and raw text handling must be stable.',
    source: stripIndent(`
      <style>
        :root {
          --var-color: #fff;
        }

        body {
          background-color: red;
        }
      </style>
      <script>
        document.addEventListener("DOMContentLoaded", () => {
          console.log("ready");
        });
      </script>
    `),
    expected: withTrailingNewline(`
      <style>
        :root {
          --var-color: #fff;
        }

        body {
          background-color: red;
        }
      </style>
      <script>
        document.addEventListener("DOMContentLoaded", () => {
          console.log("ready");
        });
      </script>
    `),
  },
  {
    id: 'whitespace-control-inline',
    name: 'supports whitespace control on inline mustaches',
    area: 'core-syntax',
    priority: 'release-blocker',
    rationale: 'Trim markers are common and change rendered output.',
    source: `<span>{{~ label ~}}</span>`,
    expected: withTrailingNewline(`<span>{{~ label ~}}</span>`),
  },
  {
    id: 'whitespace-control-block',
    name: 'supports whitespace control on block boundaries',
    area: 'core-syntax',
    priority: 'release-blocker',
    rationale: 'Block trim markers must not be normalized away.',
    source: stripIndent(`
      {{~#if show ~}}
        <span>{{~ value ~}}</span>
      {{~/if~}}
    `),
    expected: withTrailingNewline(`
      {{~#if show ~}}
        <span>
          {{~ value ~}}
        </span>
      {{~/if~}}
    `),
  },
  {
    id: 'raw-blocks',
    name: 'preserves raw blocks verbatim',
    area: 'core-syntax',
    priority: 'release-blocker',
    rationale: 'Raw blocks are designed specifically to bypass normal parsing.',
    source: stripIndent(`
      {{{{raw}}}}
      <div>{{ notParsed }}</div>
      {{{{/raw}}}}
    `),
    expected: withTrailingNewline(`
      {{{{raw}}}}
      <div>{{ notParsed }}</div>
      {{{{/raw}}}}
    `),
  },
  {
    id: 'block-partials',
    name: 'formats block partials with nested content',
    area: 'core-syntax',
    priority: 'release-blocker',
    rationale: 'Block partials are a practical requirement in larger Handlebars codebases.',
    source: stripIndent(`
      {{#> layout title=pageTitle}}
        <main>{{ body }}</main>
      {{/layout}}
    `),
    expected: withTrailingNewline(`
      {{#> layout title=pageTitle}}
        <main>
          {{ body }}
        </main>
      {{/layout}}
    `),
  },
  {
    id: 'malformed-block-partial-recovery',
    name: 'preserves malformed block partials without formatting the incomplete body',
    area: 'comments-and-recovery',
    priority: 'high',
    rationale: 'Half-written block partials should stay stable while the user is editing.',
    source: stripIndent(`
      {{#> layout}}
        <main>{{body}}</main>
    `),
    expected: withTrailingNewline(`
      {{#> layout}}
        <main>{{body}}</main>
    `),
  },
  {
    id: 'inline-partials',
    name: 'supports inline partial definitions',
    area: 'core-syntax',
    priority: 'release-blocker',
    rationale: 'Inline partials are common in component-style templates.',
    source: stripIndent(`
      {{#*inline "badge"}}
        <span class="badge">{{ label }}</span>
      {{/inline}}
      {{> badge}}
    `),
    expected: withTrailingNewline(`
      {{#*inline "badge"}}
        <span class="badge">
          {{ label }}
        </span>
      {{/inline}}
      {{> badge}}
    `),
  },
  {
    id: 'nested-block-indentation',
    name: 'indents nested blocks without collapsing structure',
    area: 'core-syntax',
    priority: 'high',
    rationale: 'Nested control flow is the minimum bar for maintainable Handlebars formatting.',
    source: stripIndent(`
      {{#each items}}
      <li>
      {{#if icon}}
      lorem
      {{else}}
      ipsum
      {{/if}}
      </li>
      {{/each}}
    `),
    expected: withTrailingNewline(`
      {{#each items}}
        <li>
          {{#if icon}}
            lorem
          {{else}}
            ipsum
          {{/if}}
        </li>
      {{/each}}
    `),
  },
  {
    id: 'blank-line-cap',
    name: 'caps blank lines to the configured maximum',
    area: 'whitespace',
    priority: 'medium',
    rationale: 'Whitespace preservation needs a deterministic ceiling for repo-wide formatting.',
    source: stripIndent(`
      <div>
        {{#if value}}
          <span>one</span>
        {{/if}}


        <span>two</span>
      </div>
    `),
    expected: withTrailingNewline(`
      <div>
        {{#if value}}
          <span>one</span>
        {{/if}}

        <span>two</span>
      </div>
    `),
  },
];

export const backlogCases: ConformanceCase[] = [
  {
    id: 'dynamic-partials',
    name: 'supports dynamic partial names',
    area: 'core-syntax',
    priority: 'high',
    rationale: 'Dynamic composition is common in CMS-style projects.',
    source: `{{> (lookup . "partialName") data=this}}`,
  },
  {
    id: 'decorators',
    name: 'preserves decorators and decorator blocks',
    area: 'core-syntax',
    priority: 'medium',
    rationale: 'Not every team uses decorators, but open source users will hit them.',
    source: stripIndent(`
      {{#*inline "button"}}
        <button>{{ label }}</button>
      {{/inline}}
    `),
  },
  {
    id: 'nested-subexpressions',
    name: 'supports nested subexpressions inside params and hash',
    area: 'core-syntax',
    priority: 'high',
    rationale: 'Helpers quickly become expression-heavy in production templates.',
    source: `{{helper (formatPrice (multiply price qty) currency=currency) show=(or isSale isPromo)}}`,
  },
  {
    id: 'path-variants',
    name: 'supports parent paths, locals, and data vars',
    area: 'core-syntax',
    priority: 'high',
    rationale: 'Relative lookup is a fundamental part of real Handlebars templates.',
    source: stripIndent(`
      {{#each items as |item|}}
        <li data-index="{{ @index }}">{{ ../title }} {{ item.name }} {{ @root.locale }}</li>
      {{/each}}
    `),
  },
  {
    id: 'path-literals',
    name: 'supports path literals and bracket lookup',
    area: 'core-syntax',
    priority: 'medium',
    rationale: 'Data often contains dash-separated keys from APIs and CMS systems.',
    source: `{{ user.[first-name] }}`,
  },
  {
    id: 'triple-stash-in-html',
    name: 'handles triple-stash alongside normal HTML children',
    area: 'core-syntax',
    priority: 'high',
    rationale: 'Unescaped HTML is risky but widespread in legacy templates.',
    source: stripIndent(`
      <div class="wysiwyg">
        {{{ html }}}
      </div>
    `),
  },
  {
    id: 'else-if-chain',
    name: 'preserves else-if style branches predictably',
    area: 'core-syntax',
    priority: 'medium',
    rationale: 'Many teams write helper-like branch chains with `else if`.',
    source: stripIndent(`
      {{#if primary}}
        one
      {{else if secondary}}
        two
      {{else}}
        three
      {{/if}}
    `),
  },
  {
    id: 'text-with-angle-bracket',
    name: 'does not treat plain text with < as HTML',
    area: 'html-interop',
    priority: 'release-blocker',
    rationale: 'Plain text such as math, comparisons, and copy must not be reparsed as markup.',
    source: `<p>1 < 2 and 3 < 4</p>`,
  },
  {
    id: 'unquoted-attr-mustache',
    name: 'supports unquoted attributes containing mustaches',
    area: 'html-interop',
    priority: 'high',
    rationale: 'Legacy templates frequently omit quotes around simple data attrs.',
    source: `<div data-id={{id}}></div>`,
  },
  {
    id: 'quoted-helper-attr',
    name: 'handles nested quotes inside helper-backed attribute values',
    area: 'html-interop',
    priority: 'high',
    rationale: 'Translation helpers and inline helpers often appear inside quoted attrs.',
    source: `<button title='{{t "cta.buy"}}'>Buy</button>`,
  },
  {
    id: 'multi-fragment-attr',
    name: 'handles multiple text and mustache fragments in a single attribute',
    area: 'html-interop',
    priority: 'high',
    rationale: 'Class names and aria labels are often assembled from many fragments.',
    source: `<div class="card {{ size }} {{#if active}}card--active{{/if}} {{ extra }}"></div>`,
  },
  {
    id: 'block-generated-attributes',
    name: 'formats blocks that emit multiple attributes in one branch',
    area: 'html-interop',
    priority: 'release-blocker',
    rationale: 'Conditional attr groups are one of the hardest real-world template shapes.',
    source: stripIndent(`
      <img
        {{#if lazy}}
          src="data:image/gif;base64,R0lGODlhAQABAAAAACw="
          data-src="{{ src }}"
          loading="lazy"
        {{else}}
          src="{{ src }}"
          loading="eager"
        {{/if}}
      />
    `),
  },
  {
    id: 'custom-elements',
    name: 'preserves custom elements and web-component style attributes',
    area: 'html-interop',
    priority: 'high',
    rationale: 'Open-source consumers will mix Handlebars with design systems and web components.',
    source: `<product-card data-id="{{ id }}" is-featured="{{ featured }}"></product-card>`,
  },
  {
    id: 'svg-and-namespaces',
    name: 'supports SVG and namespaced attributes',
    area: 'html-interop',
    priority: 'high',
    rationale: 'Icons and sprite usage should not force users to disable the formatter.',
    source: stripIndent(`
      <svg aria-hidden="true">
        <use xlink:href="#icon-{{ name }}"></use>
      </svg>
    `),
  },
  {
    id: 'textarea-pre-whitespace',
    name: 'preserves whitespace-sensitive textarea and pre content',
    area: 'html-interop',
    priority: 'high',
    rationale: 'These tags are not raw HTML, but their whitespace semantics matter.',
    source: stripIndent(`
      <textarea>
        {{ value }}
      </textarea>
    `),
  },
  {
    id: 'script-closing-tag-in-string',
    name: 'does not terminate raw-text parsing on closing tags inside strings',
    area: 'html-interop',
    priority: 'release-blocker',
    rationale: 'Naive closing-tag detection breaks real JavaScript templates and string literals.',
    source: stripIndent(`
      <script>
        const tpl = "</script><div>{{value}}</div>";
        console.log(tpl);
      </script>
    `),
  },
  {
    id: 'doctype-root-mix',
    name: 'formats doctype plus root-level comments and blocks',
    area: 'html-interop',
    priority: 'medium',
    rationale: 'Full-page templates are a likely open-source use case.',
    source: stripIndent(`
      <!doctype html>
      {{!-- page shell --}}
      <html lang="{{ locale }}">
        <body>{{{ body }}}</body>
      </html>
    `),
  },
  {
    id: 'comment-with-trim-markers',
    name: 'handles comments that also use whitespace control markers',
    area: 'comments-and-recovery',
    priority: 'high',
    rationale: 'Comment parsing and trim markers can interact in surprising ways.',
    source: `{{~!-- keep spacing stable --~}}`,
  },
  {
    id: 'broken-html-hbs-interleave',
    name: 'stays stable on malformed interleaving of HTML and Handlebars',
    area: 'comments-and-recovery',
    priority: 'high',
    rationale: 'Real repositories contain half-edited templates and merge-conflict leftovers.',
    source: stripIndent(`
      {{#if open}}
        <div class="card">
      {{else}}
        </span>
      {{/if}}
    `),
  },
  {
    id: 'html-comment-with-mustaches',
    name: 'preserves HTML comments containing handlebars-looking text',
    area: 'comments-and-recovery',
    priority: 'medium',
    rationale: 'Comments should not accidentally become a parseable template surface.',
    source: `<!-- {{ this should stay comment text }} -->`,
  },
  {
    id: 'handlebars-comment-with-mustaches',
    name: 'preserves Handlebars comments containing handlebars-looking text',
    area: 'comments-and-recovery',
    priority: 'high',
    rationale: 'Comment content should not accidentally become a parsed template surface.',
    source: `{{!-- <span>{{ price }}</span> --}}`,
    expected: withTrailingNewline(`{{!-- <span>{{ price }}</span> --}}`),
  },
  {
    id: 'crlf-input',
    name: 'normalizes or preserves CRLF consistently',
    area: 'stability',
    priority: 'release-blocker',
    rationale: 'A formatter becomes noisy fast if newline handling differs by platform.',
    source: '<div>\r\n  {{ value }}\r\n</div>\r\n',
  },
  {
    id: 'bom-input',
    name: 'handles UTF-8 BOM at file start',
    area: 'stability',
    priority: 'release-blocker',
    rationale: 'Some editors and exported fixtures still produce BOM-prefixed files.',
    source: '\uFEFF<div>{{ value }}</div>',
  },
  {
    id: 'unicode-content',
    name: 'stays stable on Cyrillic, CJK, and HTML entities',
    area: 'stability',
    priority: 'high',
    rationale: 'Open-source users will bring multilingual templates immediately.',
    source: `<p title="{{ title }}">Привет &amp; 你好 {{ name }}</p>`,
  },
  {
    id: 'triple-pass-stability',
    name: 'stays identical across repeated formatting passes on large mixed fixtures',
    area: 'stability',
    priority: 'high',
    rationale: 'Idempotence is one of the clearest signals that the formatter is safe to adopt.',
    source: stripIndent(`
      <section class="hero {{#if theme}}hero--{{ theme }}{{/if}}">
        {{#if title}}
          <h1>{{ title }}</h1>
        {{/if}}
        {{> cta href=href label=label }}
      </section>
    `),
  },
];
