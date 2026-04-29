import type { AstPath, Doc, Options, ParserOptions, Printer } from 'prettier';
import { builders, utils } from 'prettier/doc';
import {
  AttributeValue,
  BlockStatement,
  CommentStatement,
  DecoratorStatement,
  ElementAttribute,
  ElementNode,
  ElseBranch,
  HashPair,
  MustacheStatement,
  Node,
  PartialStatement,
  Program,
  TextNode,
  UnmatchedNode,
} from './types';

const { hardline, join, group, indent, line, softline, ifBreak, lineSuffix, lineSuffixBoundary } = builders;
const { stripTrailingHardline, willBreak } = utils;
const concat = (builders as unknown as { concat: (parts: Doc[]) => Doc }).concat;
const whitespaceSensitiveRawTextTags = new Set(['pre', 'textarea']);
const trimmableRawTextTags = new Set(['script', 'style']);
type PrintableExpression = MustacheStatement | BlockStatement | ElseBranch | PartialStatement | DecoratorStatement;

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

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getTrimOpen(node: PrintableExpression): string {
  return node.trimOpen ? '~' : '';
}

function getTrimClose(node: PrintableExpression): string {
  return node.trimClose ? '~' : '';
}

function isSimpleValueMustache(node: MustacheStatement): boolean {
  return node.params.length === 0 && node.hash.length === 0 && (!node.blockParams || node.blockParams.length === 0);
}

function getMustacheOpenPadding(node: MustacheStatement, content: string): string {
  return content.length > 0 && isSimpleValueMustache(node) ? ' ' : '';
}

function getMustacheClosePadding(node: MustacheStatement, content: string): string {
  if (content.length > 0 && isSimpleValueMustache(node)) {
    return ' ';
  }

  return node.trimClose && /\s/.test(content) ? ' ' : '';
}

function getTrimClosePadding(node: BlockStatement | ElseBranch | PartialStatement | DecoratorStatement, content: string): string {
  return node.trimClose && /\s/.test(content) ? ' ' : '';
}

function shouldKeepParamInline(param: string): boolean {
  return param.includes('\n') || /^\(parseJSON\s+['"`]/.test(param.trim());
}

function getBlockPrefix(node: BlockStatement): '#' | '#>' | '#*' {
  return node.blockPrefix ?? '#';
}

function hasInlineBoundaryWhitespace(value: string | undefined): boolean {
  return typeof value === 'string' && /\s/.test(value);
}

function isPunctuationOnlyTextNode(node: Node | undefined): boolean {
  return node?.type === 'TextNode' && /^[.,:;!?+"'«»+]+$/.test((node as TextNode).value);
}

function isPlainAttribute(attr: ElementAttribute): attr is Extract<ElementAttribute, { type: 'Attribute' }> {
  return attr.type === 'Attribute';
}

function isRawAttribute(attr: ElementAttribute): attr is Extract<ElementAttribute, { type: 'RawAttribute' }> {
  return attr.type === 'RawAttribute';
}

function getMaxEmptyLines(options: ParserOptions): number {
  const rawValue = (options as unknown as Record<string, unknown>).maxEmptyLines;
  if (typeof rawValue === 'number' && rawValue >= 0) {
    return rawValue;
  }

  return 1;
}

export const printer: Printer<Node> = {
  getVisitorKeys(node, nonTraversableKeys) {
    return getHandlebarsVisitorKeys(node, nonTraversableKeys);
  },
  hasPrettierIgnore(path) {
    const node = path.getValue() as Node | null;
    return node?.type === 'CommentStatement' && hasCommentDirective(node as CommentStatement, 'prettier-ignore');
  },
  canAttachComment(node) {
    return node.type !== 'CommentStatement' && node.type !== 'UnmatchedNode';
  },
  isBlockComment(node) {
    return node.type === 'CommentStatement' && ((node as CommentStatement).block || (node as CommentStatement).multiline);
  },
  willPrintOwnComments(path) {
    return (path.getValue() as Node | null)?.type === 'CommentStatement';
  },
  printComment(path, options) {
    return printCommentStatement(path.getValue() as CommentStatement, options);
  },
  getCommentChildNodes(node) {
    return getCommentChildNodes(node);
  },
  embed(path, options) {
    const node = path.getValue() as Node;
    if (node.type !== 'TextNode') {
      return null;
    }

    const parentNode = path.getParentNode() as Node | null;
    if (parentNode?.type !== 'ElementNode') {
      return null;
    }

    const parser = getEmbeddedRawTextParser(parentNode as ElementNode, node as TextNode, options);
    if (!parser) {
      return null;
    }

    return async (textToDoc) => {
      const content = normalizeEmbeddedRawText((node as TextNode).value);
      if (content.trim() === '') {
        return '';
      }

      const doc = await textToDoc(content, {
        ...options,
        parser,
      });

      return stripTrailingHardline(doc);
    };
  },
  print(path, options, print) {
    const node = path.getValue() as Node;

    switch (node.type) {
      case 'Program':
        return printProgram(path as AstPath<Program>, options, print);
      case 'ElementNode':
        return printElement(path as AstPath<ElementNode>, options, print);
      case 'TextNode':
        if (node.verbatim) {
          if (node.preserveWhitespace) {
            return node.value;
          }

          const parentNode = path.getParentNode() as Node | null;
          const value = shouldTrimRawTextBoundaryWhitespace(parentNode, node)
            ? trimRawTextBoundaryWhitespace(node.value)
            : node.value;
          return formatVerbatimText(value);
        }

        if (node.blankLines) {
          const maxEmptyLines = getMaxEmptyLines(options);
          const allowedBlankLines = Math.min(node.blankLines, maxEmptyLines);
          const extraHardlines = allowedBlankLines - 1;
          return extraHardlines > 0 ? concat(new Array(extraHardlines).fill(hardline)) : '';
        }
        return node.value.replace(/\s+/g, ' ').trim();
      case 'MustacheStatement':
        return printMustache(node, options);
      case 'DecoratorStatement':
        return printDecorator(node as DecoratorStatement, options);
      case 'BlockStatement':
        return printBlock(path as AstPath<BlockStatement>, options, print);
      case 'PartialStatement':
        return printPartial(node, options);
      case 'CommentStatement':
        return printCommentStatement(node as CommentStatement, options);
      case 'UnmatchedNode':
        return (node as UnmatchedNode).raw;
      default:
        return '';
    }
  },
};

function getHandlebarsVisitorKeys(node: unknown, nonTraversableKeys: Set<string>): string[] {
  const type = (node as { type?: string } | null)?.type;
  return getNodeVisitorKeys(type).filter((key) => !nonTraversableKeys.has(key));
}

function getNodeVisitorKeys(type: string | undefined): string[] {
  switch (type) {
    case 'Program':
      return ['body'];
    case 'ElementNode':
      return ['attributes', 'children'];
    case 'Attribute':
      return ['value'];
    case 'AttributeValue':
      return ['parts'];
    case 'AttributeBlock':
      return ['block'];
    case 'BlockStatement':
      return ['program', 'inverseChain', 'inverse'];
    case 'ElseBranch':
      return ['program'];
    default:
      return [];
  }
}

function getCommentChildNodes(node: Node): Node[] | undefined {
  switch (node.type) {
    case 'Program':
      return (node as Program).body;
    case 'ElementNode': {
      const element = node as ElementNode;
      const attributeNodes = element.attributes.flatMap((attr) => {
        if (attr.type === 'AttributeBlock') {
          return [attr.block as Node];
        }

        if (attr.type === 'Attribute' && attr.value) {
          return attr.value.parts as Node[];
        }

        return [];
      });

      return [...attributeNodes, ...(element.children as Node[])];
    }
    case 'BlockStatement': {
      const block = node as BlockStatement;
      return [
        ...(block.program.body as Node[]),
        ...((block.inverseChain ?? []).flatMap((branch) => branch.program.body) as Node[]),
        ...(block.inverse.body as Node[]),
      ];
    }
    default:
      return [];
  }
}

function hasCommentDirective(node: CommentStatement, directive: string): boolean {
  return node.value.toLowerCase().includes(directive);
}

function printCommentStatement(node: CommentStatement, options: ParserOptions): Doc {
  if (node.multiline) {
    return formatMultilineComment(node.value, options, node.inline);
  }

  if (!node.block && node.value.startsWith('<')) {
    return concat(['{{!', node.value, '}}']);
  }

  if (node.block) {
    const trimmedValue = typeof node.value === 'string' ? node.value.replace(/[ \t]+$/gm, '') : node.value;
    return concat(['{{!-- ', trimmedValue, ' --}}']);
  }

  return concat(['{{! ', node.value, '}}']);
}

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

function shouldTrimRawTextBoundaryWhitespace(parentNode: Node | null, node: TextNode): boolean {
  return (
    parentNode?.type === 'ElementNode' &&
    trimmableRawTextTags.has((parentNode as ElementNode).tag.toLowerCase()) &&
    node.verbatim === true &&
    node.preserveWhitespace !== true
  );
}

function trimRawTextBoundaryWhitespace(value: string): string {
  return value.replace(/[ \t]+$/, '');
}

type EmbeddedRawTextParser = 'babel' | 'css';

function getEmbeddedRawTextParser(
  element: ElementNode,
  child: TextNode,
  options: Options | ParserOptions,
): EmbeddedRawTextParser | null {
  if (!isEmbeddedLanguageFormattingEnabled(options) || !isSingleRawTextChild(element, child)) {
    return null;
  }

  const tag = element.tag.toLowerCase();
  const content = normalizeEmbeddedRawText(child.value);
  if (!canFormatEmbeddedRawText(content, tag)) {
    return null;
  }

  if (tag === 'style') {
    const type = getStaticAttributeValue(element, 'type');
    return !type || type === 'text/css' ? 'css' : null;
  }

  if (tag === 'script') {
    if (hasPlainAttribute(element, 'src')) {
      return null;
    }

    const type = getStaticAttributeValue(element, 'type');
    return isJavaScriptScriptType(type) ? 'babel' : null;
  }

  return null;
}

function isEmbeddedLanguageFormattingEnabled(options: Options | ParserOptions): boolean {
  return (options as { embeddedLanguageFormatting?: string }).embeddedLanguageFormatting !== 'off';
}

function isSingleRawTextChild(element: ElementNode, child: TextNode): boolean {
  return (
    trimmableRawTextTags.has(element.tag.toLowerCase()) &&
    element.children.length === 1 &&
    element.children[0] === child &&
    child.verbatim === true
  );
}

function canFormatEmbeddedRawText(content: string, tag: string): boolean {
  return (
    content.trim() !== '' &&
    !content.includes('{{') &&
    !content.includes('}}') &&
    !new RegExp(`</\\s*${tag}`, 'i').test(content) &&
    !(tag === 'style' && hasMultilineBlockComment(content))
  );
}

function hasMultilineBlockComment(content: string): boolean {
  return /\/\*[\s\S]*?\n[\s\S]*?\*\//.test(content);
}

function getStaticAttributeValue(element: ElementNode, name: string): string | null {
  const attr = element.attributes.find(
    (candidate) => candidate.type === 'Attribute' && candidate.name.toLowerCase() === name,
  );

  if (!attr || attr.type !== 'Attribute') {
    return null;
  }

  if (!attr.value) {
    return '';
  }

  if (!attr.value.parts.every((part) => part.type === 'TextNode')) {
    return null;
  }

  return attr.value.parts.map((part) => (part as TextNode).value).join('').trim().toLowerCase();
}

function hasPlainAttribute(element: ElementNode, name: string): boolean {
  return element.attributes.some((attr) => attr.type === 'Attribute' && attr.name.toLowerCase() === name);
}

function isJavaScriptScriptType(type: string | null): boolean {
  return (
    !type ||
    type === 'module' ||
    type === 'text/javascript' ||
    type === 'application/javascript' ||
    type === 'text/ecmascript' ||
    type === 'application/ecmascript'
  );
}

function normalizeEmbeddedRawText(content: string): string {
  const lines = trimSurroundingBlankLines(content.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').split('\n'));
  return stripCommonIndent(lines).join('\n');
}

function printProgram(path: AstPath<Program>, options: ParserOptions, print: (path: AstPath) => Doc): Doc {
  const parts: Doc[] = [];
  const nodes: Node[] = [];
  path.each((childPath) => {
    const childNode = childPath.getValue() as Node;
    if (childNode.type === 'TextNode' && childNode.blankLines && getMaxEmptyLines(options) === 0) {
      return;
    }

    const doc = print(childPath as AstPath<Node>);
    if (doc === null) {
      return;
    }
    nodes.push(childNode);
    parts.push(doc);
  }, 'body');

  if (parts.length === 0) {
    return '';
  }

  while (parts.length > 0 && parts[0] === '' && nodes[0]?.type === 'TextNode' && (nodes[0] as TextNode).blankLines) {
    parts.shift();
    nodes.shift();
  }

  while (
    parts.length > 0 &&
    parts[parts.length - 1] === '' &&
    nodes[nodes.length - 1]?.type === 'TextNode' &&
    (nodes[nodes.length - 1] as TextNode).blankLines
  ) {
    parts.pop();
    nodes.pop();
  }

  if (parts.length === 0) {
    return '';
  }

  const lastNode = nodes[nodes.length - 1];
  const lastPart = parts[parts.length - 1];

  if (lastNode?.type === 'UnmatchedNode' && typeof lastPart === 'string') {
    parts[parts.length - 1] = lastPart.replace(/\n+$/, '');
  }

  if (canPrintRootInlineTextTemplate(nodes, options)) {
    return concat([stringifyInlineChildren(nodes, options), hardline]);
  }

  return concat([join(hardline, parts), hardline]);
}

function canPrintRootInlineTextTemplate(nodes: Node[], options: ParserOptions): boolean {
  return (
    nodes.some((node) => node.type === 'TextNode') &&
    nodes.every((node, index) => isRootInlineTextTemplateChild(node, index, nodes, options))
  );
}

function isRootInlineTextTemplateChild(node: Node, index: number, nodes: Node[], options: ParserOptions): boolean {
  if (node.type === 'MustacheStatement' || node.type === 'PartialStatement' || node.type === 'DecoratorStatement') {
    return true;
  }

  if (node.type === 'BlockStatement') {
    return canInlineBlock(node as BlockStatement, options, 'Program');
  }

  if (node.type === 'CommentStatement') {
    const comment = node as CommentStatement;
    return !comment.block && !comment.multiline;
  }

  if (node.type !== 'TextNode') {
    return false;
  }

  const text = node as TextNode;
  if (text.verbatim || text.blankLines || /[\r\n]/.test(text.value) || hasLineBreak(text.leadingWhitespace)) {
    return false;
  }

  return !hasLineBreak(text.trailingWhitespace) || index === nodes.length - 1;
}

function hasLineBreak(value: string | undefined): boolean {
  return typeof value === 'string' && /[\r\n]/.test(value);
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

  const preferredDataOrder: string[] = (options as unknown as Record<string, unknown>).dataAttributeOrder as string[];
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

function getPrintWidth(options: ParserOptions): number {
  return typeof options.printWidth === 'number' && options.printWidth > 0 ? options.printWidth : 80;
}

function getIndentWidth(options: ParserOptions): number {
  return typeof options.tabWidth === 'number' && Number.isFinite(options.tabWidth) && options.tabWidth > 0
    ? options.tabWidth
    : 2;
}

function getIndentUnit(options: ParserOptions): string {
  const useTabs = (options as unknown as Record<string, unknown>).useTabs === true;
  const tabWidth = getIndentWidth(options);

  return useTabs ? '\t' : ' '.repeat(tabWidth);
}

function trimSurroundingBlankLines(lines: string[]): string[] {
  const trimmedLines = lines.slice();

  while (trimmedLines.length > 0 && trimmedLines[0].trim() === '') {
    trimmedLines.shift();
  }

  while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1].trim() === '') {
    trimmedLines.pop();
  }

  return trimmedLines;
}

function stripCommonIndent(lines: string[], startIndex = 0): string[] {
  const indentLines = lines.slice(startIndex).filter((line) => line.trim().length > 0);
  const commonIndent = indentLines.reduce((min, line) => {
    const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
    return Math.min(min, indentLength);
  }, Number.MAX_SAFE_INTEGER);

  const normalizedIndent = Number.isFinite(commonIndent) ? commonIndent : 0;

  return lines.map((line, index) => {
    if (index < startIndex || line.trim() === '') {
      return line.replace(/[ \t]+$/, '');
    }

    const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
    return line.slice(Math.min(indentLength, normalizedIndent)).replace(/[ \t]+$/, '');
  });
}

function splitMultilineExpression(content: string): string[] | null {
  if (!content.includes('\n')) {
    return null;
  }

  const lines = trimSurroundingBlankLines(content.replace(/[ \t]+$/gm, '').split('\n'));

  if (lines.length <= 1) {
    return null;
  }

  return stripCommonIndent(lines, 1);
}

function isStructuralCloseLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && /^[\]})'"`]+$/.test(trimmed);
}

function formatMultilineParamRest(rest: string[], options: ParserOptions): string[] {
  if (rest.length === 0) {
    return [];
  }

  const lastLine = rest[rest.length - 1];
  const hasTrailingCloseLine = isStructuralCloseLine(lastLine);
  const bodyLines = hasTrailingCloseLine ? rest.slice(0, -1) : rest;
  const indentUnit = getIndentUnit(options);
  const normalizedBodyLines = stripCommonIndent(bodyLines).map((line) =>
    line.trim() === '' ? '' : `${indentUnit}${line}`,
  );
  const normalizedCloseLine = hasTrailingCloseLine ? lastLine.trim() : null;

  return normalizedCloseLine ? [...normalizedBodyLines, normalizedCloseLine] : normalizedBodyLines;
}

function getEstimatedIndentLength(path: AstPath<Node>, options: ParserOptions): number {
  let depth = 0;

  for (let ancestorDepth = 0; ; ancestorDepth += 1) {
    const ancestor = path.getParentNode(ancestorDepth) as Node | undefined;
    if (!ancestor) {
      break;
    }

    if (ancestor.type === 'ElementNode' || ancestor.type === 'BlockStatement') {
      depth += 1;
    }
  }

  return depth * getIndentWidth(options);
}

function buildAttributeDocs(attributes: ElementAttribute[], options: ParserOptions): Doc[] {
  const docs: Doc[] = [];
  attributes.forEach((attr) => {
    docs.push(printAttribute(attr, options));
  });

  return docs;
}

function shouldBreakAttribute(attr: ElementAttribute): boolean {
  if (isRawAttribute(attr)) {
    return /\n/.test(attr.raw);
  }

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
  const attrsDocs = buildAttributeDocs(sortedAttributes, options);
  const breakAttrs =
    sortedAttributes.some((attr) => shouldBreakAttribute(attr)) || attrsDocs.some(docHasHardline);
  const parentNode = path.getParentNode();
  const grandParentNode = path.getParentNode(1);
  const ancestors: Array<Node | null | undefined> = [
    parentNode as Node | null | undefined,
    grandParentNode as Node | null | undefined,
  ];
  const currentIndentLength = getEstimatedIndentLength(path as AstPath<Node>, options);

  const openTag = concat(['<', node.tag]);
  let attributesDoc: Doc = '';

  if (sortedAttributes.length > 0) {
    if (breakAttrs) {
      attributesDoc = concat([
        indent(concat([hardline, join(hardline, attrsDocs)])),
        hardline,
      ]);
    } else {
      attributesDoc = node.selfClosing
        ? concat([indent(concat([line, join(line, attrsDocs)])), softline])
        : concat([
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

  if (shouldPreserveRawTextElement(node)) {
    return concat([openDoc, (node.children[0] as TextNode).value, closeDoc]);
  }

  const singleChild = node.children.length === 1 ? node.children[0] : null;

  if (
    singleChild?.type === 'TextNode' &&
    getEmbeddedRawTextParser(node, singleChild as TextNode, options) &&
    childrenDocs.length === 1
  ) {
    return concat([openDoc, indent(concat([hardline, childrenDocs[0]])), hardline, closeDoc]);
  }

  const singleChildIsMustache = singleChild?.type === 'MustacheStatement';
  const mustacheInsideBlock =
    singleChildIsMustache && ancestors.some((ancestor) => ancestor?.type === 'BlockStatement');
  const openTagFitsInline =
    !breakAttrs && currentIndentLength + getInlineOpenTagLength(node, sortedAttributes, options) <= getPrintWidth(options);
  const simpleInlineChildren =
    node.children.length > 0 &&
    node.children.every(
      (child) =>
        (child.type === 'TextNode' && !child.verbatim && !child.blankLines) || child.type === 'MustacheStatement',
    );
  const singleChildCanInline =
    node.children.length === 1 &&
    childrenDocs.length === 1 &&
    singleChild?.type !== 'ElementNode' &&
    singleChild?.type !== 'PartialStatement' &&
    !docBreaks(childrenDocs[0]) &&
    !mustacheInsideBlock &&
    openTagFitsInline &&
    currentIndentLength + getSingleInlineElementLength(node, sortedAttributes, singleChild as Node, options) <=
      getPrintWidth(options);

  if (singleChildCanInline) {
    return concat([openDoc, childrenDocs[0], closeDoc]);
  }

  const singleTextLikeChildCanUseInlineTag =
    node.children.length === 1 &&
    childrenDocs.length === 1 &&
    singleChild?.type !== 'ElementNode' &&
    !docBreaks(childrenDocs[0]) &&
    !mustacheInsideBlock &&
    openTagFitsInline;

  if (singleTextLikeChildCanUseInlineTag) {
    return concat([openDoc, indent(concat([hardline, childrenDocs[0]])), hardline, closeDoc]);
  }

  const canInlineSimpleChildren =
    simpleInlineChildren &&
    !childrenDocs.some(docBreaks) &&
    !mustacheInsideBlock &&
    openTagFitsInline &&
    currentIndentLength + getSimpleInlineElementLength(node, sortedAttributes, options) <= getPrintWidth(options);

  if (canInlineSimpleChildren) {
    return concat([openDoc, joinInlineChildren(node.children as Node[], childrenDocs), closeDoc]);
  }

  if (shouldPreserveSimpleInlineText(node, childrenDocs, mustacheInsideBlock)) {
    return stringifySimpleInlineElement(node, sortedAttributes, options);
  }

  const canInlineMixedChildren =
    isInlineContentTag(node.tag) &&
    node.children.length > 0 &&
    node.children.every(isInlineContentChild) &&
    !childrenDocs.some(docBreaks) &&
    !mustacheInsideBlock &&
    openTagFitsInline &&
    currentIndentLength + getSimpleInlineElementLength(node, sortedAttributes, options) <= getPrintWidth(options);

  if (canInlineMixedChildren) {
    return concat([openDoc, joinInlineChildren(node.children as Node[], childrenDocs), closeDoc]);
  }

  const inner =
    childrenDocs.length > 0
      ? concat([indent(concat([hardline, joinExpandedChildren(node.children as Node[], childrenDocs)])), hardline])
      : '';

  const expandedDoc = concat([openDoc, inner, closeDoc]);

  return expandedDoc;
}

function printAttribute(attr: ElementAttribute, options: ParserOptions): Doc {
  if (isRawAttribute(attr)) {
    return attr.raw;
  }

  if (!isPlainAttribute(attr)) {
    if ((attr.block as Node).type === 'BlockStatement') {
      return printAttributeBlock(attr.block as BlockStatement);
    }

    return stringifyNode(attr.block as Node);
  }

  if (typeof attr.value === 'undefined' || attr.value === null) {
    return attr.name;
  }

  const valueString = stringifyAttributeValue(attr.value as AttributeValue);
  const quote = chooseAttributeQuote(valueString, options);

  if (attr.name === 'class' && /{{#/.test(valueString)) {
    const classLines = formatClassValue(valueString, options);
    return concat([
      'class=',
      quote,
      indent(concat([hardline, join(hardline, classLines)])),
      hardline,
      quote,
    ]);
  }

  if (attr.name === 'class' && shouldExpandStaticClassValue(valueString, options)) {
    const classLines = formatStaticClassValue(valueString);
    return concat([
      'class=',
      quote,
      indent(concat([hardline, join(hardline, classLines)])),
      hardline,
      quote,
    ]);
  }

  if (attr.name === 'class' && hasHandlebarsBlock(valueString)) {
    const lines = formatHandlebarsBlockValue(valueString, options);
    return concat([
      attr.name,
      '=',
      quote,
      indent(concat([hardline, join(hardline, lines)])),
      hardline,
      quote,
    ]);
  }

  if (valueString.includes('\n')) {
    const lines = formatMultilineAttributeValue(valueString);
    return concat([
      attr.name,
      '=',
      quote,
      indent(concat([hardline, join(hardline, lines)])),
      hardline,
      quote,
    ]);
  }

  return concat([attr.name, '=', quote, escapeAttributeValue(valueString, quote), quote]);
}

function printAttributeBlock(block: BlockStatement): Doc {
  const open = printBlockOpen(block);
  const bodyLines = formatAttributeBlockBody(stringifyNode(block.program as Program));
  const body =
    bodyLines.length > 0 ? concat([indent(concat([hardline, join(hardline, bodyLines)])), hardline]) : hardline;

  const inverseParts: Doc[] = [];
  (block.inverseChain ?? []).forEach((branch) => {
    const branchLines = formatAttributeBlockBody(stringifyNode(branch.program as Program));
    const branchBody =
      branchLines.length > 0 ? concat([indent(concat([hardline, join(hardline, branchLines)])), hardline]) : hardline;
    inverseParts.push(concat([printElseBranchOpen(branch), branchBody]));
  });

  if (block.inverse.body.length > 0) {
    const inverseLines = formatAttributeBlockBody(stringifyNode(block.inverse as Program));
    inverseParts.push(concat(['{{else}}', indent(concat([hardline, join(hardline, inverseLines)])), hardline]));
  }

  const inverse = inverseParts.length > 0 ? concat(inverseParts) : '';
  const close = printBlockClose(block);

  return concat([open, body, inverse, close]);
}

function stringifyAttributeValue(value: AttributeValue): string {
  return value.parts.map((part) => stringifyNode(part as Node)).join('');
}

function stringifyAttribute(attr: ElementAttribute, options?: ParserOptions): string {
  if (isRawAttribute(attr)) {
    return attr.raw;
  }

  if (!isPlainAttribute(attr)) {
    return stringifyNode(attr.block as Node);
  }

  if (!attr.value) {
    return attr.name;
  }

  const value = stringifyAttributeValue(attr.value as AttributeValue);
  const quote = chooseAttributeQuote(value, options);
  return `${attr.name}=${quote}${escapeAttributeValue(value, quote)}${quote}`;
}

function getInlineOpenTagLength(node: ElementNode, attributes: ElementAttribute[], options?: ParserOptions): number {
  const attrs = attributes.map((attr) => stringifyAttribute(attr, options)).join(' ');
  const open = attrs ? `<${node.tag} ${attrs}` : `<${node.tag}`;
  const close = node.selfClosing ? ' />' : '>';

  return `${open}${close}`.length;
}

function stringifyInlineChild(node: Node, options?: ParserOptions): string {
  switch (node.type) {
    case 'TextNode':
      return normalizeInlineText((node as TextNode).value);
    case 'MustacheStatement':
      return stringifyMustache(node as MustacheStatement);
    case 'ElementNode': {
      const element = node as ElementNode;
      const sortOptions = options ?? ({} as ParserOptions);
      const sortedAttributes = sortAttributes(element.attributes, sortOptions);
      if (
        isInlineContentTag(element.tag) &&
        element.children.length > 0 &&
        element.children.every(isInlineContentChild) &&
        !sortedAttributes.some(shouldBreakAttribute)
      ) {
        return stringifySimpleInlineElement(element, sortedAttributes, sortOptions);
      }

      return stringifyNode(node);
    }
    default:
      return stringifyNode(node);
  }
}

function shouldInsertInlineSeparator(left: Node, right: Node): boolean {
  if (isPunctuationOnlyTextNode(left) || isPunctuationOnlyTextNode(right)) {
    return false;
  }

  if (left.type === 'TextNode' && hasInlineBoundaryWhitespace((left as TextNode).trailingWhitespace)) {
    return true;
  }

  if (right.type === 'TextNode' && hasInlineBoundaryWhitespace((right as TextNode).leadingWhitespace)) {
    return true;
  }

  return left.type !== 'TextNode' && right.type !== 'TextNode';
}

function shouldAttachExpandedChild(left: Node | undefined, right: Node): boolean {
  return Boolean(left) && (isPunctuationOnlyTextNode(left) || isPunctuationOnlyTextNode(right));
}

function joinInlineChildren(nodes: Node[], docs: Doc[]): Doc {
  const parts: Doc[] = [];

  docs.forEach((doc, index) => {
    if (index > 0 && shouldInsertInlineSeparator(nodes[index - 1], nodes[index])) {
      parts.push(' ');
    }

    parts.push(doc);
  });

  return concat(parts);
}

function joinExpandedChildren(nodes: Node[], docs: Doc[]): Doc {
  const parts: Doc[] = [];

  docs.forEach((doc, index) => {
    if (index > 0 && !shouldAttachExpandedChild(nodes[index - 1], nodes[index])) {
      parts.push(hardline);
    }

    parts.push(doc);
  });

  return concat(parts);
}

function printBlockBody(children: Node[], docs: Doc[], options: ParserOptions): Doc {
  if (docs.length === 0) {
    return hardline;
  }

  if (canPrintInlineTextProgram(children, options)) {
    return concat([indent(concat([hardline, stringifyInlineChildren(children, options)])), hardline]);
  }

  return concat([indent(concat([hardline, join(hardline, docs)])), hardline]);
}

function canPrintInlineTextProgram(nodes: Node[], options: ParserOptions): boolean {
  return (
    nodes.some((node) => node.type === 'TextNode') &&
    nodes.every((node, index) => isInlineTextProgramChild(node, index, nodes, options))
  );
}

function isInlineTextProgramChild(node: Node, index: number, nodes: Node[], options: ParserOptions): boolean {
  if (node.type === 'MustacheStatement' || node.type === 'PartialStatement' || node.type === 'DecoratorStatement') {
    return true;
  }

  if (node.type === 'CommentStatement') {
    const comment = node as CommentStatement;
    return !comment.block && !comment.multiline;
  }

  if (node.type === 'BlockStatement') {
    return canInlineBlock(node as BlockStatement, options, 'Program');
  }

  if (node.type !== 'TextNode') {
    return false;
  }

  const text = node as TextNode;
  if (text.verbatim || text.blankLines || /[\r\n]/.test(text.value)) {
    return false;
  }

  const leadingBreakAllowed = index === 0 || !hasLineBreak(text.leadingWhitespace);
  const trailingBreakAllowed = index === nodes.length - 1 || !hasLineBreak(text.trailingWhitespace);

  return leadingBreakAllowed && trailingBreakAllowed;
}

function stringifyInlineChildren(nodes: Node[], options?: ParserOptions): string {
  return nodes.reduce((result, child, index) => {
    const separator = index > 0 && shouldInsertInlineSeparator(nodes[index - 1], child) ? ' ' : '';
    return `${result}${separator}${stringifyInlineChild(child, options)}`;
  }, '');
}

function stringifySimpleInlineElement(node: ElementNode, attributes: ElementAttribute[], options?: ParserOptions): string {
  const attrs = attributes.map((attr) => stringifyAttribute(attr, options)).join(' ');
  const open = attrs ? `<${node.tag} ${attrs}>` : `<${node.tag}>`;
  return `${open}${stringifyInlineChildren(node.children as Node[], options)}</${node.tag}>`;
}

function shouldPreserveRawTextElement(node: ElementNode): boolean {
  return (
    whitespaceSensitiveRawTextTags.has(node.tag.toLowerCase()) &&
    node.children.length === 1 &&
    node.children[0].type === 'TextNode' &&
    (node.children[0] as TextNode).preserveWhitespace === true
  );
}

function getSingleInlineElementLength(
  node: ElementNode,
  attributes: ElementAttribute[],
  child: Node,
  options?: ParserOptions,
): number {
  return getInlineOpenTagLength(node, attributes, options) + stringifyInlineChild(child, options).length + `</${node.tag}>`.length;
}

function getSimpleInlineElementLength(node: ElementNode, attributes: ElementAttribute[], options?: ParserOptions): number {
  const childrenLength = stringifyInlineChildren(node.children as Node[], options).length;

  return getInlineOpenTagLength(node, attributes, options) + childrenLength + `</${node.tag}>`.length;
}

function shouldPreserveSimpleInlineText(node: ElementNode, childrenDocs: Doc[], mustacheInsideBlock: boolean): boolean {
  return (
    isInlineContentTag(node.tag) &&
    node.children.some((child) => child.type === 'MustacheStatement') &&
    node.children.every(
      (child) =>
        (child.type === 'TextNode' && !(child as TextNode).verbatim && !(child as TextNode).blankLines) ||
        child.type === 'MustacheStatement',
    ) &&
    !childrenDocs.some(docBreaks) &&
    !mustacheInsideBlock
  );
}

function isInlineContentTag(tag: string): boolean {
  return new Set([
    'a',
    'abbr',
    'b',
    'bdi',
    'bdo',
    'button',
    'cite',
    'code',
    'em',
    'i',
    'label',
    'p',
    'small',
    'span',
    'strong',
    'sub',
    'sup',
    'time',
  ]).has(tag.toLowerCase());
}

function isInlineContentChild(node: Node): boolean {
  if ((node.type === 'TextNode' && !(node as TextNode).verbatim && !(node as TextNode).blankLines) || node.type === 'MustacheStatement') {
    return true;
  }

  return node.type === 'ElementNode' && isInlineContentTag((node as ElementNode).tag);
}

function isSimpleInlineBlockNode(
  node: Node,
  options: ParserOptions,
  parentType: Node['type'] | undefined,
): boolean {
  switch (node.type) {
    case 'TextNode':
      return !(node as TextNode).verbatim && !(node as TextNode).blankLines;
    case 'MustacheStatement':
    case 'PartialStatement':
      return true;
    case 'BlockStatement':
      return canInlineBlock(node as BlockStatement, options, parentType);
    default:
      return false;
  }
}

function canInlineBlock(
  node: BlockStatement,
  options: ParserOptions,
  parentType: Node['type'] | undefined,
): boolean {
  if (getBlockPrefix(node) !== '#') {
    return false;
  }

  if (hasBlockTrimMarkers(node) && hasOriginalLineBreak(node, options)) {
    return false;
  }

  const programChildren = node.program.body;
  const inverseChildren = node.inverse.body;
  const inverseChainChildren = (node.inverseChain ?? []).flatMap((branch) => branch.program.body);
  const allChildren = [...programChildren, ...inverseChainChildren, ...inverseChildren];

  if (allChildren.length === 0) {
    return false;
  }

  if (parentType === 'ElementNode') {
    return false;
  }

  if (parentType && parentType !== 'Program' && parentType !== 'BlockStatement') {
    return false;
  }

  if (!allChildren.every((child) => isSimpleInlineBlockNode(child as Node, options, 'BlockStatement'))) {
    return false;
  }

  return stringifyNode(node as Node).length <= getPrintWidth(options);
}

function hasBlockTrimMarkers(node: BlockStatement): boolean {
  return Boolean(
    node.trimOpen ||
      node.trimClose ||
      node.inverseTrimOpen ||
      node.inverseTrimClose ||
      node.closeTrimOpen ||
      node.closeTrimClose ||
      (node.inverseChain ?? []).some((branch) => branch.trimOpen || branch.trimClose),
  );
}

function hasOriginalLineBreak(node: Node, options: ParserOptions): boolean {
  const range = (node as { range?: [number, number] }).range;
  const originalText = (options as { originalText?: string }).originalText;

  return Boolean(range && originalText && /[\r\n]/.test(originalText.slice(range[0], range[1])));
}

function stringifyNode(node: Node): string {
  switch (node.type) {
    case 'TextNode':
      return (node as TextNode).value;
    case 'MustacheStatement': {
      const mustache = node as MustacheStatement;
      return stringifyMustache(mustache);
    }
    case 'DecoratorStatement': {
      return stringifyDecorator(node as DecoratorStatement);
    }
    case 'PartialStatement': {
      const partial = node as PartialStatement;
      return `{{${getTrimOpen(partial)}> ${buildExpression(partial)}${getTrimClose(partial)}}}`;
    }
    case 'CommentStatement': {
      const comment = node as CommentStatement;
      if (comment.block || comment.multiline) {
        return `{{!-- ${comment.value} --}}`;
      }
      if (comment.value.startsWith('<')) {
        return `{{!${comment.value}}}`;
      }
      return `{{! ${comment.value}}}`;
    }
    case 'BlockStatement': {
      const block = node as BlockStatement;
      const prefix = getBlockPrefix(block);
      const printedPrefix = prefix === '#>' ? '#> ' : prefix;
      const expression = buildExpression(block);
      const open = `{{${getTrimOpen(block)}${printedPrefix}${expression}${getTrimClosePadding(block, expression)}${getTrimClose(block)}}}`;
      const program = stringifyNode(block.program as Program);
      const inverseChain = (block.inverseChain ?? [])
        .map((branch) => {
          const branchExpression = buildExpression(branch);
          return `{{${getTrimOpen(branch)}else ${branchExpression}${getTrimClosePadding(branch, branchExpression)}${getTrimClose(branch)}}}${stringifyNode(branch.program as Program)}`;
        })
        .join('');
      const inverse = block.inverse.body.length > 0
        ? `{{${block.inverseTrimOpen ? '~' : ''}else${block.inverseTrimClose ? '~' : ''}}}${stringifyNode(block.inverse as Program)}`
        : '';
      const close = `{{${block.closeTrimOpen ? '~' : ''}/${block.path}${block.closeTrimClose ? '~' : ''}}}`;
      return `${open}${program}${inverseChain}${inverse}${close}`;
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

function formatClassValue(value: string, options: ParserOptions): Doc[] {
  const tokens = tokenizeClass(value);
  const lines: Doc[] = [];
  let depth = 0;

  tokens.forEach((token) => {
    if (token.startsWith('{{/')) {
      depth = Math.max(depth - 1, 0);
      lines.push(indentWithDepth(token, depth, options));
      return;
    }

    if (token.startsWith('{{#') || token.startsWith('{{^')) {
      lines.push(indentWithDepth(token, depth, options));
      depth += 1;
      return;
    }

    if (token.startsWith('{{else')) {
      depth = Math.max(depth - 1, 0);
      lines.push(indentWithDepth(token, depth, options));
      depth += 1;
      return;
    }

    lines.push(indentWithDepth(token, depth, options));
  });

  return lines;
}

function indentWithDepth(content: string, depth: number, options: ParserOptions): Doc {
  const prefix = depth > 0 ? getIndentUnit(options).repeat(depth) : '';
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

  return mergeClassTokenFragments(tokens);
}

function isSimpleMustacheToken(token: string): boolean {
  return (
    token.startsWith('{{') &&
    !token.startsWith('{{#') &&
    !token.startsWith('{{/') &&
    !token.startsWith('{{else')
  );
}

function shouldGlueClassTokens(left: string, right: string): boolean {
  return (
    (isSimpleMustacheToken(right) && /[-_:]$/.test(left)) ||
    (isSimpleMustacheToken(left) && /^[-_:]/.test(right))
  );
}

function mergeClassTokenFragments(tokens: string[]): string[] {
  const merged: string[] = [];

  tokens.forEach((token) => {
    const previous = merged[merged.length - 1];
    if (previous && shouldGlueClassTokens(previous, token)) {
      merged[merged.length - 1] = `${previous}${token}`;
      return;
    }

    merged.push(token);
  });

  return merged;
}

function formatStaticClassValue(value: string): Doc[] {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token);
}

function chooseAttributeQuote(value: string, options?: ParserOptions): '"' | "'" {
  const preferSingleQuote = (options as Record<string, unknown> | undefined)?.singleQuote === true;

  if (preferSingleQuote && !value.includes("'")) {
    return "'";
  }

  if (value.includes('"') && !value.includes("'")) {
    return "'";
  }

  return '"';
}

function escapeAttributeValue(value: string, quote: '"' | "'"): string {
  if (quote === '"') {
    return value.replace(/"/g, '&quot;');
  }

  return value.replace(/'/g, '&#39;');
}

function shouldExpandStaticClassValue(value: string, options: ParserOptions): boolean {
  const tokens = value.split(/\s+/).filter(Boolean);

  if (tokens.length < 2) {
    return false;
  }

  return `class="${value.trim()}"`.length > getPrintWidth(options);
}

function stringifyMustache(node: MustacheStatement): string {
  const open = node.triple ? '{{{' : '{{';
  const close = node.triple ? '}}}' : '}}';
  const content = buildExpression(node);

  return `${open}${getTrimOpen(node)}${getMustacheOpenPadding(node, content)}${content}${getMustacheClosePadding(node, content)}${getTrimClose(node)}${close}`;
}

function stringifyDecorator(node: DecoratorStatement): string {
  const content = buildExpression(node);
  return `{{${getTrimOpen(node)}*${content}${getTrimClosePadding(node, content)}${getTrimClose(node)}}}`;
}

function printMustache(node: MustacheStatement, options: ParserOptions): Doc {
  const content = buildExpression(node);
  const open = node.triple ? '{{{' : '{{';
  const close = node.triple ? '}}}' : '}}';

  const expressionPartCount = node.hash.length + node.params.length;
  const canWrapPlainParams = !node.params.some(shouldKeepParamInline);
  const shouldMultiline =
    !node.triple &&
    expressionPartCount > 1 &&
    ((node.hash.length > 0 && expressionPartCount > 1) || (canWrapPlainParams && content.length > getPrintWidth(options)));

  if (shouldMultiline) {
    const paramsDocs: Doc[] = [];
    node.params.forEach((param) => paramsDocs.push(param));
    node.hash.forEach((pair) => paramsDocs.push(formatHash(pair)));

    return group(
      concat([
        open,
        getTrimOpen(node),
        node.path,
        indent(concat([hardline, join(hardline, paramsDocs)])),
        hardline,
        getTrimClose(node),
        close,
      ]),
    );
  }

  return concat([
    open,
    getTrimOpen(node),
    getMustacheOpenPadding(node, content),
    content,
    getMustacheClosePadding(node, content),
    getTrimClose(node),
    close,
  ]);
}

function printDecorator(node: DecoratorStatement, options: ParserOptions): Doc {
  const content = buildExpression(node);
  const expressionPartCount = node.hash.length + node.params.length;
  const canWrapPlainParams = !node.params.some(shouldKeepParamInline);
  const shouldMultiline =
    expressionPartCount > 1 &&
    canWrapPlainParams &&
    content.length > getPrintWidth(options);

  if (shouldMultiline) {
    const paramsDocs: Doc[] = [];
    node.params.forEach((param) => paramsDocs.push(param));
    node.hash.forEach((pair) => paramsDocs.push(formatHash(pair)));

    return group(
      concat([
        '{{',
        getTrimOpen(node),
        '*',
        node.path,
        indent(concat([hardline, join(hardline, paramsDocs)])),
        hardline,
        getTrimClose(node),
        '}}',
      ]),
    );
  }

  return concat([
    '{{',
    getTrimOpen(node),
    '*',
    content,
    getTrimClosePadding(node, content),
    getTrimClose(node),
    '}}',
  ]);
}

function printBlock(path: AstPath<BlockStatement>, options: ParserOptions, print: (path: AstPath) => Doc): Doc {
  const node = path.getValue();
  const parentNode = path.getParentNode() as Node | undefined;

  if (canInlineBlock(node, options, parentNode?.type)) {
    return stringifyNode(node as Node);
  }

  const open = printBlockOpen(node);
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

  const body = printBlockBody(node.program.body as Node[], bodyDocs, options);

  const inverseParts: Doc[] = [];
  (node.inverseChain ?? []).forEach((branch, index) => {
    const branchDocs: Doc[] = [];
    path.call((branchProgramPath) => {
      branchProgramPath.each((childPath) => {
        const childNode = childPath.getValue() as Node;
        if (childNode.type === 'TextNode' && childNode.blankLines && getMaxEmptyLines(options) === 0) {
          return;
        }

        const doc = print(childPath as AstPath<Node>);
        if (doc === null) {
          return;
        }
        branchDocs.push(doc);
      }, 'body');
    }, 'inverseChain', index, 'program');

    const branchBody = printBlockBody(branch.program.body as Node[], branchDocs, options);
    inverseParts.push(concat([printElseBranchOpen(branch), branchBody]));
  });

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
    inverseParts.push(concat([printFinalElseOpen(node), printBlockBody(node.inverse.body as Node[], inverseDocs, options)]));
  }

  const inverse = inverseParts.length > 0 ? concat(inverseParts) : '';
  const close = printBlockClose(node);

  return concat([open, body, inverse, close]);
}

function printBlockOpen(node: BlockStatement): Doc {
  const expression = buildExpression(node);
  const multilineExpression = splitMultilineExpression(expression);
  const prefix = getBlockPrefix(node);
  const printedPrefix = prefix === '#>' ? '#> ' : prefix;

  if (multilineExpression) {
    return concat([
      '{{',
      getTrimOpen(node),
      printedPrefix,
      multilineExpression[0],
      indent(concat([hardline, join(hardline, multilineExpression.slice(1))])),
      hardline,
      getTrimClose(node),
      '}}',
    ]);
  }

  return concat([
    '{{',
    getTrimOpen(node),
    printedPrefix,
    expression,
    getTrimClosePadding(node, expression),
    getTrimClose(node),
    '}}',
  ]);
}

function printFinalElseOpen(node: BlockStatement): Doc {
  return concat(['{{', node.inverseTrimOpen ? '~' : '', 'else', node.inverseTrimClose ? '~' : '', '}}']);
}

function printElseBranchOpen(node: ElseBranch): Doc {
  const expression = buildExpression(node);
  const multilineExpression = splitMultilineExpression(expression);

  if (multilineExpression) {
    return concat([
      '{{',
      getTrimOpen(node),
      'else ',
      multilineExpression[0],
      indent(concat([hardline, join(hardline, multilineExpression.slice(1))])),
      hardline,
      getTrimClose(node),
      '}}',
    ]);
  }

  return concat([
    '{{',
    getTrimOpen(node),
    'else ',
    expression,
    getTrimClosePadding(node, expression),
    getTrimClose(node),
    '}}',
  ]);
}

function printBlockClose(node: BlockStatement): Doc {
  return concat(['{{', node.closeTrimOpen ? '~' : '', '/', node.path, node.closeTrimClose ? '~' : '', '}}']);
}

function printPartial(node: PartialStatement, options: ParserOptions): Doc {
  const name = node.path;
  const open = concat(['{{', getTrimOpen(node), '> ']);
  const close = concat([getTrimClose(node), '}}']);
  if (node.params.length === 0 && node.hash.length === 0) {
    return concat([open, name, close]);
  }

  const paramsDocs: Doc[] = [];
  node.params.forEach((param) => paramsDocs.push(formatPartialParam(param, options)));
  node.hash.forEach((pair) => paramsDocs.push(formatPartialParam(formatHash(pair), options)));

  return group(
    concat([
      open,
      name,
      indent(concat([hardline, join(hardline, paramsDocs)])),
      hardline,
      close,
    ]),
  );
}

function formatPartialParam(param: string, options: ParserOptions): Doc {
  if (!param.includes('\n')) {
    return param;
  }

  const lines = trimSurroundingBlankLines(param.split('\n'));

  if (lines.length === 0) {
    return '';
  }

  const [firstLine, ...rest] = lines;

  if (rest.length === 0) {
    return firstLine;
  }

  const normalizedRest = formatMultilineParamRest(rest, options);

  return concat([firstLine, hardline, join(hardline, normalizedRest)]);
}

function formatMultilineComment(content: string, options: ParserOptions, inlineMarkers = false): Doc {
  const lines = trimSurroundingBlankLines(content.replace(/[ \t]+$/gm, '').split('\n'));
  const shouldInlineMarkup = !inlineMarkers && shouldFormatCommentAsInlineMarkup(lines);

  if (lines.length === 0) {
    return inlineMarkers ? '{{!--  --}}' : '{{!-- --}}';
  }

  if (inlineMarkers || shouldInlineMarkup) {
    const strippedLines = inlineMarkers ? stripCommonIndent(lines, 1) : stripCommonIndent(lines);
    const [firstLine, ...restLines] = strippedLines;
    const first = firstLine.trimStart();

    if (restLines.length === 0) {
      return concat(['{{!-- ', first, ' --}}']);
    }

    const normalizedRest = normalizeInlineCommentLines(restLines, options);

    const lastLine = normalizedRest[normalizedRest.length - 1];
    const leadingLines = normalizedRest.slice(0, -1);

    return concat([
      '{{!-- ',
      first,
      hardline,
      leadingLines.length > 0 ? concat([join(hardline, leadingLines), hardline]) : '',
      lastLine,
      ' --}}',
    ]);
  }

  const normalizedLines = stripCommonIndent(lines).map((line) => {
    if (line.trim() === '') {
      return '';
    }

    return `${getIndentUnit(options)}${line}`;
  });

  const body = join(hardline, normalizedLines);

  return concat([
    '{{!--',
    hardline,
    body,
    hardline,
    '--}}',
  ]);
}

function shouldFormatCommentAsInlineMarkup(lines: string[]): boolean {
  const nonEmptyLines = lines.filter((line) => line.trim() !== '');

  if (nonEmptyLines.length < 2) {
    return false;
  }

  const firstLine = nonEmptyLines[0].trim();
  const lastLine = nonEmptyLines[nonEmptyLines.length - 1].trim();

  return /^<[\w:-]+$/.test(firstLine) && (/\/>$/.test(lastLine) || /^<\/[\w:-]+>$/.test(lastLine));
}

function normalizeInlineCommentLines(lines: string[], options: ParserOptions): string[] {
  const indentUnit = getIndentUnit(options);
  const nonEmptyLines = lines.filter((line) => line.trim() !== '');

  if (nonEmptyLines.length === 0) {
    return lines.map(() => '');
  }

  const baseIndent = nonEmptyLines.reduce((min, line) => {
    const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
    return Math.min(min, indentLength);
  }, Number.MAX_SAFE_INTEGER);

  const relativeIndentLengths = Array.from(
    new Set(
      nonEmptyLines.map((line) => {
        const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
        return Math.max(indentLength - baseIndent, 0);
      }),
    ),
  ).sort((a, b) => a - b);

  const indentRank = new Map(relativeIndentLengths.map((length, index) => [length, index]));

  return lines.map((line) => {
    if (line.trim() === '') {
      return '';
    }

    const indentLength = (line.match(/^[ \t]*/) || [''])[0].length;
    const relativeIndent = Math.max(indentLength - baseIndent, 0);
    const level = indentRank.get(relativeIndent) ?? 0;
    const content = line.slice(indentLength).replace(/[ \t]+$/, '');

    return `${indentUnit.repeat(level)}${content}`;
  });
}

function buildExpression(node: PrintableExpression): string {
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
  if (node.blockParams && node.blockParams.length > 0) {
    pieces.push('as', `|${node.blockParams.join(' ')}|`);
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

function formatHandlebarsBlockValue(value: string, options: ParserOptions): Doc[] {
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

    lines.push(indentWithDepth(token, depth, options));

    if (isBlockOpen || isElse) {
      depth += 1;
    }
  });

  return lines;
}

function formatAttributeBlockBody(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .filter((line, index, lines) => {
      if (line.trim() !== '') {
        return true;
      }

      return index > 0 && index < lines.length - 1;
    })
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
