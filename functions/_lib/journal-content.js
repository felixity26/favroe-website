export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
export function safeLink(url){
 if(typeof url!=='string'||/[\u0000-\u0020\\]/.test(url))return false;
 if(/^\/(?!\/)/.test(url))return true;
 try{return ['https:','http:'].includes(new URL(url).protocol);}catch{return false;}
}
export function inline(s){
 // Plain text/limited Markdown only. Never accept HTML, styles or script-bearing URLs.
 const tokens=String(s).split(/(\[[^\]\n]{1,300}\]\([^\s)]+\)|\*\*[^*\n]+\*\*)/g);
 return tokens.map(t=>{let m=t.match(/^\[([^\]]+)\]\(([^)]+)\)$/);if(m)return safeLink(m[2])?`<a href="${escapeHTML(m[2])}"${/^https?:/.test(m[2])?' rel="noopener noreferrer"':''}>${escapeHTML(m[1])}</a>`:escapeHTML(m[1]);if(t.startsWith('**')&&t.endsWith('**'))return `<strong>${escapeHTML(t.slice(2,-2))}</strong>`;return escapeHTML(t);}).join('');
}
export function parseImage(line){return line.match(/^!\[([^\]]+)\]\(\/journal-media\/([a-f0-9-]{36})(?:\s+"([^"\n]*)")?\)$/);}
export function mediaReferences(doc){return [...new Set([doc.cover?.id,...doc.body.split('\n').map(l=>parseImage(l.trim())?.[2])].filter(Boolean))];}
export function validateDocument(input){
 const str=(key,min,max)=>{const s=typeof input[key]==='string'?input[key].trim():'';if(s.length<min||s.length>max)fail(`${key}: use ${min}–${max} characters.`);return s;};
 const title=str('title',1,160),summary=str('summary',1,400),description=str('description',1,240),body=str('body',1,50000);
 if(body.split('\n').length>1200)fail('Article has too many lines.');
 for(const line of body.split('\n'))if(line.trim().startsWith('![')&&!parseImage(line.trim()))fail('Body images need uploaded image IDs, alt text and optional captions.');
 let cover=null;if(input.cover?.id){if(!/^[a-f0-9-]{36}$/.test(input.cover.id)||!input.cover.alt?.trim()||input.cover.alt.length>300)fail('Cover needs a valid upload and descriptive alt text.');cover={id:input.cover.id,alt:input.cover.alt.trim(),caption:String(input.cover.caption||'').slice(0,500)};}
 const links=Array.isArray(input.links)?input.links:[];if(links.length>6)fail('Choose up to six related links.');
 const cleanLinks=links.map(x=>{if(!safeLink(x.href)||!String(x.label||'').trim())fail('Related links need a label and safe destination.');return {label:String(x.label).slice(0,160),href:String(x.href).slice(0,1000)};});
 return {title,summary,description,body,cover,links:cleanLinks,source:String(input.source||'').slice(0,1000),reviewNote:String(input.reviewNote||'').slice(0,2000)};
}
export function renderBody(body){
 let html='',paragraph=[],list=null;const flush=()=>{if(paragraph.length){html+=`<p>${inline(paragraph.join(' '))}</p>`;paragraph=[];}if(list){html+=`</${list}>`;list=null;}};
 for(const raw of body.split('\n')){const line=raw.trim();if(!line){flush();continue;}const img=parseImage(line);if(img){flush();html+=`<figure><img loading="lazy" src="/journal-media/${img[2]}" alt="${escapeHTML(img[1])}">${img[3]?`<figcaption>${escapeHTML(img[3])}</figcaption>`:''}</figure>`;continue;}
 const h=line.match(/^(#{1,3})\s+(.+)$/);if(h){flush();const level=Math.max(2,h[1].length);html+=`<h${level}>${inline(h[2])}</h${level}>`;continue;}
 const li=line.match(/^(?:([-*])|\d+\.)\s+(.+)$/);if(li){if(paragraph.length){html+=`<p>${inline(paragraph.join(' '))}</p>`;paragraph=[];}const type=li[1]?'ul':'ol';if(list!==type){if(list)html+=`</${list}>`;list=type;html+=`<${list}>`;}html+=`<li>${inline(li[2])}</li>`;continue;}
 if(list){html+=`</${list}>`;list=null;}paragraph.push(line);
 }flush();return html;
}
export function imageType(bytes){
 if(bytes.length>750*1024||bytes.length<12)fail('Upload a JPEG, PNG or WebP image no larger than 750 KB.');
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x))return 'image/png';
 if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';
 fail('Only JPEG, PNG and WebP images are accepted. SVG/HTML uploads are not accepted.');
}
