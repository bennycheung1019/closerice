// Run after bundling the Worker to /private/tmp/closerice-restaurant-test-bundle.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
const options = {
  modules: true, modulesRoot: '/private/tmp/closerice-restaurant-test-bundle', scriptPath: '/private/tmp/closerice-restaurant-test-bundle/index.js',
  compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'],
  d1Databases: ['DB'],
  bindings: { RESTAURANT_ENRICHMENT_TOKEN_HASH: createHash('sha256').update('test-only-service-token').digest('base64url'), RESTAURANT_ENRICHMENT_COLLECTION_IDS: 'home', RESTAURANT_ENRICHMENT_EXCLUDED_IDS: ' branch-excluded ' },
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
  for (const [id,group] of [['branch-home','home'],['branch-work','work'],['branch-excluded','home']]) {
    await db.prepare("INSERT INTO restaurant_branches(id,collection_id,name,district,created_at,updated_at) VALUES(?,?,?,'mong_kok','2026-01-01','2026-01-01')").bind(id,group,id === 'branch-excluded' ? '測試忽略餐廳' : '測試餐廳').run();
    await db.prepare("INSERT INTO reviews(id,owner_id,collection_id,restaurant_id,restaurant,food,dining_date,created_at,updated_at) VALUES(?,'admin',?,?,'測試餐廳','私人訂單','2026-01-01','2026-01-01','2026-01-01')").bind(`review-${id}`,group,id).run();
  }
  assert.equal((await call('enrichment/restaurants')).status,403);
  assert.equal((await call('enrichment/restaurants',session('test-editor'))).status,403);
  assert.equal((await call('enrichment/restaurants',{Authorization:'Bearer wrong'})).status,403);
  const pending = await (await call('enrichment/restaurants',service)).json();
  assert.deepEqual(pending.restaurants.map((r)=>r.id),['branch-home']);
  assert(!JSON.stringify(pending).includes('私人訂單'));
  assert.equal((await call('enrichment/restaurants/branch-work',service)).status,404);
  assert.equal((await call('enrichment/restaurants/branch-excluded',service)).status,404);
  assert.equal((await call('enrichment/restaurants/branch-excluded',{...session('test-admin'),Origin:'https://bunbun.space'},{expectedVersion:1,reviewState:'verified'})).status,404);
  assert.equal((await call('restaurants/branch-excluded',{...session('test-editor'),'X-Collection-Id':'home'})).status,200);
  assert.equal((await db.prepare("SELECT version FROM restaurant_branches WHERE id='branch-excluded'").first()).version,1);
  assert.equal((await call('restaurants/branch-home',{...session('test-outsider'),'X-Collection-Id':'home'})).status,403);
  assert.equal((await call('restaurants/branch-work',{...session('test-editor'),'X-Collection-Id':'home'})).status,404);
  const openriceUrl = 'https://www.openrice.com/en/hongkong/r-amico-1890-mong-kok-western-pizza-r445102';
  const details = { expectedVersion:1,openriceUrl,reviewState:'verified',reviewNotes:'已核對分店主頁' };
  assert.equal((await call('enrichment/restaurants/branch-home',service,{expectedVersion:1,reviewState:'verified'})).status,400);
  assert.equal((await call('enrichment/restaurants/branch-home',service,details)).status,200);
  const linked = (await (await call('enrichment/restaurants/branch-home',service)).json()).restaurant;
  assert.equal(linked.openriceUrl,openriceUrl);
  assert.equal('address' in linked,false);
  assert.equal('coverPhotoUrl' in linked,false);
  assert.equal('sourceUrl' in linked,false);
  await db.prepare("UPDATE restaurant_branches SET checked_at='2026-01-01' WHERE id='branch-home'").run();
  assert.equal((await (await call('enrichment/restaurants',service)).json()).restaurants.length,0,'a matched OpenRice link completes enrichment even without a cover');
  assert.equal((await call('enrichment/restaurants/branch-home',service,{...details,expectedVersion:2,openriceUrl:openriceUrl+'/photos/all'})).status,400);
  assert.equal((await call('enrichment/restaurants/branch-home',service,details)).status,409);
  assert.equal((await call('enrichment/restaurants/branch-home',service,{...details,expectedVersion:2,openriceUrl:'https://www.openrice.com/en/hongkong/r-sen-ryo-tsim-sha-tsui-japanese-sushi-sashimi-r188922'})).status,409);
  assert.equal((await call('enrichment/restaurants/branch-home',service,{...details,expectedVersion:2,coverPhotoUrl:'https://lh3.googleusercontent.com/photo',coverSourceUrl:'https://www.google.com/maps/',coverAttribution:'Google',coverLicense:'claimed',coverUsage:'licensed'})).status,400);
  assert.equal((await call('enrichment/restaurants/branch-home',service,{...details,expectedVersion:2,coverPhotoUrl:'https://127.0.0.1/image.jpg'})).status,400);
  assert.equal((await call('enrichment/restaurants/branch-home',service,{...details,expectedVersion:2,name:'unauthorized rename'})).status,400);
  assert.equal((await call('restaurants/branch-home',{...session('test-viewer'),'X-Collection-Id':'home',Origin:'https://bunbun.space'},{...details,expectedVersion:2})).status,403);
  assert.equal((await call('enrichment/restaurants/branch-home',{...session('test-admin'),Origin:'https://evil.example'},{...details,expectedVersion:2})).status,403);
  const { openriceUrl: unusedOpenriceUrl, ...olderClientDetails } = details;
  assert.equal((await call('restaurants/branch-home',{...session('test-editor'),'X-Collection-Id':'home',Origin:'https://bunbun.space'},{...olderClientDetails,expectedVersion:2,reviewNotes:'成員確認分店'})).status,200);
  assert.equal((await db.prepare("SELECT openrice_url FROM restaurant_branches WHERE id='branch-home'").first()).openrice_url,openriceUrl);
  assert.equal((await call('enrichment/restaurants/branch-home',service,{...details,expectedVersion:3})).status,409);
  assert.equal((await (await call('enrichment/restaurants',service)).json()).restaurants.length,0);
  assert.equal((await db.prepare('SELECT count(*) n FROM admin_audit').first()).n,2);
  assert.equal((await db.prepare('SELECT count(*) n FROM reviews').first()).n,3);
  assert.equal((await call('restaurants/branch-home',{...session('test-editor'),'X-Collection-Id':'home',Origin:'https://bunbun.space'},{expectedVersion:3,openriceUrl:'',reviewState:'pending'})).status,200);
  assert.equal((await db.prepare("SELECT openrice_url FROM restaurant_branches WHERE id='branch-home'").first()).openrice_url,'');
  const foodpandaUrl = 'https://www.foodpanda.hk/zh/restaurant/pu6a/asia-star-chicken-rice-mong-kok-pu6a';
  await db.prepare("UPDATE restaurant_branches SET manual_lock=0,checked_at='2026-01-01' WHERE id='branch-home'").run();
  assert.deepEqual((await (await call('enrichment/restaurants',service)).json()).restaurants.map(r=>r.id),['branch-home']);
  assert.equal((await call('enrichment/restaurants/branch-home',service,{expectedVersion:4,foodpandaUrl,reviewState:'verified'})).status,200);
  await db.prepare("UPDATE restaurant_branches SET checked_at='2026-01-01' WHERE id='branch-home'").run();
  assert.equal((await (await call('enrichment/restaurants',service)).json()).restaurants.length,0,'Foodpanda fallback completes the reference-link check');
  assert.equal((await call('enrichment/restaurants/branch-home',service,{expectedVersion:5,foodpandaUrl:'https://www.foodpanda.hk/zh/restaurant/v3ea/hong-kong-restaurant'})).status,409);
  assert.equal((await call('restaurants/branch-home',{...session('test-editor'),'X-Collection-Id':'home',Origin:'https://bunbun.space'},{expectedVersion:5,reviewNotes:'保留使用者指定 Foodpanda 連結'})).status,200);
  const fallback = (await (await call('restaurants/branch-home',{...session('test-editor'),'X-Collection-Id':'home'})).json()).restaurant;
  assert.equal(fallback.foodpandaUrl,foodpandaUrl);
  assert.equal(fallback.openriceUrl,'');
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
  // District correction uses an exact saved OpenRice page and updates only the
  // linked branch and its meal records in one guarded transaction.
  await db.prepare("UPDATE restaurant_branches SET openrice_url=?,manual_lock=0 WHERE id='branch-home'").bind(openriceUrl).run();
  await db.prepare("INSERT INTO photos(id,review_id,owner_id,collection_id,object_key,content_type,original_name,created_at) VALUES('district-photo','review-branch-home','admin','home','district-photo','image/jpeg','meal.jpg','2026-01-01')").run();
  await db.prepare("INSERT INTO restaurant_branches(id,collection_id,name,district,created_at,updated_at) VALUES('branch-collision','home','測試餐廳','central','2026-01-01','2026-01-01')").run();
  const linkedDistricts = await (await call('enrichment/restaurants/linked?limit=50',service)).json();
  assert(linkedDistricts.restaurants.some((r)=>r.id==='branch-home' && r.openriceUrl===openriceUrl));
  assert(!linkedDistricts.restaurants.some((r)=>r.id==='branch-excluded'));
  assert(!JSON.stringify(linkedDistricts).includes('私人訂單'));
  const beforeDistrict = (await (await call('enrichment/restaurants/branch-home',service)).json()).restaurant;
  const districtPayload = {expectedVersion:beforeDistrict.version,district:'prince_edward',openriceUrl,evidenceNote:'已讀取分店頁面並確認地區為太子'};
  const auditBefore = (await db.prepare('SELECT count(*) n FROM admin_audit').first()).n;
  assert.equal((await call('enrichment/restaurants/branch-home/district',service,{...districtPayload,district:'not_a_district'})).status,400);
  assert.equal((await call('enrichment/restaurants/branch-home/district',service,{...districtPayload,openriceUrl:'https://www.openrice.com/en/hongkong/r-sen-ryo-tsim-sha-tsui-japanese-sushi-sashimi-r188922'})).status,400);
  assert.equal((await call('enrichment/restaurants/branch-home/district',service,{...districtPayload,district:'central'})).status,409,'same-name branch in target district requires manual reconciliation');
  const correction = await call('enrichment/restaurants/branch-home/district',service,districtPayload);
  assert.equal(correction.status,200);
  const correctionBody = await correction.json();
  assert.equal(correctionBody.changed,true);
  assert.equal(correctionBody.restaurant.district,'prince_edward');
  assert(correctionBody.updatedReviews>=2);
  const corrected = (await (await call('enrichment/restaurants/branch-home',service)).json()).restaurant;
  assert.equal(corrected.district,'prince_edward');
  assert.equal(corrected.version,beforeDistrict.version+1);
  assert.equal((await db.prepare("SELECT count(*) n FROM reviews WHERE restaurant_id='branch-home' AND district!='prince_edward'").first()).n,0);
  assert.equal((await db.prepare("SELECT count(*) n FROM photos WHERE id='district-photo' AND review_id='review-branch-home'").first()).n,1);
  assert.equal((await db.prepare('SELECT count(*) n FROM admin_audit').first()).n,auditBefore+1);
  assert.equal((await call('enrichment/restaurants/branch-home/district',service,districtPayload)).status,409,'stale version must not rewrite reviews');
  const noop = await call('enrichment/restaurants/branch-home/district',service,{...districtPayload,expectedVersion:corrected.version});
  assert.equal(noop.status,200);
  assert.equal((await noop.json()).changed,false);
  await db.prepare("UPDATE restaurant_branches SET manual_lock=1 WHERE id='branch-home'").run();
  assert.equal((await call('enrichment/restaurants/branch-home/district',service,{...districtPayload,expectedVersion:corrected.version,district:'mong_kok'})).status,409);
  await mf.setOptions({ ...options, bindings:{} });
  assert.equal((await call('enrichment/restaurants',service)).status,403);
  console.log('API passed: authentication, group scopes, private data isolation, validation, stale writers, manual protection, audit, service disabled by default.');
} finally { await mf.dispose(); }
