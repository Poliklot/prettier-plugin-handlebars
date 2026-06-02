export const whitespace = /\s/;

export function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function trimSurroundingBlankLines(lines: string[]): string[] {
  const trimmedLines = lines.slice();

  while (trimmedLines.length > 0 && trimmedLines[0].trim() === '') {
    trimmedLines.shift();
  }

  while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1].trim() === '') {
    trimmedLines.pop();
  }

  return trimmedLines;
}

export function stripCommonIndent(lines: string[], startIndex = 0): string[] {
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
