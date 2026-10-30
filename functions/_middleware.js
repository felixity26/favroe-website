import {verificationMarkup} from './_lib/seo-preparation.js';
// URL-prefix verification ALTERNATIVE. DNS Domain verification needs no site code.
export async function onRequest(context) {
 const response=await context.next();
 if(context.request.method!=='GET'||new URL(context.request.url).pathname!=='/'||response.status!==200||!response.headers.get('content-type')?.includes('text/html')||!context.env.GSC_VERIFICATION)return response;
 const original=await response.text(),html=verificationMarkup(original,context.env.GSC_VERIFICATION);
 const headers=new Headers(response.headers);
 // A transformed body must not retain stale byte validators. All SEO tags remain intact.
 if(html!==original){headers.delete('content-length');headers.delete('etag');}
 return new Response(html,{status:response.status,headers});
}
