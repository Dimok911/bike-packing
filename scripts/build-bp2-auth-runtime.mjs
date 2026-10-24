import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require=createRequire(path.join(root,'standalone/bp2-auth-entry/package.json'));
const {build}=require('esbuild'),{parse}=require('acorn');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const walk=(node,visit)=>{if(!node||typeof node!=='object')return;if(node.type)visit(node);for(const [key,value]of Object.entries(node)){if(key==='start'||key==='end')continue;if(Array.isArray(value))value.forEach(n=>walk(n,visit));else if(value&&typeof value==='object')walk(value,visit);}};
const baseline=path.resolve(process.argv[2]||''),manifestPath=path.resolve(process.argv[3]||''),output=path.resolve(process.argv[4]||'');
if(!output.startsWith(root+path.sep))throw Error('Output must be inside isolated checkout');
try{await fs.stat(output);throw Error('Output already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8')),files=new Map();
for(const f of manifest.files){
 if(f.path.includes('..')||path.isAbsolute(f.path))throw Error('Invalid baseline path');
 const bytes=await fs.readFile(path.join(baseline,f.path));if(digest(bytes)!==f.sha256)throw Error('Baseline hash mismatch: '+f.path);
 files.set(f.path,bytes);
}
const runtime='chunks/personal-bp2-runtime-5u78xAH-.js',original=files.get(runtime)?.toString();
if(!original||digest(original)!=='12e986ba24815750d60cbc877bc187744b941d7a1ae7324b096a02c4cb8ed151')throw Error('Published runtime baseline changed');
const ast=parse(original,{ecmaVersion:'latest',sourceType:'module'}),factories=[];
for(const node of ast.body)if(node.type==='FunctionDeclaration'){
 const parameters=node.params.map(p=>original.slice(p.start,p.end)).join('');
 if(['requestLinkTimeoutMs','onSignedIn','authBaseUrl','onInvalidate'].every(key=>parameters.includes(key)))factories.push(node);
}
if(factories.length!==1)throw Error('Expected exactly one top-level Auth factory');
const factory=factories[0],name=factory.id.name,calls=[];
walk(ast,node=>{if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name===name)calls.push({start:node.start,end:node.end,source:original.slice(node.start,node.end)});});
if(calls.length!==1)throw Error('Unexpected Auth factory call sites');
const built=await build({stdin:{contents:'export {createPersonalAppAuth} from "./src/bp2/personal-app-auth.js";',resolveDir:path.join(root,'standalone/bp2-auth-entry'),sourcefile:'auth-runtime-adapter.js'},bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,write:false});
const adapter=Buffer.from(built.outputFiles[0].contents),tag=digest(adapter).slice(0,12),adapterPath='chunks/auth-runtime-adapter-'+tag+'.js';
const wrapper=`function ${name}(options={}){return __bp2AuthHaFactory({...options,sharedIssuerMode:"ha"})}`;
const importLine=`import {createPersonalAppAuth as __bp2AuthHaFactory} from "./${path.posix.basename(adapterPath)}";\n`;
let patched=importLine+original.slice(0,factory.start)+wrapper+original.slice(factory.end);
// Before versioning imports, prove all bytes outside the sole factory are intact.
if(patched.slice(importLine.length,importLine.length+factory.start)!==original.slice(0,factory.start)
 ||patched.slice(importLine.length+factory.start+wrapper.length)!==original.slice(factory.end))throw Error('Non-Auth bytes changed');
parse(patched,{ecmaVersion:'latest',sourceType:'module'});
const changed=new Set([runtime]),js=[...files.keys()].filter(f=>f.endsWith('.js')&&f!=='sw.js');
// Version every transitive importer so an old SW cache cannot mix module graphs.
for(let again=true;again;){again=false;for(const f of js){if(changed.has(f))continue;const text=files.get(f).toString();if([...changed].some(c=>text.includes(path.posix.basename(c)))){changed.add(f);again=true;}}}
const renames=new Map([...changed].map(f=>[f,f.replace(/\.js$/,'.authha-'+tag+'.js')]));
const rewrite=text=>{for(const [from,to]of renames)text=text.split(path.posix.basename(from)).join(path.posix.basename(to));return text;};
const artifacts=new Map([[adapterPath,adapter]]),evidence=[];
for(const f of changed){
 const old=files.get(f).toString(),next=rewrite(f===runtime?patched:old);
 parse(next,{ecmaVersion:'latest',sourceType:'module'});
 if(f!==runtime){let reverted=next;for(const [from,to]of renames)reverted=reverted.split(path.posix.basename(to)).join(path.posix.basename(from));if(reverted!==old)throw Error('Non-import bytes changed');}
 artifacts.set(renames.get(f),Buffer.from(next));evidence.push({from:f,to:renames.get(f),oldSha256:digest(old),newSha256:digest(next),kind:f===runtime?'one-auth-factory-and-imports':'module-filenames-only'});
}
for(const f of ['index.html','index.php','sw.js']){
 if(!files.has(f))continue;const before=files.get(f).toString();let after=rewrite(before);
 if(f==='sw.js'){
  const match=after.match(/const CACHE_NAME = "([^"]+)";/);if(!match)throw Error('Unknown SW cache definition');
  after=after.replace(match[0],`const CACHE_NAME = "${match[1]}:authha-${tag}";`);
 }
 if(after!==before){artifacts.set(f,Buffer.from(after));evidence.push({from:f,to:f,oldSha256:digest(before),newSha256:digest(after),kind:f==='sw.js'?'cache-generation-and-module-filenames':'module-filenames-only'});}
}
// Every relative import/preload now points at an artifact or a retained baseline.
const available=new Set([...files.keys(),...artifacts.keys()]);
for(const [name,bytes]of artifacts)if(name.endsWith('.js')){
 const tree=parse(bytes.toString(),{ecmaVersion:'latest',sourceType:'module'});
 walk(tree,node=>{if(node.type==='Literal'&&typeof node.value==='string'&&/^\.{1,2}\//.test(node.value)&&/\.js(?:\?|$)/.test(node.value)){
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(name),node.value.split('?')[0]));if(!available.has(target))throw Error('Missing module '+target);
 }});
}
await fs.mkdir(output,{recursive:true});const rows=[];
for(const [name,bytes]of artifacts){await fs.mkdir(path.dirname(path.join(output,name)),{recursive:true});await fs.writeFile(path.join(output,name),bytes);rows.push({path:name,bytes:bytes.length,sha256:digest(bytes)});}
const report={scope:'bp2-auth-runtime-adapter',tag,baseline:manifest,files:rows,evidence,factory:{name,start:factory.start,end:factory.end,calls,originalSha256:digest(original.slice(factory.start,factory.end)),outsideFactoryUnchanged:true},oldModuleFilesPreserved:true,stylesUnchanged:true};
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({output,tag,files:rows.length,bytes:rows.reduce((n,f)=>n+f.bytes,0),factory:name,calls:calls.length,changedModules:changed.size,stylesUnchanged:true}));
