import {readFile,writeFile} from 'node:fs/promises';
const page=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const header=page.match(/<header class="site-header[\s\S]*?<\/header>/)?.[0];
const footer=page.match(/<footer class="favroe-footer[\s\S]*?<\/footer>/)?.[0];
if(!header||!footer)throw Error('Approved header/footer not found; inspect before changing the shared shell.');
await writeFile(new URL('../functions/_lib/journal-shell.js',import.meta.url),'// Generated from the approved existing site. Do not redraw the logo or footer.\nexport const header='+JSON.stringify(header)+';\nexport const footer='+JSON.stringify(footer)+';\n');
