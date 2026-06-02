export type TemplateTokenKind = 'blockStart' | 'blockEnd' | 'partial' | 'comment' | 'mustache' | 'else';

export type TemplateBlockPrefix = '#' | '#>' | '#*' | '^' | '<' | '$';

export type TemplateTokenSpecialForm =
  | 'blockPartial'
  | 'decoratorBlock'
  | 'decorator'
  | 'elseIf'
  | 'inverseBlock'
  | 'parent'
  | 'mustacheBlock';

export interface TemplateToken {
  kind: TemplateTokenKind;
  content: string;
  rawContent: string;
  start: number;
  end: number;
  triple: boolean;
  name?: string;
  rawInner: string;
  trimOpen: boolean;
  trimClose: boolean;
  specialForm?: TemplateTokenSpecialForm;
}

export interface TemplateTagDelimiters {
  open: string;
  close: string;
}

export interface TemplateBlockCommentMarkers {
  blockOpen: string;
  blockClose: string;
  inlineOpen: string;
  inlineClose: string;
  emptyBlock: string;
  emptyInline: string;
}

export interface TemplateDialect {
  name: string;
  openDelimiter: string;
  closeDelimiter: string;
  parseToken(text: string, position: number): TemplateToken;
  findNextOpen(text: string, position: number): number;
  isEscapedOpen(text: string, position: number): boolean;
  isDynamicElementStart(text: string, position: number): boolean;
  consumeRawBlock(text: string, position: number): number | null;
  getBlockExpression(token: TemplateToken): string;
  getBlockPrefix(token: TemplateToken): TemplateBlockPrefix;
  getTagDelimiters(triple: boolean): TemplateTagDelimiters;
  getPrintedBlockPrefix(prefix: TemplateBlockPrefix): string;
  getPartialPrefix(): string;
  getDecoratorPrefix(): string;
  getElseKeyword(): string;
  getBlockClosePrefix(path: string): string;
  getLineCommentTag(value: string): string;
  getBlockCommentTag(value: string): string;
  getBlockCommentMarkers(): TemplateBlockCommentMarkers;
  shouldPreserveTokenVerbatim(token: TemplateToken): boolean;
  shouldPreserveUnclosedBlockRemainder(token: TemplateToken): boolean;
}
