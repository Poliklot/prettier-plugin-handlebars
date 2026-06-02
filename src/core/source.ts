export interface SourceRange {
  range?: [number, number];
}

export function normalizeInput(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

export function locStart(node: unknown): number {
  const range = (node as { range?: [number, number] } | null | undefined)?.range;
  return Array.isArray(range) ? range[0] : 0;
}

export function locEnd(node: unknown): number {
  const range = (node as { range?: [number, number] } | null | undefined)?.range;
  return Array.isArray(range) ? range[1] : 0;
}

export function withRange<T extends object>(node: T, start: number, end: number): T {
  Object.defineProperty(node, 'range', {
    value: [start, end] satisfies [number, number],
    enumerable: false,
    configurable: true,
  });

  return node;
}

export function withOptionalRange<T extends object>(node: T, start?: number, end?: number): T {
  return typeof start === 'number' && typeof end === 'number' ? withRange(node, start, end) : node;
}
