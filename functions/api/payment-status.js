import {paymentStatus} from '../_lib/stripe-checkout.js';
export const onRequestGet=({request,env})=>paymentStatus(request,env);
