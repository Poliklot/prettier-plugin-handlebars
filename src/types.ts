export type Node =
  | Program
  | ElementNode
  | TextNode
  | MustacheStatement
  | BlockStatement
  | PartialStatement
  | CommentStatement
  | UnmatchedNode;

export interface Program {
  type: 'Program';
  body: Node[];
}

export interface AttributeValue {
  type: 'AttributeValue';
  parts: AttributeValuePart[];
}

export type AttributeValuePart =
  | TextNode
  | MustacheStatement
  | BlockStatement
  | PartialStatement
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
      block: MustacheStatement | BlockStatement | PartialStatement | CommentStatement;
    };

export interface ElementNode {
  type: 'ElementNode';
  tag: string;
  attributes: ElementAttribute[];
  children: Node[];
  selfClosing: boolean;
}

export interface TextNode {
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

export interface MustacheStatement extends MustacheBase {
  type: 'MustacheStatement';
  triple: boolean;
}

export interface ElseBranch extends MustacheBase {
  type: 'ElseBranch';
  program: Program;
}

export interface BlockStatement extends MustacheBase {
  type: 'BlockStatement';
  program: Program;
  inverseChain?: ElseBranch[];
  inverse: Program;
  rawOpen: string;
  blockPrefix?: '#' | '#>' | '#*';
  closeTrimOpen?: boolean;
  closeTrimClose?: boolean;
}

export interface PartialStatement extends MustacheBase {
  type: 'PartialStatement';
}

export interface CommentStatement {
  type: 'CommentStatement';
  value: string;
  multiline: boolean;
  block: boolean;
  inline: boolean;
}

export interface UnmatchedNode {
  type: 'UnmatchedNode';
  raw: string;
}

export type ParseEndReason = 'blockEnd' | 'else' | 'tagClose' | null;
