/**
 * route-stress-seed.js — Route planner stress-test dataset
 *
 * Creates a NEW company (does not wipe other accounts). Re-running removes
 * only the previous "RouteTest" company and recreates it fresh.
 *
 * Usage:  node route-stress-seed.js
 *
 * Login:
 *   admin@routetest.co.uk   / demo1234   (owner)
 *   james@routetest.co.uk   / demo1234   (employee — North London)
 *   (+ 5 more employees, same password)
 *
 * Company slug: routetest-field
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
require('dotenv').config({ path: require('path').resolve(__dirname, 'api-server', '.env'), override: true });

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vevago_local',
  user: process.env.DB_USER || 'vevago_local',
  password: process.env.DB_PASSWORD || 'password123',
});

const COMPANY_SLUG = 'routetest-field';
const PASSWORD = 'demo1234';

const fmt = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const monday = (date) => {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
};

const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const EMPLOYEES = [
  { first: 'James', last: 'Walker', email: 'james@routetest.co.uk', territory: 'north', home: '12 Ballards Lane, London N3 1XW' },
  { first: 'Sarah', last: 'Mitchell', email: 'sarah@routetest.co.uk', territory: 'west', home: '45 Uxbridge Road, London W5 5SA' },
  { first: 'Tom', last: 'Hughes', email: 'tom@routetest.co.uk', territory: 'east', home: '88 High Street, London E15 2QB' },
  { first: 'Emma', last: 'Clarke', email: 'emma@routetest.co.uk', territory: 'south', home: '22 Clapham High Street, London SW4 7UL' },
  { first: 'Ryan', last: 'Patel', email: 'ryan@routetest.co.uk', territory: 'central', home: '5 Camden High Street, London NW1 7JE' },
  { first: 'Chloe', last: 'Bennett', email: 'chloe@routetest.co.uk', territory: 'southwest', home: '14 Hill Street, Richmond TW9 1SX' },
];

// Realistic Greater London stops — spread for routing stress
const LOCATION_POOL = {
  north: [
    { address: '10 Finchley Central, London', city: 'London', zip: 'N3 1LL', lat: 51.6012, lng: -0.1934 },
    { address: '45 High Road, East Finchley', city: 'London', zip: 'N2 8DD', lat: 51.5877, lng: -0.1658 },
    { address: '2 Muswell Hill Broadway', city: 'London', zip: 'N10 3RT', lat: 51.5904, lng: -0.1429 },
    { address: '18 Barnet High Street', city: 'Barnet', zip: 'EN5 5XE', lat: 51.6507, lng: -0.1998 },
    { address: '7 Friern Barnet Road', city: 'London', zip: 'N11 3DT', lat: 51.6145, lng: -0.1421 },
    { address: '33 Wood Green High Road', city: 'London', zip: 'N22 6BH', lat: 51.5980, lng: -0.1098 },
    { address: '5 Bounds Green Road', city: 'London', zip: 'N11 2QP', lat: 51.6078, lng: -0.1245 },
    { address: '21 Totteridge Lane', city: 'London', zip: 'N20 8NR', lat: 51.6312, lng: -0.1798 },
    { address: '9 Whetstone High Road', city: 'London', zip: 'N20 9LP', lat: 51.6324, lng: -0.1756 },
    { address: '14 Palmers Green High Street', city: 'London', zip: 'N13 4AA', lat: 51.6189, lng: -0.1045 },
  ],
  west: [
    { address: '12 Ealing Broadway', city: 'London', zip: 'W5 2NR', lat: 51.5130, lng: -0.3089 },
    { address: '8 Acton High Street', city: 'London', zip: 'W3 6ND', lat: 51.5089, lng: -0.2723 },
    { address: '25 Chiswick High Road', city: 'London', zip: 'W4 2PH', lat: 51.4923, lng: -0.2589 },
    { address: '3 Hammersmith Grove', city: 'London', zip: 'W6 7AP', lat: 51.4928, lng: -0.2234 },
    { address: '44 Uxbridge Road, Shepherd\'s Bush', city: 'London', zip: 'W12 8LP', lat: 51.5045, lng: -0.2245 },
    { address: '17 Hanwell Broadway', city: 'London', zip: 'W7 3PD', lat: 51.5098, lng: -0.3389 },
    { address: '6 Greenford Road', city: 'Greenford', zip: 'UB6 8SQ', lat: 51.5324, lng: -0.3567 },
    { address: '29 High Street, Brentford', city: 'Brentford', zip: 'TW8 8JW', lat: 51.4867, lng: -0.3089 },
    { address: '11 South Ealing Road', city: 'London', zip: 'W5 4QS', lat: 51.5012, lng: -0.3123 },
    { address: '2 Turnham Green Terrace', city: 'London', zip: 'W4 1QP', lat: 51.4956, lng: -0.2545 },
  ],
  east: [
    { address: '15 Stratford High Street', city: 'London', zip: 'E15 2NE', lat: 51.5412, lng: -0.0034 },
    { address: '8 Mile End Road', city: 'London', zip: 'E1 4UN', lat: 51.5234, lng: -0.0456 },
    { address: '22 Bow Road', city: 'London', zip: 'E3 4LN', lat: 51.5289, lng: -0.0234 },
    { address: '4 Ilford High Road', city: 'Ilford', zip: 'IG1 1DN', lat: 51.5598, lng: 0.0712 },
    { address: '19 Romford Market', city: 'Romford', zip: 'RM1 3AB', lat: 51.5756, lng: 0.1834 },
    { address: '7 Walthamstow High Street', city: 'London', zip: 'E17 7JN', lat: 51.5834, lng: -0.0198 },
    { address: '33 Hackney Road', city: 'London', zip: 'E2 7NX', lat: 51.5289, lng: -0.0712 },
    { address: '9 Canary Wharf, Canada Square', city: 'London', zip: 'E14 5AB', lat: 51.5054, lng: -0.0235 },
    { address: '12 Leytonstone High Road', city: 'London', zip: 'E11 3BS', lat: 51.5689, lng: 0.0089 },
    { address: '5 Barking Broadway', city: 'Barking', zip: 'IG11 7LS', lat: 51.5398, lng: 0.0812 },
  ],
  south: [
    { address: '18 Clapham High Street', city: 'London', zip: 'SW4 7UN', lat: 51.4634, lng: -0.1389 },
    { address: '6 Brixton Road', city: 'London', zip: 'SW9 6DE', lat: 51.4612, lng: -0.1145 },
    { address: '24 Streatham High Road', city: 'London', zip: 'SW16 1EX', lat: 51.4312, lng: -0.1289 },
    { address: '11 Balham High Road', city: 'London', zip: 'SW12 9AL', lat: 51.4434, lng: -0.1523 },
    { address: '3 Tooting High Street', city: 'London', zip: 'SW17 0RN', lat: 51.4278, lng: -0.1689 },
    { address: '8 Wimbledon Broadway', city: 'London', zip: 'SW19 1RY', lat: 51.4212, lng: -0.2067 },
    { address: '15 Peckham Rye', city: 'London', zip: 'SE15 4ST', lat: 51.4689, lng: -0.0689 },
    { address: '4 Camberwell Church Street', city: 'London', zip: 'SE5 8TR', lat: 51.4734, lng: -0.0912 },
    { address: '21 Dulwich Village', city: 'London', zip: 'SE21 7BN', lat: 51.4456, lng: -0.0834 },
    { address: '9 Norwood Road', city: 'London', zip: 'SE24 9AA', lat: 51.4512, lng: -0.1023 },
  ],
  central: [
    { address: '10 Camden High Street', city: 'London', zip: 'NW1 0JH', lat: 51.5398, lng: -0.1423 },
    { address: '5 Islington High Street', city: 'London', zip: 'N1 9LQ', lat: 51.5367, lng: -0.1023 },
    { address: '22 Marylebone High Street', city: 'London', zip: 'W1U 4QE', lat: 51.5234, lng: -0.1523 },
    { address: '8 Kings Cross Road', city: 'London', zip: 'WC1X 9DT', lat: 51.5312, lng: -0.1189 },
    { address: '14 Holborn', city: 'London', zip: 'WC1V 6DR', lat: 51.5178, lng: -0.1189 },
    { address: '3 Borough High Street', city: 'London', zip: 'SE1 1NP', lat: 51.5045, lng: -0.0912 },
    { address: '17 Shoreditch High Street', city: 'London', zip: 'E1 6JN', lat: 51.5234, lng: -0.0789 },
    { address: '6 Notting Hill Gate', city: 'London', zip: 'W11 3HT', lat: 51.5089, lng: -0.1967 },
    { address: '12 Victoria Street', city: 'London', zip: 'SW1H 0NB', lat: 51.4989, lng: -0.1389 },
    { address: '2 Paddington Station Approach', city: 'London', zip: 'W2 1HQ', lat: 51.5154, lng: -0.1756 },
  ],
  southwest: [
    { address: '8 Richmond Hill', city: 'Richmond', zip: 'TW10 6RP', lat: 51.4567, lng: -0.3012 },
    { address: '15 Kingston Upon Thames Market', city: 'Kingston', zip: 'KT1 1JS', lat: 51.4089, lng: -0.3067 },
    { address: '4 Twickenham Green', city: 'Twickenham', zip: 'TW2 5AB', lat: 51.4456, lng: -0.3289 },
    { address: '11 Barnes High Street', city: 'London', zip: 'SW13 9LW', lat: 51.4734, lng: -0.2489 },
    { address: '6 Putney High Street', city: 'London', zip: 'SW15 1SP', lat: 51.4634, lng: -0.2167 },
    { address: '19 Wimbledon Park Road', city: 'London', zip: 'SW19 6NW', lat: 51.4389, lng: -0.2134 },
    { address: '3 Surbiton High Street', city: 'Surbiton', zip: 'KT6 4RQ', lat: 51.3934, lng: -0.3067 },
    { address: '7 Teddington High Street', city: 'Teddington', zip: 'TW11 8EW', lat: 51.4278, lng: -0.3312 },
    { address: '21 Kew Road', city: 'Richmond', zip: 'TW9 2NQ', lat: 51.4712, lng: -0.2867 },
    { address: '9 Hampton Court Road', city: 'East Molesey', zip: 'KT8 9BN', lat: 51.4012, lng: -0.3412 },
  ],
};

const FIRST_NAMES = [
  'Oliver', 'Amelia', 'George', 'Isla', 'Harry', 'Ava', 'Jack', 'Mia', 'Noah', 'Emily',
  'Charlie', 'Sophia', 'Jacob', 'Grace', 'Oscar', 'Lily', 'William', 'Ella', 'Henry', 'Freya',
  'Arthur', 'Poppy', 'Leo', 'Rosie', 'Alfie', 'Evie', 'Theo', 'Phoebe', 'Freddie', 'Daisy',
];

const LAST_NAMES = [
  'Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Davies', 'Evans', 'Thomas', 'Roberts', 'Johnson',
  'Walker', 'Wright', 'Thompson', 'White', 'Green', 'Hall', 'Lewis', 'Harris', 'Clark', 'Young',
  'King', 'Ward', 'Turner', 'Hill', 'Scott', 'Cooper', 'Morris', 'Baker', 'Phillips', 'Campbell',
];

const SERVICES = [
  { title: 'Exterior window clean', price: 45, duration: 35 },
  { title: 'Full window clean (in & out)', price: 75, duration: 55 },
  { title: 'Commercial storefront clean', price: 120, duration: 90 },
  { title: 'Gutter clearing', price: 85, duration: 60 },
  { title: 'Pressure wash — patio/drive', price: 95, duration: 75 },
  { title: 'Conservatory clean', price: 65, duration: 50 },
  { title: 'Solar panel clean', price: 110, duration: 45 },
  { title: 'Signage & fascia clean', price: 55, duration: 40 },
];

const BUSINESS_NAMES = [
  'Greenleaf Estate Agents', 'The Daily Grind Café', 'Northside Dental', 'Premier Lettings Ltd',
  'Oakwood Veterinary', 'City Print Solutions', 'Harbour View Restaurant', 'FitLife Gym',
  'Bloom Florist', 'TechFix Repairs', 'Riverside Pharmacy', 'Metro Accounting',
];

async function ensureColumns(pool) {
  await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_start_address TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_end_address TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) DEFAULT 'GB'`).catch(() => {});
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduling_flexibility VARCHAR(24) DEFAULT 'fixed_date'`).catch(() => {});
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS allowed_weekdays INTEGER[]`).catch(() => {});
  await pool.query(`ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS start_address TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS end_address TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS use_company_default_location BOOLEAN DEFAULT TRUE`).catch(() => {});
}

async function wipeExistingCompany(pool, slug) {
  const r = await pool.query('SELECT id, owner_id FROM companies WHERE slug = $1', [slug]);
  if (!r.rows.length) return;

  const companyId = r.rows[0].id;
  console.log(`🗑  Removing previous "${slug}" company (id ${companyId})...`);

  const jobRows = await pool.query('SELECT id FROM jobs WHERE company_id = $1', [companyId]);
  const jobIds = jobRows.rows.map((x) => x.id);
  if (jobIds.length) {
    await pool.query('DELETE FROM job_services WHERE job_id = ANY($1::int[])', [jobIds]);
    await pool.query('DELETE FROM job_logs WHERE job_id = ANY($1::int[])', [jobIds]).catch(() => {});
  }
  await pool.query('DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = $1)', [companyId]).catch(() => {});
  await pool.query('DELETE FROM invoices WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM daily_routes WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM jobs WHERE company_id = $1', [companyId]);

  const subRows = await pool.query('SELECT id FROM recurring_jobs WHERE company_id = $1', [companyId]);
  const subIds = subRows.rows.map((x) => x.id);
  if (subIds.length) {
    await pool.query('DELETE FROM recurring_job_services WHERE recurring_job_id = ANY($1::int[])', [subIds]);
  }
  await pool.query('DELETE FROM recurring_jobs WHERE company_id = $1', [companyId]);

  await pool.query('DELETE FROM clients WHERE company_id = $1', [companyId]);
  await pool.query('DELETE FROM services WHERE company_id = $1', [companyId]);
  await pool.query('DELETE FROM email_templates WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM user_company_work_hours WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM company_default_work_hours WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM employee_appointments WHERE company_id = $1', [companyId]).catch(() => {});

  await pool.query('DELETE FROM user_companies WHERE company_id = $1', [companyId]);

  // companies.owner_id → users and users.company_id → companies (both must be cleared before delete)
  await pool.query('UPDATE companies SET owner_id = NULL WHERE id = $1', [companyId]);
  await pool.query('DELETE FROM users WHERE company_id = $1', [companyId]);
  await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
}

function buildClients() {
  const clients = [];
  let idx = 0;

  for (const territory of Object.keys(LOCATION_POOL)) {
    const locs = LOCATION_POOL[territory];
    for (let i = 0; i < locs.length; i++) {
      const loc = locs[i];
      const isBusiness = i % 4 === 3;
      if (isBusiness) {
        clients.push({
          territory,
          type: 'company',
          name: BUSINESS_NAMES[idx % BUSINESS_NAMES.length],
          last: null,
          email: `biz${idx}@client-routetest.co.uk`,
          phone: `+44 7700 ${String(900000 + idx).slice(-6)}`,
          ...loc,
          country: 'United Kingdom',
        });
      } else {
        const fn = FIRST_NAMES[idx % FIRST_NAMES.length];
        const ln = LAST_NAMES[(idx * 3) % LAST_NAMES.length];
        clients.push({
          territory,
          type: 'person',
          name: fn,
          last: ln,
          email: `${fn.toLowerCase()}.${ln.toLowerCase()}${idx}@mail.co.uk`,
          phone: `+44 7700 ${String(900000 + idx).slice(-6)}`,
          ...loc,
          country: 'United Kingdom',
        });
      }
      idx++;
    }
  }

  return clients;
}

function minutesToTime(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function insertWorkHours(pool, userId, companyId, homeAddress) {
  await pool.query(
    `INSERT INTO user_company_work_hours (
      user_id, company_id, work_hours_mode,
      monday_start, monday_end, monday_break_minutes, monday_hours,
      tuesday_start, tuesday_end, tuesday_break_minutes, tuesday_hours,
      wednesday_start, wednesday_end, wednesday_break_minutes, wednesday_hours,
      thursday_start, thursday_end, thursday_break_minutes, thursday_hours,
      friday_start, friday_end, friday_break_minutes, friday_hours,
      saturday_start, saturday_end, saturday_break_minutes, saturday_hours,
      sunday_start, sunday_end, sunday_break_minutes, sunday_hours,
      start_address, end_address, use_company_default_location
    ) VALUES (
      $1, $2, 'fixed',
      '08:00', '17:00', 30, 8.5,
      '08:00', '17:00', 30, 8.5,
      '08:00', '17:00', 30, 8.5,
      '08:00', '17:00', 30, 8.5,
      '08:00', '16:30', 30, 8.0,
      NULL, NULL, 0, 0,
      NULL, NULL, 0, 0,
      $3, $3, false
    )`,
    [userId, companyId, homeAddress],
  );
}

async function main() {
  console.log('\n🚐  RouteTest Field Services — stress-test seed\n');

  await ensureColumns(pool);
  await wipeExistingCompany(pool, COMPANY_SLUG);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const clients = buildClients();

  const ownerRes = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, language_code)
     VALUES ('Alex', 'Morgan', 'admin@routetest.co.uk', $1, 'company-owner', 'en')
     RETURNING id`,
    [passwordHash],
  );
  const ownerId = ownerRes.rows[0].id;

  const companyRes = await pool.query(
    `INSERT INTO companies (name, slug, owner_id, country_code, default_start_address, default_end_address)
     VALUES ('RouteTest Field Services', $1, $2, 'GB', $3, $3)
     RETURNING id`,
    [COMPANY_SLUG, ownerId, 'Unit 4, Industrial Estate, Wembley HA0 1AF'],
  );
  const companyId = companyRes.rows[0].id;

  await pool.query('UPDATE users SET company_id = $1 WHERE id = $2', [companyId, ownerId]);
  await pool.query(
    `INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, 'owner')`,
    [ownerId, companyId],
  );

  console.log('👤  Creating 6 field employees...');
  const employeeIds = [];
  const employeeByTerritory = {};

  for (const emp of EMPLOYEES) {
    const r = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, language_code, company_id)
       VALUES ($1, $2, $3, $4, 'employee', 'en', $5)
       RETURNING id`,
      [emp.first, emp.last, emp.email, passwordHash, companyId],
    );
    const uid = r.rows[0].id;
    employeeIds.push(uid);
    employeeByTerritory[emp.territory] = uid;
    await pool.query(
      `INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, 'employee')`,
      [uid, companyId],
    );
    await insertWorkHours(pool, uid, companyId, emp.home);
  }

  console.log('🛠  Creating services...');
  const svcRows = [];
  for (const s of SERVICES) {
    const r = await pool.query(
      `INSERT INTO services (company_id, title, price, duration_minutes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [companyId, s.title, s.price, s.duration],
    );
    svcRows.push({ id: r.rows[0].id, ...s });
  }

  console.log(`👥  Creating ${clients.length} clients with coordinates...`);
  const clientRecords = [];
  for (const c of clients) {
    const r = await pool.query(
      `INSERT INTO clients
        (company_id, client_type, name, last_name, email, phone, address, city, zip_code, country, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [companyId, c.type, c.name, c.last, c.email, c.phone, c.address, c.city, c.zip, c.country, c.lat, c.lng],
    );
    clientRecords.push({ id: r.rows[0].id, territory: c.territory, lat: c.lat, lng: c.lng });
  }

  const clientsByTerritory = {};
  for (const c of clientRecords) {
    if (!clientsByTerritory[c.territory]) clientsByTerritory[c.territory] = [];
    clientsByTerritory[c.territory].push(c);
  }

  for (const t of ['change_date', 'change_time', 'change_employee', 'cancel_job', 'send_invoice']) {
    await pool.query(
      `INSERT INTO email_templates (company_id, template_type, subject, message)
       VALUES ($1,$2,'','') ON CONFLICT (company_id, template_type) DO NOTHING`,
      [companyId, t],
    ).catch(() => {});
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayStr = fmt(today);
  const weekOffsets = [-1, 0, 1, 2];
  let jobCount = 0;
  let sortGlobal = 0;

  console.log('📅  Scheduling jobs (6 employees × weekdays × 4 weeks, 3–8 hrs/day)...');

  for (const weekOffset of weekOffsets) {
    const mon = monday(today);
    mon.setDate(mon.getDate() + weekOffset * 7);

    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const date = addDays(mon, dayIdx);
      const dateStr = fmt(date);
      const isPast = dateStr < todayStr;

      for (let e = 0; e < EMPLOYEES.length; e++) {
        const emp = EMPLOYEES[e];
        const userId = employeeIds[e];
        const poolClients = clientsByTerritory[emp.territory] || clientRecords;
        let dayMinutes = 0;
        const targetMinutes = rand(180, 480);
        let cursor = rand(0, poolClients.length - 1);
        let routeOrder = 0;
        let timeCursor = 8 * 60 + rand(0, 30);

        while (dayMinutes < targetMinutes && poolClients.length > 0) {
          const client = poolClients[cursor % poolClients.length];
          cursor++;

          const svcCount = Math.random() < 0.75 ? 1 : 2;
          const svcs = [];
          const used = new Set();
          for (let s = 0; s < svcCount; s++) {
            let svc;
            do { svc = pick(svcRows); } while (used.has(svc.id) && used.size < svcRows.length);
            used.add(svc.id);
            svcs.push(svc);
          }

          const jobMinutes = svcs.reduce((sum, s) => sum + s.duration, 0) + rand(0, 15);
          if (dayMinutes + jobMinutes > targetMinutes + 45 && dayMinutes >= 180) break;

          const timeFrom = minutesToTime(timeCursor);
          const timeTo = minutesToTime(timeCursor + jobMinutes);
          timeCursor += jobMinutes + rand(10, 25);

          const title = svcs.length === 1 ? svcs[0].title : `${svcs[0].title} + ${svcs[1].title}`;
          let status = 'scheduled';
          if (isPast) status = Math.random() < 0.9 ? 'completed' : 'cancelled';
          else if (dateStr === todayStr) status = routeOrder < 2 ? 'completed' : 'scheduled';

          const flexRoll = Math.random();
          const schedulingFlex = flexRoll < 0.12 ? 'flexible' : flexRoll < 0.08 ? 'fixed_weekday' : 'fixed_date';
          const allowedDays = schedulingFlex === 'flexible' ? [0, 1, 2, 3, 4] : schedulingFlex === 'fixed_weekday' ? [dayIdx] : null;

          const jobRes = await pool.query(
            `INSERT INTO jobs
              (company_id, client_id, assigned_user_id, title, note,
               scheduled_date, scheduled_time_from, scheduled_time_to,
               status, is_generated, sort_order, route_order,
               scheduling_flexibility, allowed_weekdays)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13)
             RETURNING id`,
            [
              companyId, client.id, userId, title,
              Math.random() < 0.25 ? 'Access via side gate. Park on street.' : null,
              dateStr, timeFrom, timeTo, status, sortGlobal++, routeOrder++,
              schedulingFlex, allowedDays,
            ],
          );

          for (const svc of svcs) {
            const svcStatus = status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'scheduled';
            await pool.query(
              `INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes, status)
               VALUES ($1,$2,$3,$4,$5)`,
              [jobRes.rows[0].id, svc.id, svc.price, svc.duration, svcStatus],
            );
          }

          dayMinutes += jobMinutes;
          jobCount++;
          if (routeOrder > 12) break;
        }
      }
    }
  }

  console.log('🔄  Creating subscriptions...');
  let subCount = 0;
  const subClients = clientRecords.filter((_, i) => i % 2 === 0).slice(0, 28);

  for (let i = 0; i < subClients.length; i++) {
    const client = subClients[i];
    const empIdx = i % EMPLOYEES.length;
    const userId = employeeIds[empIdx];
    const svc = svcRows[i % svcRows.length];
    const dayOfWeek = i % 5;
    const intervalWeeks = i % 3 === 0 ? 4 : i % 3 === 1 ? 2 : 1;
    const recurrenceType = i % 7 === 0 ? 'monthly' : 'weekly';
    const dayOfMonth = ((i % 28) + 1);
    const startDate = addDays(today, -rand(7, 42));
    const nextOcc = addDays(today, rand(1, 14));

    const subRes = await pool.query(
      `INSERT INTO recurring_jobs
        (company_id, client_id, assigned_user_id, title, note, starting_date,
         recurrence_type, day_of_week, day_of_month, interval_value,
         scheduled_time_from, scheduled_time_to, next_occurrence_date, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)
       RETURNING id`,
      [
        companyId, client.id, userId,
        `Recurring — ${svc.title}`,
        'Subscription client — fixed weekday',
        fmt(startDate),
        recurrenceType,
        dayOfWeek,
        recurrenceType === 'monthly' ? dayOfMonth : null,
        intervalWeeks,
        '09:00', minutesToTime(9 * 60 + svc.duration),
        fmt(nextOcc),
      ],
    );

    await pool.query(
      `INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes)
       VALUES ($1,$2,$3,$4)`,
      [subRes.rows[0].id, svc.id, svc.price, svc.duration],
    );

    subCount++;
  }

  console.log('\n✅  Stress-test seed complete!\n');
  console.log('─'.repeat(56));
  console.log('🏢  Company:      RouteTest Field Services');
  console.log(`🔗  Slug:         ${COMPANY_SLUG}`);
  console.log(`👥  Clients:      ${clientRecords.length} (with lat/lng)`);
  console.log(`💼  Jobs:         ${jobCount}`);
  console.log(`🔄  Subscriptions: ${subCount}`);
  console.log(`👷  Employees:    ${EMPLOYEES.length}`);
  console.log('─'.repeat(56));
  console.log(`\n🔑  Password for all accounts: ${PASSWORD}\n`);
  console.log('   admin@routetest.co.uk  — owner (Alex Morgan)');
  for (const emp of EMPLOYEES) {
    console.log(`   ${emp.email.padEnd(24)} — ${emp.first} ${emp.last} (${emp.territory})`);
  }
  console.log(`\n🌐  Open: /${COMPANY_SLUG}/jobs  (week or day view for route planner)\n`);

  await pool.end();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
