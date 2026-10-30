export async function onRequest({next}){
 const response=await next(),headers=new Headers(response.headers);
 headers.set('Cache-Control','no-store');headers.set('X-Robots-Tag','noindex,nofollow');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('X-Content-Type-Options','nosniff');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 return new Response(response.body,{status:response.status,headers});
}
