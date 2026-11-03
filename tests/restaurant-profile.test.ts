import test from 'node:test';
import assert from 'node:assert/strict';
import { openRiceRestaurantUrl, foodpandaRestaurantUrl, restaurantReference } from '../lib/restaurant-profile';
import { restaurantDetailsInput } from '../lib/restaurant-profile-input';

test('OpenRice references are distinct exact restaurant pages, never tracking or image URLs', () => {
  const link = 'https://www.openrice.com/en/hongkong/r-amico-1890-mong-kok-western-pizza-r445102';
  assert.equal(openRiceRestaurantUrl(link), true);
  assert.equal(openRiceRestaurantUrl(''), true);
  for (const value of [link+'?tracking=1', link+'#photos', link+'/photos/all', 'javascript:alert(1)', 'https://user:password@www.openrice.com/en/hongkong/r-amico-1890-r445102', 'https://127.0.0.1/en/hongkong/r-amico-1890-r445102', 'https://openrice.com.evil.example/en/hongkong/r-fake-r1', 'https://static5.orstatic.com/photo.jpg', 'http://www.openrice.com/en/hongkong/r-fake-r1', 'https://www.openrice.com/zh/hongkong/restaurants']) {
    assert.equal(openRiceRestaurantUrl(value), false, value);
    assert.equal(restaurantDetailsInput.safeParse({ expectedVersion:1, openriceUrl:value }).success, false, value);
  }
  assert.equal(restaurantDetailsInput.parse({ expectedVersion:1, openriceUrl:link }).openriceUrl, link);
  assert.equal(restaurantDetailsInput.parse({ expectedVersion:1 }).openriceUrl, undefined);
});

test('obsolete address and cover fields are rejected', () => {
  for (const key of ['address','region','sourceUrl','coverPhotoUrl','coverSourceUrl','coverAttribution','coverLicense','coverUsage','keetaUrl']) assert.equal(restaurantDetailsInput.safeParse({expectedVersion:1,[key]:'obsolete'}).success,false,key);
});

test('Foodpanda fallback is clearly labeled and never treated as OpenRice', () => {
  const foodpandaUrl = 'https://www.foodpanda.hk/zh/restaurant/pu6a/asia-star-chicken-rice-mong-kok-pu6a';
  const openriceUrl = 'https://www.openrice.com/en/hongkong/r-amico-1890-mong-kok-western-pizza-r445102';
  assert.equal(foodpandaRestaurantUrl(foodpandaUrl),true);
  assert.equal(restaurantDetailsInput.parse({expectedVersion:1,foodpandaUrl}).foodpandaUrl,foodpandaUrl);
  assert.equal(openRiceRestaurantUrl(foodpandaUrl),false);
  assert.equal(foodpandaRestaurantUrl(openriceUrl),false);
  assert.deepEqual(restaurantReference({openriceUrl:'',foodpandaUrl}),{url:foodpandaUrl,provider:'Foodpanda',label:'Foodpanda 餐廳網頁'});
  assert.equal(restaurantReference({openriceUrl,foodpandaUrl})?.provider,'OpenRice');
  assert.equal(restaurantReference({openriceUrl:'',foodpandaUrl:''}),null);
  for (const url of [foodpandaUrl+'?tracking=1',foodpandaUrl+'#photos',foodpandaUrl+'/reviews',foodpandaUrl.replace('https:','http:'),foodpandaUrl.replace('www.foodpanda.hk','www.foodpanda.hk.evil.example')]) assert.equal(foodpandaRestaurantUrl(url),false,url);
});

