import { readFileSync, readdirSync } from 'node:fs';
const ROOT='/Users/thanhhhtt/repos/mikademy/web26a/project/backend';
let K; for (const f of readdirSync(ROOT+'/postman').sort()) { if(!f.endsWith('.postman_environment.json'))continue; const h=JSON.parse(readFileSync(ROOT+'/postman/'+f,'utf8')).values.find(v=>v.key==='firebaseApiKey'&&v.value); if(h){K=h.value;break;} }
const login=async(e)=>(await(await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:'Passw0rd!',returnSecureToken:true})})).json());
const ra=await login('hocvien-a@test.dev'), r2=await login('hocvien-a2@test.dev');
const api=async(m,p,t,b)=>{const r=await fetch('http://localhost:3000'+p,{method:m,headers:{Authorization:`Bearer ${t}`,...(b?{'Content-Type':'application/json'}:{})},...(b?{body:JSON.stringify(b)}:{})});const x=await r.text();return[r.status,x?JSON.parse(x):null];};
await new Promise(r=>setTimeout(r,6000));
const [,o1]=await api('POST','/organizations',r2.idToken,{name:'T A',slug:`ta-${Date.now()}`});
console.log('loi moi 1:', (await api('POST',`/organizations/${o1.id}/invites`,r2.idToken,{toUserId:ra.localId}))[0]);
await new Promise(r=>setTimeout(r,9000));
const [,o2]=await api('POST','/organizations',r2.idToken,{name:'T B',slug:`tb-${Date.now()}`});
console.log('loi moi 2:', (await api('POST',`/organizations/${o2.id}/invites`,r2.idToken,{toUserId:ra.localId}))[0]);
console.log('ORGS='+o1.id+','+o2.id);
