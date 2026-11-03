// Run after bundling the Worker to /private/tmp/closerice-restaurant-test-bundle.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
const options = {
  modules: true, modulesRoot: '/private/tmp/closerice-restaurant-test-bundle', scriptPath: '/private/tmp/closerice-restaurant-test-bundle/index.js',
  compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'],
  d1Databases: ['DB'],
  bindings: { RESTAURANT_ENRICHMENT_TOKEN_HASH: createHash('sha256').update('test-only-service-token').digest('base64url'), RESTAURANT_ENRICHMENT_COLLECTION_IDS: 'home' },
};
const mf = new Miniflare(options);
const session = (token) => ({ Cookie: `__Secure-closerice_session=${token}` });
const service = { Authorization: 'Bearer test-only-service-token' };
const url = (path) => `https://bunbun.space/closerice/api/${path}`;
const call = (path, headers = {}, body) => mf.dispatchFetch(url(path), { method: body ? 'PATCH' : 'GET', headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
try {
  const db = await mf.getD1Database('DB');
  for (const file of (await readdir('drizzle')).filter((name) => name.endsWith('.sql')).sort()) {
    for (const statement of (await readFile(`drizzle/${file}`, 'utf8')).split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  for (const id of ['admin', 'editor', 'viewer', 'outsider']) {
    await db.prepare("INSERT INTO users(id,google_subject,email,created_at) VALUES(?,?,?,'2026-01-01')").bind(id,id,`${id}@example.invalid`).run();
    await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(`test-${id}`).digest('base64url'),id,Date.now()+1000000).run();
  }
  await db.prepare("INSERT INTO site_admins VALUES('admin','2026-01-01')").run();
  for (const id of ['home','work']) await db.prepare("INSERT INTO collections VALUES(?,?,'admin','2026-01-01')").bind(id,id).run();
  for (const [id,role] of [['editor','editor'],['viewer','viewer']]) await db.prepare("INSERT INTO memberships VALUES('home',?,?,'2026-01-01')").bind(id,role).run();
  for (const [id,group] of [['branch-home','home'],['branch-work','work']]) {
    await db.prepare("INSERT INTO restaurant_branches(id,collection_id,name,district,created_at,updated_at) VALUES(?,?,'測試餐廳','mong_kok','2026-01-01','2026-01-01')").bind(id,group).run();
    await db.prepare("INSERT INTO reviews(id,owner_id,collection_id,restaurant_id,restaurant,food,dining_date,created_at,updated_at) VALUES(?,'admin',?,?,'測試餐廳','私人訂單','2026-01-01','2026-01-01','2026-01-01')").bind(`review-${id}`,group,id).run();
  }
  assert.equal((await call('enrichment/restaurants')).status,403);
  assert.equal((await call('enrichment/restaurants',session('test-editor'))).status,403);
  assert.equal((await call('enrichment/restaurants',{Authorization:'Bearer wrong'})).status,403);
  const pending = await (await call('enrichment/restaurants',service)).json();
  assert.deepEqual(pending.restaurants.map((r)=>r.id),['branch-home']);
  assert(!JSON.stringify(pending).includes('私人訂單'));
  assert.equal((await call('enrichment/restaurants/branch-work',service)).status,404);
  assert.equal((await call('restaurants/branch-home',{...session('test-outsider'),'X-Collection-Id':'home'})).status,403);
  assert.equal((await call('restaurants/branch-work',{...session('test-editor'),'X-Collection-Id':'home'})).status,404);
  const details = { expectedVersion:1,address:'旺角測試街1號',region:'香港',sourceUrl:'https://restaurant.example/address',reviewState:'verified' };
  assert.equal((await call('enrichment/restaurants/branch-home',service,details)).status,200);
  assert.equal((await call('enrichment/restaurants/branch-home',service,details)).status,409);
  assert.equal((await call('enrichment/restaurants/branch-home',service,{...details,expectedVersion:2,address:'其他分店'})).status,409);
  assert.equal((await call('enrichment/restaurants/branch-home',service,{...details,expectedVersion:2,coverPhotoUrl:'https://lh3.googleusercontent.com/photo',coverSourceUrl:'https://www.google.com/maps/',coverAttribution:'Google',coverLicense:'claimed',coverUsage:'licensed'})).status,400);
  assert.equal((await call('enrichment/restaurants/branch-home',service,{...details,expectedVersion:2,coverPhotoUrl:'https://127.0.0.1/image.jpg'})).status,400);
  assert.equal((await call('enrichment/restaurants/branch-home',service,{...details,expectedVersion:2,name:'unauthorized rename'})).status,400);
  assert.equal((await call('restaurants/branch-home',{...session('test-viewer'),'X-Collection-Id':'home',Origin:'https://bunbun.space'},{...details,expectedVersion:2})).status,403);
  assert.equal((await call('enrichment/restaurants/branch-home',{...session('test-admin'),Origin:'https://evil.example'},{...details,expectedVersion:2})).status,403);
  assert.equal((await call('restaurants/branch-home',{...session('test-editor'),'X-Collection-Id':'home',Origin:'https://bunbun.space'},{...details,expectedVersion:2,address:'成員確認地址'})).status,200);
  assert.equal((await call('enrichment/restaurants/branch-home',service,{...details,expectedVersion:3})).status,409);
  assert.equal((await (await call('enrichment/restaurants',service)).json()).restaurants.length,0);
  assert.equal((await db.prepare('SELECT count(*) n FROM admin_audit').first()).n,2);
  assert.equal((await db.prepare('SELECT count(*) n FROM reviews').first()).n,2);
  const createHeaders = { ...session('test-editor'), 'X-Collection-Id':'home', Origin:'https://bunbun.space', 'Content-Type':'application/json' };
  const meal = { restaurant:'測試餐廳', district:'mong_kok', food:'飯', diningDate:'2026-11-03', comment:'測試', score:3.5, channel:'dine_in' };
  const created = await mf.dispatchFetch(url('reviews'), { method:'POST', headers:createHeaders, body:JSON.stringify(meal) });
  assert.equal(created.status,201);
  const newId = (await created.json()).id;
  assert.equal((await db.prepare('SELECT restaurant_id id FROM reviews WHERE id=?').bind(newId).first()).id,'branch-home');
  const edited = await call(`reviews/${newId}`,createHeaders,{...meal,restaurant:'另一間餐廳'});
  assert.equal(edited.status,200);
  assert.notEqual((await db.prepare('SELECT restaurant_id id FROM reviews WHERE id=?').bind(newId).first()).id,'branch-home');
  const agentCreated = await mf.dispatchFetch(url('agent/reviews'), {method:'POST',headers:createHeaders,body:JSON.stringify(meal)});
  assert.equal(agentCreated.status,201);
  const list = await (await call('reviews',createHeaders)).json();
  assert(list.reviews.every((review)=>review.restaurantProfile?.id === review.restaurantId));
  await mf.setOptions({ ...options, bindings:{} });
  assert.equal((await call('enrichment/restaurants',service)).status,403);
  console.log('API passed: authentication, group scopes, private data isolation, validation, stale writers, manual protection, audit, service disabled by default.');
} finally { await mf.dispose(); }
