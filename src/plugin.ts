import { parse } from './parser';
import { printer } from './printer';

export const languages = [
  {
    name: 'Handlebars',
    parsers: ['handlebars'],
    extensions: ['.hbs', '.handlebars'],
  },
];

export const parsers = {
  'handlebars': {
    parse,
    astFormat: 'handlebars-ast',
    locStart: () => 0,
    locEnd: () => 0,
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
};
