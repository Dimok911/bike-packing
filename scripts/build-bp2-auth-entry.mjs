import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=path.join(root,'standalone/bp2-auth-entry');
const {build}=createRequire(path.join(source,'package.json'))('esbuild');
const output=path.resolve(process.argv[2]||path.join(root,'.tmp/bp2-auth-entry'));
if(!output.startsWith(root+path.sep))throw Error('Output outside release checkout');
try{await fs.stat(output);throw Error('Never overwrite an existing artifact');}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(path.join(output,'bp2-auth-entry'),{recursive:true});
await build({entryPoints:[path.join(source,'src/app/bp2-confirmation-entry.js')],outfile:path.join(output,'bp2-auth-entry/entry.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
const css=await fs.readFile(path.join(source,'styles.css'));
if(createHash('sha256').update(css).digest('hex')!=='dabdfee44e54dae470b028cb1e5d6afe8543c93d6017e0f98ab3db3a95b73cfd')throw Error('Published CSS baseline changed');
await fs.writeFile(path.join(output,'bp2-auth-entry/styles.css'),css);
let html=await fs.readFile(path.join(source,'bp2-auth-entry.html'),'utf8');
html=html.replace('./styles.css','/bp2-auth-entry/styles.css').replace('./src/app/bp2-confirmation-entry.js','/bp2-auth-entry/entry.js');
await fs.writeFile(path.join(output,'bp2-auth-entry.html'),html);
const files=[];
for(const name of ['bp2-auth-entry.html','bp2-auth-entry/entry.js','bp2-auth-entry/styles.css']){
 const bytes=await fs.readFile(path.join(output,name));files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({scope:'bp2-independent-auth-entry',mainApplicationChanged:false,files},null,2));
console.log(JSON.stringify({output,files}));
