import prettier from 'prettier';
import * as plugin from '../dist/plugin.js';

const caseCount = Number.parseInt(process.env.HBS_FUZZ_CASES ?? '400', 10);
let seed = Number.parseInt(process.env.HBS_FUZZ_SEED ?? '20260429', 10) >>> 0;

function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function pick(items) {
  return items[Math.floor(random() * items.length)];
}

function maybe(value, probability = 0.5) {
  return random() < probability ? value : '';
}

const atoms = [
  'Hello, {{name}}!',
  '{{ value }}',
  '{{~ value ~}}',
  '{{#if active}}active{{else}}inactive{{/if}}',
  '{{#if ok~}} yes {{~else~}} no {{~/if}}',
  '{{#each items as |item index|}}<span>{{ item.name }}</span>{{else}}empty{{/each}}',
  '{{> card title=title data=(lookup . "payload")}}',
  '{{> (lookup . "partialName") data=this}}',
  '{{*log value level="debug"}}',
  '{{~*log value~}}',
  '{{#> layout title=title}}<main>{{body}}</main>{{/layout}}',
  '{{#> layout}}\n  <main>{{body}}</main>',
  '{{#*decorate value=true}}<span>{{label}}</span>{{/decorate}}',
  '{{#*inline "badge"}}<span>{{label}}</span>{{/inline}}',
  '{{!-- <span>{{ price }}</span> --}}',
  '{{!--\n  <span>{{ price }}</span>\n--}}',
  '<!-- {{ not a mustache }} -->',
  '<div class="box {{#if active}}box--active{{/if}} {{ extra }}"></div>',
  '<div data-json=\'{"html":"<b>","value":"{{raw}}"}\'></div>',
  '<input disabled type=text>',
  '<br></br>',
  '<x-thing />',
  '<p>1 < 2 and {{ value }}</p>',
  '<script>const tpl = "</script><div>{{value}}</div>";</script>',
  '<script>const state={count:1};function read(){return state.count}</script>',
  '<style>.banner{color:red;background:#fff}</style>',
  '{{{{raw}}}}<div>{{ notParsed }}</div>{{{{/raw}}}}',
  '{{{{raw}}}}<div>{{ notParsed }}</div>',
  '{{! prettier-ignore }}\n<div    class="raw">{{value}}</div>',
  '{{!-- prettier-ignore-start --}}\n<div    class="raw">{{value}}</div>\n{{!-- prettier-ignore-end --}}',
  '<{{#if link}}a href="{{href}}"{{else}}div{{/if}} class="box">{{label}}</{{#if link}}a{{else}}div{{/if}}>',
];

const wrappers = [
  (body) => body,
  (body) => `<section>${body}</section>`,
  (body) => `<div class="wrap">\n${body}\n</div>`,
  (body) => `{{#if visible}}\n${body}\n{{/if}}`,
  (body) => `{{#unless hidden}}\n${body}\n{{else}}\nFallback\n{{/unless}}`,
  (body) => `{{!-- header --}}\n${body}\n{{!-- footer --}}`,
];

function buildGeneratedCase(index) {
  const pieceCount = 1 + Math.floor(random() * 5);
  const separator = pick(['', ' ', '\n', '\n\n']);
  const pieces = [];

  for (let pieceIndex = 0; pieceIndex < pieceCount; pieceIndex += 1) {
    pieces.push(`${maybe('  ', 0.2)}${pick(atoms)}${maybe('  ', 0.2)}`);
  }

  const body = pieces.join(separator);
  return {
    id: `generated-${index}`,
    source: pick(wrappers)(body),
  };
}

const fixedCases = atoms.map((source, index) => ({ id: `fixed-${index}`, source }));
const generatedCases = Array.from({ length: Number.isFinite(caseCount) ? Math.max(caseCount, 0) : 400 }, (_, index) =>
  buildGeneratedCase(index),
);
const cases = [...fixedCases, ...generatedCases];
const failures = [];

for (const testCase of cases) {
  try {
    const firstPass = await prettier.format(testCase.source, {
      parser: 'handlebars',
      plugins: [plugin],
      printWidth: 80,
    });
    const secondPass = await prettier.format(firstPass, {
      parser: 'handlebars',
      plugins: [plugin],
      printWidth: 80,
    });

    if (secondPass !== firstPass) {
      failures.push({
        id: testCase.id,
        type: 'non-idempotent',
        source: testCase.source,
        firstPass,
        secondPass,
      });
    }
  } catch (error) {
    failures.push({
      id: testCase.id,
      type: 'crash',
      source: testCase.source,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  }
}

if (failures.length > 0) {
  console.error(`Fuzz check failed: ${failures.length}/${cases.length} cases failed.`);

  failures.slice(0, 10).forEach((failure) => {
    console.error(`\n--- ${failure.id} ${failure.type} ---`);
    console.error(failure.source);

    if (failure.type === 'crash') {
      console.error(failure.error);
      return;
    }

    console.error('--- first pass ---');
    console.error(failure.firstPass);
    console.error('--- second pass ---');
    console.error(failure.secondPass);
  });

  process.exit(1);
}

console.log(`Fuzz check passed: ${cases.length} cases, seed=${process.env.HBS_FUZZ_SEED ?? '20260429'}.`);
