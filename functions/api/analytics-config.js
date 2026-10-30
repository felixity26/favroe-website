import {analyticsConfig} from '../_lib/seo-preparation.js';
export const onRequestGet=({env})=>Response.json(analyticsConfig(env),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
