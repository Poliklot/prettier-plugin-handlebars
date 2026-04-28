import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser';
import type {
  BlockStatement,
  CommentStatement,
  ElementAttribute,
  ElementNode,
  MustacheStatement,
  PartialStatement,
  Program,
  TextNode,
} from '../src/types';

function parseProgram(source: string): Program {
  return parse(source);
}

function firstNode<T>(source: string): T {
  return parseProgram(source).body[0] as T;
}

function firstElement(source: string): ElementNode {
  const element = firstNode<ElementNode>(source);
  expect(element.type).toBe('ElementNode');
  return element;
}

describe('simple parser coverage', () => {
  it('parses short handlebars comments at the top level', () => {
    const comment = firstNode<CommentStatement>('{{! note}}');

    expect(comment).toMatchObject({
      type: 'CommentStatement',
      value: 'note',
      multiline: false,
      block: false,
    });
  });

  it('parses triple-stash expressions', () => {
    const mustache = firstNode<MustacheStatement>('{{{ html }}}');

    expect(mustache).toMatchObject({
      type: 'MustacheStatement',
      path: 'html',
      triple: true,
      params: [],
      hash: [],
    });
  });

  it('parses partials with hash pairs', () => {
    const partial = firstNode<PartialStatement>("{{> card title=title featured=true}}");

    expect(partial).toMatchObject({
      type: 'PartialStatement',
      path: 'card',
      params: [],
      hash: [
        { key: 'title', value: 'title' },
        { key: 'featured', value: 'true' },
      ],
    });
  });

  it('parses boolean and unquoted attributes on void elements', () => {
    const input = firstElement('<input disabled type=text>');

    expect(input).toMatchObject({
      type: 'ElementNode',
      tag: 'input',
      selfClosing: true,
    });

    expect(input.attributes).toEqual([
      {
        type: 'Attribute',
        name: 'disabled',
        value: null,
      },
      {
        type: 'Attribute',
        name: 'type',
        value: {
          type: 'AttributeValue',
          parts: [{ type: 'TextNode', value: 'text' }],
        },
      },
    ]);
  });

  it('parses dynamic attribute names as raw attributes', () => {
    const input = firstElement('<span data-{{ control.badgeData }}></span>');

    expect(input.attributes).toEqual([
      {
        type: 'RawAttribute',
        raw: 'data-{{ control.badgeData }}',
      },
    ]);
  });
});

describe('medium parser coverage', () => {
  it('parses blocks with inverse branches and block params', () => {
    const block = firstNode<BlockStatement>(
      '{{#each items as |item idx|}}<span>{{ item }}</span>{{else}}<em>Empty</em>{{/each}}',
    );

    expect(block).toMatchObject({
      type: 'BlockStatement',
      path: 'each',
      params: ['items'],
      blockParams: ['item', 'idx'],
    });

    expect(block.program.body).toHaveLength(1);
    expect(block.inverse.body).toHaveLength(1);
    expect((block.inverse.body[0] as ElementNode).tag).toBe('em');
  });

  it('parses html comments inside elements as verbatim text nodes', () => {
    const element = firstElement('<div><!-- keep --><span>{{ value }}</span></div>');
    const comment = element.children[0] as TextNode;

    expect(comment).toMatchObject({
      type: 'TextNode',
      value: '<!-- keep -->',
      verbatim: true,
    });

    expect((element.children[1] as ElementNode).tag).toBe('span');
  });

  it('parses style contents as a single verbatim child', () => {
    const style = firstElement('<style>\n  .x { color: red; }\n</style>');
    const child = style.children[0] as TextNode;

    expect(style.tag).toBe('style');
    expect(style.children).toHaveLength(1);
    expect(child).toMatchObject({
      type: 'TextNode',
      value: '\n  .x { color: red; }\n',
      verbatim: true,
    });
  });

  it('parses comment blocks in opening tags as attribute blocks', () => {
    const element = firstElement('<div {{!-- note --}} hidden></div>');
    const attrBlock = element.attributes[0] as Extract<ElementAttribute, { type: 'AttributeBlock' }>;

    expect(attrBlock).toMatchObject({
      type: 'AttributeBlock',
      block: {
        type: 'CommentStatement',
        value: 'note',
        multiline: false,
        block: true,
      },
    });

    expect(element.attributes[1]).toEqual({
      type: 'Attribute',
      name: 'hidden',
      value: null,
    });
  });

  it('parses custom element names with dashed tags', () => {
    const element = firstElement('<product-card data-view=grid></product-card>');

    expect(element).toMatchObject({
      type: 'ElementNode',
      tag: 'product-card',
      selfClosing: false,
    });
  });
});
