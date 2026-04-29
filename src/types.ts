export type Node =
  | Program
  | ElementNode
  | TextNode
  | MustacheStatement
  | BlockStatement
  | PartialStatement
  | DecoratorStatement
  | CommentStatement
  | UnmatchedNode;

export interface SourceRange {
  range?: [number, number];
}

export interface Program extends SourceRange {
  type: 'Program';
  body: Node[];
}

export interface AttributeValue extends SourceRange {
  type: 'AttributeValue';
  parts: AttributeValuePart[];
}

export type AttributeValuePart =
  | TextNode
  | MustacheStatement
  | BlockStatement
  | PartialStatement
  | DecoratorStatement
  | CommentStatement;

export type ElementAttribute =
  | {
      type: 'Attribute';
      name: string;
      value?: AttributeValue | null;
    }
  | {
      type: 'RawAttribute';
      raw: string;
    }
  | {
      type: 'AttributeBlock';
      block: MustacheStatement | BlockStatement | PartialStatement | DecoratorStatement | CommentStatement;
    };

export interface ElementNode extends SourceRange {
  type: 'ElementNode';
  tag: string;
  attributes: ElementAttribute[];
  children: Node[];
  selfClosing: boolean;
}

export interface TextNode extends SourceRange {
  type: 'TextNode';
  value: string;
  blankLines?: number;
  verbatim?: boolean;
  preserveWhitespace?: boolean;
  leadingWhitespace?: string;
  trailingWhitespace?: string;
}

export interface HashPair {
  key: string;
  value: string;
}

export interface MustacheBase {
  path: string;
  params: string[];
  hash: HashPair[];
  blockParams?: string[];
  trimOpen?: boolean;
  trimClose?: boolean;
}

export interface MustacheStatement extends MustacheBase, SourceRange {
  type: 'MustacheStatement';
  triple: boolean;
}

export interface ElseBranch extends MustacheBase, SourceRange {
  type: 'ElseBranch';
  program: Program;
}

export interface BlockStatement extends MustacheBase, SourceRange {
  type: 'BlockStatement';
  program: Program;
  inverseChain?: ElseBranch[];
  inverse: Program;
  inverseTrimOpen?: boolean;
  inverseTrimClose?: boolean;
  rawOpen: string;
  blockPrefix?: '#' | '#>' | '#*' | '^';
  closeTrimOpen?: boolean;
  closeTrimClose?: boolean;
}

export interface PartialStatement extends MustacheBase, SourceRange {
  type: 'PartialStatement';
}

export interface DecoratorStatement extends MustacheBase, SourceRange {
  type: 'DecoratorStatement';
}

export interface CommentStatement extends SourceRange {
  type: 'CommentStatement';
  value: string;
  multiline: boolean;
  block: boolean;
  inline: boolean;
}

export interface UnmatchedNode extends SourceRange {
  type: 'UnmatchedNode';
  raw: string;
}

export type ParseEndReason = 'blockEnd' | 'else' | 'tagClose' | null;
