import type { AstPath, Doc, ParserOptions, Printer } from 'prettier';
import { builders } from 'prettier/doc';
import { BlockStatement, ElementAttribute, ElementNode, HashPair, MustacheStatement, Node, PartialStatement, Program, TextNode, UnmatchedNode } from './types';

const { hardline, join, group, indent, line, softline } = builders;
const concat = (builders as unknown as { concat: (parts: Doc[]) => Doc }).concat;

function docHasHardline(doc: Doc): boolean {
  if (typeof doc === 'string' || typeof doc === 'number' || doc === null || doc === undefined) {
    return false;
  }

  if (doc === hardline) {
    return true;
  }

  if (Array.isArray(doc)) {
    return doc.some(docHasHardline);
  }

  if (typeof doc === 'object' && 'contents' in doc) {
    return docHasHardline((doc as { contents: Doc }).contents);
  }

  if (typeof doc === 'object' && 'parts' in doc) {
    return docHasHardline((doc as { parts: Doc[] }).parts);
  }

  return false;
}

function getMaxEmptyLines(options: ParserOptions): number {
  const rawValue = (options as Record<string, unknown>).maxEmptyLines;
  if (typeof rawValue === 'number' && rawValue >= 1) {
    return rawValue;
  }

  return 1;
}

export const printer: Printer<Node> = {
  print(path, options, print) {
    const node = path.getValue() as Node;

    switch (node.type) {
      case 'Program':
        return printProgram(path as AstPath<Program>, options, print);
      case 'ElementNode':
        return printElement(path as AstPath<ElementNode>, options, print);
      case 'TextNode':
        if (node.blankLines) {
          const maxEmptyLines = getMaxEmptyLines(options);
          const allowedBlankLines = Math.min(node.blankLines, maxEmptyLines);
          const extraHardlines = allowedBlankLines - 1;
          return extraHardlines > 0 ? concat(new Array(extraHardlines).fill(hardline)) : '';
        }
        return node.value.replace(/\s+/g, ' ').trim();
      case 'MustacheStatement':
        return printMustache(node);
      case 'BlockStatement':
        return printBlock(path as AstPath<BlockStatement>, options, print);
      case 'PartialStatement':
        return printPartial(node, options);
      case 'CommentStatement':
        if (node.multiline) {
          return formatMultilineComment(node.value);
        }

        if (node.block) {
          const trimmedValue = typeof node.value === 'string' ? node.value.replace(/[ \t]+$/gm, '') : node.value;
          return concat(['{{!-- ', trimmedValue, ' --}}']);
        }

        return concat(['{{! ', node.value, '}}']);
      case 'UnmatchedNode':
        return (node as UnmatchedNode).raw;
      default:
        return '';
    }
  },
};

function printProgram(path: AstPath<Program>, options: ParserOptions, print: (path: AstPath) => Doc): Doc {
  const parts: Doc[] = [];
  path.each((childPath) => {
    const doc = print(childPath as AstPath<Node>);
    parts.push(doc);
  }, 'body');

  if (parts.length === 0) {
    return '';
  }

  return concat([join(hardline, parts), hardline]);
}

function sortAttributes(attributes: ElementAttribute[], options: ParserOptions): ElementAttribute[] {
  const sorted: ElementAttribute[] = [];
  let buffer: ElementAttribute[] = [];
  let blockDepth = 0;

  const flush = (shouldSort: boolean) => {
    if (buffer.length === 0) return;
    sorted.push(...(shouldSort ? sortPlainAttributes(buffer, options) : buffer));
    buffer = [];
  };

  attributes.forEach((attr) => {
    const isHandlebars = attr.name.startsWith('{{');

    if (!isHandlebars) {
      buffer.push(attr);
      return;
    }

    flush(blockDepth === 0);
    sorted.push(attr);

    if (attr.name.startsWith('{{#')) {
      blockDepth += 1;
    }

    if (attr.name.startsWith('{{/')) {
      blockDepth = Math.max(blockDepth - 1, 0);
    }
  });

  flush(blockDepth === 0);

  return sorted;
}

function sortPlainAttributes(attributes: ElementAttribute[], options: ParserOptions): ElementAttribute[] {
  const others = attributes.filter((attr) => attr.name !== 'id' && attr.name !== 'class');
  const idAttr = attributes.find((attr) => attr.name === 'id');
  const classAttr = attributes.find((attr) => attr.name === 'class');
  const ordered: ElementAttribute[] = [];
  if (idAttr) ordered.push(idAttr);
  if (classAttr) ordered.push(classAttr);

  const preferredDataOrder: string[] = (options as Record<string, unknown>).dataAttributeOrder as string[];
  const dataOrder = Array.isArray(preferredDataOrder) ? preferredDataOrder : [];
  const orderMap = new Map(dataOrder.map((name, index) => [name, index]));

  const nonDataAttrs = others.filter((attr) => !attr.name.startsWith('data-'));
  const dataAttrs = others.filter((attr) => attr.name.startsWith('data-'));

  const sortedData = dataAttrs.slice().sort((a, b) => {
    const aRank = orderMap.has(a.name) ? (orderMap.get(a.name) as number) : Number.MAX_SAFE_INTEGER;
    const bRank = orderMap.has(b.name) ? (orderMap.get(b.name) as number) : Number.MAX_SAFE_INTEGER;

    if (aRank !== bRank) return aRank - bRank;
    return attributes.indexOf(a) - attributes.indexOf(b);
  });

  return ordered.concat(nonDataAttrs).concat(sortedData);
}

function buildAttributeDocs(attributes: ElementAttribute[]): Doc[] {
  const docs: Doc[] = [];
  let depth = 0;

  attributes.forEach((attr) => {
    const isBlockStart = attr.name.startsWith('{{#');
    const isBlockEnd = attr.name.startsWith('{{/');
    const isElse = attr.name.startsWith('{{else');

    if (isBlockEnd || isElse) {
      depth = Math.max(depth - 1, 0);
    }

    const paddedDoc = depth > 0 ? concat(['  '.repeat(depth), printAttribute(attr)]) : printAttribute(attr);
    docs.push(paddedDoc);

    if (isBlockStart || isElse) {
      depth += 1;
    }
  });

  return docs;
}

function shouldBreakAttribute(attr: ElementAttribute): boolean {
  if (attr.name.startsWith('{{')) {
    return true;
  }

  if (typeof attr.value === 'string' && /\n/.test(attr.value)) {
    return true;
  }

  if (attr.name === 'class' && typeof attr.value === 'string' && /{{[#/^]/.test(attr.value)) {
    return true;
  }

  return false;
}

function printElement(path: AstPath<ElementNode>, options: ParserOptions, print: (path: AstPath) => Doc): Doc {
  const node = path.getValue();
  const sortedAttributes = sortAttributes(node.attributes, options);

  const openTag = concat(['<', node.tag]);
  let attributesDoc: Doc = '';

  if (sortedAttributes.length > 0) {
    const attrsDocs = buildAttributeDocs(sortedAttributes);
    const breakAttrs =
      sortedAttributes.some((attr) => shouldBreakAttribute(attr)) || attrsDocs.some(docHasHardline);
    if (breakAttrs) {
      attributesDoc = concat([
        indent(concat([hardline, join(hardline, attrsDocs)])),
        hardline,
      ]);
    } else {
      attributesDoc = concat([
        group(indent(concat([line, join(line, attrsDocs)]))),
        softline,
      ]);
    }
  }

  const closing = node.selfClosing ? (docHasHardline(attributesDoc) ? '/>' : ' />') : '>';
  const openDoc = group(concat([openTag, attributesDoc, closing]));

  if (node.selfClosing) {
    return openDoc;
  }

  const childrenDocs: Doc[] = [];
  path.each((childPath) => {
    childrenDocs.push(print(childPath as AstPath<Node>));
  }, 'children');

  const closeDoc = concat(['</', node.tag, '>']);

  const singleChild = node.children.length === 1 ? node.children[0] : null;
  const canInline =
    childrenDocs.length === 1 &&
    singleChild?.type !== 'ElementNode' &&
    !docHasHardline(openDoc) &&
    !docHasHardline(childrenDocs[0]) &&
    !docHasHardline(closeDoc);

  if (canInline) {
    return concat([openDoc, childrenDocs[0], closeDoc]);
  }

  const inner =
    childrenDocs.length > 0 ? concat([indent(concat([hardline, join(hardline, childrenDocs)])), hardline]) : '';

  return concat([openDoc, inner, closeDoc]);
}

function printAttribute(attr: ElementAttribute): Doc {
  if (typeof attr.value === 'undefined') {
    return attr.name;
  }

  if (attr.name === 'class' && /{{#/.test(attr.value)) {
    const classLines = formatClassValue(attr.value);
    return concat([
      'class="',
      indent(concat([hardline, join(hardline, classLines)])),
      hardline,
      '"',
    ]);
  }

  if (typeof attr.value === 'string' && attr.value.includes('\n')) {
    const lines = formatMultilineAttributeValue(attr.value);
    return concat([
      attr.name,
      '="',
      indent(concat([hardline, join(hardline, lines)])),
      hardline,
      '"',
    ]);
  }

  return concat([attr.name, '="', attr.value, '"']);
}

function formatClassValue(value: string): Doc[] {
  const tokens = tokenizeClass(value);
  const lines: Doc[] = [];
  let depth = 0;

  tokens.forEach((token) => {
    if (token.startsWith('{{/')) {
      depth = Math.max(depth - 1, 0);
      lines.push(indentWithDepth(token, depth));
      return;
    }

    if (token.startsWith('{{#') || token.startsWith('{{^')) {
      lines.push(indentWithDepth(token, depth));
      depth += 1;
      return;
    }

    if (token.startsWith('{{else')) {
      depth = Math.max(depth - 1, 0);
      lines.push(indentWithDepth(token, depth));
      depth += 1;
      return;
    }

    lines.push(indentWithDepth(token, depth));
  });

  return lines;
}

function indentWithDepth(content: string, depth: number): Doc {
  const prefix = depth > 0 ? '  '.repeat(depth) : '';
  return concat([prefix, content]);
}

function tokenizeClass(value: string): string[] {
  const tokens: string[] = [];
  const mustacheRegex = /{{[^}]+}}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mustacheRegex.exec(value)) !== null) {
    const before = value.slice(lastIndex, match.index);
    before.split(/\s+/).filter(Boolean).forEach((word) => tokens.push(word));
    tokens.push(match[0].trim());
    lastIndex = match.index + match[0].length;
  }

  const remaining = value.slice(lastIndex);
  remaining.split(/\s+/).filter(Boolean).forEach((word) => tokens.push(word));

  return tokens;
}

function printMustache(node: MustacheStatement): Doc {
  const content = buildExpression(node);
  const open = node.triple ? '{{{' : '{{';
  const close = node.triple ? '}}}' : '}}';
  const spacing = content.length > 0 ? ' ' : '';
  return concat([open, spacing, content, spacing, close]);
}

function printBlock(path: AstPath<BlockStatement>, options: ParserOptions, print: (path: AstPath) => Doc): Doc {
  const node = path.getValue();
  const open = concat(['{{#', buildExpression(node), '}}']);
  const bodyDocs: Doc[] = [];
  path.each((childPath) => {
    bodyDocs.push(print(childPath as AstPath<Node>));
  }, 'program');

  const body =
    bodyDocs.length > 0 ? concat([indent(concat([hardline, join(hardline, bodyDocs)])), hardline]) : hardline;

  let inverse: Doc = '';
  if (node.inverse.length > 0) {
    const inverseDocs: Doc[] = [];
    path.each((childPath) => {
      inverseDocs.push(print(childPath as AstPath<Node>));
    }, 'inverse');
    inverse = concat(['{{else}}', indent(concat([hardline, join(hardline, inverseDocs)])), hardline]);
  }

  const close = concat(['{{/', node.path, '}}']);

  return concat([open, body, inverse, close]);
}

function printPartial(node: PartialStatement, options: ParserOptions): Doc {
  const name = node.path;
  if (node.params.length === 0 && node.hash.length === 0) {
    return concat(['{{> ', name, '}}']);
  }

  const paramsDocs: Doc[] = [];
  node.params.forEach((param) => paramsDocs.push(param));
  node.hash.forEach((pair) => paramsDocs.push(formatHash(pair)));

  return group(
    concat([
      '{{> ',
      name,
      indent(concat([hardline, join(hardline, paramsDocs)])),
      hardline,
      '}}',
    ]),
  );
}

function formatMultilineComment(content: string): Doc {
  const needsLeadingSpace = !content.startsWith('\n');
  const needsTrailingSpace = !content.endsWith('\n');

  const lines = content.split('\n');
  const hasLeadingEmptyLine = lines[0] === '';
  const hasTrailingEmptyLine = lines[lines.length - 1] === '';
  const bodyLines = lines.slice(hasLeadingEmptyLine ? 1 : 0, hasTrailingEmptyLine ? -1 : undefined);

  const commonIndent = bodyLines.reduce((min, line) => {
    if (line.trim() === '') return min;
    const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
    return Math.min(min, indentLength);
  }, Number.MAX_SAFE_INTEGER);

  const normalizedIndent = Number.isFinite(commonIndent) ? Math.max(commonIndent - 1, 0) : 0;
  const normalizedBody = bodyLines.map((line) => {
    if (line.trim() === '') return '';
    const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
    const trimLength = Math.min(indentLength, normalizedIndent);
    return line.slice(trimLength);
  });

  const normalizedLines = [...normalizedBody];
  while (normalizedLines[0] === '') {
    normalizedLines.shift();
  }
  while (normalizedLines[normalizedLines.length - 1] === '') {
    normalizedLines.pop();
  }

  const body = join(hardline, normalizedLines);

  return concat([
    '{{!--',
    needsLeadingSpace ? ' ' : hardline,
    body,
    needsTrailingSpace ? ' ' : hardline,
    '--}}',
  ]);
}

function buildExpression(node: MustacheStatement | BlockStatement | PartialStatement): string {
  const pieces: string[] = [];
  if (node.path) {
    pieces.push(node.path);
  }
  if (node.params.length > 0) {
    pieces.push(...node.params);
  }
  if (node.hash.length > 0) {
    pieces.push(...node.hash.map((pair) => formatHash(pair)));
  }
  return pieces.join(' ');
}

function formatHash(pair: HashPair): string {
  return `${pair.key}=${pair.value}`;
}

function formatMultilineAttributeValue(value: string): Doc[] {
  const lines = value.split('\n');

  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  const commonIndent = lines.reduce((min, line) => {
    if (line.trim() === '') return min;
    const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
    return Math.min(min, indentLength);
  }, Number.MAX_SAFE_INTEGER);

  const normalizedIndent = Number.isFinite(commonIndent) ? commonIndent : 0;

  return lines.map((line) => {
    const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
    const trimmedLine = line.slice(Math.min(indentLength, normalizedIndent));
    return trimmedLine.replace(/[ \t]+$/, '');
  });
}

