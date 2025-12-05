import type { AstPath, Doc, ParserOptions, Printer } from 'prettier';
import { builders, utils } from 'prettier/doc';
import {
  AttributeValue,
  BlockStatement,
  ElementAttribute,
  ElementNode,
  HashPair,
  MustacheStatement,
  Node,
  PartialStatement,
  Program,
  TextNode,
  UnmatchedNode,
} from './types';

const { hardline, join, group, indent, line, softline, ifBreak, lineSuffix, lineSuffixBoundary } = builders;
const { willBreak } = utils;
const concat = (builders as unknown as { concat: (parts: Doc[]) => Doc }).concat;

function docHasHardline(doc: Doc): boolean {
  if (typeof doc === 'string') {
    return doc.includes('\n');
  }

  if (typeof doc === 'number' || doc === null || doc === undefined) {
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

function docBreaks(doc: Doc): boolean {
  if (Array.isArray(doc)) {
    return doc.some(docBreaks);
  }

  if (typeof doc === 'object' && doc !== null && 'contents' in doc) {
    return docBreaks((doc as { contents: Doc }).contents);
  }

  if (typeof doc === 'object' && doc !== null && 'parts' in doc) {
    return docBreaks((doc as { parts: Doc[] }).parts);
  }

  return docHasHardline(doc) || willBreak(doc);
}

function isPlainAttribute(attr: ElementAttribute): attr is Extract<ElementAttribute, { type: 'Attribute' }> {
  return attr.type === 'Attribute';
}

function getMaxEmptyLines(options: ParserOptions): number {
  const rawValue = (options as Record<string, unknown>).maxEmptyLines;
  if (typeof rawValue === 'number' && rawValue >= 0) {
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
        if (node.verbatim) {
          return formatVerbatimText(node.value);
        }

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

function formatVerbatimText(content: string): Doc {
  const withoutLeadingNewline = content.startsWith('\n') ? content.slice(1) : content;
  const withoutTrailingNewline = withoutLeadingNewline.endsWith('\n')
    ? withoutLeadingNewline.slice(0, -1)
    : withoutLeadingNewline;

  if (withoutTrailingNewline.trimStart().startsWith('<!--')) {
    return withoutTrailingNewline;
  }

  const lines = withoutTrailingNewline.split('\n');
  const commonIndent = lines.reduce((min, line) => {
    if (line.trim() === '') return min;
    const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
    return Math.min(min, indentLength);
  }, Number.MAX_SAFE_INTEGER);

  const normalizedIndent = Number.isFinite(commonIndent) ? commonIndent : 0;
  let normalizedLines = lines.map((line) => {
    const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
    return line.slice(Math.min(indentLength, normalizedIndent));
  });

  while (normalizedLines.length > 0 && normalizedLines[0].trim() === '') {
    normalizedLines = normalizedLines.slice(1);
  }

  while (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1].trim() === '') {
    normalizedLines = normalizedLines.slice(0, -1);
  }

  if (normalizedLines.length === 0) {
    return '';
  }

  const docs: Doc[] = [];

  normalizedLines.forEach((lineText, index) => {
    const trailingWhitespaceMatch = lineText.match(/(\s+)$/);
    const trailingWhitespace = trailingWhitespaceMatch?.[1] ?? '';
    const contentWithoutTrailing = trailingWhitespace ? lineText.slice(0, -trailingWhitespace.length) : lineText;

    docs.push(contentWithoutTrailing);
    if (trailingWhitespace) {
      docs.push(lineSuffix(trailingWhitespace));
      docs.push(lineSuffixBoundary);
    }

    if (index < normalizedLines.length - 1) {
      docs.push(hardline);
    }
  });

  return concat(docs);
}

function printProgram(path: AstPath<Program>, options: ParserOptions, print: (path: AstPath) => Doc): Doc {
  const parts: Doc[] = [];
  path.each((childPath) => {
    const childNode = childPath.getValue() as Node;
    if (childNode.type === 'TextNode' && childNode.blankLines && getMaxEmptyLines(options) === 0) {
      return;
    }

    const doc = print(childPath as AstPath<Node>);
    if (doc === null) {
      return;
    }
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

  const flush = () => {
    if (buffer.length === 0) return;
    sorted.push(...sortPlainAttributes(buffer, options));
    buffer = [];
  };

  attributes.forEach((attr) => {
    if (!isPlainAttribute(attr)) {
      flush();
      sorted.push(attr);
      return;
    }

    buffer.push(attr);
  });

  flush();

  return sorted;
}

function sortPlainAttributes(attributes: ElementAttribute[], options: ParserOptions): ElementAttribute[] {
  const plainAttributes = attributes.filter(isPlainAttribute);
  const others = plainAttributes.filter((attr) => attr.name !== 'id' && attr.name !== 'class');
  const idAttr = plainAttributes.find((attr) => attr.name === 'id');
  const classAttr = plainAttributes.find((attr) => attr.name === 'class');
  const ordered: ElementAttribute[] = [];
  if (idAttr) ordered.push(idAttr);
  if (classAttr) ordered.push(classAttr);

  const preferredDataOrder: string[] = (options as Record<string, unknown>).dataAttributeOrder as string[];
  const dataOrder = Array.isArray(preferredDataOrder) ? preferredDataOrder : [];

  if (dataOrder.length === 0) {
    return ordered.concat(others);
  }

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
  attributes.forEach((attr) => {
    docs.push(printAttribute(attr));
  });

  return docs;
}

function shouldBreakAttribute(attr: ElementAttribute): boolean {
  if (!isPlainAttribute(attr)) {
    return true;
  }

  if (!attr.value) {
    return false;
  }

  if (attr.value.parts.some((part) => part.type === 'BlockStatement' || part.type === 'CommentStatement')) {
    return true;
  }

  const hasNewlineText = attr.value.parts.some((part) => part.type === 'TextNode' && /\n/.test(part.value));
  if (hasNewlineText) {
    return true;
  }

  return false;
}

function printElement(path: AstPath<ElementNode>, options: ParserOptions, print: (path: AstPath) => Doc): Doc {
  const node = path.getValue();
  const sortedAttributes = sortAttributes(node.attributes, options);
  const parentNode = path.getParentNode();
  const grandParentNode = path.getParentNode(1);
  const ancestors: Array<Node | null | undefined> = [
    parentNode as Node | null | undefined,
    grandParentNode as Node | null | undefined,
  ];

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

  const closing = node.selfClosing ? ifBreak('/>', ' />') : '>';
  const tagGroupId = Symbol('tag');
  const openDoc = group(concat([openTag, attributesDoc, closing]), { id: tagGroupId });

  if (node.selfClosing) {
    return openDoc;
  }

  const childrenDocs: Doc[] = [];
  path.each((childPath) => {
    childrenDocs.push(print(childPath as AstPath<Node>));
  }, 'children');

  const closeDoc = concat(['</', node.tag, '>']);

  const singleChild = node.children.length === 1 ? node.children[0] : null;
  const singleChildIsMustache = singleChild?.type === 'MustacheStatement';
  const mustacheInsideBlock =
    singleChildIsMustache && ancestors.some((ancestor) => ancestor?.type === 'BlockStatement');
  const simpleInlineChildren =
    node.children.length > 0 &&
    node.children.every(
      (child) =>
        (child.type === 'TextNode' && !child.verbatim && !child.blankLines) || child.type === 'MustacheStatement',
    );
  const canInline =
    node.children.length === 1 &&
    childrenDocs.length === 1 &&
    singleChild?.type !== 'ElementNode' &&
    !docBreaks(openDoc) &&
    !docBreaks(childrenDocs[0]) &&
    !docBreaks(closeDoc) &&
    !mustacheInsideBlock;

  if (canInline) {
    const childDoc = childrenDocs[0];
    return concat([
      openDoc,
      ifBreak(indent(concat([hardline, childDoc])), childDoc, { groupId: tagGroupId }),
      ifBreak(hardline, '', { groupId: tagGroupId }),
      closeDoc,
    ]);
  }

  const canInlineSimpleChildren =
    simpleInlineChildren &&
    !docBreaks(openDoc) &&
    !docBreaks(closeDoc) &&
    !childrenDocs.some(docBreaks) &&
    !mustacheInsideBlock;

  if (canInlineSimpleChildren) {
    const inlineChildren = join(' ', childrenDocs);
    const multilineChildren = indent(concat([hardline, join(hardline, childrenDocs)]));

    return concat([
      openDoc,
      ifBreak(multilineChildren, inlineChildren, { groupId: tagGroupId }),
      ifBreak(hardline, '', { groupId: tagGroupId }),
      closeDoc,
    ]);
  }

  const inner =
    childrenDocs.length > 0 ? concat([indent(concat([hardline, join(hardline, childrenDocs)])), hardline]) : '';

  const expandedDoc = concat([openDoc, inner, closeDoc]);

  return expandedDoc;
}

function printAttribute(attr: ElementAttribute): Doc {
  if (!isPlainAttribute(attr)) {
    return stringifyNode(attr.block as Node);
  }

  if (typeof attr.value === 'undefined' || attr.value === null) {
    return attr.name;
  }

  const valueString = stringifyAttributeValue(attr.value as AttributeValue);

  if (valueString === '' && attr.name.startsWith('data-')) {
    return attr.name;
  }

  if (attr.name === 'class' && /{{#/.test(valueString)) {
    const classLines = formatClassValue(valueString);
    return concat([
      'class="',
      indent(concat([hardline, join(hardline, classLines)])),
      hardline,
      '"',
    ]);
  }

  if (hasHandlebarsBlock(valueString)) {
    const lines = formatHandlebarsBlockValue(valueString);
    return concat([
      attr.name,
      '="',
      indent(concat([hardline, join(hardline, lines)])),
      hardline,
      '"',
    ]);
  }

  if (valueString.includes('\n')) {
    const lines = formatMultilineAttributeValue(valueString);
    return concat([
      attr.name,
      '="',
      indent(concat([hardline, join(hardline, lines)])),
      hardline,
      '"',
    ]);
  }

  return concat([attr.name, '="', valueString, '"']);
}

function stringifyAttributeValue(value: AttributeValue): string {
  return value.parts.map((part) => stringifyNode(part as Node)).join('');
}

function stringifyAttribute(attr: ElementAttribute): string {
  if (!isPlainAttribute(attr)) {
    return stringifyNode(attr.block as Node);
  }

  if (!attr.value) {
    return attr.name;
  }

  const value = stringifyAttributeValue(attr.value as AttributeValue);
  return `${attr.name}="${value}"`;
}

function stringifyNode(node: Node): string {
  switch (node.type) {
    case 'TextNode':
      return (node as TextNode).value;
    case 'MustacheStatement': {
      const mustache = node as MustacheStatement;
      const open = mustache.triple ? '{{{' : '{{';
      const close = mustache.triple ? '}}}' : '}}';
      return `${open}${buildExpression(mustache)}${close}`;
    }
    case 'PartialStatement': {
      const partial = node as PartialStatement;
      return `{{> ${buildExpression(partial)}}}`;
    }
    case 'CommentStatement': {
      const comment = node as CommentStatement;
      if (comment.block || comment.multiline) {
        return `{{!-- ${comment.value} --}}`;
      }
      return `{{! ${comment.value}}}`;
    }
    case 'BlockStatement': {
      const block = node as BlockStatement;
      const open = `{{${block.rawOpen}}}`;
      const program = stringifyNode(block.program as Program);
      const inverse = block.inverse.body.length > 0
        ? `{{else}}${stringifyNode(block.inverse as Program)}`
        : '';
      const close = `{{/${block.path}}}`;
      return `${open}${program}${inverse}${close}`;
    }
    case 'ElementNode': {
      const element = node as ElementNode;
      const attrs = element.attributes.map((attr) => stringifyAttribute(attr)).join(' ');
      const open = attrs ? `<${element.tag} ${attrs}${element.selfClosing ? ' />' : '>'}` : `<${element.tag}${element.selfClosing ? ' />' : '>'}`;
      if (element.selfClosing) {
        return open;
      }
      const children = element.children.map((child) => stringifyNode(child as Node)).join('');
      return `${open}${children}</${element.tag}>`;
    }
    case 'Program':
      return (node as Program).body.map((child) => stringifyNode(child as Node)).join('');
    case 'UnmatchedNode':
      return (node as UnmatchedNode).raw;
    default:
      return '';
  }
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

  const shouldMultiline = node.hash.length > 0 && node.hash.length + node.params.length > 1;

  if (shouldMultiline) {
    const paramsDocs: Doc[] = [];
    node.params.forEach((param) => paramsDocs.push(param));
    node.hash.forEach((pair) => paramsDocs.push(formatHash(pair)));

    return group(
      concat([
        open,
        ' ',
        node.path,
        indent(concat([hardline, join(hardline, paramsDocs)])),
        hardline,
        close,
      ]),
    );
  }

  const spacing = content.length > 0 ? ' ' : '';
  return concat([open, spacing, content, spacing, close]);
}

function printBlock(path: AstPath<BlockStatement>, options: ParserOptions, print: (path: AstPath) => Doc): Doc {
  const node = path.getValue();
  const open = concat(['{{#', buildExpression(node), '}}']);
  const bodyDocs: Doc[] = [];
  path.call((programPath) => {
    programPath.each((childPath) => {
      const childNode = childPath.getValue() as Node;
      if (childNode.type === 'TextNode' && childNode.blankLines && getMaxEmptyLines(options) === 0) {
        return;
      }

      const doc = print(childPath as AstPath<Node>);
      if (doc === null) {
        return;
      }
      bodyDocs.push(doc);
    }, 'body');
  }, 'program');

  const body =
    bodyDocs.length > 0 ? concat([indent(concat([hardline, join(hardline, bodyDocs)])), hardline]) : hardline;

  let inverse: Doc = '';
  if (node.inverse.body.length > 0) {
    const inverseDocs: Doc[] = [];
    path.call((inversePath) => {
      inversePath.each((childPath) => {
        const childNode = childPath.getValue() as Node;
        if (childNode.type === 'TextNode' && childNode.blankLines && getMaxEmptyLines(options) === 0) {
          return;
        }

        const doc = print(childPath as AstPath<Node>);
        if (doc === null) {
          return;
        }
        inverseDocs.push(doc);
      }, 'body');
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
  node.params.forEach((param) => paramsDocs.push(formatPartialParam(param)));
  node.hash.forEach((pair) => paramsDocs.push(formatPartialParam(formatHash(pair))));

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

function formatPartialParam(param: string): Doc {
  if (!param.includes('\n')) {
    return param;
  }

  const lines = param.split('\n');

  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  if (lines.length === 0) {
    return '';
  }

  const [firstLine, ...rest] = lines;

  if (rest.length === 0) {
    return firstLine;
  }

  const indents = rest
    .filter((line) => line.trim().length > 0)
    .map((line) => (line.match(/^[ \t]*/) || [''])[0].length);

  const commonIndent = indents.length ? Math.min(...indents) : 0;
  const maxExtraIndent = 2;

  const normalizedRest = rest.map((line) => {
    const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
    const diff = Math.max(indentLength - commonIndent, 0);
    const allowedIndent = Math.min(diff, maxExtraIndent);
    const trimAmount = Math.max(indentLength - allowedIndent, 0);
    const trimmedLine = line.slice(trimAmount).replace(/[ \t]+$/, '');
    return trimmedLine;
  });

  return concat([firstLine, hardline, join(hardline, normalizedRest)]);
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
  if (node.blockParams && node.blockParams.length > 0) {
    pieces.push('as', `|${node.blockParams.join(' ')}|`);
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

function hasHandlebarsBlock(value: string): boolean {
  return /{{[#/^]/.test(value) && /{{\//.test(value);
}

function formatHandlebarsBlockValue(value: string): Doc[] {
  const tokens: string[] = [];
  const mustacheRegex = /{{[^}]+}}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mustacheRegex.exec(value)) !== null) {
    const before = value.slice(lastIndex, match.index).trim();
    if (before) {
      tokens.push(before);
    }

    tokens.push(match[0].trim());
    lastIndex = match.index + match[0].length;
  }

  const remaining = value.slice(lastIndex).trim();
  if (remaining) {
    tokens.push(remaining);
  }

  const lines: Doc[] = [];
  let depth = 0;

  tokens.forEach((token) => {
    const isClosing = token.startsWith('{{/');
    const isElse = token.startsWith('{{else');
    const isBlockOpen = token.startsWith('{{#') || token.startsWith('{{^');

    if (isClosing || isElse) {
      depth = Math.max(depth - 1, 0);
    }

    lines.push(indentWithDepth(token, depth));

    if (isBlockOpen || isElse) {
      depth += 1;
    }
  });

  return lines;
}

