"""Verify the additive migration preserves meals, opinions and review photos."""
import sqlite3
from pathlib import Path

con = sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys=ON')
for migration in sorted(Path('drizzle').glob('*.sql')):
    if migration.name.startswith('0009_'):
        break
    con.executescript(migration.read_text())
con.execute("INSERT INTO users(id,google_subject,email,created_at) VALUES('u','google-u','fixture@example.invalid','2026-01-01')")
for group in ['home', 'work']:
    con.execute("INSERT INTO collections(id,name,owner_user_id,created_at) VALUES(?,?, 'u','2026-01-01')", (group,group))
visits = [('v1','home','同名餐廳','mong_kok'), ('v2','home','同名餐廳','mong_kok'), ('v3','home','同名餐廳','tsim_sha_tsui'), ('v4','work','同名餐廳','mong_kok'), ('v5','home','同名 餐廳','mong_kok'), ('v6','home','無地區',None)]
for id, group, name, district in visits:
    con.execute("INSERT INTO reviews(id,owner_id,collection_id,restaurant,district,dining_date,food,created_at,updated_at) VALUES(?,'u',?,?,?,'2026-01-01','飯','2026-01-01','2026-01-01')",(id,group,name,district))
    con.execute("INSERT INTO photos(id,review_id,owner_id,collection_id,object_key,data_base64,content_type,original_name,created_at) VALUES(?,?,'u',?,'unchanged-key','fixture-base64','image/jpeg','food.jpg','2026-01-01')",('p'+id,id,group))
    con.execute("INSERT INTO review_opinions(id,review_id,author_id,comment,score,created_at,updated_at) VALUES(?,?,'u','私人評語',3.5,'2026-01-01','2026-01-01')",('o'+id,id))
before_photos = con.execute('SELECT * FROM photos ORDER BY id').fetchall()
before_opinions = con.execute('SELECT * FROM review_opinions ORDER BY id').fetchall()
before_reviews = con.execute('SELECT * FROM reviews ORDER BY id').fetchall()
con.executescript(Path('drizzle/0009_restaurant_branch_profiles.sql').read_text())
assert con.execute('SELECT count(*) FROM restaurant_branches').fetchone()[0] == 5
assert con.execute('SELECT count(*) FROM reviews WHERE restaurant_id IS NULL').fetchone()[0] == 0
assert con.execute("SELECT restaurant_id FROM reviews WHERE id='v1'").fetchone() == con.execute("SELECT restaurant_id FROM reviews WHERE id='v2'").fetchone()
assert before_photos == con.execute('SELECT * FROM photos ORDER BY id').fetchall()
assert before_opinions == con.execute('SELECT * FROM review_opinions ORDER BY id').fetchall()
assert before_reviews == [row[:-1] for row in con.execute('SELECT * FROM reviews ORDER BY id').fetchall()]
assert con.execute('PRAGMA foreign_key_check').fetchall() == []
foreign_id = con.execute("SELECT restaurant_id FROM reviews WHERE id='v4'").fetchone()[0]
try:
    con.execute("UPDATE reviews SET restaurant_id=? WHERE id='v1'",(foreign_id,))
    raise AssertionError('Cross-group branch assignment accepted')
except sqlite3.IntegrityError:
    pass
print('Migration passed: exact branch separation, group isolation, reviews/opinions/photos unchanged, valid foreign keys.')

con.execute("INSERT INTO reviews(id,owner_id,collection_id,restaurant,district,dining_date,food,created_at,updated_at) VALUES('legacy','u','home','過渡版本餐廳','mong_kok','2026-01-01','飯','2026-01-01','2026-01-01')")
assert con.execute("SELECT restaurant_id FROM reviews WHERE id='legacy'").fetchone()[0]
con.execute("UPDATE reviews SET restaurant='過渡版本另一分店' WHERE id='legacy'")
assert con.execute("SELECT b.name FROM restaurant_branches b JOIN reviews r ON r.restaurant_id=b.id WHERE r.id='legacy'").fetchone()[0]=='過渡版本另一分店'
print('Rolling-release legacy writes also remain linked.')

before_profiles = con.execute('SELECT * FROM restaurant_branches ORDER BY id').fetchall()
con.executescript(Path('drizzle/0010_restaurant_openrice_link.sql').read_text())
after_profiles = con.execute('SELECT * FROM restaurant_branches ORDER BY id').fetchall()
assert before_profiles == [row[:-1] for row in after_profiles]
assert all(row[-1] == '' for row in after_profiles)
assert before_photos == con.execute('SELECT * FROM photos ORDER BY id').fetchall()
assert before_opinions == con.execute('SELECT * FROM review_opinions ORDER BY id').fetchall()
assert con.execute('PRAGMA foreign_key_check').fetchall() == []
print('OpenRice migration passed: empty optional links, all branch metadata, opinions and photos preserved.')

# Cleanup is limited to newly added address/cover enrichment columns.
kept = ['id','collection_id','name','district','openrice_url','review_state','review_notes','checked_at','manual_lock','version','created_at','updated_at']
con.execute("UPDATE restaurant_branches SET openrice_url='https://www.openrice.com/en/hongkong/r-amico-1890-mong-kok-western-pizza-r445102',checked_at='2026-11-03T00:00:00Z',version=7 WHERE id=(SELECT restaurant_id FROM reviews WHERE id='v1')")
kept_sql = 'SELECT '+','.join(kept)+' FROM restaurant_branches ORDER BY id'
before_kept = con.execute(kept_sql).fetchall()
before_all_reviews = con.execute('SELECT * FROM reviews ORDER BY id').fetchall()
con.executescript(Path('drizzle/0011_remove_unused_restaurant_enrichment.sql').read_text())
assert before_kept == con.execute(kept_sql).fetchall()
assert set(row[1] for row in con.execute('PRAGMA table_info(restaurant_branches)')) == set(kept)
assert before_all_reviews == con.execute('SELECT * FROM reviews ORDER BY id').fetchall()
assert before_photos == con.execute('SELECT * FROM photos ORDER BY id').fetchall()
assert before_opinions == con.execute('SELECT * FROM review_opinions ORDER BY id').fetchall()
assert con.execute('PRAGMA foreign_key_check').fetchall() == []
print('Cleanup passed: only 8 unused columns removed; identity, links, verification dates, locks, versions, reviews and food photos preserved.')

before_fallback = con.execute('SELECT * FROM restaurant_branches ORDER BY id').fetchall()
con.executescript(Path('drizzle/0012_restaurant_foodpanda_fallback.sql').read_text())
after_fallback = con.execute('SELECT * FROM restaurant_branches ORDER BY id').fetchall()
assert before_fallback == [row[:-1] for row in after_fallback]
assert all(row[-1] == '' for row in after_fallback)
assert before_all_reviews == con.execute('SELECT * FROM reviews ORDER BY id').fetchall()
assert before_photos == con.execute('SELECT * FROM photos ORDER BY id').fetchall()
assert before_opinions == con.execute('SELECT * FROM review_opinions ORDER BY id').fetchall()
print('Foodpanda fallback migration passed: optional labeled links; all existing data preserved.')

