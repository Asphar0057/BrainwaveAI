import { markdownToNoteHtml, htmlToBlocks, blocksToHtml } from '../../utils/noteContent';

test('code, charts, and images survive Markdown import and a save/reopen cycle', () => {
  const source = '# Notes\n\n```python\n  if a < b:\n    print("**literal** & <div>")\n```\n\n```mermaid\ngraph TD\n A --> B\n```\n\n```graphjson\n{"type":"line","series":[{"points":[{"x":0,"y":1}]}]}\n```\n\n![Example](data:image/png;base64,aGVsbG8=)';
  const blocks = htmlToBlocks(markdownToNoteHtml(source));
  const reopened = htmlToBlocks(blocksToHtml(blocks));
  for (const result of [blocks, reopened]) {
    const code = result.filter(b => b.type === 'code');
    expect(code.map(b => b.properties.language)).toEqual(['python', 'mermaid', 'graphjson']);
    expect(code[0].content).toBe('  if a < b:\n    print("**literal** & <div>")');
    expect(code[1].content).toContain('A --> B');
    expect(result.some(b => b.content.includes('<img'))).toBe(true);
  }
});

test('standalone HTML image and divider survive import', () => {
  const blocks = htmlToBlocks('<img src="https://example.test/image.png" alt="Graph"><hr>');
  expect(blocks).toHaveLength(2);
  expect(blocks[0].content).toContain('<img');
  expect(blocks[1].type).toBe('divider');
});

test('unsafe HTML is removed and code is escaped', () => {
  expect(markdownToNoteHtml('<img src=x onerror="alert(1)"><script>alert(1)</script>')).not.toMatch(/onerror|<script/);
  expect(blocksToHtml([{type:'code',content:'<script>alert(1)</script>'}])).toContain('&lt;script&gt;');
});

test('math delimiters are preserved without interpreting code as math', () => {
  const html = markdownToNoteHtml('Mean \\(\\mu\\)\n\n```python\nprint("$price$")\n```');
  expect(html).toContain('$\\mu$');
  expect(htmlToBlocks(html).find(b => b.type === 'code').content).toBe('print("$price$")');
});

test('tables remain tables after saving and reopening', () => {
  const blocks = htmlToBlocks(markdownToNoteHtml('| X | Y |\n|---|---|\n| 1 | 2 |'));
  expect(htmlToBlocks(blocksToHtml(blocks))[0].properties.tableData.rows).toEqual([['X','Y'],['1','2']]);
});

test('nested lists preserve structure and inline code without duplicating children', () => {
 const blocks = htmlToBlocks(markdownToNoteHtml('- Parent with `<div>`\n  - Child detail\n  - Second detail'));
 expect(blocks).toHaveLength(1);
 const html = blocksToHtml(blocks);
 expect(html.match(/Child detail/g)).toHaveLength(1);
 expect(html).toContain('<code>&lt;div&gt;</code>');
});
