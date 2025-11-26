import type { AstPath, Doc, ParserOptions, Printer } from 'prettier';
import { builders } from 'prettier/doc';
import { BlockStatement, ElementAttribute, ElementNode, HashPair, MustacheStatement, Node, PartialStatement, Program, TextNode } from './types';

const { concat, hardline, join, group, indent } = builders;

export const printer: Printer<Node> = {
  print(path, options, print) {
    const node = path.getValue() as Node;

    switch (node.type) {
      case 'Program':
        return printProgram(path as AstPath<Program>, options, print);
      case 'ElementNode':
        return printElement(path as AstPath<ElementNode>, options, print);
      case 'TextNode':
        return node.value;
      case 'MustacheStatement':
        return printMustache(node);
      case 'BlockStatement':
        return printBlock(path as AstPath<BlockStatement>, options, print);
      case 'PartialStatement':
        return printPartial(node, options);
      case 'CommentStatement':
        return node.multiline ? concat(['{{!-- ', node.value.trim(), ' --}}']) : concat(['{{! ', node.value.trim(), ' }}']);
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

function sortAttributes(attributes: ElementAttribute[]): ElementAttribute[] {
  const others = attributes.filter((attr) => attr.name !== 'id' && attr.name !== 'class');
  const idAttr = attributes.find((attr) => attr.name === 'id');
  const classAttr = attributes.find((attr) => attr.name === 'class');
  const ordered: ElementAttribute[] = [];
  if (idAttr) ordered.push(idAttr);
  if (classAttr) ordered.push(classAttr);
  return ordered.concat(others);
}

function printElement(path: AstPath<ElementNode>, options: ParserOptions, print: (path: AstPath) => Doc): Doc {
  const node = path.getValue();
  const sortedAttributes = sortAttributes(node.attributes);
  const multiline = sortedAttributes.length > 1;

  const openTag = concat(['<', node.tag]);
  let attributesDoc: Doc = '';

  if (sortedAttributes.length > 0) {
    const attrsDocs = sortedAttributes.map((attr) => printAttribute(attr));
    if (multiline) {
      attributesDoc = concat([
        hardline,
        indent(join(hardline, attrsDocs)),
        hardline,
      ]);
    } else {
      attributesDoc = concat([' ', attrsDocs[0]]);
    }
  }

  const closing = node.selfClosing ? '/>' : '>';
  const openDoc = group(concat([openTag, attributesDoc, closing]));

  if (node.selfClosing) {
    return openDoc;
  }

  const childrenDocs: Doc[] = [];
  path.each((childPath) => {
    childrenDocs.push(print(childPath as AstPath<Node>));
  }, 'children');

  const inner = childrenDocs.length > 0 ? concat([indent(concat([hardline, join(hardline, childrenDocs)])), hardline]) : '';

  const closeDoc = concat(['</', node.tag, '>']);
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
      hardline,
      indent(join(hardline, classLines)),
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
  if (depth <= 0) {
    return content;
  }
  return concat([indent(indentWithDepth(content, depth - 1))]);
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
  return concat([open, ' ', content, ' ', close]);
}

function printBlock(path: AstPath<BlockStatement>, options: ParserOptions, print: (path: AstPath) => Doc): Doc {
  const node = path.getValue();
  const open = concat(['{{#', buildExpression(node), '}}']);
  const bodyDocs: Doc[] = [];
  path.each((childPath) => {
    bodyDocs.push(print(childPath as AstPath<Node>));
  }, 'program');

  const body = bodyDocs.length > 0 ? concat([indent(concat([hardline, join(hardline, bodyDocs)])), hardline]) : '';

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
      hardline,
      indent(join(hardline, paramsDocs)),
      hardline,
      '}}',
    ]),
  );
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

