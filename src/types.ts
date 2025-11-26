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

export interface ElementAttribute {
  name: string;
  value?: string;
}

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
}

export interface HashPair {
  key: string;
  value: string;
}

export interface MustacheBase {
  path: string;
  params: string[];
  hash: HashPair[];
}

export interface MustacheStatement extends MustacheBase {
  type: 'MustacheStatement';
  triple: boolean;
}

export interface BlockStatement extends MustacheBase {
  type: 'BlockStatement';
  program: Node[];
  inverse: Node[];
  rawOpen: string;
}

export interface PartialStatement extends MustacheBase {
  type: 'PartialStatement';
}

export interface CommentStatement {
  type: 'CommentStatement';
  value: string;
  multiline: boolean;
}

export interface UnmatchedNode {
  type: 'UnmatchedNode';
  raw: string;
}

export type ParseEndReason = 'blockEnd' | 'else' | 'tagClose' | null;
