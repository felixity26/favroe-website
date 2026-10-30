(() => {
 const form=document.querySelector('[data-action]'),status=document.querySelector('#newsletter-result'),button=form.querySelector('button');
 const token=new URLSearchParams(location.hash.slice(1)).get('token');
 // Fragments do not reach hosting logs. Remove the token from the visible address bar.
 history.replaceState(null,'',location.pathname);
 if(!/^[a-f0-9]{64}$/.test(token||'')){status.textContent='Please use the link in your email. If it has expired, request a new signup link.';button.disabled=true;return;}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(button.disabled)return;button.disabled=true;status.textContent='One moment, please.';
  try{
   const response=await fetch('/api/newsletter/'+form.dataset.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),signal:AbortSignal.timeout(45000)});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Please try again shortly.');
   status.textContent=result.message;form.hidden=true;
   if(result.unsubscribe){const link=document.querySelector('#unsubscribe-link');link.href=result.unsubscribe;link.hidden=false;}
  }catch(error){status.textContent=error.name==='TimeoutError'?'This is taking longer than expected. Please try again shortly.':error.message;button.disabled=false;}
 });
})();
