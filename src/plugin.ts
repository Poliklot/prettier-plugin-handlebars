import { parse } from './parser';
import { printer } from './printer';

export const languages = [
  {
    name: 'HandlebarsCustom',
    parsers: ['handlebars-custom'],
    extensions: ['.hbs'],
  },
];

export const parsers = {
  'handlebars-custom': {
    parse,
    astFormat: 'handlebars-custom-ast',
    locStart: () => 0,
    locEnd: () => 0,
  },
};

export const printers = {
  'handlebars-custom-ast': printer,
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
};
