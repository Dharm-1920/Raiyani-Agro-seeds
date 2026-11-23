// Turns GPS coordinates into Indian delivery-address fields using OpenStreetMap Nominatim.
// Runs on the server so the site's Content-Security-Policy can keep connect-src 'self'.
// Nominatim policy: identify the app, max 1 request/second, no bulk use. Routes rate-limit per user.
const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const clip = (value, limit) => String(value || '').trim().slice(0, limit);
const unique = values => values.filter((value, index) => value && values.indexOf(value) === index);

function parseCoordinates(query) {
  const lat = Number(query.lat), lon = Number(query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || String(query.lat ?? '').trim() === '' || String(query.lon ?? '').trim() === '')
    throw fail('Your location could not be read. Please try again.');
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}

// Maps a Nominatim "address" object to the address-book fields. Every value stays editable by the customer.
function toAddressFields(result) {
  const a = result?.address;
  if (!a) throw fail('No address was found at your location. Please enter it manually.', 404);
  if (a.country_code && a.country_code !== 'in') throw fail('Your location is outside India. We deliver only within India.', 422);
  const building = a.building || a.amenity || a.shop || a.office;
  const street = a.road || a.pedestrian || a.residential;
  const city = a.city || a.town || a.village || a.municipality || a.hamlet || a.county || a.state_district;
  const area = unique([a.neighbourhood, a.suburb, a.quarter, a.city_district, a.village !== city && a.village, a.hamlet !== city && a.hamlet]).filter(v => v !== city && v !== street);
  const line1 = unique([a.house_number, building, street]).join(', ') || area.shift() || '';
  const postcode = String(a.postcode || '').replace(/\s/g, '');
  return {
    line1: clip(line1, 1000),
    line2: clip(area.slice(0, 2).join(', '), 200),
    landmark: '',
    city: clip(city, 100),
    state: clip(a.state, 100),
    postalCode: /^[1-9]\d{5}$/.test(postcode) ? postcode : '',
  };
}

async function reverseGeocode({ lat, lon }, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const url = `${ENDPOINT}?format=jsonv2&addressdetails=1&zoom=18&accept-language=en&lat=${lat}&lon=${lon}`;
  let response;
  try {
    response = await fetchImpl(url, { headers: { 'User-Agent': 'RaiyaniAgroSeedsShop/1.0 (address autofill)', Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  } catch { throw fail('The address lookup service is unreachable. Please enter your address manually.', 503); }
  if (response.status === 429) throw fail('Too many location lookups. Please wait a minute and try again.', 429);
  if (!response.ok) throw fail('The address lookup service is unavailable. Please enter your address manually.', 503);
  const data = await response.json().catch(() => null);
  if (!data || data.error) throw fail('No address was found at your location. Please enter it manually.', 404);
  return toAddressFields(data);
}

module.exports = { parseCoordinates, toAddressFields, reverseGeocode };
