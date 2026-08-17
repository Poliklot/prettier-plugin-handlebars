import { locEnd, locStart, parse } from './parser';
import { printer } from './printer';

export const languages = [
  {
    name: 'Handlebars',
    type: 'markup',
    parsers: ['handlebars'],
    extensions: ['.hbs', '.handlebars'],
    aliases: ['hbs', 'htmlbars', 'classic-handlebars'],
    vscodeLanguageIds: ['handlebars'],
  },
];

export const parsers = {
  'handlebars': {
    parse,
    astFormat: 'handlebars-ast',
    locStart,
    locEnd,
  },
};

export const printers = {
  'handlebars-ast': printer,
};

export const options = {
  dataAttributeOrder: {
    since: '0.1.0',
    category: 'HTML',
    type: 'string',
    array: true,
    default: [{ value: [] }],
    description: 'Ordering override for data-* attributes.',
  },
  maxEmptyLines: {
    since: '0.1.0',
    category: 'HTML',
    type: 'int',
    default: 1,
    description: 'Maximum number of consecutive blank lines to preserve between nodes.',
  },
  classAttributeSameLine: {
    since: '0.2.17',
    category: 'HTML',
    type: 'boolean',
    default: false,
    description: 'Keep the first and last tokens of multiline conditional class attributes glued to their quotes.',
  },
  classAttributeLayout: {
    since: '0.4.0',
    category: 'HTML',
    type: 'choice',
    default: 'auto',
    description: 'Control whether class attribute values may use multiple lines.',
    choices: [
      {
        value: 'auto',
        description: 'Wrap long and conditional class attributes using the default formatting rules.',
      },
      {
        value: 'single-line',
        description: 'Keep class attribute values on a single physical line.',
      },
    ],
  },
};

export const defaultOptions = {};
