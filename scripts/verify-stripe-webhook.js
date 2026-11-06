async function verify() {
 if(process.env.VERCEL_ENV !== 'production') { console.log('Sandbox webhook audit skipped outside Production.'); return; }
 const key=process.env.STRIPE_SECRET_KEY;
 if(!key?.startsWith('sk_test_')) throw Error('Sandbox key required');
 let after; const endpoints=[];
 do {
  const q=new URLSearchParams({limit:'100'}); if(after) q.set('starting_after',after);
  const r=await fetch('https://api.stripe.com/v1/webhook_endpoints?'+q,{headers:{Authorization:'Bearer '+key,'Stripe-Version':'2024-11-20.acacia'},signal:AbortSignal.timeout(30000)});
  if(!r.ok) throw Error('Stripe webhook audit HTTP '+r.status);
  const p=await r.json(); endpoints.push(...p.data);
  if(!p.has_more) break; after=p.data.at(-1)?.id; if(!after)throw Error('Invalid pagination');
 } while(after);
 const matches=endpoints.filter(x=>x.url==='https://www.tomoflow.app/api/stripe-webhook');
 console.log('Sandbox webhook audit: '+JSON.stringify(matches.map(x=>({id:x.id,url:x.url,status:x.status,livemode:x.livemode,events:x.enabled_events}))));
 const required=['checkout.session.completed','checkout.session.async_payment_succeeded'];
 if(!matches.some(x=>x.status==='enabled' && !x.livemode && required.every(e=>x.enabled_events.includes('*')||x.enabled_events.includes(e)))) throw Error('Required sandbox webhook success subscriptions missing');
 console.log('Sandbox webhook success subscriptions verified.');
}
if(require.main === module) verify().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports=verify;

