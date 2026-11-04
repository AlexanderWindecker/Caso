import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createWord,createBugWord} from '../src/document.js';
import {newReport} from '../src/model.js';
import {wordLogo} from '../src/word-branding.js';

for(const [kind,exportWord] of [['casos',createWord],['bugs',createBugWord]]){
  test(`Word de ${kind} usa las fuentes de la plantilla y el logo con el título del informe`,async()=>{
    const report=newReport();report.title='Proyecto & validación <JIRA-123>';
    report.app='Aplicación que no es el título';report.version='9.2';
    report.cases[0].bug.enabled=true;report.cases[0].bug.title='Error al guardar';
    const zip=await JSZip.loadAsync(await(await exportWord(report)).arrayBuffer());
    const header=await zip.file('word/header1.xml').async('string');
    assert.ok(header.includes('Proyecto &amp; validación &lt;JIRA-123&gt;'));
    assert.ok(!header.includes(report.app));assert.ok(!header.includes(report.version));
    assert.ok(header.includes('<w:tbl>'));assert.ok(header.includes('D9D9D9'));
    assert.equal((header.match(/<w:drawing>/g)||[]).length,1);
    const rels=await zip.file('word/_rels/header1.xml.rels').async('string');
    const target=rels.match(/Target="([^\"]+\.jpg)"/)[1];
    const imagePath='word/'+target.replace(/^\.\.\//,'');
    assert.deepEqual(await zip.file(imagePath).async('uint8array'),new Uint8Array(Buffer.from(wordLogo.split(',')[1],'base64')));
    const styles=await zip.file('word/styles.xml').async('string');
    const style=id=>styles.match(new RegExp(`<w:style[^>]*w:styleId="${id}"[\\s\\S]*?</w:style>`))[0];
    assert.ok(styles.match(/<w:docDefaults>[\s\S]*?<w:rFonts[^>]*w:ascii="Times New Roman"/));
    for(const id of ['Title','Heading1','Heading2'])assert.ok(style(id).includes('w:ascii="Arial"'),id);
    assert.ok(header.includes('w:ascii="Times New Roman"'));
    const xml=await zip.file('word/document.xml').async('string');
    assert.ok(xml.includes('<w:headerReference w:type="default"'));
    assert.ok(!xml.includes('<w:titlePg'));
  });
}
