import assert from 'node:assert/strict';
import vm from 'node:vm';
import prettier from 'prettier';
import * as plugin from '../dist/plugin.js';
import { test } from 'vitest';
import handlebars from 'handlebars';
const render = (s, v) => handlebars.compile(s)(v);

const format = (source, options = {}) => prettier.format(source, { parser: 'handlebars', plugins: [plugin], ...options });
const result = source => vm.runInNewContext(source.slice(source.indexOf('>') + 1, source.lastIndexOf('</script>')) + '\n;result', { await: value => value }, { timeout: 1000 });
const cases = [
  ['dynamic quoted key', 'const result={"{{key}}":"{{value}}"};', {key:'foo-bar',value:'hello'}, {}],
  ['grouped runtime expression', 'const result=2*({{{expr}}});', {expr:'1+2'}, {}],
  ['collision with a source marker', 'const result=["__POLIKLOT_HBS_PLACEHOLDER_0__","{{value}}"];', {value:'hello'}, {}],
  ['classic-script await identifier', 'const result=await\n("{{value}}");', {value:'hello'}, {}],
  ['multiline literal whitespace', 'const result=`first\n  second  \nlast`;', {}, {}],
  ['disabled embedding preserves literal source', 'const result=`first\n  second  \nlast`;', {}, {embeddedLanguageFormatting:'off'}],
];
for (const [name, body, view, options] of cases) {
  test(`shared embedding preserves runtime result: ${name}`, async () => {
    const source = '<script>\n' + body + '\n</script>\n';
    const before = JSON.stringify(result(render(source, view)));
    for (const printWidth of [20, 80]) {
      const settings = {...options, printWidth};
      const once = await format(source, settings);
      assert.equal(JSON.stringify(result(render(once, view))), before);
      assert.equal(await format(once, settings), once);
      assert.equal(await format(await format(once, settings), settings), once);
    }
  });
}

for (const attrs of ['type="application/json"', 'type="{{type}}"', 'lang="ts"', 'type="\u00a0module"']) {
  test('unsupported/dynamic attribute keeps original body: '+attrs, async()=>{
    const body='\n  const result = { a:1 };  \n ';
    const source='<script '+attrs+'>'+body+'</script>\n';
    const once=await format(source);
    assert.equal(once.slice(once.indexOf('>')+1,once.lastIndexOf('</script>')),body);
    assert.equal(await format(once),once);
  });
}
for (const closing of ['</script data=">">','</SCRIPT >','</script/>']) {
  test('shared boundary scanner preserves complete raw closing shape: '+closing,async()=>{
    const source='<script>\nconst result={a:1};\n'+closing+'\n<p>tail</p>\n';
    const once=await format(source);
    assert.ok(once.includes(closing));
    assert.ok(once.includes('<p>tail</p>'));
    assert.equal(await format(once),once);
  });
}
test('script escaped/double-escaped bodies are not handed to Babel',async()=>{
  const body='\n<!--<script>\nconst a=1;\n</script>-->\nconst b=2;\n';
  const source='<script>'+body+'</script>\n<p>tail</p>\n';
  const once=await format(source);
  assert.ok(once.includes(body));
  assert.ok(once.includes('<p>tail</p>'));
  assert.equal(await format(once),once);
});
test('caller parser and preprocessing remain in the native embedding lifecycle',async()=>{
  const {parsers} = await import('prettier/plugins/babel');
  let preprocessed=0, parsed=0;
  const custom={parsers:{babel:{...parsers.babel,
    preprocess(text){preprocessed++;return text;},
    parse(text,options){parsed++;return parsers.babel.parse(text,options);},
  }}};
  await format('<script>\nconst result="{{value}}";\n</script>\n',{plugins:[plugin,custom]});
  assert.equal(preprocessed,1);
  assert.equal(parsed,1);
});
test('missing caller-printer markers select exact source fallback',async()=>{
  const {parsers} = await import('prettier/plugins/babel');
  const custom={parsers:{babel:{...parsers.babel,astFormat:'test-drop-marker'}},printers:{'test-drop-marker':{print:()=> 'const result = "lost";'}}};
  const source='<script>\n  const result="{{value}}";  \n</script>\n';
  assert.equal(await format(source,{plugins:[plugin,custom]}),source);
});
for (const endOfLine of ['lf','crlf','cr','auto']) {
  test('fallback owns exact body lines with EOL '+endOfLine,async()=>{
    const body='\n  const result = `first\n  second  \nlast`;  \n\t';
    const source='<div>\n<script>'+body+'</script>\n</div>\n';
    const eol=endOfLine==='crlf'||endOfLine==='auto'?'\r\n':endOfLine==='cr'?'\r':'\n';
    const input=endOfLine==='auto'?source.replaceAll('\n','\r\n'):source;
    const options={embeddedLanguageFormatting:'off',useTabs:true,endOfLine};
    const once=await format(input,options);
    assert.ok(once.includes(body.replaceAll('\n',eol)));
    assert.equal(await format(once,options),once);
  });
}
test('concurrent embedded bodies keep independent placeholder maps',async()=>{
  const source='<script>\nconst result={"{{key}}":"{{value}}"};\n</script>\n';
  const outputs=await Promise.all(Array.from({length:20},(_,i)=>format(source,{printWidth:20+i})));
  for(const [i,output] of outputs.entries()) assert.equal(JSON.stringify(result(render(output,{key:'key-'+i,value:String(i)}))),JSON.stringify({['key-'+i]:String(i)}));
});

test('quoted interpolation is not moved to a conflicting quote style',async()=>{
  const source='<script>\nconst result="{{value}}";\n</script>\n';
  const once=await format(source,{singleQuote:true});
  assert.equal(once,source);
  assert.equal(JSON.stringify(result(render(once,{value:"it's safe in double quotes"}))),JSON.stringify(result(render(source,{value:"it's safe in double quotes"}))));
});
