import { describe, expect, it } from 'vitest';
import prettier from 'prettier';
import * as plugin from '../src/plugin';
import { parse } from '../src/parser';
import type {
  BlockStatement,
  ElementNode,
  MustacheStatement,
  PartialStatement,
  Program,
  TextNode,
  UnmatchedNode,
} from '../src/types';

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

function parseProgram(source: string): Program {
  return parse(source);
}

function firstNode<T>(source: string): T {
  return parseProgram(source).body[0] as T;
}

describe('parser coverage from mined anonymized patterns', () => {
  it('parses assign-style hashes with bracket paths', () => {
    const mustache = firstNode<MustacheStatement>(
      '{{assign currentA=dataA.items.[0].value fallbackB=listB.[1]}}',
    );

    expect(mustache).toMatchObject({
      type: 'MustacheStatement',
      path: 'assign',
      params: [],
      hash: [
        { key: 'currentA', value: 'dataA.items.[0].value' },
        { key: 'fallbackB', value: 'listB.[1]' },
      ],
    });
  });

  it('parses assign helpers with nested concatArrays and parseJSON chains', () => {
    const mustache = firstNode<MustacheStatement>(
      `{{assign typeListA=(concatArrays (array (parseJSON (concat '{ "id": "all", "value": "all", "name": "All" }'))) sourceListA)}}`,
    );

    expect(mustache).toMatchObject({
      type: 'MustacheStatement',
      path: 'assign',
      params: [],
      hash: [
        {
          key: 'typeListA',
          value:
            `(concatArrays (array (parseJSON (concat '{ "id": "all", "value": "all", "name": "All" }'))) sourceListA)`,
        },
      ],
    });
  });

  it('parses partial hashes with nested subexpressions and relative paths', () => {
    const partial = firstNode<PartialStatement>(
      "{{> card-a value=(pickA @root.listA.[1] ../itemA) labelC=(formatA (getA dataB.[2] 'name'))}}",
    );

    expect(partial).toMatchObject({
      type: 'PartialStatement',
      path: 'card-a',
      params: [],
      hash: [
        { key: 'value', value: '(pickA @root.listA.[1] ../itemA)' },
        { key: 'labelC', value: "(formatA (getA dataB.[2] 'name'))" },
      ],
    });
  });

  it('preserves dynamic mustache tag wrappers as unmatched nodes', () => {
    const program = parseProgram('<{{ @root.tagA }} class="box">{{ valueA }}</{{ @root.tagA }}>');

    expect(program.body).toEqual([
      {
        type: 'UnmatchedNode',
        raw: '<{{ @root.tagA }} class="box">{{ valueA }}</{{ @root.tagA }}>',
      } as UnmatchedNode,
    ]);
  });

  it('keeps raw include directives as plain text nodes', () => {
    const program = parseProgram("@@include('../part-a/file-a.html', { valueA: true })");

    expect(program.body).toEqual([
      {
        type: 'TextNode',
        value: "@@include('../part-a/file-a.html', { valueA: true })",
      },
    ]);
  });

  it('parses setVar-style calls with quoted params and nested helpers', () => {
    const mustache = firstNode<MustacheStatement>("{{setVar 'valueA' (getA itemA @root.mapA)}}");

    expect(mustache).toMatchObject({
      type: 'MustacheStatement',
      path: 'setVar',
      params: ["'valueA'", '(getA itemA @root.mapA)'],
      hash: [],
    });
  });

  it('parses partials with positional this params and bracket-path hashes', () => {
    const partial = firstNode<PartialStatement>("{{> box-a this flagA=true itemB=@root.listA.[0]}}");

    expect(partial).toMatchObject({
      type: 'PartialStatement',
      path: 'box-a',
      params: ['this'],
      hash: [
        { key: 'flagA', value: 'true' },
        { key: 'itemB', value: '@root.listA.[0]' },
      ],
    });
  });

  it('parses custom block helpers with quoted operator params', () => {
    const block = firstNode<BlockStatement>("{{#ifCompare @index '<' '2'}}{{ this }}{{/ifCompare}}");

    expect(block).toMatchObject({
      type: 'BlockStatement',
      path: 'ifCompare',
      params: ['@index', "'<'", "'2'"],
    });
  });

  it('parses deeply nested blocks with nested attribute programs without leaking close tokens', () => {
    const eachBlock = firstNode<BlockStatement>(
      '{{#each listA as |itemA|}}{{#if itemA.flag}}{{#unless @root.off}}<div class="box{{#if itemA.mode}} box--{{ itemA.mode }}{{/if}}" data-a="{{#if itemA.value}}{{ itemA.value }}{{else}}{{ @root.fallbackA }}{{/if}}"><span>{{ itemA.label }}</span></div>{{/unless}}{{/if}}{{/each}}',
    );

    const ifBlock = eachBlock.program.body[0] as BlockStatement;
    const unlessBlock = ifBlock.program.body[0] as BlockStatement;
    const element = unlessBlock.program.body[0] as ElementNode;

    expect(eachBlock).toMatchObject({
      type: 'BlockStatement',
      path: 'each',
      blockParams: ['itemA'],
    });
    expect(ifBlock.path).toBe('if');
    expect(unlessBlock.path).toBe('unless');
    expect(ifBlock.program.body).toHaveLength(1);
    expect(unlessBlock.program.body).toHaveLength(1);
    expect(element.tag).toBe('div');
    expect(
      ifBlock.program.body.some(
        (node) => node.type === 'TextNode' && (node as TextNode).value.includes('{{/each}}'),
      ),
    ).toBe(false);
  });

  it('parses application-json script contents as a single verbatim child', () => {
    const script = firstNode<ElementNode>(
      '<script id="data-a" type="application/json">{{{ json dataA }}}</script>',
    );
    const child = script.children[0] as TextNode;

    expect(script).toMatchObject({
      type: 'ElementNode',
      tag: 'script',
      selfClosing: false,
    });
    expect(script.children).toHaveLength(1);
    expect(child).toMatchObject({
      type: 'TextNode',
      value: '{{{ json dataA }}}',
      verbatim: true,
    });
  });
});

describe('formatter coverage from mined anonymized patterns', () => {
  it('preserves dynamic mustache tag wrappers verbatim', async () => {
    await expectStableFormat(
      '<{{ @root.tagA }} class="box">{{ valueA }}</{{ @root.tagA }}>',
      '<{{ @root.tagA }} class="box">{{ valueA }}</{{ @root.tagA }}>',
    );
  });

  it('preserves block-driven dynamic tag wrappers verbatim', async () => {
    await expectStableFormat(
      stripIndent(`
        <{{#if flagA}}a href="{{ hrefA }}"{{else}}div{{/if}} class="box">
          {{ valueA }}
        </{{#if flagA}}a{{else}}div{{/if}}>
      `),
      `
        <{{#if flagA}}a href="{{ hrefA }}"{{else}}div{{/if}} class="box">
          {{ valueA }}
        </{{#if flagA}}a{{else}}div{{/if}}>
      `,
    );
  });

  it('formats multiline partial hashes with bracket paths and nested subexpressions', async () => {
    await expectStableFormat(
      "{{> card-a value=dataA.items.[0].value itemB=(pickA @root.listA.[1] ../itemA) labelC=(formatA (getA dataB.[2] 'name'))}}",
      `
        {{> card-a
          value=dataA.items.[0].value
          itemB=(pickA @root.listA.[1] ../itemA)
          labelC=(formatA (getA dataB.[2] 'name'))
        }}
      `,
    );
  });

  it('formats block-generated aria and data attributes inside opening tags', async () => {
    await expectStableFormat(
      '<div class="box" {{#if flagA}}data-opened{{/if}} {{#ifEquals @index 0}}aria-selected="true"{{else}}aria-selected="false"{{/ifEquals}}></div>',
      `
        <div
          class="box"
          {{#if flagA}}
            data-opened
          {{/if}}
          {{#ifEquals @index 0}}
            aria-selected="true"
          {{else}}
            aria-selected="false"
          {{/ifEquals}}
        ></div>
      `,
    );
  });

  it('wraps JSON-like data attributes with nested helper expressions', async () => {
    await expectStableFormat(
      `<button type=button data-payload='{"ids": {{JSONstringify (map dataA.tabs.[0].items "x => x.id")}}, "flag": true}'></button>`,
      `
        <button
          type="button"
          data-payload='{"ids": {{JSONstringify (map dataA.tabs.[0].items "x => x.id")}}, "flag": true}'
        ></button>
      `,
      { printWidth: 70 },
    );
  });

  it('formats mixed text and block logic inside attribute values', async () => {
    await expectStableFormat(
      '<div class="box{{#if flagA}} box--on{{else}} box--off{{/if}} {{ classA }}" aria-label="{{#if titleA}}{{ titleA }}{{else}}valueA{{/if}}"></div>',
      `
        <div
          class="
            box
            {{#if flagA}}
              box--on
            {{else}}
              box--off
            {{/if}}
            {{ classA }}
          "
          aria-label="{{#if titleA}}{{ titleA }}{{else}}valueA{{/if}}"
        ></div>
      `,
    );
  });

  it('keeps include-style html comments verbatim before markup', async () => {
    await expectStableFormat(
      `<!-- @@include('../part-a/file-a.html', { valueA: true }) --><div>{{ valueA }}</div>`,
      `
        <!-- @@include('../part-a/file-a.html', { valueA: true }) -->
        <div>{{ valueA }}</div>
      `,
    );
  });

  it('keeps raw include directives stable as top-level text', async () => {
    await expectStableFormat(
      "@@include('../part-a/file-a.html', { valueA: true })",
      "@@include('../part-a/file-a.html', { valueA: true })",
    );
  });

  it('formats class values that generate modifiers inside each blocks', async () => {
    await expectStableFormat(
      '<div class="box {{#each listA as |itemA|}} box--{{itemA}}{{/each}}"></div>',
      `
        <div
          class="
            box
            {{#each listA as |itemA|}}
              box--{{ itemA }}
            {{/each}}
          "
        ></div>
      `,
    );
  });

  it('formats relative-path lazy-loading attributes generated by helper blocks', async () => {
    await expectStableFormat(
      '<img {{#ifEquals ../modeA \'lazy\'}}src="data:a" data-src="{{ imgA }}"{{/ifEquals}} alt="{{ nameA }}">',
      `
        <img
          {{#ifEquals ../modeA 'lazy'}}
            src="data:a" data-src="{{ imgA }}"
          {{/ifEquals}}
          alt="{{ nameA }}"
        />
      `,
    );
  });

  it('formats setVar-style statements with quoted names and nested helper calls', async () => {
    await expectStableFormat(
      "{{setVar 'valueA' (getA itemA @root.mapA)}}",
      "{{setVar 'valueA' (getA itemA @root.mapA)}}",
    );
  });

  it('formats assign helpers with nested concatArrays and parseJSON chains stably', async () => {
    await expectStableFormat(
      `{{assign typeListA=(concatArrays (array (parseJSON (concat '{ "id": "all", "value": "all", "name": "All" }'))) sourceListA)}}`,
      `{{assign typeListA=(concatArrays (array (parseJSON (concat '{ "id": "all", "value": "all", "name": "All" }'))) sourceListA)}}`,
    );
  });

  it('formats partials with positional this parameters and bracket-path hashes', async () => {
    await expectStableFormat(
      '{{> box-a this flagA=true itemB=@root.listA.[0]}}',
      `
        {{> box-a
          this
          flagA=true
          itemB=@root.listA.[0]
        }}
      `,
    );
  });

  it('formats custom block helpers with quoted operator params and this references', async () => {
    await expectStableFormat(
      "{{#ifCompare @index '<' '2'}}<span>{{ this }}</span>{{/ifCompare}}",
      `
        {{#ifCompare @index '<' '2'}}
          <span>
            {{ this }}
          </span>
        {{/ifCompare}}
      `,
    );
  });

  it('formats helper blocks that generate hidden and tabindex attributes', async () => {
    await expectStableFormat(
      '<div {{#ifNotEquals @index 0}}hidden{{/ifNotEquals}} {{#ifEquals @index 0}}tabindex="-1"{{/ifEquals}}></div>',
      `
        <div
          {{#ifNotEquals @index 0}}
            hidden
          {{/ifNotEquals}}
          {{#ifEquals @index 0}}
            tabindex="-1"
          {{/ifEquals}}
        ></div>
      `,
    );
  });

  it('formats class values with unless-driven modifier branches', async () => {
    await expectStableFormat(
      '<a class="linkA{{#unless flagA}} linkA--off{{/unless}}" href="{{ hrefA }}"></a>',
      `
        <a
          class="
            linkA
            {{#unless flagA}}
              linkA--off
            {{/unless}}
          "
          href="{{ hrefA }}"
        ></a>
      `,
    );
  });

  it('formats nested conditional helpers with increment and root-length lookups', async () => {
    await expectStableFormat(
      "{{#if (compare (increment @index) '<' @root.listA.length)}}<img src='a' alt=''>{{/if}}",
      `
        {{#if (compare (increment @index) '<' @root.listA.length)}}
          <img src="a" alt="" />
        {{/if}}
      `,
    );
  });

  it('keeps schema-style comma separators inline inside loops', async () => {
    await expectStableFormat(
      '{{#each listA}}"{{ this }}"{{#unless @last}},{{/unless}}{{/each}}',
      '{{#each listA}}"{{ this }}"{{#unless @last}},{{/unless}}{{/each}}',
    );
  });
});

describe('deep nesting and raw text coverage from mined patterns', () => {
  it('formats deeply nested loops with nested block attribute values and root lookups', async () => {
    await expectStableFormat(
      '{{#each listA as |itemA|}}{{#if itemA.flag}}{{#unless @root.off}}<div class="box{{#if itemA.mode}} box--{{ itemA.mode }}{{/if}}" data-a="{{#if itemA.value}}{{ itemA.value }}{{else}}{{ @root.fallbackA }}{{/if}}"><span>{{ itemA.label }}</span></div>{{/unless}}{{/if}}{{/each}}',
      `
        {{#each listA as |itemA|}}
          {{#if itemA.flag}}
            {{#unless @root.off}}
              <div
                class="
                  box
                  {{#if itemA.mode}}
                    box--{{ itemA.mode }}
                  {{/if}}
                "
                data-a="{{#if itemA.value}}{{ itemA.value }}{{else}}{{ @root.fallbackA }}{{/if}}"
              >
                <span>{{ itemA.label }}</span>
              </div>
            {{/unless}}
          {{/if}}
        {{/each}}
      `,
    );
  });

  it('preserves application-json scripts with triple-stash payloads inline', async () => {
    await expectStableFormat(
      '<script id="data-a" type="application/json">{{{ json dataA }}}</script>',
      '<script id="data-a" type="application/json">{{{ json dataA }}}</script>',
    );
  });

  it('preserves complex inline scripts with nested callbacks and selector guards', async () => {
    await expectStableFormat(
      `
        <script>
          document.addEventListener("DOMContentLoaded", () => {
            document.querySelectorAll("[data-scroll-to]").forEach(($button) => {
              $button.addEventListener("click", (event) => {
                const href = $button.getAttribute("href");

                if (!href || !href.startsWith("#")) {
                  return;
                }

                const $target = document.querySelector(href);
                if (!$target) {
                  return;
                }

                event.preventDefault();
                $target.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            });
          });
        </script>
      `,
      `
        <script>
          document.addEventListener("DOMContentLoaded", () => {
            document.querySelectorAll("[data-scroll-to]").forEach(($button) => {
              $button.addEventListener("click", (event) => {
                const href = $button.getAttribute("href");

                if (!href || !href.startsWith("#")) {
                  return;
                }

                const $target = document.querySelector(href);
                if (!$target) {
                  return;
                }

                event.preventDefault();
                $target.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            });
          });
        </script>
      `,
    );
  });

  it('preserves script blocks with regex constructors and template literals', async () => {
    await expectStableFormat(
      `
        <script>
          const reA = new RegExp(
            "(?:^|; )" + nameA.replace(/([.$?*|{}()[\\]\\/+^])/g, "\\\\$1") + "=([^;]*)",
          );
          const textA = \`a-\${valueA}\`;
          const htmlA = \`<div class="box">\${textA}</div>\`;
          return reA.test(textA) && htmlA.length > 0;
        </script>
      `,
      `
        <script>
          const reA = new RegExp(
            "(?:^|; )" + nameA.replace(/([.$?*|{}()[\\]\\/+^])/g, "\\\\$1") + "=([^;]*)",
          );
          const textA = \`a-\${valueA}\`;
          const htmlA = \`<div class="box">\${textA}</div>\`;
          return reA.test(textA) && htmlA.length > 0;
        </script>
      `,
    );
  });

  it('keeps css-variable style attributes with mustache values inline', async () => {
    await expectStableFormat(
      '<svg class="icon-a" style="--p: {{ percentA }}%; --q: 10;"></svg>',
      '<svg class="icon-a" style="--p: {{ percentA }}%; --q: 10;"></svg>',
    );
  });

  it('formats style attributes that mix helper branches with custom properties', async () => {
    await expectStableFormat(
      '<div style="{{#if flagA}}opacity: 0;{{else}}display: none;{{/if}} --tone: {{ toneA }};"></div>',
      `
        <div
          style="{{#if flagA}}opacity: 0;{{else}}display: none;{{/if}} --tone: {{ toneA }};"
        ></div>
      `,
    );
  });
});

describe('dynamic tags and tag-switching coverage from mined patterns', () => {
  it('parses nested dynamic tag wrappers as a single unmatched node', () => {
    const program = parseProgram(
      `<{{#if (eq kindA 'link')}}a href="{{ hrefA }}"{{else}}div{{/if}} class="box-a">{{#if actionA}}<{{#if (eq actionA.type 'link')}}a href="{{ actionA.href }}"{{else if (eq actionA.type 'button')}}button type="button"{{else}}div{{/if}} class="box-a__action">{{ actionA.text }}</{{#if (eq actionA.type 'link')}}a{{else if (eq actionA.type 'button')}}button{{else}}div{{/if}}>{{/if}}</{{#if (eq kindA 'link')}}a{{else}}div{{/if}}>`,
    );

    expect(program.body).toEqual([
      {
        type: 'UnmatchedNode',
        raw: `<{{#if (eq kindA 'link')}}a href="{{ hrefA }}"{{else}}div{{/if}} class="box-a">{{#if actionA}}<{{#if (eq actionA.type 'link')}}a href="{{ actionA.href }}"{{else if (eq actionA.type 'button')}}button type="button"{{else}}div{{/if}} class="box-a__action">{{ actionA.text }}</{{#if (eq actionA.type 'link')}}a{{else if (eq actionA.type 'button')}}button{{else}}div{{/if}}>{{/if}}</{{#if (eq kindA 'link')}}a{{else}}div{{/if}}>`,
      } as UnmatchedNode,
    ]);
  });

  it('parses conditional tag-switching around shared content without nesting corruption', () => {
    const program = parseProgram(
      '{{#unless flagA}}<a href="{{ hrefA }}" class="box-a__title">{{else}}<p class="box-a__title">{{/unless}}<span>{{ nameA }}</span>{{#unless flagA}}</a>{{else}}</p>{{/unless}}',
    );

    const openBlock = program.body[0] as BlockStatement;
    const content = program.body[1] as ElementNode;
    const closeBlock = program.body[2] as BlockStatement;

    expect(program.body).toHaveLength(3);
    expect(openBlock.program.body[0]).toMatchObject({
      type: 'UnmatchedNode',
      raw: '<a href="{{ hrefA }}" class="box-a__title">',
    });
    expect(openBlock.inverse.body[0]).toMatchObject({
      type: 'UnmatchedNode',
      raw: '<p class="box-a__title">',
    });
    expect(content.tag).toBe('span');
    expect(closeBlock.program.body[0]).toMatchObject({
      type: 'TextNode',
      value: '</a>',
      verbatim: true,
    });
    expect(closeBlock.inverse.body[0]).toMatchObject({
      type: 'TextNode',
      value: '</p>',
      verbatim: true,
    });
  });

  it('preserves nested dynamic tag wrappers with inner dynamic actions verbatim', async () => {
    await expectStableFormat(
      `<{{#if (eq kindA 'link')}}a href="{{ hrefA }}"{{else}}div{{/if}} class="box-a">{{#if actionA}}<{{#if (eq actionA.type 'link')}}a href="{{ actionA.href }}"{{else if (eq actionA.type 'button')}}button type="button"{{else}}div{{/if}} class="box-a__action">{{ actionA.text }}</{{#if (eq actionA.type 'link')}}a{{else if (eq actionA.type 'button')}}button{{else}}div{{/if}}>{{/if}}</{{#if (eq kindA 'link')}}a{{else}}div{{/if}}>`,
      `<{{#if (eq kindA 'link')}}a href="{{ hrefA }}"{{else}}div{{/if}} class="box-a">{{#if actionA}}<{{#if (eq actionA.type 'link')}}a href="{{ actionA.href }}"{{else if (eq actionA.type 'button')}}button type="button"{{else}}div{{/if}} class="box-a__action">{{ actionA.text }}</{{#if (eq actionA.type 'link')}}a{{else if (eq actionA.type 'button')}}button{{else}}div{{/if}}>{{/if}}</{{#if (eq kindA 'link')}}a{{else}}div{{/if}}>`,
    );
  });

  it('formats conditional tag-switching around shared content as sibling boundary blocks', async () => {
    await expectStableFormat(
      '{{#unless flagA}}<a href="{{ hrefA }}" class="box-a__title">{{else}}<p class="box-a__title">{{/unless}}<span>{{ nameA }}</span>{{#unless flagA}}</a>{{else}}</p>{{/unless}}',
      `
        {{#unless flagA}}
          <a href="{{ hrefA }}" class="box-a__title">
        {{else}}
          <p class="box-a__title">
        {{/unless}}
        <span>{{ nameA }}</span>
        {{#unless flagA}}
          </a>
        {{else}}
          </p>
        {{/unless}}
      `,
    );
  });
});

describe('schema and data payload coverage from mined patterns', () => {
  it('parses schema-org ld-json scripts with loops as a single verbatim child', () => {
    const script = firstNode<ElementNode>(
      `<script type="application/ld+json">{ "@context": "https://schema.org", "@type": "Organization", "name": "{{nameA}}", "url": "{{urlA}}" {{#if listA}}, "sameAs": [ {{#each listA}}"{{this}}"{{#unless @last}},{{/unless}} {{/each}} ]{{/if}} }</script>`,
    );
    const child = script.children[0] as TextNode;

    expect(script.tag).toBe('script');
    expect(script.children).toHaveLength(1);
    expect(child.verbatim).toBe(true);
    expect(child.value).toContain('{{#each listA}}');
    expect(child.value).toContain('{{#unless @last}}');
  });

  it('parses multiline setVar parseJSON payloads as a single helper param', () => {
    const mustache = firstNode<MustacheStatement>(
      `{{setVar "listA" (parseJSON '
        [
          {
            "name": "A",
            "href": "/a"
          }
        ]
      ')}}`,
    );

    expect(mustache.path).toBe('setVar');
    expect(mustache.params[0]).toBe('"listA"');
    expect(mustache.params[1]).toContain("(parseJSON '");
    expect(mustache.params[1]).toContain('"name": "A"');
  });

  it('preserves organization ld-json blocks with contact-point and same-as loops', async () => {
    await expectStableFormat(
      `
        <script type="application/ld+json">
        	{
        	  "@context": "https://schema.org",
        	  "@type": "Organization",
        	  "name": "{{nameA}}",
        	  "url": "{{urlA}}"
        	  {{#if logoA}},
        	  "logo": "{{logoA}}"{{/if}}
        	  {{#if pointListA}},
        	  "contactPoint": [
        	    {{#each pointListA}}
        	    {
        	      "@type": "ContactPoint",
        	      "telephone": "{{telephone}}"
        	      {{#if kindA}},
        	      "contactType": "{{kindA}}"{{/if}}
        	    }{{#unless @last}},{{/unless}}
        	    {{/each}}
        	  ]{{/if}}
        	  {{#if urlListA}},
        	  "sameAs": [
        	    {{#each urlListA}}
        	    "{{this}}"{{#unless @last}},{{/unless}}
        	    {{/each}}
        	  ]{{/if}}
        	}
        </script>
      `,
      `
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "{{nameA}}",
            "url": "{{urlA}}"
            {{#if logoA}},
            "logo": "{{logoA}}"{{/if}}
            {{#if pointListA}},
            "contactPoint": [
              {{#each pointListA}}
              {
                "@type": "ContactPoint",
                "telephone": "{{telephone}}"
                {{#if kindA}},
                "contactType": "{{kindA}}"{{/if}}
              }{{#unless @last}},{{/unless}}
              {{/each}}
            ]{{/if}}
            {{#if urlListA}},
            "sameAs": [
              {{#each urlListA}}
              "{{this}}"{{#unless @last}},{{/unless}}
              {{/each}}
            ]{{/if}}
          }
        </script>
      `,
    );
  });

  it('preserves local-business ld-json blocks with nested opening-hours loops', async () => {
    await expectStableFormat(
      `
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "{{nameA}}",
            "url": "{{urlA}}"
            {{#if imageA}},
            "image": "{{imageA}}"{{/if}}
            {{#if hoursListA}},
            "openingHoursSpecification": [
              {{#each hoursListA}}
              {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": [
                  {{#each dayListA}}
                  "https://schemaOrg/{{this}}"{{#unless @last}},{{/unless}}
                  {{/each}}
                ],
                "opens": "{{opens}}",
                "closes": "{{closes}}"
              }{{#unless @last}},{{/unless}}
              {{/each}}
            ]{{/if}}
          }
        </script>
      `,
      `
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "{{nameA}}",
            "url": "{{urlA}}"
            {{#if imageA}},
            "image": "{{imageA}}"{{/if}}
            {{#if hoursListA}},
            "openingHoursSpecification": [
              {{#each hoursListA}}
              {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": [
                  {{#each dayListA}}
                  "https://schemaOrg/{{this}}"{{#unless @last}},{{/unless}}
                  {{/each}}
                ],
                "opens": "{{opens}}",
                "closes": "{{closes}}"
              }{{#unless @last}},{{/unless}}
              {{/each}}
            ]{{/if}}
          }
        </script>
      `,
    );
  });

  it('formats multiline setVar parseJSON payloads without corrupting embedded json text', async () => {
    await expectStableFormat(
      `{{setVar "listA" (parseJSON '
        [
          {
            "name": "A",
            "href": "/a"
          },
          {
            "name": "B",
            "items": [
              {
                "name": "C",
                "href": "/c"
              }
            ]
          }
        ]
      ')}}`,
      `
        {{setVar "listA" (parseJSON '
                [
                  {
                    "name": "A",
                    "href": "/a"
                  },
                  {
                    "name": "B",
                    "items": [
                      {
                        "name": "C",
                        "href": "/c"
                      }
                    ]
                  }
                ]
              ')}}
      `,
    );
  });
});

describe('svg and asset-like markup coverage from mined patterns', () => {
  it('formats inline svg masks with fill-rule clip-rule and css variable fills', async () => {
    await expectStableFormat(
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><mask id="mask0" style="mask-type: alpha" maskUnits="userSpaceOnUse" x="1" y="1" width="12" height="12"><path fill-rule="evenodd" clip-rule="evenodd" d="M1 1Z" fill="white"/></mask><g mask="url(#mask0)"><rect x="1" y="1" width="1.1" height="11.3" fill="var(--tone-a)" /></g></svg>',
      `
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <mask
            id="mask0"
            style="mask-type: alpha"
            maskUnits="userSpaceOnUse"
            x="1"
            y="1"
            width="12"
            height="12"
          >
            <path fill-rule="evenodd" clip-rule="evenodd" d="M1 1Z" fill="white" />
          </mask>
          <g mask="url(#mask0)">
            <rect x="1" y="1" width="1.1" height="11.3" fill="var(--tone-a)" />
          </g>
        </svg>
      `,
    );
  });

  it('formats svg defs with clip paths and compact path attributes', async () => {
    await expectStableFormat(
      '<svg xmlns="http://www.w3.org/2000/svg" width="33" height="32" fill="none" viewBox="0 0 33 32"><g clip-path="url(#clip0)"><path fill="#B7F0EF" fill-rule="evenodd" d="M1 1Z" clip-rule="evenodd" opacity=".7"/></g><defs><clipPath id="clip0"><rect width="32" height="32" fill="#fff" transform="translate(0.5)"/></clipPath></defs></svg>',
      `
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="33"
          height="32"
          fill="none"
          viewBox="0 0 33 32"
        >
          <g clip-path="url(#clip0)">
            <path
              fill="#B7F0EF"
              fill-rule="evenodd"
              d="M1 1Z"
              clip-rule="evenodd"
              opacity=".7"
            />
          </g>
          <defs>
            <clipPath id="clip0">
              <rect width="32" height="32" fill="#fff" transform="translate(0.5)" />
            </clipPath>
          </defs>
        </svg>
      `,
    );
  });

  it('formats svg gradients with stop opacity and stroke urls', async () => {
    await expectStableFormat(
      '<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="a" x1="8.042%" x2="65.682%" y1="0%" y2="23.865%"><stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="63.146%" stop-color="#fff" stop-opacity=".631"/><stop offset="100%" stop-color="#fff"/></linearGradient></defs><g fill="none" fill-rule="evenodd"><path d="M36 18c0-9.94-8.06-18-18-18" id="Oval-2" stroke-width="5" stroke="url(#a)"></path></g></svg>',
      `
        <svg
          width="36"
          height="36"
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="a" x1="8.042%" x2="65.682%" y1="0%" y2="23.865%">
              <stop offset="0%" stop-color="#fff" stop-opacity="0" />
              <stop offset="63.146%" stop-color="#fff" stop-opacity=".631" />
              <stop offset="100%" stop-color="#fff" />
            </linearGradient>
          </defs>
          <g fill="none" fill-rule="evenodd">
            <path
              id="Oval-2"
              d="M36 18c0-9.94-8.06-18-18-18"
              stroke-width="5"
              stroke="url(#a)"
            ></path>
          </g>
        </svg>
      `,
    );
  });

  it('keeps svg use tags with xlink href stable', async () => {
    await expectStableFormat(
      '<svg><use xlink:href="assets/sprite.svg#icon-a"></use></svg>',
      `
        <svg>
          <use xlink:href="assets/sprite.svg#icon-a"></use>
        </svg>
      `,
    );
  });
});

describe('full document and compound attribute coverage from mined patterns', () => {
  it('formats button modifiers with helper-driven disabled and tabindex attributes', async () => {
    await expectStableFormat(
      `<button type="button" class="box-a__button {{#if (eq stateA.text 'X')}}button-b{{else}}button-a{{/if}} button {{#if inA}}box-a__button--hide{{/if}}" aria-label="ActionA" {{#if disabledA}}disabled tabIndex="-1"{{/if}} {{#if inA}}tabIndex="-1"{{/if}}>{{> 'icon-a'}}</button><input class="box-a__input" value="{{#if inA}}{{inA}}{{else}}1{{/if}}">`,
      `
        <button
          class="
            box-a__button
            {{#if (eq stateA.text 'X')}}
              button-b
            {{else}}
              button-a
            {{/if}}
            button
            {{#if inA}}
              box-a__button--hide
            {{/if}}
          "
          type="button"
          aria-label="ActionA"
          {{#if disabledA}}
            disabled tabIndex="-1"
          {{/if}}
          {{#if inA}}
            tabIndex="-1"
          {{/if}}
        >
          {{> 'icon-a'}}
        </button>
        <input
          class="box-a__input"
          value="{{#if inA}}{{ inA }}{{else}}1{{/if}}"
        />
      `,
    );
  });

  it('formats full documents with root-level setVar helpers and custom elements', async () => {
    await expectStableFormat(
      `<!doctype html><html lang="x"><head><meta charset="utf-8" /><title>{{ projectA }}</title></head>{{setVar "listA" (parseJSON '[{"name":"A","href":"/a"},{"name":"B","items":[{"name":"C","href":"/c"}]}]')}}<body class="page-a"><ul>{{#each listA}}<li>{{#if items}}<bm-accordion><div class="acc-a__head"><button type="button">{{ name }}</button></div></bm-accordion>{{else}}<a href="{{ href }}">{{ name }}</a>{{/if}}</li>{{/each}}</ul></body></html>`,
      `
        <!doctype html>
        <html lang="x">
          <head>
            <meta charset="utf-8" />
            <title>{{ projectA }}</title>
          </head>
          {{setVar "listA" (parseJSON '[{"name":"A","href":"/a"},{"name":"B","items":[{"name":"C","href":"/c"}]}]')}}
          <body class="page-a">
            <ul>
              {{#each listA}}
                <li>
                  {{#if items}}
                    <bm-accordion>
                      <div class="acc-a__head">
                        <button type="button">{{ name }}</button>
                      </div>
                    </bm-accordion>
                  {{else}}
                    <a href="{{ href }}">
                      {{ name }}
                    </a>
                  {{/if}}
                </li>
              {{/each}}
            </ul>
          </body>
        </html>
      `,
    );
  });
});

describe('style helper coverage from mined patterns', () => {
  it('keeps svg custom-property styles stable inside rating loops', async () => {
    await expectStableFormat(
      `<div class="rating-a">{{#each (ratingToPercentsAr valueA) as |percentA|}}<div class="rating-a__item"><svg class="rating-a__main" style="--p: {{ percentA }}%;"><use xlink:href="@img/sprite.svg#"></use></svg><svg class="rating-a__bg"><use xlink:href="@img/sprite.svg#"></use></svg></div>{{/each}}</div>`,
      `
        <div class="rating-a">
          {{#each (ratingToPercentsAr valueA) as |percentA|}}
            <div class="rating-a__item">
              <svg class="rating-a__main" style="--p: {{ percentA }}%;">
                <use xlink:href="@img/sprite.svg#"></use>
              </svg>
              <svg class="rating-a__bg">
                <use xlink:href="@img/sprite.svg#"></use>
              </svg>
            </div>
          {{/each}}
        </div>
      `,
    );
  });

  it('keeps custom-property gantt styles inline when values come from mustaches', async () => {
    await expectStableFormat(
      `<div class="gantt-a" style="--count: {{ listA.length }}">{{#each listA}}<div class="gantt-a__item" style="--s: {{ startA }}%; --e: {{ endA }}%"><span>{{ textA }}</span></div>{{/each}}</div>`,
      `
        <div class="gantt-a" style="--count: {{ listA.length }}">
          {{#each listA}}
            <div class="gantt-a__item" style="--s: {{ startA }}%; --e: {{ endA }}%">
              <span>{{ textA }}</span>
            </div>
          {{/each}}
        </div>
      `,
    );
  });

  it('formats helper-only style attributes and width branches deterministically', async () => {
    await expectStableFormat(
      `<div class="dot-a{{#ifEquals @index ../activeA}} dot-a--on{{/ifEquals}}" style="{{transformStyleA ../activeA @index}}"><span></span></div><div class="star-a__front" style="width: {{#if (compare ../countA '>=' itemA)}}100%{{else}}0%{{/if}};">{{> 'icon-a'}}</div>`,
      `
        <div
          class="
            dot-a
            {{#ifEquals @index ../activeA}}
              dot-a--on
            {{/ifEquals}}
          "
          style="{{transformStyleA ../activeA @index}}"
        >
          <span></span>
        </div>
        <div
          class="star-a__front"
          style="width: {{#if (compare ../countA '>=' itemA)}}100%{{else}}0%{{/if}};"
        >
          {{> 'icon-a'}}
        </div>
      `,
    );
  });
});
