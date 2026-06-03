import { isTemplateExpressionQuoteStart } from 'template-format-core';
import type { TemplateBlockPrefix, TemplateDialect, TemplateToken } from 'template-format-core';

export const handlebarsDialect: TemplateDialect = {
  name: 'handlebars',
  openDelimiter: '{{',
  closeDelimiter: '}}',
  parseToken: parseHandlebarsToken,
  findNextOpen: findNextHandlebarsOpen,
  isEscapedOpen: isEscapedHandlebarsOpen,
  isDynamicElementStart: isDynamicHandlebarsElementStart,
  consumeRawBlock: consumeHandlebarsRawBlock,
  getBlockExpression: getHandlebarsBlockExpression,
  getBlockPrefix: getHandlebarsBlockPrefix,
  getTagDelimiters: getHandlebarsTagDelimiters,
  getPrintedBlockPrefix: getPrintedHandlebarsBlockPrefix,
  getPartialPrefix: getHandlebarsPartialPrefix,
  getDecoratorPrefix: getHandlebarsDecoratorPrefix,
  getElseKeyword: getHandlebarsElseKeyword,
  getBlockClosePrefix: getHandlebarsBlockClosePrefix,
  getLineCommentTag: getHandlebarsLineCommentTag,
  getBlockCommentTag: getHandlebarsBlockCommentTag,
  getBlockCommentMarkers: getHandlebarsBlockCommentMarkers,
  shouldPreserveTokenVerbatim: shouldPreserveHandlebarsTokenVerbatim,
  shouldPreserveUnclosedBlockRemainder: shouldPreserveUnclosedHandlebarsBlockRemainder,
};

function parseHandlebarsToken(text: string, position: number): TemplateToken {
  const triple = text.startsWith('{{{', position);
  const openLength = triple ? 3 : 2;
  const isBlockComment = text.startsWith('{{!--', position) || text.startsWith('{{{!--', position);
  const close = triple ? '}}}' : '}}';
  const closeDelimiter = isBlockComment ? `--${close}` : close;
  const closeIdx = isBlockComment
    ? text.indexOf(closeDelimiter, position + openLength)
    : findHandlebarsClose(text, position + openLength, closeDelimiter);
  const end = closeIdx >= 0 ? closeIdx + closeDelimiter.length : text.length;
  const rawContent = text.slice(position + openLength, closeIdx >= 0 ? closeIdx : undefined);
  const rawInner = rawContent.trim();
  const trimOpen = rawInner.startsWith('~');
  const trimClose = rawInner.endsWith('~');
  const inner = rawInner.replace(/^~/, '').replace(/~$/, '').trim();

  const baseToken = {
    rawContent,
    rawInner,
    start: position,
    end,
    triple,
    trimOpen,
    trimClose,
  };

  if (inner.startsWith('!')) {
    return { kind: 'comment', content: inner, name: undefined, ...baseToken };
  }

  if (inner.startsWith('>')) {
    return { kind: 'partial', content: inner.slice(1).trim(), name: undefined, ...baseToken };
  }

  if (inner.startsWith('<')) {
    const name = inner.slice(1).trim().split(/\s+/)[0];
    return { kind: 'blockStart', content: inner, name, specialForm: 'parent', ...baseToken };
  }

  if (inner.startsWith('#>')) {
    const name = inner.slice(2).trim().split(/\s+/)[0];
    return { kind: 'blockStart', content: inner, name, specialForm: 'blockPartial', ...baseToken };
  }

  if (inner.startsWith('#*')) {
    const name = inner.slice(2).trim().split(/\s+/)[0];
    return { kind: 'blockStart', content: inner, name, specialForm: 'decoratorBlock', ...baseToken };
  }

  if (inner.startsWith('*')) {
    return { kind: 'mustache', content: inner, name: undefined, specialForm: 'decorator', ...baseToken };
  }

  if (inner.startsWith('#')) {
    const name = inner.slice(1).trim().split(/\s+/)[0];
    return { kind: 'blockStart', content: inner, name, ...baseToken };
  }

  if (inner.startsWith('^')) {
    const name = inner.slice(1).trim().split(/\s+/)[0];
    return { kind: 'blockStart', content: inner, name, specialForm: 'inverseBlock', ...baseToken };
  }

  if (inner.startsWith('$')) {
    const name = inner.slice(1).trim().split(/\s+/)[0];
    return { kind: 'blockStart', content: inner, name, specialForm: 'mustacheBlock', ...baseToken };
  }

  if (inner.startsWith('/')) {
    const name = inner.slice(1).trim();
    return { kind: 'blockEnd', content: inner, name, ...baseToken };
  }

  if (inner === 'else' || inner.startsWith('else ')) {
    return {
      kind: 'else',
      content: inner,
      name: 'else',
      specialForm: inner === 'else' ? undefined : 'elseIf',
      ...baseToken,
    };
  }

  return { kind: 'mustache', content: inner, name: undefined, ...baseToken };
}

function findHandlebarsClose(text: string, position: number, closeDelimiter: string): number {
  let quote: '"' | "'" | '`' | null = null;
  let escaped = false;

  for (let index = position; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if ((char === '"' || char === "'" || char === '`') && isTemplateExpressionQuoteStart(text, index, position)) {
      quote = char;
      continue;
    }

    if (text.startsWith(closeDelimiter, index)) {
      return index;
    }
  }

  return -1;
}

function isEscapedHandlebarsOpen(text: string, position: number): boolean {
  if (!text.startsWith('{{', position)) {
    return false;
  }

  let slashCount = 0;
  for (let index = position - 1; index >= 0 && text[index] === '\\'; index -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function findNextHandlebarsOpen(text: string, position: number): number {
  let searchPos = position;

  while (searchPos < text.length) {
    const candidate = text.indexOf('{{', searchPos);
    if (candidate === -1) {
      return -1;
    }

    if (!isEscapedHandlebarsOpen(text, candidate)) {
      return candidate;
    }

    searchPos = candidate + 2;
  }

  return -1;
}

function isDynamicHandlebarsElementStart(text: string, position: number): boolean {
  return text.startsWith('<{{', position) || text.startsWith('</{{', position);
}

function consumeHandlebarsRawBlock(text: string, position: number): number | null {
  if (!text.startsWith('{{{{', position)) {
    return null;
  }

  const openIdx = text.indexOf('}}}}', position + 4);
  if (openIdx === -1) {
    return text.length;
  }

  const openInner = text.slice(position + 4, openIdx).trim().replace(/^~/, '').replace(/~$/, '').trim();
  if (!openInner || openInner.startsWith('/')) {
    return null;
  }

  const name = openInner.split(/\s+/)[0];
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const closePattern = new RegExp(`{{{{\\s*~?\\/\\s*${escapedName}\\s*~?\\s*}}}}`);
  const closeMatch = closePattern.exec(text.slice(openIdx + 4));

  if (!closeMatch) {
    return text.length;
  }

  return openIdx + 4 + closeMatch.index + closeMatch[0].length;
}

function getHandlebarsBlockExpression(token: TemplateToken): string {
  if (token.specialForm === 'blockPartial' || token.specialForm === 'decoratorBlock') {
    return token.content.slice(2).trim();
  }

  return token.content.slice(1).trim();
}

function getHandlebarsBlockPrefix(token: TemplateToken): TemplateBlockPrefix {
  if (token.specialForm === 'blockPartial') {
    return '#>';
  }

  if (token.specialForm === 'decoratorBlock') {
    return '#*';
  }

  if (token.specialForm === 'inverseBlock') {
    return '^';
  }

  if (token.specialForm === 'parent') {
    return '<';
  }

  if (token.specialForm === 'mustacheBlock') {
    return '$';
  }

  return '#';
}

function getHandlebarsTagDelimiters(triple: boolean) {
  return triple ? { open: '{{{', close: '}}}' } : { open: '{{', close: '}}' };
}

function getPrintedHandlebarsBlockPrefix(prefix: TemplateBlockPrefix): string {
  if (prefix === '#>' || prefix === '<') {
    return `${prefix} `;
  }

  return prefix;
}

function getHandlebarsPartialPrefix(): string {
  return '> ';
}

function getHandlebarsDecoratorPrefix(): string {
  return '*';
}

function getHandlebarsElseKeyword(): string {
  return 'else';
}

function getHandlebarsBlockClosePrefix(path: string): string {
  return `/${path}`;
}

function getHandlebarsLineCommentTag(value: string): string {
  if (value.startsWith('<')) {
    return `{{!${value}}}`;
  }

  return `{{! ${value}}}`;
}

function getHandlebarsBlockCommentTag(value: string): string {
  return `{{!-- ${value} --}}`;
}

function getHandlebarsBlockCommentMarkers() {
  return {
    blockOpen: '{{!--',
    blockClose: '--}}',
    inlineOpen: '{{!-- ',
    inlineClose: ' --}}',
    emptyBlock: '{{!-- --}}',
    emptyInline: '{{!--  --}}',
  };
}

function shouldPreserveHandlebarsTokenVerbatim(token: TemplateToken): boolean {
  return token.specialForm === 'elseIf';
}

function shouldPreserveUnclosedHandlebarsBlockRemainder(token: TemplateToken): boolean {
  return token.specialForm === 'blockPartial' || token.specialForm === 'parent';
}
