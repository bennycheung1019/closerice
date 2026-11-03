import test from 'node:test';
import assert from 'node:assert/strict';
import { googleMapsUrl, providerImagery, publicHttpsUrl, usableCover, type RestaurantProfile } from '../lib/restaurant-profile';
import { restaurantDetailsInput } from '../lib/restaurant-profile-input';

test('only public HTTPS references are accepted', () => {
  for (const value of ['javascript:alert(1)', 'http://example.com/a', 'https://user:password@example.com/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://a.internal/a']) assert.equal(publicHttpsUrl(value), false, value);
  assert.equal(publicHttpsUrl('https://restaurant.example/photo.jpg'), true);
});
test('provider photos stay on their source websites', () => {
  for (const value of ['https://lh3.googleusercontent.com/photo', 'https://maps.googleapis.com/photo', 'https://www.google.com./maps/', 'https://static5.orstatic.com/photo', 'https://www.openrice.com/restaurant']) assert.equal(providerImagery(value), true, value);
  const profile = { coverPhotoUrl:'https://restaurant.example/cover.jpg', coverSourceUrl:'https://restaurant.example/photos', coverAttribution:'Photographer', coverLicense:'Permission from photographer', coverUsage:'licensed' } as RestaurantProfile;
  assert.equal(usableCover(profile), true);
  assert.equal(usableCover({ ...profile, coverUsage:'restricted' }), false);
  assert.equal(usableCover({ ...profile, coverAttribution:'' }), false);
  assert.equal(restaurantDetailsInput.safeParse({expectedVersion:1,...profile}).success, true);
  assert.equal(restaurantDetailsInput.safeParse({expectedVersion:1,...profile,coverPhotoUrl:'https://static5.orstatic.com/photo'}).success, false);
});
test('Maps links encode names and addresses without a key', () => {
  const url = new URL(googleMapsUrl('餐廳 & 分店', '旺角', '彌敦道 1 號'));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('query'), '餐廳 & 分店 彌敦道 1 號 香港');
  assert.equal(url.searchParams.has('key'), false);
});
