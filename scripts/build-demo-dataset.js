#!/usr/bin/env node
/**
 * One-off builder for the fixed UK demo dataset (api-server/services/demo/ukDemoDataset.json).
 *
 * Street geometry: © OpenStreetMap contributors (ODbL), via Overpass.
 * Postcodes: postcodes.io (Open Government Licence).
 * Road routes: OSRM public demo server.
 *
 * People and house numbers are invented. Run: node scripts/build-demo-dataset.js
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'api-server', 'services', 'demo', 'ukDemoDataset.json');
const UA = 'PathPilo-demo-dataset-builder/1.0 (https://pathpilo.com)';

/**
 * Solo cleaner based in Bilton (north Harrogate). Most work sits in a few
 * focus towns; density falls off with distance from home, with a thinner
 * scatter of jobs on the roads between hubs.
 */
const DEPOT = { lat: 54.0053, lng: -1.5145, label: 'Bilton' };
const SEED = 20260301;
/** Each hub becomes one or more weekday rounds. */
const HUBS = [
  { name: 'Harrogate', lat: 53.9925, lng: -1.5378, radiusKm: 3.2, rounds: 7, city: 'Harrogate' },
  { name: 'Knaresborough', lat: 54.0082, lng: -1.4705, radiusKm: 2.4, rounds: 4, city: 'Knaresborough' },
  { name: 'Ripon', lat: 54.1356, lng: -1.5234, radiusKm: 2.2, rounds: 3, city: 'Ripon' },
  { name: 'Wetherby', lat: 53.9286, lng: -1.3867, radiusKm: 2.0, rounds: 2, city: 'Wetherby' },
  { name: 'Pannal', lat: 53.9608, lng: -1.5355, radiusKm: 1.8, rounds: 1, city: 'Harrogate' },
  { name: 'Killinghall', lat: 54.0235, lng: -1.5648, radiusKm: 1.6, rounds: 1, city: 'Harrogate' },
  { name: 'Starbeck', lat: 53.9992, lng: -1.4975, radiusKm: 1.5, rounds: 1, city: 'Harrogate' },
  { name: 'Boroughbridge', lat: 54.0948, lng: -1.3975, radiusKm: 1.6, rounds: 1, city: 'Boroughbridge' },
];
const ROUND_COUNT = HUBS.reduce((s, h) => s + h.rounds, 0);

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const url of mirrors) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Accept: 'application/json' },
          body: 'data=' + encodeURIComponent(query),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
        console.warn('overpass failed', url, e.message);
        await sleep(1200 + attempt * 1500);
      }
    }
  }
  throw new Error(`All Overpass mirrors failed: ${lastErr?.message || 'unknown'}`);
}

function lineLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += haversine(pts[i - 1], pts[i]);
  return l;
}

/** Point at distance d along polyline, offset sideways by `side` metres (+left / -right). */
function pointAlong(pts, d, side) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = haversine(pts[i - 1], pts[i]);
    if (acc + seg >= d || i === pts.length - 1) {
      const t = seg > 0 ? Math.min(1, Math.max(0, (d - acc) / seg)) : 0;
      const a = pts[i - 1];
      const b = pts[i];
      const lat = a.lat + (b.lat - a.lat) * t;
      const lng = a.lng + (b.lng - a.lng) * t;
      const mPerDegLat = 111320;
      const mPerDegLng = 111320 * Math.cos(toRad(lat));
      const dx = (b.lng - a.lng) * mPerDegLng;
      const dy = (b.lat - a.lat) * mPerDegLat;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      return { lat: lat + (ny * side) / mPerDegLat, lng: lng + (nx * side) / mPerDegLng };
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}

function kmeans(points, k, iterations = 60) {
  let centers = shuffle(points).slice(0, k).map((p) => ({ lat: p.lat, lng: p.lng }));
  let assign = new Array(points.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    assign = points.map((p) => {
      let best = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = haversine(p, c) / Math.sqrt(p.w || 1);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    });
    centers = centers.map((c, i) => {
      const members = points.filter((_, j) => assign[j] === i);
      if (!members.length) return c;
      const w = members.reduce((s, m) => s + (m.w || 1), 0);
      return {
        lat: members.reduce((s, m) => s + m.lat * (m.w || 1), 0) / w,
        lng: members.reduce((s, m) => s + m.lng * (m.w || 1), 0) / w,
      };
    });
  }
  return { centers, assign };
}

function tourLength(order, pts, start) {
  let l = haversine(start, pts[order[0]]);
  for (let i = 1; i < order.length; i++) l += haversine(pts[order[i - 1]], pts[order[i]]);
  return l;
}

/** Open tour from depot: nearest neighbour then 2-opt. */
function orderStops(pts, start) {
  const left = new Set(pts.map((_, i) => i));
  const order = [];
  let cur = start;
  while (left.size) {
    let best = -1;
    let bd = Infinity;
    for (const i of left) {
      const d = haversine(cur, pts[i]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    order.push(best);
    left.delete(best);
    cur = pts[best];
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const next = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
        if (tourLength(next, pts, start) + 0.01 < tourLength(order, pts, start)) {
          order.splice(0, order.length, ...next);
          improved = true;
        }
      }
    }
  }
  return order;
}

async function reversePostcodes(points) {
  const out = new Array(points.length).fill(null);
  for (let i = 0; i < points.length; i += 100) {
    const batch = points.slice(i, i + 100);
    const res = await fetch('https://api.postcodes.io/postcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({
        geolocations: batch.map((p) => ({ latitude: p.lat, longitude: p.lng, radius: 200, limit: 1 })),
      }),
    });
    const json = await res.json();
    (json.result || []).forEach((r, j) => {
      const hit = r?.result?.[0];
      if (hit) out[i + j] = { postcode: hit.postcode, town: hit.admin_ward ? hit : hit };
    });
    await sleep(300);
  }
  return out;
}

async function osrmRoute(coords) {
  const str = coords.map((c) => `${c.lng.toFixed(6)},${c.lat.toFixed(6)}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${str}?overview=full&geometries=geojson&steps=false`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      const json = await res.json();
      if (json.code === 'Ok') {
        const r = json.routes[0];
        return {
          geometry: r.geometry.coordinates.map(([lng, lat]) => [+lng.toFixed(5), +lat.toFixed(5)]),
          legMinutes: r.legs.map((l) => Math.max(1, Math.round((l.duration / 60) * 10) / 10)),
          km: Math.round((r.distance / 1000) * 10) / 10,
        };
      }
      throw new Error(json.code);
    } catch (e) {
      console.warn('osrm retry', e.message);
      await sleep(1500);
    }
  }
  return null;
}

const FIRST = [
  'James', 'Sarah', 'David', 'Emma', 'Michael', 'Claire', 'Paul', 'Helen', 'Andrew', 'Rachel', 'Mark', 'Laura',
  'Richard', 'Joanne', 'Stephen', 'Karen', 'Peter', 'Nicola', 'John', 'Susan', 'Robert', 'Gemma', 'Ian', 'Louise',
  'Chris', 'Amanda', 'Gary', 'Lisa', 'Simon', 'Victoria', 'Neil', 'Hannah', 'Graham', 'Kate', 'Martin', 'Ruth',
  'Steven', 'Fiona', 'Alan', 'Jane', 'Tom', 'Lucy', 'Daniel', 'Sophie', 'Matthew', 'Charlotte', 'Adam', 'Jenny',
  'Keith', 'Pauline', 'Brian', 'Margaret', 'Colin', 'Janet', 'Philip', 'Alison', 'Nigel', 'Deborah', 'Trevor',
  'Elaine', 'Ben', 'Amy', 'Sam', 'Natalie', 'Jonathan', 'Kirsty', 'Lee', 'Zoe', 'Craig', 'Beverley', 'Derek',
  'Sandra', 'Kevin', 'Tracey', 'Barry', 'Wendy', 'Roger', 'Linda', 'Gordon', 'Carol', 'Harry', 'Megan', 'Oliver',
  'Ellie', 'Jack', 'Holly', 'Luke', 'Rebecca', 'Ryan', 'Jessica', 'Priya', 'Arjun', 'Aisha', 'Imran', 'Mei',
  'Tomasz', 'Agnieszka', 'Siobhan', 'Callum', 'Eilidh',
];
const LAST = [
  'Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Johnson', 'Walker', 'Wood', 'Robinson', 'Thompson', 'Wright',
  'White', 'Hall', 'Green', 'Jackson', 'Harrison', 'Clarke', 'Hughes', 'Atkinson', 'Shaw', 'Lee', 'Turner',
  'Hill', 'Moore', 'Martin', 'Cooper', 'Ward', 'Morris', 'King', 'Baker', 'Holmes', 'Dawson', 'Bell', 'Kaye',
  'Barker', 'Hudson', 'Foster', 'Marshall', 'Webster', 'Booth', 'Hirst', 'Stephenson', 'Pearson', 'Gill',
  'Lister', 'Fletcher', 'Whitaker', 'Sutcliffe', 'Ellis', 'Allen', 'Parker', 'Spencer', 'Mitchell', 'Lawson',
  'Rhodes', 'Simpson', 'Walton', 'Brook', 'Kirk', 'Senior', 'Hartley', 'Barraclough', 'Ackroyd', 'Firth',
  'Greenwood', 'Hargreaves', 'Bentley', 'Naylor', 'Dixon', 'Metcalfe', 'Riley', 'Hewitt', 'Marsden', 'Patel',
  'Khan', 'Hussain', 'Begum', 'Ali', 'Chen', 'Kowalski', 'Nowak', 'Murphy', "O'Brien", 'Campbell', 'Stewart',
  'MacDonald', 'Evans', 'Davies', 'Roberts', 'Price',
];

const ACCESS_NOTES = [
  'Side gate code 1984',
  'Side gate usually unlocked',
  'Dog in garden, ring first',
  'Leave gate closed, cat',
  'Rear access via alley',
  'Park on drive is fine',
  'Pays by bank transfer',
  'Skip conservatory, clean frames only',
  'Back gate bolted, key under pot',
  'Please do frames and sills',
  'Narrow side path, use short ladder',
  'Text before arriving',
];

function hubBbox(hub) {
  const dLat = hub.radiusKm / 111.32;
  const dLng = hub.radiusKm / (111.32 * Math.cos(toRad(hub.lat)));
  return { s: hub.lat - dLat, w: hub.lng - dLng, n: hub.lat + dLat, e: hub.lng + dLng };
}

function streetsFromOverpass(elements) {
  const byName = new Map();
  for (const el of elements) {
    if (!el.geometry || el.geometry.length < 2 || !el.tags?.name) continue;
    const name = el.tags.name.trim();
    if (/^(the )?(service|access)|^back /i.test(name)) continue;
    const pts = el.geometry.map((g) => ({ lat: g.lat, lng: g.lon }));
    const len = lineLength(pts);
    const prev = byName.get(name);
    if (!prev || len > prev.len) byName.set(name, { name, pts, len });
  }
  return [...byName.values()].filter((s) => s.len >= 80 && s.len <= 1100);
}

/** Prefer streets near the hub centre; thin out farther from home depot. */
function weightStreet(street, hub) {
  const mid = pointAlong(street.pts, street.len / 2, 0);
  const toHub = haversine(mid, hub) / 1000;
  const toHome = haversine(mid, DEPOT) / 1000;
  const hubWeight = Math.exp(-Math.pow(toHub / Math.max(0.6, hub.radiusKm * 0.55), 2));
  const homeFalloff = 1 / (1 + Math.pow(toHome / 9, 1.35));
  return { ...street, lat: mid.lat, lng: mid.lng, w: Math.max(0.05, hubWeight * (0.35 + 0.65 * homeFalloff)) };
}

function pickHousesOnStreets(streets, target, usedAddress) {
  const chosen = streets.slice(0, Math.min(streets.length, 3 + Math.floor(rand() * 3)));
  const totalLen = chosen.reduce((s, m) => s + m.len, 0) || 1;
  const houses = [];
  for (const st of chosen) {
    const want = Math.max(2, Math.round((st.len / totalLen) * target));
    const spacing = 14 + Math.floor(rand() * 6);
    const perSide = Math.max(2, Math.floor((st.len - 10) / spacing));
    const slots = [];
    for (let k = 0; k < perSide; k++) {
      slots.push({ k, odd: true });
      slots.push({ k, odd: false });
    }
    for (const s of shuffle(slots)) {
      if (houses.filter((h) => h.street === st.name).length >= want) break;
      const number = s.odd ? s.k * 2 + 1 : s.k * 2 + 2;
      const key = `${st.name}|${number}`;
      if (usedAddress.has(key)) continue;
      usedAddress.add(key);
      const p = pointAlong(st.pts, 5 + s.k * spacing + spacing / 2, s.odd ? 9 : -9);
      houses.push({ street: st.name, number, lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), city: st.city });
    }
  }
  return houses;
}

async function main() {
  const usedAddress = new Set();
  const usedNames = new Set();
  const usedAreaNames = new Map();
  const rounds = [];
  let phoneSeq = 0;
  let slot = 0;

  for (const hub of HUBS) {
    const b = hubBbox(hub);
    const box = `${b.s},${b.w},${b.n},${b.e}`;
    console.log(`Fetching streets around ${hub.name}…`);
    let streetsRes;
    try {
      streetsRes = await overpass(
        `[out:json][timeout:90];(way[highway=residential][name](${box});way[highway=living_street][name](${box}););out geom;`
      );
    } catch (e) {
      console.warn(`  skipping ${hub.name}: ${e.message}`);
      await sleep(2500);
      continue;
    }
    await sleep(1800);
    const weighted = streetsFromOverpass(streetsRes.elements || [])
      .map((s) => ({ ...weightStreet(s, hub), city: hub.city, hub: hub.name }))
      .filter((s) => haversine(s, hub) / 1000 <= hub.radiusKm * 1.05)
      .sort((a, b) => b.w - a.w);
    console.log(`  ${weighted.length} usable streets`);
    if (!weighted.length) continue;

    const { centers, assign } = kmeans(weighted, Math.max(1, hub.rounds));
    const hubRoundOrder = centers
      .map((c, i) => ({ i, dist: haversine(c, DEPOT) }))
      .sort((a, b) => a.dist - b.dist)
      .map((x) => x.i);

    for (const ci of hubRoundOrder) {
      const center = centers[ci];
      const members = weighted
        .filter((_, j) => assign[j] === ci)
        .sort((a, b) => b.w - a.w || haversine(a, center) - haversine(b, center));
      if (!members.length) continue;

      // Distant hubs keep shorter days; hometown can fill a fuller round.
      const homeKm = haversine(center, DEPOT) / 1000;
      const target = homeKm < 4 ? 12 + Math.floor(rand() * 4) : homeKm < 12 ? 9 + Math.floor(rand() * 3) : 7 + Math.floor(rand() * 3);

      let area = hub.name;
      if (hub.rounds > 1) {
        const streetHint = members[0]?.name || 'East';
        const n = (usedAreaNames.get(hub.name) || 0) + 1;
        usedAreaNames.set(hub.name, n);
        area = n === 1 ? hub.name : `${hub.name} – ${streetHint}`;
      }

      const houses = pickHousesOnStreets(members, target, usedAddress).map((h) => ({
        ...h,
        city: hub.city,
      }));
      if (houses.length < 5) continue;
      rounds.push({ slot: slot++, area, center, houses, city: hub.city, hub: hub.name });
    }
  }

  // Sweep order: roughly clockwise from home so the week feels like real routing.
  rounds.sort((a, b) => {
    const aa = Math.atan2(a.center.lat - DEPOT.lat, a.center.lng - DEPOT.lng);
    const bb = Math.atan2(b.center.lat - DEPOT.lat, b.center.lng - DEPOT.lng);
    return bb - aa;
  });
  rounds.forEach((r, i) => {
    r.slot = i;
  });

  console.log('Postcode lookup…');
  const all = rounds.flatMap((r) => r.houses);
  const postcodes = await reversePostcodes(all);
  all.forEach((h, i) => {
    h.postcode = postcodes[i]?.postcode || null;
  });

  const out = [];
  for (const r of rounds) {
    const houses = r.houses.filter((h) => h.postcode);
    if (houses.length < 5) continue;
    const order = orderStops(houses, DEPOT);
    const ordered = order.map((i) => houses[i]);
    console.log(`Routing ${r.area} (${ordered.length} stops)…`);
    const route = await osrmRoute([DEPOT, ...ordered, DEPOT]);
    await sleep(1100);

    const stops = ordered.map((h) => {
      let first;
      let last;
      let key;
      do {
        first = pick(FIRST);
        last = pick(LAST);
        key = `${first} ${last}`;
      } while (usedNames.has(key));
      usedNames.add(key);
      const roll = rand();
      const intervalWeeks = roll < 0.14 ? 8 : 4;
      const insideToo = rand() < 0.07;
      const base = pick([12, 13, 14, 15, 15, 16, 16, 17, 18, 18, 20, 20, 22, 24, 26, 28]);
      const phone = `07700 900${String(phoneSeq++).padStart(3, '0')}`;
      return {
        firstName: first,
        lastName: last,
        address: `${h.number} ${h.street}`,
        zip: h.postcode,
        city: h.city || r.city,
        lat: h.lat,
        lng: h.lng,
        phone,
        email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com',
        intervalWeeks,
        price: base,
        insideToo,
        conservatory: rand() < 0.12,
        note: rand() < 0.3 ? pick(ACCESS_NOTES) : null,
      };
    });
    out.push({
      week: Math.floor(r.slot / 5) + 1,
      weekday: (r.slot % 5) + 1,
      name: r.area,
      stops,
      route,
    });
  }

  const dataset = {
    attribution: 'Street geometry © OpenStreetMap contributors (ODbL). Postcodes: postcodes.io (OGL). People and house numbers are fictional.',
    town: 'Harrogate',
    country: 'GB',
    depot: DEPOT,
    hubs: HUBS.map((h) => ({ name: h.name, lat: h.lat, lng: h.lng, rounds: h.rounds })),
    rounds: out,
  };
  fs.writeFileSync(OUT, JSON.stringify(dataset));
  const clients = out.reduce((s, r) => s + r.stops.length, 0);
  const cities = [...new Set(out.flatMap((r) => r.stops.map((s) => s.city)))];
  console.log(`Wrote ${OUT}: ${out.length} rounds, ${clients} clients, cities=${cities.join(', ')}, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
