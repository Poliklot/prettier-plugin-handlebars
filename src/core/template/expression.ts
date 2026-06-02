import { whitespace } from '../text/whitespace';

export interface TemplateHashPair {
  key: string;
  value: string;
}

export interface TemplateExpression {
  path: string;
  params: string[];
  hash: TemplateHashPair[];
  blockParams?: string[];
}

export function parseTemplateExpression(content: string): TemplateExpression {
  const normalized = normalizeTemplateExpression(content);
  const { expression, blockParams } = extractBlockParams(normalized);
  const tokens = tokenizeTemplateExpression(expression);
  const path = tokens.shift() || '';
  const { params, hash } = splitTemplateParams(tokens);
  const parsed: TemplateExpression = {
    path,
    params,
    hash,
  };

  if (blockParams.length > 0) {
    parsed.blockParams = blockParams;
  }

  return parsed;
}

export function normalizeTemplateExpression(content: string): string {
  const joined = tokenizeTemplateExpression(content.trim()).join(' ');
  return joined.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
}

export function tokenizeTemplateExpression(content: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | '`' | null = null;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (quote) {
      current += char;

      if (char === '\\' && i + 1 < content.length) {
        i += 1;
        current += content[i];
        continue;
      }

      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if ((char === '"' || char === "'" || char === '`') && isTemplateExpressionQuoteStart(content, i)) {
      current += char;
      quote = char;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      current += char;
      continue;
    }

    if (char === ')') {
      parenDepth = Math.max(parenDepth - 1, 0);
      current += char;
      continue;
    }

    if (char === '[') {
      bracketDepth += 1;
      current += char;
      continue;
    }

    if (char === ']') {
      bracketDepth = Math.max(bracketDepth - 1, 0);
      current += char;
      continue;
    }

    if (char === '{') {
      braceDepth += 1;
      current += char;
      continue;
    }

    if (char === '}') {
      braceDepth = Math.max(braceDepth - 1, 0);
      current += char;
      continue;
    }

    if (whitespace.test(char) && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export function isTemplateExpressionQuoteStart(text: string, position: number, expressionStart = 0): boolean {
  if (position <= expressionStart) {
    return true;
  }

  const previous = text[position - 1];
  return !previous || whitespace.test(previous) || /[([{=,:~|]/.test(previous);
}

export function splitTemplateParams(tokens: string[]): { params: string[]; hash: TemplateHashPair[] } {
  const params: string[] = [];
  const hash: TemplateHashPair[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const eqIndex = token.indexOf('=');
    const key = eqIndex > 0 ? token.slice(0, eqIndex) : '';

    if (eqIndex > 0 && isHashKey(key)) {
      let value = token.slice(eqIndex + 1);
      if (value === '' && index + 1 < tokens.length) {
        value = tokens[index + 1];
        index += 1;
      }
      hash.push({ key, value });
      continue;
    }

    if (isHashKey(token) && tokens[index + 1] === '=' && index + 2 < tokens.length) {
      hash.push({ key: token, value: tokens[index + 2] });
      index += 2;
      continue;
    }

    params.push(token);
  }

  return { params, hash };
}

export function formatTemplateHashPair(pair: TemplateHashPair): string {
  return `${pair.key}=${pair.value}`;
}

function extractBlockParams(content: string): { expression: string; blockParams: string[] } {
  const match = content.match(/\s+as\s+\|([^|]*)\|/);

  if (!match) {
    return { expression: content, blockParams: [] };
  }

  const blockParams = match[1].split(/\s+/).filter(Boolean);
  const expression = content.replace(match[0], '').trim();

  return { expression, blockParams };
}

function isHashKey(value: string): boolean {
  return /^[A-Za-z_@][A-Za-z0-9_@.:-]*$/.test(value);
}
