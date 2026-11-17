import assert from 'node:assert/strict';
import { it as test } from 'vitest';
import engine from 'handlebars';
import type { HelperOptions } from 'handlebars';
import prettier from 'prettier';
import * as plugin from '../src/plugin';

// HTML proof collapses only browser-collapsible ASCII whitespace, not NBSP or
// other Unicode data. Plain templates and lambda bodies are compared exactly.
const htmlText = (s: string) => s.replace(/<\/?(?:p|span|div|b)>/g, '').replace(/[\t\n\f\r ]+/g, ' ').replace(/^ | $/g, '');
const optionsMatrix = [
  { printWidth: 80 }, { printWidth: 20 },
  { printWidth: 120, htmlWhitespaceSensitivity: 'strict' as const },
  { printWidth: 80, useTabs: true, tabWidth: 4, embeddedLanguageFormatting: 'off' as const },
];
const view = {
  a: 'A', b: 'B', x: 3, n: 10, ok: true, html: '<b>ok</b>',
  'first  name': 'DOUBLE', 'first name': 'SINGLE', 'foo ( bar )': 'ORIGINAL',
  'foo (bar)': 'CHANGED', 'x as |y|': 'KEY',
};
const environment = engine.create();
environment.registerHelper('echo', (value: string) => value);
environment.registerHelper('hash', (options: HelperOptions) => options.hash.value);
environment.registerPartial('part', 'P');
environment.registerPartial('multiline', 'X\nY\n');
const render = (s: string, data: object = view) => environment.compile(s)(data);
async function prove(source: string, html = false, data: object = view) {
  const before = render(source, data);
  for (const options of optionsMatrix) {
    const once = await prettier.format(source, { parser: 'handlebars', plugins: [plugin as never], ...options });
    const after = render(once, data);
    assert.equal(html ? htmlText(after) : after, html ? htmlText(before) : before, JSON.stringify({ source, options, once }));
    assert.equal(await prettier.format(once, { parser: 'handlebars', plugins: [plugin as never], ...options }), once);
  }
}
const nodes = ['{{a}}', '<b>{{b}}</b>', '{{! note}}', '{{#if ok}}K{{/if}}', '{{>part}}', '{{{html}}}', '{{&html}}'];
for (const wrapper of ['', 'p', 'span', 'div']) {
  test(`source boundaries preserve execution in ${wrapper || 'plain text'}`, async () => {
    for (const left of nodes) for (const right of nodes) for (const gap of ['', ' ', '\n', '\u00a0', '\u202f']) {
      const text = `${left}${gap}${right}`;
      await prove(wrapper ? `<${wrapper}>${text}</${wrapper}>\n` : `${text}\n`, Boolean(wrapper));
    }
  });
}
for (const source of [
  '<p>X<span> Y </span>Z</p>\n', '<p>X<span> </span>Z</p>\n',
  '<p>A\u00a0B</p>\n', '<p>{{a}}\u202f{{b}}</p>\n',
  '<p>X<span>\u00a0</span>Z</p>\n', '<span>\u00a0{{a}}\u00a0</span>\n',
]) test(`HTML data and inline edges: ${JSON.stringify(source)}`, () => prove(source, true));
for (const source of ['A\u00a0\n', 'A\u202f\n', 'Before\n  {{a}}\nAfter\n']) {
  test(`literal template data: ${JSON.stringify(source)}`, () => prove(source));
}
for (const source of [
  '{{&html}}\n', '{{~&html~}}\n', '{{& html}}\n', '{{{html}}}\n',
  'A {{~! note~}} B\n', 'A {{~!-- note --~}} B\n',
  '{{echo "a ( b )"}}\n', "{{echo 'a ( b )'}}\n",
  '{{hash value="a ( b )"}}\n', '{{echo (echo "a ( b )")}}\n',
  '{{echo "a as |x| b"}}\n', '{{hash value="a as |x| b"}}\n',
]) test(`dialect semantics: ${JSON.stringify(source)}`, () => prove(source));

for (const source of ['  {{>multiline}}\n', '<div>\n  {{>multiline}}\n</div>\n', '<div>\n      {{>multiline}}\n</div>\n']) {
  test(`standalone partial indentation is runtime data: ${JSON.stringify(source)}`, () => prove(source));
}

test('whitespace-only inverse branches still produce output', async () => {
  await prove('A{{#if ok}}B{{else}} {{/if}}C\n', false, { ...view, ok: false });
});

test('conditional class fragments retain token boundaries in both branches', async () => {
  for (const value of ['a{{#if ok}}b{{else}} {{/if}}c', 'a{{#if ok}} {{else}}b{{/if}}c', 'button{{#if ok}}-active{{/if}}']) {
    const source = `<p class="${value}">x</p>\n`;
    for (const ok of [true, false]) for (const options of optionsMatrix) {
      const output = await prettier.format(source, { parser: 'handlebars', plugins: [plugin as never], ...options });
      const before = render(source, { ...view, ok }).match(/class="([^"]*)"/)![1];
      const after = render(output, { ...view, ok }).match(/class="([^"]*)"/)![1];
      assert.equal(before.replace(/[\t\n\f\r ]+/g, ' ').trim(), after.replace(/[\t\n\f\r ]+/g, ' ').trim());
      assert.equal(await prettier.format(output, { parser: 'handlebars', plugins: [plugin as never], ...options }), output);
    }
  }
});
