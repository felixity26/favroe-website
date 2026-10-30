(() => {
 const form=document.querySelector('#newsletter-form');if(!form)return;
 const input=form.querySelector('[name=email]'),button=form.querySelector('button[type=submit]'),status=form.querySelector('#newsletter-status');
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(button.disabled)return;
  if(!input.validity.valid){input.setAttribute('aria-invalid','true');status.textContent='Please enter a valid email address.';input.focus();return;}
  input.removeAttribute('aria-invalid');button.disabled=true;form.setAttribute('aria-busy','true');status.textContent='One moment—we’re preparing your confirmation.';
  try{
   const response=await fetch('/api/newsletter/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:input.value,website:form.elements.website.value,consentVersion:'2026-10-30-v1',source:location.pathname}),signal:AbortSignal.timeout(20000)});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Please try again shortly.');
   status.textContent=result.message;input.value='';
  }catch(error){status.textContent=error.name==='TimeoutError'?'The request took longer than expected. Check your inbox before trying again.':error.message==='Failed to fetch'?'We couldn’t connect. Check your connection and try again.':error.message;}
  finally{button.disabled=false;form.removeAttribute('aria-busy');}
 });
 input.addEventListener('input',()=>input.removeAttribute('aria-invalid'));
})();
