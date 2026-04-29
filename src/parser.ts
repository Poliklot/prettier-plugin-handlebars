import {
  Program,
  Node,
  ElementAttribute,
  ElementNode,
  TextNode,
  MustacheStatement,
  BlockStatement,
  ElseBranch,
  PartialStatement,
  CommentStatement,
  HashPair,
  ParseEndReason,
  UnmatchedNode,
} from './types';

interface ParseResult {
  nodes: Node[];
  position: number;
  endReason: ParseEndReason;
  endToken?: MustacheToken;
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
const rawTextElements = new Set(['script', 'style', 'textarea', 'pre']);
const whitespaceSensitiveRawTextElements = new Set(['textarea', 'pre']);

export function parse(text: string): Program {
  const normalizedText = normalizeInput(text);
  const { nodes } = parseChildren(normalizedText, 0, null, null);
  return { type: 'Program', body: nodes };
}

function parseChildren(text: string, position: number, endTag: string | null, endBlock: string | null): ParseResult {
  const nodes: Node[] = [];
  let pos = position;

  if (endTag && rawTextElements.has(endTag.toLowerCase())) {
    const closeStart = findRawTextClose(text, pos, endTag);
    const contentEnd = closeStart >= 0 ? closeStart : text.length;
    const rawContent = text.slice(pos, contentEnd);

    if (rawContent.length > 0) {
      nodes.push({
        type: 'TextNode',
        value: rawContent,
        verbatim: true,
        preserveWhitespace: whitespaceSensitiveRawTextElements.has(endTag.toLowerCase()),
      } as TextNode);
    }

    const closeIdx = closeStart >= 0 ? text.indexOf('>', closeStart) : -1;
    const nextPos = closeIdx >= 0 ? closeIdx + 1 : contentEnd;

    return { nodes, position: nextPos, endReason: closeStart >= 0 ? 'tagClose' : null };
  }

  while (pos < text.length) {
    const rawBlockEnd = consumeRawBlock(text, pos);
    if (rawBlockEnd !== null) {
      nodes.push(createUnmatchedNode(text, pos, rawBlockEnd));
      pos = rawBlockEnd;
      continue;
    }

    const dynamicElementEnd = consumeDynamicElement(text, pos);
    if (dynamicElementEnd !== null) {
      nodes.push(createUnmatchedNode(text, pos, dynamicElementEnd));
      pos = dynamicElementEnd;
      continue;
    }

    if (endTag && text.startsWith(`</${endTag}`, pos)) {
      const closeIdx = text.indexOf('>', pos);
      pos = closeIdx >= 0 ? closeIdx + 1 : text.length;
      return { nodes, position: pos, endReason: 'tagClose' };
    }

    if (text.startsWith('{{', pos)) {
      const token = parseMustacheToken(text, pos);

      if (shouldPreserveMustacheVerbatim(token) && !(endBlock && token.kind === 'else')) {
        const preserveEnd =
          token.kind === 'blockStart' ? consumeUnsupportedBlock(text, pos, token) : token.end;
        nodes.push(createUnmatchedNode(text, pos, preserveEnd));
        pos = preserveEnd;
        continue;
      }

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
        return { nodes, position: token.end, endReason: 'blockEnd', endToken: token };
      }

      if (endBlock && token.kind === 'else') {
        return { nodes, position: token.end, endReason: 'else', endToken: token };
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
        nodes.push(createPartial(token.content, token.trimOpen, token.trimClose));
        pos = token.end;
        continue;
      }

      if (token.kind === 'comment') {
        nodes.push(createComment(token.rawContent));
        pos = token.end;
        continue;
      }

      nodes.push(createMustache(token.content, token.triple, token.trimOpen, token.trimClose));
      pos = token.end;
      continue;
    }

    if (text[pos] === '<') {
      if (text.startsWith('<!', pos) && !text.startsWith('<!--', pos)) {
        const closeIdx = text.indexOf('>', pos + 2);
        const end = closeIdx >= 0 ? closeIdx + 1 : text.length;
        nodes.push({ type: 'TextNode', value: text.slice(pos, end), verbatim: true } as TextNode);
        pos = end;
        continue;
      }

      if (!isTagStart(text, pos)) {
        const nextMarkup = findNextMarkup(text, pos + 1);
        nodes.push({ type: 'TextNode', value: text.slice(pos, nextMarkup) } as TextNode);
        pos = nextMarkup;
        continue;
      }

      if (text.startsWith('<!--', pos)) {
        const closeIdx = text.indexOf('-->', pos + 4);
        const end = closeIdx >= 0 ? closeIdx + 3 : text.length;

        nodes.push({ type: 'TextNode', value: text.slice(pos, end), verbatim: true } as TextNode);
        pos = end;
        continue;
      }

      const tagResult = parseTag(text, pos);

      if (tagResult.kind === 'close') {
        if (endTag && tagResult.tag === endTag) {
          pos = tagResult.end;
          return { nodes, position: pos, endReason: 'tagClose' };
        }

        nodes.push({ type: 'TextNode', value: text.slice(pos, tagResult.end), verbatim: true } as TextNode);
        pos = tagResult.end;
        continue;
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

      const blockBoundary = endBlock ? findCurrentBlockBoundary(text, tagResult.end, endBlock) : -1;

      if (!hasMatchingTagEnd(text, tagResult.tag, tagResult.end, blockBoundary)) {
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
      const node: TextNode = {
        type: 'TextNode',
        value: trimmed,
      };
      const leadingWhitespace = rawValue.match(/^\s*/)?.[0] ?? '';
      const trailingWhitespace = rawValue.match(/\s*$/)?.[0] ?? '';

      if (leadingWhitespace) {
        node.leadingWhitespace = leadingWhitespace;
      }

      if (trailingWhitespace) {
        node.trailingWhitespace = trailingWhitespace;
      }

      nodes.push(node);
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

  let depth = 0;
  let pos = start + 1;

  while (pos < text.length) {
    const next = text.indexOf('{{', pos);
    if (next === -1) {
      return false;
    }

    const candidate = parseMustacheToken(text, next);

    if (candidate.kind === 'blockStart' && candidate.name === token.name) {
      depth += 1;
    } else if (candidate.kind === 'blockEnd' && candidate.name === token.name) {
      if (depth === 0) {
        return true;
      }

      depth -= 1;
    }

    pos = candidate.end > next ? candidate.end : next + 2;
  }

  return false;
}

function parseBlock(text: string, token: MustacheToken): { node: BlockStatement; next: number } {
  const openInfo = parseExpression(getBlockExpression(token));
  const blockPrefix = getBlockPrefix(token);
  const { nodes: program, position: afterProgram, endReason, endToken } = parseChildren(
    text,
    token.end,
    null,
    openInfo.path,
  );
  const buildProgram = (nodes: Node[]): Program => ({ type: 'Program', body: trimEdgeWhitespace(nodes) });
  const programBody = buildProgram(program);

  let inverseBody: Program = { type: 'Program', body: [] };
  const inverseChain: ElseBranch[] = [];
  let finalPos = afterProgram;
  let closeToken = endReason === 'blockEnd' ? endToken : undefined;

  if (endReason === 'else' && endToken) {
    let currentElseToken: MustacheToken | undefined = endToken;
    let currentPosition = afterProgram;

    while (currentElseToken?.specialForm === 'elseIf') {
      const branchInfo = parseExpression(currentElseToken.content.replace(/^else\s+/, ''));
      const { type: _branchType, ...branchExpression } = branchInfo;
      const {
        nodes: branchNodes,
        position: afterBranch,
        endReason: branchEndReason,
        endToken: branchEndToken,
      } = parseChildren(text, currentPosition, null, openInfo.path);

      inverseChain.push({
        type: 'ElseBranch',
        program: buildProgram(branchNodes),
        trimOpen: currentElseToken.trimOpen,
        trimClose: currentElseToken.trimClose,
        ...branchExpression,
      });

      finalPos = afterBranch;
      closeToken = branchEndReason === 'blockEnd' ? branchEndToken : undefined;

      if (branchEndReason === 'else' && branchEndToken) {
        currentElseToken = branchEndToken;
        currentPosition = afterBranch;
        continue;
      }

      currentElseToken = undefined;
    }

    if (currentElseToken) {
      const {
        nodes: inverseNodes,
        position: afterInverse,
        endReason: inverseEndReason,
        endToken: inverseEndToken,
      } = parseChildren(text, currentPosition, null, openInfo.path);
      inverseBody = buildProgram(inverseNodes);
      finalPos = afterInverse;
      closeToken = inverseEndReason === 'blockEnd' ? inverseEndToken : undefined;
    }
  }

  // Drop the mustache-specific `type` field so we can build a proper BlockStatement
  const { type: _ignored, ...expression } = openInfo;

  const node: BlockStatement = {
    type: 'BlockStatement',
    program: programBody,
    ...(inverseChain.length > 0 ? { inverseChain } : {}),
    inverse: inverseBody,
    rawOpen: token.content,
    blockPrefix,
    trimOpen: token.trimOpen,
    trimClose: token.trimClose,
    closeTrimOpen: closeToken?.trimOpen,
    closeTrimClose: closeToken?.trimClose,
    ...expression,
  };

  return { node, next: finalPos };
}

function getBlockExpression(token: MustacheToken): string {
  if (token.specialForm === 'blockPartial' || token.specialForm === 'decoratorBlock') {
    return token.content.slice(2).trim();
  }

  return token.content.slice(1).trim();
}

function getBlockPrefix(token: MustacheToken): '#' | '#>' | '#*' {
  if (token.specialForm === 'blockPartial') {
    return '#>';
  }

  if (token.specialForm === 'decoratorBlock') {
    return '#*';
  }

  return '#';
}

function hasMatchingTagEnd(text: string, tag: string, start: number, limit = -1): boolean {
  return findMatchingTagClose(text, tag, start, limit) !== null;
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

function normalizeInput(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
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
  rawInner: string;
  trimOpen: boolean;
  trimClose: boolean;
  specialForm?: 'blockPartial' | 'decoratorBlock' | 'decorator' | 'elseIf';
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
  const rawInner = rawContent.trim();
  const trimOpen = rawInner.startsWith('~');
  const trimClose = rawInner.endsWith('~');
  const inner = rawInner.replace(/^~/, '').replace(/~$/, '').trim();

  const baseToken = {
    rawContent,
    rawInner,
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

    const dynamicAttribute = parseDynamicAttribute(text, pos);
    if (dynamicAttribute) {
      attributes.push(dynamicAttribute.attribute);
      pos = dynamicAttribute.position;
      continue;
    }

    if (text.startsWith('{{', pos)) {
      const token = parseMustacheToken(text, pos);

      // комментарий в голове тега
      if (token.kind === 'comment') {
        attributes.push({
          type: 'AttributeBlock',
          block: createComment(token.rawContent),
        });
        pos = token.end;
        continue;
      }

      // partial в голове тега
      if (token.kind === 'partial') {
        attributes.push({
          type: 'AttributeBlock',
          block: createPartial(token.content, token.trimOpen, token.trimClose),
        });
        pos = token.end;
        continue;
      }

      // обычный {{ mustache }}
      if (token.kind === 'mustache') {
        attributes.push({
          type: 'AttributeBlock',
          block: createMustache(token.content, token.triple, token.trimOpen, token.trimClose),
        });
        pos = token.end;
        continue;
      }

      // {{#block}} ... {{/block}} в голове тега
      if (token.kind === 'blockStart') {
        if (!hasMatchingBlockEnd(text, token, pos)) {
          // нет закрытия — считаем unmatched-куском
          attributes.push({
            type: 'AttributeBlock',
            block: createMustache(token.content, token.triple, token.trimOpen, token.trimClose),
          });
          pos = token.end;
          continue;
        }

        const { node, next } = parseBlock(text, token);
        attributes.push({
          type: 'AttributeBlock',
          block: node,
        });
        pos = next;
        continue;
      }

      // else / blockEnd в голове тега — странный случай, но не ломаемся
      attributes.push({
        type: 'AttributeBlock',
        block: createMustache(token.content, token.triple, token.trimOpen, token.trimClose),
      });
      pos = token.end;
      continue;
    }

    if (text[pos] === '/' && text[pos + 1] === '>') {
      pos += 2;
      const normalizedAttributes = normalizeTagAttributes(attributes);
      return { kind: 'selfClosing', tag, attributes: normalizedAttributes, end: pos };
    }
    if (text[pos] === '>') {
      pos += 1;
      const kind = voidElements.has(tag.toLowerCase()) ? 'selfClosing' : 'open';
      const normalizedAttributes = normalizeTagAttributes(attributes);
      return { kind, tag, attributes: normalizedAttributes, end: pos };
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
  const normalizedAttributes = normalizeTagAttributes(attributes);
  return { kind, tag, attributes: normalizedAttributes, end: pos };
}

function isTagStart(text: string, position: number): boolean {
  if (text[position] !== '<') {
    return false;
  }

  const next = text[position + 1];
  return /[A-Za-z!/]/.test(next ?? '') || next === '/';
}

function isDynamicTagStart(text: string, position: number): boolean {
  return text.startsWith('<{{', position) || text.startsWith('</{{', position);
}

function parseAttribute(text: string, position: number): { attribute: ElementAttribute; position: number } | null {
  let pos = position;
  skipWhitespace(text, () => pos++, () => pos);
  const attrStart = pos;
  const { value: name, next } = readName(text, pos);
  pos = next;

  if (!name) {
    return null;
  }

  skipWhitespace(text, () => pos++, () => pos);

  // boolean-атрибут: без "="
  if (text[pos] !== '=') {
    return { attribute: createAttribute(name, null), position: pos };
  }

  pos += 1;
  skipWhitespace(text, () => pos++, () => pos);

  let rawValue = '';
  if (text[pos] === '"' || text[pos] === "'") {
    const quote = text[pos];
    pos += 1;
    const end = text.indexOf(quote, pos);
    rawValue = text.slice(pos, end >= 0 ? end : undefined);
    pos = end >= 0 ? end + 1 : text.length;
  } else {
    const start = pos;
    while (pos < text.length && text[pos] !== '>' && text[pos] !== '/') {
      if (text.startsWith('{{', pos)) {
        const token = parseMustacheToken(text, pos);
        pos = token.end;
        continue;
      }

      if (whitespace.test(text[pos])) {
        break;
      }

      pos += 1;
    }
    rawValue = text.slice(start, pos);
  }

  if (shouldPreserveRawAttribute(name, rawValue)) {
    return { attribute: createRawAttribute(text.slice(attrStart, pos)), position: pos };
  }

  return { attribute: createAttribute(name, rawValue), position: pos };
}

function shouldPreserveRawAttribute(name: string, rawValue: string): boolean {
  return rawValue.includes('\n') && (name.startsWith('data-for-') || rawValue.includes('&quot;'));
}

function parseDynamicAttribute(
  text: string,
  position: number,
): { attribute: ElementAttribute; position: number } | null {
  let pos = position;
  skipWhitespace(text, () => pos++, () => pos);

  const start = pos;
  let hasDynamicPart = false;
  let hasStaticPart = false;

  while (pos < text.length) {
    if (text.startsWith('{{', pos)) {
      const token = parseMustacheToken(text, pos);

      if (token.kind !== 'mustache') {
        return null;
      }

      hasDynamicPart = true;
      pos = token.end;
      continue;
    }

    if (/[A-Za-z0-9_:-]/.test(text[pos])) {
      hasStaticPart = true;
      pos += 1;
      continue;
    }

    break;
  }

  if (!hasDynamicPart || !hasStaticPart) {
    return null;
  }

  const nameEnd = pos;
  let afterName = pos;
  while (afterName < text.length && whitespace.test(text[afterName])) {
    afterName += 1;
  }

  if (text[afterName] !== '=') {
    return {
      attribute: createRawAttribute(text.slice(start, nameEnd)),
      position: nameEnd,
    };
  }

  pos = afterName + 1;
  while (pos < text.length && whitespace.test(text[pos])) {
    pos += 1;
  }

  if (text[pos] === '"' || text[pos] === "'") {
    const quote = text[pos];
    pos += 1;

    while (pos < text.length) {
      if (text.startsWith('{{', pos)) {
        const token = parseMustacheToken(text, pos);
        pos = token.end;
        continue;
      }

      if (text[pos] === quote) {
        pos += 1;
        break;
      }

      pos += 1;
    }
  } else {
    while (pos < text.length && !whitespace.test(text[pos]) && text[pos] !== '>' && text[pos] !== '/') {
      if (text.startsWith('{{', pos)) {
        const token = parseMustacheToken(text, pos);
        pos = token.end;
        continue;
      }

      pos += 1;
    }
  }

  return {
    attribute: createRawAttribute(text.slice(start, pos)),
    position: pos,
  };
}

function createAttribute(name: string, rawValue: string | null): ElementAttribute {
  if (rawValue == null) {
    return {
      type: 'Attribute',
      name,
      value: null,
    };
  }

  const parts = parseAttributeValueParts(rawValue);

  return {
    type: 'Attribute',
    name,
    value: {
      type: 'AttributeValue',
      parts,
    },
  };
}

function createRawAttribute(raw: string): ElementAttribute {
  return {
    type: 'RawAttribute',
    raw,
  };
}

function normalizeTagAttributes(attributes: ElementAttribute[]): ElementAttribute[] {
  const normalized: ElementAttribute[] = [];

  for (let index = 0; index < attributes.length; index += 1) {
    const current = attributes[index];
    const next = attributes[index + 1];

    if (
      current?.type === 'Attribute' &&
      current.value == null &&
      current.name.endsWith('-') &&
      next?.type === 'AttributeBlock' &&
      next.block.type === 'MustacheStatement'
    ) {
      normalized.push(createRawAttribute(`${current.name}${stringifyMustacheForAttribute(next.block)}`));
      index += 1;
      continue;
    }

    normalized.push(current);
  }

  return normalized;
}

function stringifyMustacheForAttribute(node: MustacheStatement): string {
  const pieces: string[] = [];

  if (node.path) {
    pieces.push(node.path);
  }

  if (node.params.length > 0) {
    pieces.push(...node.params);
  }

  if (node.hash.length > 0) {
    pieces.push(...node.hash.map((pair) => `${pair.key}=${pair.value}`));
  }

  if (node.blockParams && node.blockParams.length > 0) {
    pieces.push('as', `|${node.blockParams.join(' ')}|`);
  }

  const content = pieces.join(' ');
  const open = node.triple ? '{{{' : '{{';
  const close = node.triple ? '}}}' : '}}';
  const trimOpen = node.trimOpen ? '~' : '';
  const trimClose = node.trimClose ? '~' : '';
  const isSimpleValue = node.params.length === 0 && node.hash.length === 0 && (!node.blockParams || node.blockParams.length === 0);
  const openPadding = content.length > 0 && isSimpleValue ? ' ' : '';
  const closePadding = content.length > 0 && isSimpleValue ? ' ' : node.trimClose && /\s/.test(content) ? ' ' : '';

  return `${open}${trimOpen}${openPadding}${content}${closePadding}${trimClose}${close}`;
}

function parseAttributeValueParts(
  value: string,
): (TextNode | MustacheStatement | BlockStatement | PartialStatement | CommentStatement)[] {
  const parts: (TextNode | MustacheStatement | BlockStatement | PartialStatement | CommentStatement)[] = [];
  let pos = 0;

  while (pos < value.length) {
    if (value.startsWith('{{', pos)) {
      const token = parseMustacheToken(value, pos);

      // комментарий
      if (token.kind === 'comment') {
        parts.push(createComment(token.rawContent));
        pos = token.end;
        continue;
      }

      // partial
      if (token.kind === 'partial') {
        parts.push(createPartial(token.content, token.trimOpen, token.trimClose));
        pos = token.end;
        continue;
      }

      // обычный mustache
      if (token.kind === 'mustache') {
        parts.push(createMustache(token.content, token.triple, token.trimOpen, token.trimClose));
        pos = token.end;
        continue;
      }

      // блок {{#if ...}} ... {{/if}}
      if (token.kind === 'blockStart') {
        if (!hasMatchingBlockEnd(value, token, pos)) {
          // не нашли закрытие — считаем текстом, чтобы не упасть
          parts.push({ type: 'TextNode', value: value.slice(pos, token.end) } as TextNode);
          pos = token.end;
          continue;
        }

        const { node, next } = parseBlock(value, token);
        parts.push(node);
        pos = next;
        continue;
      }

      // else / blockEnd — странные, но не ломаемся
      parts.push({ type: 'TextNode', value: value.slice(pos, token.end) } as TextNode);
      pos = token.end;
      continue;
    }

    const next = value.indexOf('{{', pos);
    const end = next === -1 ? value.length : next;
    const rawText = value.slice(pos, end);

    if (rawText.length > 0) {
      parts.push({ type: 'TextNode', value: rawText } as TextNode);
    }

    pos = end;
  }

  return parts;
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
  let next = text.length;
  let searchPos = position;

  while (searchPos < text.length) {
    const candidate = text.indexOf('<', searchPos);
    if (candidate === -1) {
      break;
    }

    if (isDynamicTagStart(text, candidate)) {
      next = candidate;
      break;
    }

    if (isTagStart(text, candidate)) {
      next = candidate;
      break;
    }

    searchPos = candidate + 1;
  }

  const hb = text.indexOf('{{', position);
  if (hb !== -1 && hb < next) {
    next = hb;
  }
  return next;
}

function findCurrentBlockBoundary(text: string, position: number, endBlock: string): number {
  let depth = 0;
  let pos = position;

  while (pos < text.length) {
    const next = text.indexOf('{{', pos);
    if (next === -1) {
      return -1;
    }

    const token = parseMustacheToken(text, next);

    if (token.kind === 'blockStart' && shouldPreserveMustacheVerbatim(token)) {
      pos = consumeUnsupportedBlock(text, next, token);
      continue;
    }

    if (token.kind === 'blockStart') {
      depth += 1;
    } else if (token.kind === 'blockEnd') {
      if (depth === 0 && token.name === endBlock) {
        return next;
      }

      if (depth > 0) {
        depth -= 1;
      }
    } else if (token.kind === 'else' && depth === 0) {
      return next;
    }

    pos = token.end > next ? token.end : next + 2;
  }

  return -1;
}

function findMatchingTagClose(text: string, tag: string, position: number, limit = -1): number | null {
  if (rawTextElements.has(tag.toLowerCase())) {
    const closeStart = findRawTextClose(text, position, tag);
    if (closeStart === -1 || (limit >= 0 && closeStart >= limit)) {
      return null;
    }

    return closeStart;
  }

  let depth = 0;
  let pos = position;

  while (pos < text.length) {
    const next = text.indexOf('<', pos);
    if (next === -1 || (limit >= 0 && next >= limit)) {
      return null;
    }

    if (text.startsWith('<!--', next)) {
      const closeIdx = text.indexOf('-->', next + 4);
      pos = closeIdx >= 0 ? closeIdx + 3 : text.length;
      continue;
    }

    if (text.startsWith('<!', next) && !text.startsWith('<!--', next)) {
      const closeIdx = text.indexOf('>', next + 2);
      pos = closeIdx >= 0 ? closeIdx + 1 : text.length;
      continue;
    }

    const dynamicEnd = consumeDynamicElement(text, next);
    if (dynamicEnd !== null) {
      pos = dynamicEnd;
      continue;
    }

    if (!isTagStart(text, next)) {
      pos = next + 1;
      continue;
    }

    const tagResult = parseTag(text, next);

    if (tagResult.kind === 'close') {
      if (tagResult.tag === tag) {
        if (depth === 0) {
          return next;
        }

        depth -= 1;
      }

      pos = tagResult.end;
      continue;
    }

    if (tagResult.kind === 'open' && rawTextElements.has(tagResult.tag.toLowerCase())) {
      const closeStart = findRawTextClose(text, tagResult.end, tagResult.tag);
      const closeIdx = closeStart >= 0 ? text.indexOf('>', closeStart) : -1;
      pos = closeIdx >= 0 ? closeIdx + 1 : text.length;
      continue;
    }

    if (tagResult.kind === 'open' && tagResult.tag === tag) {
      depth += 1;
    }

    pos = tagResult.end;
  }

  return null;
}

function shouldPreserveMustacheVerbatim(token: MustacheToken): boolean {
  return token.specialForm === 'decorator' || token.specialForm === 'elseIf';
}

function consumeUnsupportedBlock(text: string, position: number, openToken: MustacheToken): number {
  if (!openToken.name) {
    return openToken.end;
  }

  let depth = 1;
  let pos = openToken.end;

  while (pos < text.length) {
    const next = text.indexOf('{{', pos);
    if (next === -1) {
      return text.length;
    }

    const token = parseMustacheToken(text, next);

    if (token.kind === 'blockStart' && token.name === openToken.name) {
      depth += 1;
    } else if (token.kind === 'blockEnd' && token.name === openToken.name) {
      depth -= 1;
      if (depth === 0) {
        return token.end;
      }
    }

    pos = token.end > next ? token.end : next + 2;
  }

  return text.length;
}

function consumeRawBlock(text: string, position: number): number | null {
  if (!text.startsWith('{{{{', position)) {
    return null;
  }

  const openIdx = text.indexOf('}}}}', position + 4);
  if (openIdx === -1) {
    return text.length;
  }

  const openInner = text.slice(position + 4, openIdx).trim();
  if (!openInner || openInner.startsWith('/')) {
    return null;
  }

  const name = openInner.split(/\s+/)[0];
  const closeTag = `{{{{/${name}}}}}`;
  const closeStart = text.indexOf(closeTag, openIdx + 4);

  if (closeStart === -1) {
    return text.length;
  }

  return closeStart + closeTag.length;
}

function findRawTextClose(text: string, position: number, tag: string): number {
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

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (text.startsWith(`</${tag}`, index)) {
      return index;
    }
  }

  return -1;
}

function consumeTagLikeChunk(text: string, position: number): number {
  let quote: '"' | "'" | '`' | null = null;
  let escaped = false;

  for (let index = position + 1; index < text.length; index += 1) {
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

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '>') {
      return index + 1;
    }
  }

  return text.length;
}

function consumeDynamicElement(text: string, position: number): number | null {
  if (!isDynamicTagStart(text, position)) {
    return null;
  }

  if (text.startsWith('</{{', position)) {
    return consumeTagLikeChunk(text, position);
  }

  const openEnd = consumeTagLikeChunk(text, position);
  let depth = 0;
  let pos = openEnd;

  while (pos < text.length) {
    const nextOpen = text.indexOf('<{{', pos);
    const nextClose = text.indexOf('</{{', pos);
    const candidates = [nextOpen, nextClose].filter((value) => value !== -1);
    const next = candidates.length > 0 ? Math.min(...candidates) : -1;

    if (next === -1) {
      return openEnd;
    }

    if (next === nextClose) {
      if (depth === 0) {
        return consumeTagLikeChunk(text, nextClose);
      }

      depth -= 1;
      pos = consumeTagLikeChunk(text, nextClose);
      continue;
    }

    depth += 1;
    pos = consumeTagLikeChunk(text, nextOpen);
  }

  return openEnd;
}

function parseExpression(content: string): MustacheStatement {
  const triple = false;
  const normalized = normalizeExpression(content);
  const { expression, blockParams } = extractBlockParams(normalized);
  const tokens = tokenize(expression);
  const path = tokens.shift() || '';
  const { params, hash } = splitParams(tokens);

  const result: MustacheStatement = {
    type: 'MustacheStatement',
    path,
    params,
    hash,
    triple,
  };

  if (blockParams.length > 0) {
    result.blockParams = blockParams;
  }

  return result;
}

function extractBlockParams(content: string): { expression: string; blockParams: string[] } {
  const match = content.match(/\s+as\s+\|([^|]*)\|/);

  if (!match) {
    return { expression: content, blockParams: [] };
  }

  const blockParams = match[1].split(/\s+/).filter(Boolean);
  const expression = content.replace(match[0], '').trim();

  return { expression, blockParams };
}

function createMustache(content: string, triple: boolean, trimOpen = false, trimClose = false): MustacheStatement {
  const normalized = normalizeExpression(content);
  const tokens = tokenize(normalized);
  const path = tokens.shift() || '';
  const { params, hash } = splitParams(tokens);
  const node: MustacheStatement = {
    type: 'MustacheStatement',
    path,
    params,
    hash,
    triple,
  };

  if (trimOpen) {
    node.trimOpen = true;
  }

  if (trimClose) {
    node.trimClose = true;
  }

  return node;
}

function createPartial(content: string, trimOpen = false, trimClose = false): PartialStatement {
  const normalized = normalizeExpression(content);
  const tokens = tokenize(normalized);
  const path = tokens.shift() || '';
  const { params, hash } = splitParams(tokens);
  const node: PartialStatement = {
    type: 'PartialStatement',
    path,
    params,
    hash,
  };

  if (trimOpen) {
    node.trimOpen = true;
  }

  if (trimClose) {
    node.trimClose = true;
  }

  return node;
}

function createComment(content: string): CommentStatement {
  const isBlockStyle = /^\s*!-{2}/.test(content);
  const withoutOpen = content.replace(/^[\t ]*!-{0,2}/, '');
  const withoutClosing = withoutOpen.replace(/-{2}\s*$/, '');
  const inline = !withoutClosing.startsWith('\n');
  let value = inline ? withoutClosing.replace(/^\s*/, '') : withoutClosing;

  value = value.replace(/[ \t]+$/gm, '');

  const isMultiline = /\n/.test(content);

  return {
    type: 'CommentStatement',
    value,
    multiline: isMultiline,
    block: isBlockStyle || isMultiline,
    inline,
  };
}

function splitParams(tokens: string[]): { params: string[]; hash: HashPair[] } {
  const params: string[] = [];
  const hash: HashPair[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const eqIndex = token.indexOf('=');
    const key = eqIndex > 0 ? token.slice(0, eqIndex) : '';

    if (eqIndex > 0 && isHashKey(key)) {
      let value = token.slice(eqIndex + 1);
      if (value === '' && index + 1 < tokens.length) {
        value = tokens[index + 1];
        index += 1;
      }
      hash.push({ key, value });
      continue;
    }

    if (isHashKey(token) && tokens[index + 1] === '=' && index + 2 < tokens.length) {
      hash.push({ key: token, value: tokens[index + 2] });
      index += 2;
      continue;
    }

    params.push(token);
  }

  return { params, hash };
}

function isHashKey(value: string): boolean {
  return /^[A-Za-z_@][A-Za-z0-9_@.:-]*$/.test(value);
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
