import {handle,signup} from '../../_lib/newsletter.js';
export const onRequest=({request,env})=>request.method==='POST'?handle(signup,request,env):new Response('Method not allowed',{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
