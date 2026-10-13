import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { translateInterface, normalizeInterfacePhrase } from '../src/lib/translateInterface.js';
import persianUiPhrases from '../src/lib/persianUiPhrases.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const technical=new Set(['BizCTRL','Biz','CTRL','BIZCTRL ·','⌘K','-SM','field_key','PDF','CSV','A4','branch_1','supplier_code','Asia/Riyadh','YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY','bar','x','SAVE20','SA...','05xxxxxxxx','+966 5x xxx xxxx','123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ']);
const exempt=s=>technical.has(s)||/^(?:(?:dark:)?text-[a-z]+-\d+\s*)+$/.test(s)||/^https?:\/\//.test(s)||/^[\w.+-]+@[\w.-]+\.[a-z]+$/i.test(s)||/^(SKU|INV|PUR|EMP)-[\d-]+$/.test(s);
const candidates=new Map();let scannedFiles=0;
function collect(source,file){
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function visit(node){let text;
  if(ts.isJsxText(node)) text=node.text;
  if(ts.isJsxAttribute(node)&&['placeholder','title','aria-label','alt'].includes(node.name.text)&&node.initializer&&ts.isStringLiteral(node.initializer))text=node.initializer.text;
  if(ts.isPropertyAssignment(node)&&['label','title','description','message','text'].includes(node.name?.text)&&ts.isStringLiteral(node.initializer))text=node.initializer.text;
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(ast)!=='console'&&['success','error','info','warning'].includes(node.expression.name.text)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))text=node.arguments[0].text;
  if(text){text=normalizeInterfacePhrase(text);if(/[A-Za-z]/.test(text)&&!/[\u0600-\u06ff]/.test(text))candidates.set(text,[...new Set([...(candidates.get(text)||[]),file])]);}
  ts.forEachChild(node,visit);
 }
 visit(ast);
}
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const target=path.join(dir,entry.name);if(entry.isDirectory()){if(!['dev','fixtures'].includes(entry.name))walk(target);}else if(/\.[jt]sx$/.test(target)&&!target.includes('.test.')){scannedFiles++;collect(fs.readFileSync(target,'utf8'),path.relative(root,target));}
}}
walk(path.join(root,'src'));
const remaining=[...candidates].filter(([phrase])=>translateInterface(phrase,'fa')===phrase);
const unresolved=remaining.filter(([phrase])=>!exempt(phrase)).map(([phrase,files])=>({phrase,files}));
const report={scope:'Static JSX text, text attributes, labelled configuration and literal toast messages. Dynamic/server messages, generated PDFs and user-entered data need separate runtime review.',scannedFiles,reviewedPersianEntries:Object.keys(persianUiPhrases).length,staticCandidates:candidates.size,translatedCandidates:candidates.size-remaining.length,technicalExceptions:remaining.filter(([phrase])=>exempt(phrase)).map(([phrase])=>phrase),unresolved};
fs.writeFileSync(path.join(root,'reports/persian-interface-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(unresolved.length)process.exitCode=1;
