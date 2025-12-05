import { describe, expect, it } from 'vitest';
import { parse } from './parser';

function firstElement(ast) {
  expect(ast).toBeDefined();
  expect(ast.type).toBe('Program');
  expect(ast.body[0]).toBeDefined();
  expect(ast.body[0].type).toBe('ElementNode');
  return ast.body[0];
}

describe('HTML Elements', () => {
  it('empty div', () => {
    const input = `<div></div>`;

    const output = parse(input);
    const el = firstElement(output);

    expect(el).toMatchObject({
      type: 'ElementNode',
      tag: 'div',
      selfClosing: false,
      attributes: [],
      children: []
    });
  });

  it('div with text', () => {
    const input = `<div>text</div>`;

    const output = parse(input);
    const el = firstElement(output);

    expect(el.tag).toBe('div');
    expect(el.selfClosing).toBe(false);
    expect(el.attributes).toEqual([]);

    // Должен быть один TextNode с "text"
    expect(el.children).toEqual([
      expect.objectContaining({
        type: 'TextNode',
        value: 'text'
      })
    ]);
  });

  it('br', () => {
    const input = `<div>text<br/>text</div>`;

    const output = parse(input);
    const el = firstElement(output);

    expect(el.tag).toBe('div');
    expect(el.selfClosing).toBe(false);
    expect(el.attributes).toEqual([]);

    // Структура: TextNode "text", ElementNode br, TextNode "text"
    expect(el.children[0]).toMatchObject({
      type: 'TextNode',
      value: 'text'
    });

    expect(el.children[1]).toMatchObject({
      type: 'ElementNode',
      tag: 'br',
      selfClosing: true,
      attributes: [],
      children: []
    });

    expect(el.children[2]).toMatchObject({
      type: 'TextNode',
      value: 'text'
    });
  });
});

describe('Mustache in HTML attributes', () => {
  it('simple mustache in attribute value', () => {
    const input = `<div data-text="{{ text }}"></div>`;

    const output = parse(input);
    const el = firstElement(output);

    expect(el.tag).toBe('div');
    expect(el.children).toEqual([]);

    expect(el.attributes).toHaveLength(1);
    const attr = el.attributes[0];

    expect(attr).toMatchObject({
      type: 'Attribute',
      name: 'data-text',
      value: expect.objectContaining({
        type: 'AttributeValue'
      })
    });

    // В value.parts должен быть MustacheStatement с path "text"
    expect(attr.value.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'MustacheStatement',
          path: 'text'
        })
      ])
    );
  });

  it('class with simple mustache', () => {
    const input = `<div class="{{ class }}"></div>`;

    const output = parse(input);
    const el = firstElement(output);

    expect(el.tag).toBe('div');
    expect(el.children).toEqual([]);

    expect(el.attributes).toHaveLength(1);
    const attr = el.attributes[0];

    expect(attr).toMatchObject({
      type: 'Attribute',
      name: 'class',
      value: expect.objectContaining({
        type: 'AttributeValue'
      })
    });

    expect(attr.value.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'MustacheStatement',
          path: 'class'
        })
      ])
    );
  });

  it('class with if block in value', () => {
    const input = `
      <div 
        class="
          {{#if class}}
            {{ class }}
          {{/if}}
        "
      ></div>`;

    const output = parse(input);
    const el = firstElement(output);

    expect(el.tag).toBe('div');
    expect(el.children).toEqual([]);

    expect(el.attributes).toHaveLength(1);
    const attr = el.attributes[0];

    expect(attr).toMatchObject({
      type: 'Attribute',
      name: 'class',
      value: expect.objectContaining({
        type: 'AttributeValue'
      })
    });

    // В parts должен быть BlockStatement с path "if"
    expect(attr.value.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'BlockStatement',
          path: 'if',
          program: expect.any(Array)
        })
      ])
    );
  });

  it('complex attributes mix (id/class/data + each + ifEquals)', () => {
    const input = `
      <div
        id="id-block--{{#if hasIDModification}}{{ IDModification }}{{else}}none{{/if}}"
        class="a123 a123--{{ modification }}"
        data-a123="value"
        {{#each attributes as |item|}}
          {{ item.name }}="{{ item.value }}"
        {{/each}}
        {{#ifEquals hidden}}
          hidden
        {{/ifEquals}}
      ></div>
    `;

    const output = parse(input);
    const el = firstElement(output);

    expect(el.tag).toBe('div');
    expect(el.selfClosing).toBe(false);
    expect(el.children).toEqual([]);

    // тут ожидаем как минимум 3 обычных атрибута + 2 AttributeBlock
    const attributes = el.attributes;

    const idAttr = attributes.find(a => a.type === 'Attribute' && a.name === 'id');
    const classAttr = attributes.find(a => a.type === 'Attribute' && a.name === 'class');
    const dataAttr = attributes.find(a => a.type === 'Attribute' && a.name === 'data-a123');
    const eachBlock = attributes.find(a => a.type === 'AttributeBlock');
    const ifEqualsBlock = attributes.find(
      a =>
        a.type === 'AttributeBlock' &&
        (a.block as any)?.path === 'ifEquals'
    );

    expect(idAttr).toBeDefined();
    expect(classAttr).toBeDefined();
    expect(dataAttr).toBeDefined();
    expect(eachBlock).toBeDefined();
    expect(ifEqualsBlock).toBeDefined();

    // id: в value.parts есть BlockStatement 'if'
    expect(idAttr.value.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'BlockStatement',
          path: 'if'
        })
      ])
    );

    // class: "a123 a123--" + {{ modification }}
    expect(classAttr.value.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'TextNode'
        }),
        expect.objectContaining({
          type: 'MustacheStatement',
          path: 'modification'
        })
      ])
    );

    // data-a123: просто статическое значение "value"
    expect(dataAttr.value.parts).toEqual([
      expect.objectContaining({
        type: 'TextNode',
        value: 'value'
      })
    ]);

    // eachBlock: AttributeBlock с BlockStatement 'each'
    expect(eachBlock).toMatchObject({
      type: 'AttributeBlock',
      block: expect.objectContaining({
        type: 'BlockStatement',
        path: 'each',
        blockParams: ['item']
      })
    });
  });
});

describe('Mustache blocks in children', () => {
  it('if block as content', () => {
    const input = `
      <div>
        {{#if text}}
          {{ text }}
        {{/if}}
      </div>
    `;

    const output = parse(input);
    const el = firstElement(output);

    expect(el.tag).toBe('div');

    // В детях должен быть BlockStatement 'if'
    const ifBlock = el.children.find(
      child =>
        child.type === 'BlockStatement' &&
        child.path === 'if'
    );

    expect(ifBlock).toBeDefined();
    expect(ifBlock.program).toMatchObject({
      type: 'Program'
    });
  });

  it('each attributes in tag (AttributeBlock)', () => {
    const input = `
      <div
        {{#each attributes as |item|}}
          {{ item.name }}="{{ item.value }}"
        {{/each}}
      ></div>
    `;

    const output = parse(input);
    const el = firstElement(output);

    expect(el.tag).toBe('div');
    expect(el.children).toEqual([]);

    // В attributes должен быть AttributeBlock с BlockStatement 'each'
    const eachAttrBlock = el.attributes.find(
      a =>
        a.type === 'AttributeBlock' &&
        (a.block as any)?.path === 'each'
    );

    expect(eachAttrBlock).toBeDefined();
    expect(eachAttrBlock.block).toMatchObject({
      type: 'BlockStatement',
      blockParams: ['item'],
      program: expect.objectContaining({
        type: 'Program'
      })
    });
  });
});
