const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCoordinates, toAddressFields, reverseGeocode } = require('../services/reverse-geocode');

test('coordinates are validated and rounded', () => {
  assert.deepEqual(parseCoordinates({ lat: '21.9612345678', lon: '70.7923456789' }), { lat: 21.961235, lon: 70.792346 });
  for (const bad of [{}, { lat: '', lon: '70' }, { lat: 'abc', lon: '70' }, { lat: '95', lon: '70' }, { lat: '21', lon: '181' }])
    assert.throws(() => parseCoordinates(bad), { status: 400 });
});

test('an Indian town address fills street, area, city, state and PIN', () => {
  const fields = toAddressFields({ address: { house_number: '12', road: 'Station Road', neighbourhood: 'Bhojrajpara', town: 'Gondal', state_district: 'Rajkot', state: 'Gujarat', postcode: '360 311', country_code: 'in' } });
  assert.deepEqual(fields, { line1: '12, Station Road', line2: 'Bhojrajpara', landmark: '', city: 'Gondal', state: 'Gujarat', postalCode: '360311' });
});

test('a village without a road still gives a usable first line, and bad PINs are dropped', () => {
  const fields = toAddressFields({ address: { hamlet: 'Patel Vas', village: 'Ribda', county: 'Gondal', state: 'Gujarat', postcode: '36031', country_code: 'in' } });
  assert.equal(fields.line1, 'Patel Vas');
  assert.equal(fields.city, 'Ribda');
  assert.equal(fields.postalCode, '');
});

test('locations outside India and empty results are rejected', () => {
  assert.throws(() => toAddressFields({ address: { city: 'Dubai', country_code: 'ae' } }), { status: 422 });
  assert.throws(() => toAddressFields({}), { status: 404 });
});

test('provider failures become friendly errors and the request identifies the app', async () => {
  let seen;
  const ok = async (url, options) => { seen = { url, options }; return { ok: true, status: 200, json: async () => ({ address: { road: 'MG Road', city: 'Rajkot', state: 'Gujarat', postcode: '360001', country_code: 'in' } }) }; };
  const fields = await reverseGeocode({ lat: 22.3, lon: 70.8 }, { fetchImpl: ok });
  assert.equal(fields.city, 'Rajkot');
  assert.match(seen.url, /lat=22\.3&lon=70\.8/);
  assert.match(seen.options.headers['User-Agent'], /RaiyaniAgroSeeds/);
  await assert.rejects(reverseGeocode({ lat: 1, lon: 1 }, { fetchImpl: async () => { throw new Error('offline'); } }), { status: 503 });
  await assert.rejects(reverseGeocode({ lat: 1, lon: 1 }, { fetchImpl: async () => ({ ok: false, status: 429 }) }), { status: 429 });
  await assert.rejects(reverseGeocode({ lat: 1, lon: 1 }, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ error: 'Unable to geocode' }) }) }), { status: 404 });
});
