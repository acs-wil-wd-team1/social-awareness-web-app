import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Offline only. No network client or database dependency is imported.
const collection = JSON.parse(readFileSync(new URL('./CauseConnect-Stage3.postman_collection.json', import.meta.url)));
const environment = JSON.parse(readFileSync(new URL('./CauseConnect-local.postman_environment.json', import.meta.url)));
const items = collection.item.flatMap(group => group.item);
const checks = JSON.parse(collection.variable.find(v => v.key === 'contractChecks').value);
const before = collection.event.find(event => event.listen === 'prerequest').script.exec.join('\n');
const after = collection.event.find(event => event.listen === 'test').script.exec.join('\n');
let assertions = 0;
function test(name, fn) { fn(); assertions++; console.log('PASS ' + name); }

const expectedCalls = [
  'GET /api/business/me', 'PUT /api/business/me', 'POST /api/campaign-images', 'POST /api/campaigns',
  'GET /api/campaigns/mine', 'GET /api/campaigns/mine/:id', 'PATCH /api/campaigns/mine/:id',
  'DELETE /api/campaigns/mine/:id', 'PATCH /api/campaigns/admin/:id/status',
  'GET /api/campaigns/admin/:id/reviews', 'PATCH /api/campaigns/admin/:id/publication',
  'DELETE /api/campaigns/admin/:id', 'GET /api/admin/users', 'PATCH /api/admin/users/:id/status',
  'GET /api/campaigns/:id/participation', 'PUT /api/campaigns/:id/participation',
  'GET /api/participations/mine', 'POST /api/campaigns/:id/enquiries', 'GET /api/business/me/enquiries',
];
const actualCalls = new Set(items.map(item => item.request.method + ' ' + item.request.url.replace('{{baseUrl}}', '').split('?')[0].replace(/{{[^}]+Id}}/g, ':id')));
test('all 19 handoff calls and current auth/read routes are represented', () => {
  expectedCalls.forEach(call => assert.ok(actualCalls.has(call), call));
  ['POST /api/auth/login','PUT /api/auth/logout','GET /api/campaigns/categories','GET /api/campaigns','GET /api/campaigns/:id','GET /api/campaigns/admin','GET /api/campaigns/admin/:id'].forEach(call => assert.ok(actualCalls.has(call), call));
});
test('every request has assertions, unique name, and redirects disabled', () => {
  assert.equal(new Set(items.map(item => item.name)).size, items.length);
  items.forEach(item => { assert.ok(checks[item.name]); assert.equal(item.protocolProfileBehavior.followRedirects, false); });
});
test('environment is blank except disabled write flag; secrets are marked', () => {
  environment.values.forEach(value => {
    assert.equal(value.value, value.key === 'allowWrites' ? 'false' : '');
    if (/Password|Token/.test(value.key)) assert.equal(value.type, 'secret');
  });
  assert.ok(!after.includes('pm.environment.set'));
  assert.ok(!after.includes('pm.collectionVariables.set'));
  assert.ok(!JSON.stringify(collection).includes('pm.sendRequest'));
});
test('all sandbox scripts compile and upload has no selected path', () => {
  new vm.Script(before); new vm.Script(after);
  items.forEach(item => item.event.forEach(event => new vm.Script(event.script.exec.join('\n'))));
  assert.deepEqual(items.find(item => item.request.body?.mode === 'formdata').request.body.formdata[0].src, []);
});

const values = {
  baseUrl:'http://127.0.0.1:3000', allowWrites:'false', isolatedFixtureAcknowledgement:'', armedWriteRequest:'',
  publicEmail:'public@example.test', publicPassword:'not-a-real-password', businessEmail:'business@example.test', businessPassword:'not-a-real-password', adminEmail:'admin@example.test', adminPassword:'not-a-real-password',
  publicToken:'fixture.public.signature', businessToken:'fixture.business.signature', adminToken:'fixture.admin.signature',
  categoryId:7, publicUserId:21, businessUserId:22, adminUserId:23, ownerCampaignId:31, adminCampaignId:31,
  approvedCauseId:31, approvedBusinessId:32, otherOwnerCampaignId:33, pendingCampaignId:31, targetUserId:24,
  ownerVersion:'2026-10-01T00:00:00.000Z', adminVersion:'2026-10-01T00:00:00.000Z', staleVersion:'2026-09-30T00:00:00.000Z', imageId:'img_fixture_opaque',
  startDate:'2026-10-08', endDate:'2026-10-09',
};
function expect(value, negate = false, deep = false) {
  const evaluate = condition => assert.equal(Boolean(condition), !negate);
  const chain = {
    equal(other) { if(deep) { if(negate) assert.notDeepEqual(value,other); else assert.deepEqual(value,other); } else evaluate(value === other); },
    a(type) { evaluate(type === 'array' ? Array.isArray(value) : typeof value === type && value !== null); },
    include(other) { evaluate(value.includes(other)); }, above(other) { evaluate(value > other); },
    least(other) { evaluate(value >= other); }, most(other) { evaluate(value <= other); },
    match(pattern) { evaluate(pattern.test(value)); }, property(key) { evaluate(Object.prototype.hasOwnProperty.call(value,key)); },
  };
  Object.defineProperties(chain, {
    to:{get:()=>chain}, be:{get:()=>chain}, an:{get:()=>chain.a}, at:{get:()=>chain}, have:{get:()=>chain},
    not:{get:()=>expect(value,!negate,deep)}, deep:{get:()=>expect(value,negate,true)},
  });
  return chain;
}
function sandbox(item, overrides = {}, response) {
  const env = new Map(Object.entries({...values,...overrides})); const local = new Map(); const failures = [];
  const replace = text => String(text).replace(/{{([^}]+)}}/g, (full,key) => local.has(key) ? String(local.get(key)) : env.has(key) ? String(env.get(key)) : full);
  let skipped = false;
  const pm = {
    info:{requestName:item.name}, environment:{get:key=>env.get(key),unset:key=>env.delete(key)},
    variables:{get:key=>local.has(key)?local.get(key):env.get(key),set:(key,value)=>local.set(key,value),replaceIn:replace},
    collectionVariables:{get:key=>collection.variable.find(v=>v.key===key)?.value},
    execution:{skipRequest:()=>{skipped=true;}},
    request:{...item.request,url:{toString:()=>item.request.url},headers:{get:key=>item.request.header.find(h=>h.key===key)?.value}},
    response:response && {code:response.status,headers:{get:()=>response.contentType ?? 'application/json'},text:()=>response.text ?? JSON.stringify(response.body),json:()=>JSON.parse(response.text ?? JSON.stringify(response.body))},
    test:(name,fn)=>{try{fn();}catch(error){failures.push({name,error});}}, expect,
  };
  const context=vm.createContext({pm,Date,console});
  return {env,local,failures,pm,context,get skipped(){return skipped;},runPre(){try {vm.runInContext('{'+before+'}',context); if(!skipped)item.event.filter(e=>e.listen==='prerequest').forEach(e=>vm.runInContext('{'+e.script.exec.join('\n')+'}',context));}catch(error){if(!skipped)throw error;this.skipReason=error.message;}},runPost(){vm.runInContext(after,context);}};
}
const read = items.find(item=>item.name==='Categories (existing)');
const write = items.find(item=>item.name==='Create text-only public campaign (existing branch)');
test('default blank environment blocks every request before send',()=>{
  const blank=Object.fromEntries(environment.values.map(value=>[value.key,value.value]));
  items.forEach(item=>{const s=sandbox(item,blank);s.runPre();assert.equal(s.skipped,true,item.name);});
});
test('remote, malformed, credentialed, out-of-range and unported destinations are blocked',()=>{
  ['https://example.com','http://localhost','http://127.0.0.1:65536','http://localhost:3000/','http://localhost.evil.test:3000','http://user@localhost:3000','http://127.0.0.1:3000?x=1','http://[::1]:3000'].forEach(baseUrl=>{const s=sandbox(read,{baseUrl});s.runPre();assert.equal(s.skipped,true,baseUrl);});
});
test('local reads work but writes require all three explicit safeguards',()=>{
  const r=sandbox(read);r.runPre();assert.equal(r.skipped,false);
  for(const overrides of [{},{allowWrites:'true'},{allowWrites:'true',isolatedFixtureAcknowledgement:'I created a disposable local database'},{allowWrites:'true',isolatedFixtureAcknowledgement:'I created a disposable local database',armedWriteRequest:'Wrong request'}]){const s=sandbox(write,overrides);s.runPre();assert.equal(s.skipped,true);}
  const s=sandbox(write,{allowWrites:'true',isolatedFixtureAcknowledgement:'I created a disposable local database',armedWriteRequest:write.name});s.runPre();assert.equal(s.skipped,false,s.skipReason);assert.equal(s.env.has('armedWriteRequest'),false);s.runPre();assert.equal(s.skipped,true);
});
test('unselected upload, blank token, blank ID and malformed version are blocked',()=>{
  const upload=items.find(item=>item.request.body?.mode==='formdata');
  const u=sandbox(upload,{allowWrites:'true',isolatedFixtureAcknowledgement:'I created a disposable local database',armedWriteRequest:upload.name});u.runPre();assert.equal(u.skipped,true);
  const sdk=sandbox(upload,{allowWrites:'true',isolatedFixtureAcknowledgement:'I created a disposable local database',armedWriteRequest:upload.name});
  sdk.pm.request.body={...upload.request.body,formdata:{find:fn=>upload.request.body.formdata.find(fn)}};
  sdk.runPre();assert.equal(sdk.skipped,true); // Postman's FormParamList is not a JavaScript array.
  const own=items.find(item=>item.name==='Load own campaign (loads version)');
  for(const changes of [{publicToken:''},{ownerCampaignId:''},{ownerCampaignId:'../admin'}]){const s=sandbox(own,changes);s.runPre();assert.equal(s.skipped,true);}
  const edit=items.find(item=>item.name==='Edit own campaign and resubmit');
  const s=sandbox(edit,{allowWrites:'true',isolatedFixtureAcknowledgement:'I created a disposable local database',armedWriteRequest:edit.name,ownerVersion:'2026-10-01'});s.runPre();assert.equal(s.skipped,true);
});
test('campaign dates are generated before unresolved body validation',()=>{
  const s=sandbox(write,{allowWrites:'true',isolatedFixtureAcknowledgement:'I created a disposable local database',armedWriteRequest:write.name,startDate:'',endDate:''});
  s.runPre();assert.equal(s.skipped,false,s.skipReason);assert.match(s.local.get('startDate'),/^\d{4}-\d{2}-\d{2}$/);assert.ok(s.local.get('endDate')>s.local.get('startDate'));
});

const time='2026-10-01T00:00:00.001Z';
const campaign={id:31,title:'Disposable contract fixture',description:'Created only in the disposable local integration database.',categoryId:7,category:'Environment',type:'cause',imageUrl:null,targetAudience:'Fixture users',startDate:'2026-10-08',endDate:'2026-10-09',createdBy:21,businessId:null,business:null,status:'pending',createdAt:time,updatedAt:time,review:null};
const profile={id:41,businessName:'Disposable fixture repairs',abn:null,website:'https://example.test',description:'Local integration fixture only.'};
const user={id:24,name:'Fixture',email:'fixture@example.test',role:'public',status:'active',createdAt:time};
const participation={id:51,campaignId:31,status:'joined',participatedAt:time};
const enquiry={id:61,campaignId:32,businessId:41,name:'Disposable Fixture',email:'fixture@example.test',phone:null,message:'Local test enquiry only; no email delivery expected.',createdAt:time};
const review={id:71,campaignId:31,adminId:23,action:'approved',comments:null,reviewedAt:time};
function list(key,rows){return{[key]:rows,page:1,pageSize:10,total:rows.length};}
function responseFor(item){
  const spec=checks[item.name];const s=sandbox(item);const body=item.request.body?.mode==='raw'?JSON.parse(s.pm.variables.replaceIn(item.request.body.raw)):null;
  switch(spec.kind){
    case'empty':return undefined;
    case'login':return{user:{id:spec.role==='admin'?23:spec.role==='business_owner'?22:21,name:'Fixture',email:'fixture@example.test',role:spec.role},token:'fixture.payload.signature'};
    case'categories':return{categories:[{id:7,name:'Environment'}]};
    case'campaignList':{const c={...campaign,status:spec.public?'approved':'pending'};if(spec.public)delete c.review;return list('campaigns',[c]);}
    case'campaignDetail':{const c={...campaign,id:Number(values[spec.idVariable]),status:spec.public?'approved':'pending'};if(spec.public)delete c.review;return c;}
    case'campaignCreate':case'campaignUpdate':return{campaign:{...campaign,...(spec.role==='business'?{createdBy:22,type:'business',businessId:41,business:profile}:{})}};
    case'profile':return{business:profile};
    case'image':return{imageId:'img_fixture_opaque',contentType:'image/jpeg',sizeBytes:1200,expiresAt:'2099-10-01T00:00:00.000Z'};
    case'decision':return{campaign:{id:31,status:body.status,updatedAt:time},review:{...review,action:body.status,comments:body.comments}};
    case'publication':return{campaign:{id:31,status:'pending',updatedAt:time}};
    case'reviews':return list('reviews',[review]);
    case'users':return list('users',[user]);
    case'userStatus':return{user:{...user,status:body.status}};
    case'participation':return{participation:{...participation,status:body?.status||'joined'}};
    case'participations':return list('participations',[{...participation,campaign:{id:31,title:'Fixture',type:'cause',status:'approved'}}]);
    case'enquiry':return{enquiry};
    case'enquiries':return list('enquiries',[{...enquiry,campaign:{id:32,title:'Fixture',status:'approved'}}]);
    case'error':return{status:spec.status,code:spec.codes[0],message:'Fixture failure',fieldErrors:null};
    default:throw new Error('Missing response fixture for '+spec.kind);
  }
}
test('all 41 requests accept representative contract fixtures',()=>{
  items.forEach(item=>{const spec=checks[item.name];const s=sandbox(item,{}, {status:spec.status,body:responseFor(item),...(spec.status===204?{text:''}:{})});s.runPost();assert.deepEqual(s.failures,[],item.name);});
});
test('all request assertions reject wrong HTTP status',()=>{
  items.forEach(item=>{const spec=checks[item.name];const s=sandbox(item,{}, {status:spec.status===500?200:500,body:responseFor(item),...(spec.status===204?{text:''}:{})});s.runPost();assert.ok(s.failures.length,item.name);assert.equal(s.local.size,0,'failure must not capture data');});
});
test('all JSON assertions reject HTML, malformed JSON and empty envelopes',()=>{
  items.filter(item=>checks[item.name].status!==204).forEach(item=>{
    for(const bad of [{text:'<html>not an API</html>',contentType:'text/html'},{text:'{'},{body:{}}]){const s=sandbox(item,{}, {status:checks[item.name].status,...bad});s.runPost();assert.ok(s.failures.length,item.name);assert.equal(s.local.size,0);}
  });
});
test('version, identity, privacy and envelope mismatches fail',()=>{
  const cases=[
    ['Edit own campaign and resubmit',b=>{b.campaign.updatedAt=values.ownerVersion;}],
    ['Approve fixture campaign',b=>{b.review.campaignId=999;}],
    ['Approve fixture campaign',b=>{b.campaign.updatedAt='2026-10-01T00:00:00Z';}],
    ['Load own campaign (loads version)',b=>{b.id=999;}],
    ['List accounts',b=>{b.users[0].passwordHash='must-never-leak';}],
    ['Public campaigns (Stage 3 target)',b=>{b.campaigns[0].review=review;}],
    ['My participation history',b=>{b.participations[0].campaign.id=999;}],
    ['My participation history',b=>{b.participations[0].campaign.status='pending';}],
    ['My participation history',b=>{b.participations[0].campaign.status='rejected';}],
    ['Read my participation',b=>{b.participation.campaign={id:31,title:'Private changed title'};}],
    ['Withdraw own participation',b=>{b.participation.userId=999;}],
    ['Send fixture business enquiry',b=>{b.enquiry.campaignId=999;}],
    ['List own campaigns',b=>{delete b.total;}],
    ['Pending campaign is not public',b=>{b.code='INTERNAL_SERVER_ERROR';}],
  ];
  cases.forEach(([name,mutate])=>{const item=items.find(v=>v.name===name);const body=structuredClone(responseFor(item));mutate(body);const s=sandbox(item,{}, {status:checks[name].status,body});s.runPost();assert.ok(s.failures.length,name);assert.equal(s.local.size,0);});
});
test('participation receipts and null history summaries do not require public campaign content',()=>{
  for(const name of ['Read my participation','Withdraw own participation','My participation history']) {
    const item=items.find(v=>v.name===name); const body=structuredClone(responseFor(item));
    if(name==='My participation history') body.participations[0].campaign=null;
    const s=sandbox(item,{}, {status:200,body}); s.runPost(); assert.deepEqual(s.failures,[],name);
  }
});
test('login token captures are run-local, including business role mapping',()=>{
  for(const name of ['Login public fixture (creates session)','Login business fixture (creates session)','Login admin fixture (creates session)']){
    const item=items.find(v=>v.name===name);const s=sandbox(item,{}, {status:200,body:responseFor(item)});const original=new Map(s.env);s.runPost();assert.deepEqual(s.env,original);const spec=checks[name];assert.equal(s.local.get((spec.tokenPrefix||spec.role)+'Token'),'fixture.payload.signature');
  }
});
console.log(`${assertions} offline checks passed; ${items.length} request contracts exercised. No API/database requests were made.`);
