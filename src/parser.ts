import { Program, Node, ElementAttribute, ElementNode, TextNode, MustacheStatement, BlockStatement, PartialStatement, CommentStatement, HashPair, ParseEndReason } from './types';

interface ParseResult {
  nodes: Node[];
  position: number;
  endReason: ParseEndReason;
}

const whitespace = /\s/;

export function parse(text: string): Program {
  const { nodes } = parseChildren(text, 0, null, null);
  return { type: 'Program', body: nodes };
}

function parseChildren(text: string, position: number, endTag: string | null, endBlock: string | null): ParseResult {
  const nodes: Node[] = [];
  let pos = position;

  while (pos < text.length) {
    if (endTag && text.startsWith(`</${endTag}`, pos)) {
      const closeIdx = text.indexOf('>', pos);
      pos = closeIdx >= 0 ? closeIdx + 1 : text.length;
      return { nodes, position: pos, endReason: 'tagClose' };
    }

    if (text.startsWith('{{', pos)) {
      const token = parseMustacheToken(text, pos);

      if (endBlock && token.kind === 'blockEnd' && token.name === endBlock) {
        return { nodes, position: token.end, endReason: 'blockEnd' };
      }

      if (endBlock && token.kind === 'else') {
        return { nodes, position: token.end, endReason: 'else' };
      }

      if (token.kind === 'blockStart') {
        const { node, next } = parseBlock(text, token);
        nodes.push(node);
        pos = next;
        continue;
      }

      if (token.kind === 'blockEnd') {
        // Unmatched end, treat as text to avoid crash
        nodes.push({ type: 'TextNode', value: text.slice(pos, token.end) } as TextNode);
        pos = token.end;
        continue;
      }

      if (token.kind === 'partial') {
        nodes.push(createPartial(token.content));
        pos = token.end;
        continue;
      }

      if (token.kind === 'comment') {
        nodes.push(createComment(token.content));
        pos = token.end;
        continue;
      }

      nodes.push(createMustache(token.content, token.triple));
      pos = token.end;
      continue;
    }

    if (text[pos] === '<') {
      const tagResult = parseTag(text, pos);

      if (tagResult.kind === 'close') {
        pos = tagResult.end;
        return { nodes, position: pos, endReason: 'tagClose' };
      }

      if (tagResult.kind === 'selfClosing') {
        nodes.push({
          type: 'ElementNode',
          tag: tagResult.tag,
          attributes: tagResult.attributes,
          children: [],
          selfClosing: true,
        } as ElementNode);
        pos = tagResult.end;
        continue;
      }

      const { nodes: children, position: newPos } = parseChildren(text, tagResult.end, tagResult.tag, null);
      nodes.push({
        type: 'ElementNode',
        tag: tagResult.tag,
        attributes: tagResult.attributes,
        children,
        selfClosing: false,
      } as ElementNode);
      pos = newPos;
      continue;
    }

    // Text node until next markup
    const nextMarkup = findNextMarkup(text, pos);
    const value = text.slice(pos, nextMarkup);
    if (value.trim().length > 0) {
      nodes.push({ type: 'TextNode', value } as TextNode);
    }
    pos = nextMarkup;
  }

  return { nodes, position: pos, endReason: null };
}

function parseBlock(text: string, token: MustacheToken): { node: BlockStatement; next: number } {
  const openInfo = parseExpression(token.content.slice(1));
  const { nodes: program, position: afterProgram, endReason } = parseChildren(text, token.end, null, openInfo.path);

  let inverse: Node[] = [];
  let finalPos = afterProgram;

  if (endReason === 'else') {
    const { nodes: inverseNodes, position: afterInverse } = parseChildren(text, afterProgram, null, openInfo.path);
    inverse = inverseNodes;
    finalPos = afterInverse;
  }

  // consume closing block if still present
  if (text.startsWith('{{/', finalPos)) {
    const endToken = parseMustacheToken(text, finalPos);
    finalPos = endToken.end;
  }

  const node: BlockStatement = {
    type: 'BlockStatement',
    program,
    inverse,
    rawOpen: token.content,
    ...openInfo,
  };

  return { node, next: finalPos };
}

type MustacheTokenKind = 'blockStart' | 'blockEnd' | 'partial' | 'comment' | 'mustache' | 'else';

interface MustacheToken {
  kind: MustacheTokenKind;
  content: string;
  end: number;
  triple: boolean;
  name?: string;
}

function parseMustacheToken(text: string, position: number): MustacheToken {
  const triple = text.startsWith('{{{', position);
  const close = triple ? '}}}' : '}}';
  const closeIdx = text.indexOf(close, position + (triple ? 3 : 2));
  const end = closeIdx >= 0 ? closeIdx + close.length : text.length;
  const inner = text.slice(position + (triple ? 3 : 2), closeIdx >= 0 ? closeIdx : undefined).trim();

  if (inner.startsWith('!')) {
    return { kind: 'comment', content: inner, end, triple, name: undefined };
  }

  if (inner.startsWith('>')) {
    return { kind: 'partial', content: inner.slice(1).trim(), end, triple, name: undefined };
  }

  if (inner.startsWith('#')) {
    const name = inner.slice(1).trim().split(/\s+/)[0];
    return { kind: 'blockStart', content: inner, end, triple, name };
  }

  if (inner.startsWith('/')) {
    const name = inner.slice(1).trim();
    return { kind: 'blockEnd', content: inner, end, triple, name };
  }

  if (inner === 'else' || inner.startsWith('else ')) {
    return { kind: 'else', content: inner, end, triple, name: 'else' };
  }

  return { kind: 'mustache', content: inner, end, triple, name: undefined };
}

function parseTag(text: string, position: number):
  | { kind: 'open'; tag: string; attributes: ElementAttribute[]; end: number }
  | { kind: 'selfClosing'; tag: string; attributes: ElementAttribute[]; end: number }
  | { kind: 'close'; tag: string; end: number } {
  let pos = position + 1; // skip '<'

  if (text[pos] === '/') {
    pos += 1;
    const { value: tag, next } = readName(text, pos);
    const closeIdx = text.indexOf('>', next);
    return { kind: 'close', tag, end: closeIdx >= 0 ? closeIdx + 1 : text.length };
  }

  const { value: tag, next } = readName(text, pos);
  pos = next;
  const attributes: ElementAttribute[] = [];

  while (pos < text.length) {
    skipWhitespace(text, () => pos++, () => pos);
    if (text[pos] === '/' && text[pos + 1] === '>') {
      pos += 2;
      return { kind: 'selfClosing', tag, attributes, end: pos };
    }
    if (text[pos] === '>') {
      pos += 1;
      return { kind: 'open', tag, attributes, end: pos };
    }

    const attr = parseAttribute(text, pos);
    attributes.push(attr.attribute);
    pos = attr.position;
  }

  return { kind: 'open', tag, attributes, end: pos };
}

function parseAttribute(text: string, position: number): { attribute: ElementAttribute; position: number } {
  let pos = position;
  skipWhitespace(text, () => pos++, () => pos);
  const { value: name, next } = readName(text, pos);
  pos = next;
  skipWhitespace(text, () => pos++, () => pos);

  if (text[pos] !== '=') {
    return { attribute: { name }, position: pos };
  }

  pos += 1;
  skipWhitespace(text, () => pos++, () => pos);

  let value = '';
  if (text[pos] === '"' || text[pos] === "'") {
    const quote = text[pos];
    pos += 1;
    const end = text.indexOf(quote, pos);
    value = text.slice(pos, end >= 0 ? end : undefined);
    pos = end >= 0 ? end + 1 : text.length;
  } else {
    const start = pos;
    while (pos < text.length && !whitespace.test(text[pos]) && text[pos] !== '>' && text[pos] !== '/') {
      pos += 1;
    }
    value = text.slice(start, pos);
  }

  return { attribute: { name, value }, position: pos };
}

function skipWhitespace(text: string, advance: () => void, getPos: () => number) {
  while (getPos() < text.length && whitespace.test(text[getPos()])) {
    advance();
  }
}

function readName(text: string, position: number): { value: string; next: number } {
  let pos = position;
  while (pos < text.length && /[A-Za-z0-9_:-]/.test(text[pos])) {
    pos += 1;
  }
  return { value: text.slice(position, pos), next: pos };
}

function findNextMarkup(text: string, position: number): number {
  let next = text.indexOf('<', position);
  if (next === -1) next = text.length;
  const hb = text.indexOf('{{', position);
  if (hb !== -1 && hb < next) {
    next = hb;
  }
  return next;
}

function parseExpression(content: string): MustacheStatement {
  const triple = false;
  const normalized = normalizeExpression(content);
  const tokens = tokenize(normalized);
  const path = tokens.shift() || '';
  const { params, hash } = splitParams(tokens);

  return {
    type: 'MustacheStatement',
    path,
    params,
    hash,
    triple,
  };
}

function createMustache(content: string, triple: boolean): MustacheStatement {
  const normalized = normalizeExpression(content);
  const tokens = tokenize(normalized);
  const path = tokens.shift() || '';
  const { params, hash } = splitParams(tokens);
  return {
    type: 'MustacheStatement',
    path,
    params,
    hash,
    triple,
  };
}

function createPartial(content: string): PartialStatement {
  const normalized = normalizeExpression(content);
  const tokens = tokenize(normalized);
  const path = tokens.shift() || '';
  const { params, hash } = splitParams(tokens);
  return {
    type: 'PartialStatement',
    path,
    params,
    hash,
  };
}

function createComment(content: string): CommentStatement {
  const multiline = content.startsWith('!--');
  return {
    type: 'CommentStatement',
    value: content.replace(/^!(-{2})?\s*/, ''),
    multiline,
  };
}

function splitParams(tokens: string[]): { params: string[]; hash: HashPair[] } {
  const params: string[] = [];
  const hash: HashPair[] = [];

  tokens.forEach((token) => {
    const eqIndex = token.indexOf('=');
    if (eqIndex > 0) {
      const key = token.slice(0, eqIndex);
      const value = token.slice(eqIndex + 1);
      hash.push({ key, value });
    } else {
      params.push(token);
    }
  });

  return { params, hash };
}

function normalizeExpression(content: string): string {
  return tokenize(content.trim()).join(' ');
}

function tokenize(content: string): string[] {
  const tokens: string[] = [];
  const regex = /"[^"]*"|'[^']*'|\S+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    tokens.push(match[0]);
  }

  return tokens;
}

