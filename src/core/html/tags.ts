export const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export const rawTextElements = new Set(['script', 'style', 'textarea', 'pre']);

export const whitespaceSensitiveRawTextElements = new Set(['textarea', 'pre']);

export const trimmableRawTextElements = new Set(['script', 'style']);

export const inlineContentElements = new Set([
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
]);
