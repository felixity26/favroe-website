import {fail,validateDocument,mediaReferences} from './journal-content.js';
const uid=()=>crypto.randomUUID(),now=()=>new Date().toISOString();
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
export async function getEntry(db,id){const e=await first(db,'SELECT * FROM journal_entries WHERE id=?',id);if(!e)fail('Entry not found.',404);return e;}
export async function getVersion(db,id){const v=await first(db,'SELECT * FROM journal_versions WHERE id=?',id);if(!v)fail('Version not found.',404);return {...v,document:JSON.parse(v.document)};}
async function refs(db,doc){const ids=mediaReferences(doc);if(ids.length>20)fail('Use no more than 20 images per article.');for(const id of ids)if(!await first(db,'SELECT id FROM journal_media WHERE id=?',id))fail('An image is missing. Upload it before saving.');return ids;}
const refStatements=(db,revision,ids)=>ids.map(id=>db.prepare('INSERT INTO journal_media_refs(revision,media) SELECT ?,? WHERE EXISTS(SELECT 1 FROM journal_versions WHERE id=?)').bind(revision,id,revision));
export async function createEntry(db,input,actor){
 const slug=String(input.slug||'');if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>100||['index','preview','admin','new','feed'].includes(slug))fail('Use a short lowercase URL name with hyphens.');
 const doc=validateDocument(input),ids=await refs(db,doc),id=uid(),revision=uid(),created=now();
 if(await first(db,'SELECT id FROM journal_entries WHERE slug=?',slug))fail('That URL already belongs to an entry.',409);
 await db.batch([
 db.prepare('INSERT INTO journal_entries(id,slug,head,created) VALUES(?,?,?,?)').bind(id,slug,revision,created),
 db.prepare('INSERT INTO journal_versions(id,entry_id,document,created,actor) VALUES(?,?,?,?,?)').bind(revision,id,JSON.stringify(doc),created,actor),
 ...refStatements(db,revision,ids),
 db.prepare('INSERT INTO journal_events(id,entry_id,revision,action,actor,created) VALUES(?,?,?,?,?,?)').bind(uid(),id,revision,'created',actor,created)]);
 return detail(db,id);
}
export async function saveEntry(db,id,input,actor){
 const e=await getEntry(db,id);if(input.baseRevision!==e.head)fail('A newer version exists. Reload before saving.',409);
 if(input.slug&&input.slug!==e.slug)fail('The URL is stable and cannot be changed.');
 const doc=validateDocument(input),ids=await refs(db,doc),revision=uid(),created=now();
 const results=await db.batch([
 db.prepare('INSERT INTO journal_versions(id,entry_id,document,created,actor) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM journal_entries WHERE id=? AND head=?)').bind(revision,id,JSON.stringify(doc),created,actor,id,e.head),
 ...refStatements(db,revision,ids),
 db.prepare("UPDATE journal_entries SET head=?,state='draft' WHERE id=? AND head=?").bind(revision,id,e.head),
 db.prepare("INSERT INTO journal_events(id,entry_id,revision,action,actor,created,note) SELECT ?,?,?,'saved',?,?,? WHERE EXISTS(SELECT 1 FROM journal_entries WHERE id=? AND head=?)").bind(uid(),id,revision,actor,created,input.restoredFrom?`Restored from ${input.restoredFrom}`:'',id,revision)]);
 if(!results[0].meta.changes)fail('A newer version exists. Reload before saving.',409);return detail(db,id);
}
export async function detail(db,id){const e=await getEntry(db,id),v=await getVersion(db,e.head);const history=await db.prepare('SELECT id,created,actor FROM journal_versions WHERE entry_id=? ORDER BY created DESC,id DESC').bind(id).all();const events=await db.prepare('SELECT revision,action,actor,created,note FROM journal_events WHERE entry_id=? ORDER BY created DESC,rowid DESC').bind(id).all();const approval=await first(db,'SELECT actor,approved,note FROM journal_approvals WHERE revision=?',e.head);return {...e,document:v.document,history:history.results,events:events.results,approval};}
export async function listEntries(db){const r=await db.prepare('SELECT e.*,v.document FROM journal_entries e JOIN journal_versions v ON v.id=e.head ORDER BY e.created DESC').all();return r.results.map(e=>({...e,title:JSON.parse(e.document).title,document:undefined}));}
export async function transition(db,id,input,user){
 const e=await getEntry(db,id);if(input.revision!==e.head)fail('The entry changed. Review the latest version.',409);
 const action=input.action,note=String(input.note||'').trim().slice(0,2000),time=now();let sql,args=[],before=[];
 if(action==='restore'){const v=await getVersion(db,input.version);if(v.entry_id!==id)fail('Version does not belong to this entry.');return saveEntry(db,id,{...v.document,baseRevision:e.head,restoredFrom:v.id},user.actor);}
 if(action==='submit'){if(e.state!=='draft')fail('Only a draft can be submitted.',409);sql="UPDATE journal_entries SET state='ready-for-review' WHERE id=? AND head=? AND state='draft'";args=[id,e.head];}
 else if(action==='approve'){
  if(user.role!=='founder')fail('Only the founder can approve an exact version.',403);if(e.state!=='ready-for-review')fail('Submit this draft for review first.',409);if(!note)fail('Record a short approval note.');
  before.push(db.prepare("INSERT INTO journal_approvals(revision,actor,approved,note) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM journal_entries WHERE id=? AND head=? AND state='ready-for-review') ON CONFLICT(revision) DO UPDATE SET actor=excluded.actor,approved=excluded.approved,note=excluded.note").bind(e.head,user.actor,time,note,id,e.head));
  sql="UPDATE journal_entries SET state='approved' WHERE id=? AND head=? AND state='ready-for-review'";args=[id,e.head];
 }else if(action==='publish'){
  if(e.state!=='approved')fail('Founder approval of this exact version is required.',403);
  sql="UPDATE journal_entries SET published=head,state='published',first_published=COALESCE(first_published,?),updated=? WHERE id=? AND head=? AND state='approved' AND EXISTS(SELECT 1 FROM journal_approvals WHERE revision=journal_entries.head)";args=[time,time,id,e.head];
 }else if(action==='changes'){
  if(user.role!=='founder')fail('Only the founder can request changes.',403);if(!note)fail('Add the changes you need.');sql="UPDATE journal_entries SET state='draft' WHERE id=? AND head=?";args=[id,e.head];
 }else if(action==='unpublish'){
  if(user.role!=='founder')fail('Founder authorization is required to unpublish.',403);if(!e.published)fail('This entry is not published.',409);if(!note)fail('Record why the entry is being unpublished.');sql="UPDATE journal_entries SET published=NULL,state='draft' WHERE id=? AND head=? AND published IS NOT NULL";args=[id,e.head];
 }else fail('Unknown action.');
 const result=await db.batch([...before,db.prepare(sql).bind(...args),db.prepare('INSERT INTO journal_events(id,entry_id,revision,action,actor,created,note) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(uid(),id,e.head,action,user.actor,time,note)]);
 if(!result[before.length].meta.changes)fail('The entry changed. Reload and review again.',409);return detail(db,id);
}
export async function publishedEntries(db){const r=await db.prepare('SELECT e.*,v.document FROM journal_entries e JOIN journal_versions v ON v.id=e.published ORDER BY e.first_published DESC').all();return r.results.map(e=>({...e,document:JSON.parse(e.document)}));}
export async function publishedEntry(db,slug){const e=await first(db,'SELECT e.*,v.document FROM journal_entries e JOIN journal_versions v ON v.id=e.published WHERE e.slug=?',slug);return e?{...e,document:JSON.parse(e.document)}:null;}
