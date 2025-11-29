import { Program, Node, ElementAttribute, ElementNode, TextNode, MustacheStatement, BlockStatement, PartialStatement, CommentStatement, HashPair, ParseEndReason, UnmatchedNode } from './types';

interface ParseResult {
  nodes: Node[];
  position: number;
  endReason: ParseEndReason;
}

const whitespace = /\s/;
const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const rawTextElements = new Set(['script', 'style']);

export function parse(text: string): Program {
  const { nodes } = parseChildren(text, 0, null, null);
  return { type: 'Program', body: nodes };
}

function parseChildren(text: string, position: number, endTag: string | null, endBlock: string | null): ParseResult {
  const nodes: Node[] = [];
  let pos = position;

  if (endTag && rawTextElements.has(endTag.toLowerCase())) {
    const closeStart = text.indexOf(`</${endTag}`, pos);
    const contentEnd = closeStart >= 0 ? closeStart : text.length;
    const rawContent = text.slice(pos, contentEnd);

    if (rawContent.length > 0) {
      nodes.push({ type: 'TextNode', value: rawContent, verbatim: true } as TextNode);
    }

    const closeIdx = closeStart >= 0 ? text.indexOf('>', closeStart) : -1;
    const nextPos = closeIdx >= 0 ? closeIdx + 1 : contentEnd;

    return { nodes, position: nextPos, endReason: closeStart >= 0 ? 'tagClose' : null };
  }

  while (pos < text.length) {
    if (endTag && text.startsWith(`</${endTag}`, pos)) {
      const closeIdx = text.indexOf('>', pos);
      pos = closeIdx >= 0 ? closeIdx + 1 : text.length;
      return { nodes, position: pos, endReason: 'tagClose' };
    }

    if (text.startsWith('{{', pos)) {
      const token = parseMustacheToken(text, pos);

      if (token.kind === 'comment') {
        const ignoreDirective = getPrettierIgnoreDirective(token.rawContent);

        if (ignoreDirective === 'start') {
          const ignoreStart = pos;
          const ignoreEnd = findPrettierIgnoreEnd(text, token.end);
          const finalIgnoredEnd = ignoreEnd ?? text.length;

          nodes.push(createUnmatchedNode(text, ignoreStart, finalIgnoredEnd));
          pos = finalIgnoredEnd;
          continue;
        }

        if (ignoreDirective === 'next' || ignoreDirective === 'attribute') {
          const ignoreStart = pos;
          const afterComment = token.end;
          const ignoredEnd = consumeNextNode(text, afterComment);
          const finalIgnoredEnd = ignoredEnd > afterComment ? ignoredEnd : text.length;

          nodes.push(createUnmatchedNode(text, ignoreStart, finalIgnoredEnd));
          pos = finalIgnoredEnd;
          continue;
        }
      }

      if (endBlock && token.kind === 'blockEnd' && token.name === endBlock) {
        return { nodes, position: token.end, endReason: 'blockEnd' };
      }

      if (endBlock && token.kind === 'else') {
        return { nodes, position: token.end, endReason: 'else' };
      }

      if (token.kind === 'blockStart') {
        if (!hasMatchingBlockEnd(text, token, pos)) {
          nodes.push(createUnmatchedNode(text, pos, token.end));
          pos = token.end;
          continue;
        }

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
        nodes.push(createComment(token.rawContent));
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

      if (!hasMatchingTagEnd(text, tagResult.tag, tagResult.end)) {
        nodes.push(createUnmatchedNode(text, pos, tagResult.end));
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
    const rawValue = text.slice(pos, nextMarkup);
    const trimmed = rawValue.trim();
    if (trimmed.length > 0) {
      nodes.push({ type: 'TextNode', value: trimmed } as TextNode);
    } else {
      const newlineCount = (rawValue.match(/\n/g) || []).length;
      const blankLines = Math.max(newlineCount - 1, 0);
      if (blankLines > 0) {
        nodes.push({ type: 'TextNode', value: '', blankLines } as TextNode);
      }
    }
    pos = nextMarkup;
  }

  return { nodes, position: pos, endReason: null };
}

function hasMatchingBlockEnd(text: string, token: MustacheToken, start: number): boolean {
  if (!token.name) {
    return false;
  }

  return text.indexOf(`{{/${token.name}`, start + 1) !== -1;
}

function parseBlock(text: string, token: MustacheToken): { node: BlockStatement; next: number } {
  const openInfo = parseExpression(token.content.slice(1));
  const { nodes: program, position: afterProgram, endReason } = parseChildren(text, token.end, null, openInfo.path);
  const trimmedProgram = trimEdgeWhitespace(program);

  let inverse: Node[] = [];
  let finalPos = afterProgram;

  if (endReason === 'else') {
    const { nodes: inverseNodes, position: afterInverse } = parseChildren(text, afterProgram, null, openInfo.path);
    inverse = trimEdgeWhitespace(inverseNodes);
    finalPos = afterInverse;
  }

  // consume closing block if still present
  if (text.startsWith('{{/', finalPos)) {
    const endToken = parseMustacheToken(text, finalPos);
    finalPos = endToken.end;
  }

  // Drop the mustache-specific `type` field so we can build a proper BlockStatement
  const { type: _ignored, ...expression } = openInfo;

  const node: BlockStatement = {
    type: 'BlockStatement',
    program: trimmedProgram,
    inverse,
    rawOpen: token.content,
    ...expression,
  };

  return { node, next: finalPos };
}

function hasMatchingTagEnd(text: string, tag: string, start: number): boolean {
  return text.indexOf(`</${tag}`, start) !== -1;
}

function trimEdgeWhitespace(nodes: Node[]): Node[] {
  let start = 0;
  let end = nodes.length;

  while (start < end && isWhitespaceOnlyText(nodes[start])) {
    start += 1;
  }

  while (end > start && isWhitespaceOnlyText(nodes[end - 1])) {
    end -= 1;
  }

  return nodes.slice(start, end);
}

function isWhitespaceOnlyText(node: Node): boolean {
  return node.type === 'TextNode' && (node as TextNode).value === '';
}

type PrettierIgnoreDirective = 'next' | 'start' | 'end' | 'attribute' | null;

function getPrettierIgnoreDirective(rawContent: string): PrettierIgnoreDirective {
  const normalized = rawContent.toLowerCase();

  if (normalized.includes('prettier-ignore-start')) {
    return 'start';
  }

  if (normalized.includes('prettier-ignore-end')) {
    return 'end';
  }

  if (normalized.includes('prettier-ignore-attribute')) {
    return 'attribute';
  }

  if (normalized.includes('prettier-ignore')) {
    return 'next';
  }

  return null;
}

function findPrettierIgnoreEnd(text: string, position: number): number | null {
  let pos = position;

  while (pos < text.length) {
    const next = text.indexOf('{{', pos);

    if (next === -1) {
      return null;
    }

    const token = parseMustacheToken(text, next);
    const directive = getPrettierIgnoreDirective(token.rawContent);

    if (token.kind === 'comment' && directive === 'end') {
      return token.end;
    }

    pos = token.end > next ? token.end : next + 2;
  }

  return null;
}

function consumeNextNode(text: string, position: number): number {
  if (position >= text.length) {
    return position;
  }

  if (text.startsWith('{{', position)) {
    const token = parseMustacheToken(text, position);

    if (token.kind === 'blockStart') {
      const { next } = parseBlock(text, token);
      return next;
    }

    return token.end;
  }

  if (text[position] === '<') {
    const tagResult = parseTag(text, position);

    if (tagResult.kind === 'open') {
      const { position: afterChildren } = parseChildren(text, tagResult.end, tagResult.tag, null);
      return afterChildren;
    }

    return tagResult.end;
  }

  const nextMarkup = findNextMarkup(text, position);

  if (nextMarkup <= position) {
    return nextMarkup;
  }

  if (nextMarkup >= text.length) {
    return text.length;
  }

  return consumeNextNode(text, nextMarkup);
}

function createUnmatchedNode(text: string, start: number, end: number): UnmatchedNode {
  return { type: 'UnmatchedNode', raw: text.slice(start, end) };
}

type MustacheTokenKind = 'blockStart' | 'blockEnd' | 'partial' | 'comment' | 'mustache' | 'else';

interface MustacheToken {
  kind: MustacheTokenKind;
  content: string;
  rawContent: string;
  end: number;
  triple: boolean;
  name?: string;
}

function parseMustacheToken(text: string, position: number): MustacheToken {
  const triple = text.startsWith('{{{', position);
  const openLength = triple ? 3 : 2;
  const isBlockComment = text.startsWith('{{!--', position) || text.startsWith('{{{!--', position);
  const close = triple ? '}}}' : '}}';
  const closeDelimiter = isBlockComment ? `--${close}` : close;
  const closeIdx = text.indexOf(closeDelimiter, position + openLength);
  const end = closeIdx >= 0 ? closeIdx + closeDelimiter.length : text.length;
  const rawContent = text.slice(position + openLength, closeIdx >= 0 ? closeIdx : undefined);
  const inner = rawContent.trim();

  if (inner.startsWith('!')) {
    return { kind: 'comment', content: inner, rawContent, end, triple, name: undefined };
  }

  if (inner.startsWith('>')) {
    return { kind: 'partial', content: inner.slice(1).trim(), rawContent, end, triple, name: undefined };
  }

  if (inner.startsWith('#')) {
    const name = inner.slice(1).trim().split(/\s+/)[0];
    return { kind: 'blockStart', content: inner, rawContent, end, triple, name };
  }

  if (inner.startsWith('/')) {
    const name = inner.slice(1).trim();
    return { kind: 'blockEnd', content: inner, rawContent, end, triple, name };
  }

  if (inner === 'else' || inner.startsWith('else ')) {
    return { kind: 'else', content: inner, rawContent, end, triple, name: 'else' };
  }

  return { kind: 'mustache', content: inner, rawContent, end, triple, name: undefined };
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

    if (text.startsWith('{{', pos)) {
      const token = parseMustacheToken(text, pos);
      const open = token.triple ? '{{{' : '{{';
      const close = token.triple ? '}}}' : '}}';
      const content = token.content;
      attributes.push({ name: `${open}${content}${close}` });
      pos = token.end;
      continue;
    }

    if (text[pos] === '/' && text[pos + 1] === '>') {
      pos += 2;
      return { kind: 'selfClosing', tag, attributes, end: pos };
    }
    if (text[pos] === '>') {
      pos += 1;
      const kind = voidElements.has(tag.toLowerCase()) ? 'selfClosing' : 'open';
      return { kind, tag, attributes, end: pos };
    }

    const beforeAttr = pos;
    const attr = parseAttribute(text, pos);

    if (!attr) {
      pos = beforeAttr + 1;
      continue;
    }

    attributes.push(attr.attribute);
    pos = attr.position;

    if (pos <= beforeAttr) {
      pos = beforeAttr + 1;
    }
  }

  const kind = voidElements.has(tag.toLowerCase()) ? 'selfClosing' : 'open';
  return { kind, tag, attributes, end: pos };
}

function parseAttribute(text: string, position: number): { attribute: ElementAttribute; position: number } | null {
  let pos = position;
  skipWhitespace(text, () => pos++, () => pos);
  const { value: name, next } = readName(text, pos);
  pos = next;

  if (!name) {
    return null;
  }

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
  const isBlockStyle = /^\s*!-{2}/.test(content);
  const withoutOpen = content.replace(/^[\t ]*!-{0,2}/, '');
  const withoutClosing = withoutOpen.replace(/-{2}\s*$/, '');
  let value = withoutClosing.startsWith('\n') ? withoutClosing : withoutClosing.replace(/^\s*/, '');

  value = value.replace(/[ \t]+$/gm, '');

  const isMultiline = /\n/.test(content);

  return {
    type: 'CommentStatement',
    value,
    multiline: isMultiline,
    block: isBlockStyle || isMultiline,
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
  const joined = tokenize(content.trim()).join(' ');
  return joined.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
}

function tokenize(content: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      current += char;
      quote = char;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      current += char;
      continue;
    }

    if (char === ')') {
      parenDepth = Math.max(parenDepth - 1, 0);
      current += char;
      continue;
    }

    if (char === '[') {
      bracketDepth += 1;
      current += char;
      continue;
    }

    if (char === ']') {
      bracketDepth = Math.max(bracketDepth - 1, 0);
      current += char;
      continue;
    }

    if (char === '{') {
      braceDepth += 1;
      current += char;
      continue;
    }

    if (char === '}') {
      braceDepth = Math.max(braceDepth - 1, 0);
      current += char;
      continue;
    }

    if (whitespace.test(char) && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

