import { describe, expect, it } from 'vitest';
import { handlebarsDialect } from './tokens';

describe('handlebars dialect tokens', () => {
  it('classifies Handlebars token forms', () => {
    expect(handlebarsDialect.parseToken('{{#if ok}}', 0)).toMatchObject({
      kind: 'blockStart',
      name: 'if',
    });
    expect(handlebarsDialect.parseToken('{{/if}}', 0)).toMatchObject({
      kind: 'blockEnd',
      name: 'if',
    });
    expect(handlebarsDialect.parseToken('{{> user-card}}', 0)).toMatchObject({
      kind: 'partial',
      content: 'user-card',
    });
    expect(handlebarsDialect.parseToken('{{!-- comment --}}', 0)).toMatchObject({
      kind: 'comment',
      content: '!-- comment',
    });
  });

  it('classifies Handlebars dialect-only special forms', () => {
    expect(handlebarsDialect.parseToken('{{else if ready}}', 0)).toMatchObject({
      kind: 'else',
      specialForm: 'elseIf',
    });
    expect(handlebarsDialect.parseToken('{{#> card}}', 0)).toMatchObject({
      kind: 'blockStart',
      specialForm: 'blockPartial',
    });
    expect(handlebarsDialect.parseToken('{{#*inline "row"}}', 0)).toMatchObject({
      kind: 'blockStart',
      specialForm: 'decoratorBlock',
    });
    expect(handlebarsDialect.parseToken('{{*log}}', 0)).toMatchObject({
      kind: 'mustache',
      specialForm: 'decorator',
    });
    expect(handlebarsDialect.parseToken('{{< layout}}', 0)).toMatchObject({
      kind: 'blockStart',
      specialForm: 'parent',
    });
    expect(handlebarsDialect.parseToken('{{$title}}', 0)).toMatchObject({
      kind: 'blockStart',
      specialForm: 'mustacheBlock',
    });
  });

  it('keeps scanning and recovery rules in the dialect', () => {
    const escaped = '\\{{ignored}} {{name}}';
    expect(handlebarsDialect.findNextOpen(escaped, 0)).toBe(13);

    const rawBlock = '{{{{raw}}}} {{value}} {{{{/raw}}}}';
    expect(handlebarsDialect.consumeRawBlock(rawBlock, 0)).toBe(rawBlock.length);

    const parent = handlebarsDialect.parseToken('{{< layout}}', 0);
    expect(handlebarsDialect.getBlockExpression(parent)).toBe('layout');
    expect(handlebarsDialect.getBlockPrefix(parent)).toBe('<');
    expect(handlebarsDialect.getPrintedBlockPrefix('<')).toBe('< ');
  });

  it('keeps Handlebars print syntax in the dialect', () => {
    expect(handlebarsDialect.getTagDelimiters(false)).toEqual({ open: '{{', close: '}}' });
    expect(handlebarsDialect.getTagDelimiters(true)).toEqual({ open: '{{{', close: '}}}' });
    expect(handlebarsDialect.getPartialPrefix()).toBe('> ');
    expect(handlebarsDialect.getDecoratorPrefix()).toBe('*');
    expect(handlebarsDialect.getElseKeyword()).toBe('else');
    expect(handlebarsDialect.getBlockClosePrefix('if')).toBe('/if');
    expect(handlebarsDialect.getLineCommentTag('hello')).toBe('{{! hello}}');
    expect(handlebarsDialect.getLineCommentTag('<tag>')).toBe('{{!<tag>}}');
    expect(handlebarsDialect.getBlockCommentTag('hello')).toBe('{{!-- hello --}}');
    expect(handlebarsDialect.getBlockCommentMarkers()).toMatchObject({
      blockOpen: '{{!--',
      blockClose: '--}}',
      inlineOpen: '{{!-- ',
      inlineClose: ' --}}',
    });
  });
});
