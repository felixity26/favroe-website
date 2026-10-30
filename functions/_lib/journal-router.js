import {fail,imageType} from './journal-content.js';
import {checkOrigin,readJSON,login,requireSession,session,sessionCookie} from './journal-auth.js';
import {createEntry,saveEntry,detail,listEntries,transition,getVersion,getEntry,publishedEntries,publishedEntry} from './journal-store.js';
import {indexPage,articlePage} from './journal-render.js';
const secure={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...secure,'Content-Type':'application/json','X-Robots-Tag':'noindex, nofollow',...extra}});
const html=(body,env,privatePage=false,status=200)=>new Response(body,{status,headers:{...secure,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",...(privatePage||env.JOURNAL_PREVIEW==='true'?{'X-Robots-Tag':'noindex, nofollow'}:{})}});
export async function journalAPI({request,env}){try{
 const path=new URL(request.url).pathname.replace(/^\/api\/journal\/?/,'').replace(/\/$/,'');
 if(request.method==='POST')checkOrigin(request);
 if(path==='login'&&request.method==='POST'){const r=await login(request,env);return json({role:r.role},200,{'Set-Cookie':r.cookie});}
 if(path==='logout'&&request.method==='POST')return json({ok:true},200,{'Set-Cookie':sessionCookie(request,'',0)});
 const user=await requireSession(request,env),db=env.JOURNAL_DB;
 if(path==='session'&&request.method==='GET')return json(user);
 if(path==='entries'&&request.method==='GET')return json({entries:await listEntries(db)});
 if(path==='entries'&&request.method==='POST')return json(await createEntry(db,await readJSON(request),user.actor),201);
 let m=path.match(/^entries\/([a-f0-9-]{36})(?:\/(action))?$/);
 if(m){if(!m[2]&&request.method==='GET')return json(await detail(db,m[1]));if(!m[2]&&request.method==='PUT'){checkOrigin(request);return json(await saveEntry(db,m[1],await readJSON(request),user.actor));}if(m[2]&&request.method==='POST')return json(await transition(db,m[1],await readJSON(request),user));}
 m=path.match(/^versions\/([a-f0-9-]{36})$/);if(m&&request.method==='GET')return json(await getVersion(db,m[1]));
 if(path==='media'&&request.method==='POST'){
  if(Number(request.headers.get('Content-Length')||0)>750*1024)fail('Maximum image size is 750 KB.',413);
  const reader=request.body?.getReader();if(!reader)fail('Image required.');let chunks=[],length=0;while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>750*1024){await reader.cancel();fail('Maximum image size is 750 KB.',413);}chunks.push(r.value);}const bytes=new Uint8Array(length);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}const mime=imageType(bytes),id=crypto.randomUUID();
  const result=await db.prepare('INSERT INTO journal_media(id,mime,bytes,created) SELECT ?,?,?,? WHERE (SELECT COALESCE(SUM(length(bytes)),0) FROM journal_media)+? <= 104857600').bind(id,mime,bytes.buffer,new Date().toISOString(),bytes.length).run();if(!result.meta.changes)fail('Journal image storage is full. Contact the technical owner.',507);return json({id,mime,bytes:bytes.length,url:`/journal-media/${id}`},201);
 }
 return json({error:'Route or method not found.'},404);
 }catch(e){return json({error:e.status?e.message:'The journal could not save this request. Please try again.'},e.status||500);}}
export async function journalPublic({request,env}){try{
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const p=new URL(request.url).pathname.replace(/\/$/,'');if(!env.JOURNAL_DB)fail('Journal not configured.',503);
 if(p==='/journal')return html(indexPage(await publishedEntries(env.JOURNAL_DB),env),env);
 const slug=p.slice('/journal/'.length);if(!/^[a-z0-9-]+$/.test(slug))fail('Not found',404);const e=await publishedEntry(env.JOURNAL_DB,slug);if(!e)fail('Not found',404);
 return html(articlePage(e,env),env);
 }catch(e){return new Response(e.status===404?'Not found':'Journal unavailable',{status:e.status||503,headers:{...secure,'X-Robots-Tag':'noindex'}});}}
export async function journalPreview({request,env}){try{
 await requireSession(request,env);const url=new URL(request.url),id=url.pathname.split('/').filter(Boolean)[1],e=await getEntry(env.JOURNAL_DB,id),v=await getVersion(env.JOURNAL_DB,url.searchParams.get('version')||e.head);if(v.entry_id!==e.id)fail('Not found',404);
 return html(articlePage({...e,document:v.document},env,{preview:true,version:v.id}),env,true);
 }catch(e){return new Response(e.status===401?'Private preview. Sign in at /journal-studio/.':'Preview unavailable',{status:e.status||500,headers:{...secure,'X-Robots-Tag':'noindex, nofollow'}});}}
export async function journalMedia({request,env}){try{
 const id=new URL(request.url).pathname.split('/').filter(Boolean)[1];if(!/^[a-f0-9-]{36}$/.test(id))fail('Not found',404);
 const publicRef=await env.JOURNAL_DB.prepare('SELECT r.media FROM journal_media_refs r JOIN journal_entries e ON e.published=r.revision WHERE r.media=? LIMIT 1').bind(id).first();
 if(!publicRef&&!await session(request,env))fail('Not found',404);
 const row=await env.JOURNAL_DB.prepare('SELECT mime,bytes FROM journal_media WHERE id=?').bind(id).first();if(!row)fail('Not found',404);
 const bytes=row.bytes instanceof ArrayBuffer?row.bytes:new Uint8Array(row.bytes);return new Response(bytes,{headers:{...secure,'Content-Type':row.mime,'X-Robots-Tag':publicRef?'noindex':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }catch(e){return new Response('Not found',{status:e.status||404,headers:secure});}}
export async function journalSitemap({request,env,next}){
 const base=await next();if(!env.JOURNAL_DB)return base;
 const xml=await base.text();if(!xml.includes('</urlset>'))return new Response('Sitemap unavailable',{status:503});
 const entries=await publishedEntries(env.JOURNAL_DB),origin=env.FAVROE_PUBLIC_ORIGIN||'https://favroe.com';
 // Preserve the existing base sitemap; journal content is derived only from published version pointers.
 const add=`<url><loc>${origin}/journal/</loc></url>`+entries.map(e=>`<url><loc>${origin}/journal/${e.slug}/</loc><lastmod>${e.updated.slice(0,10)}</lastmod></url>`).join('');
 return new Response(xml.replace('</urlset>',`${add}</urlset>`),{headers:{...secure,'Content-Type':'application/xml',...(env.JOURNAL_PREVIEW==='true'?{'X-Robots-Tag':'noindex,nofollow'}:{})}});
}
