/**
 * public-demo-seed.js — Public PathPilo demo company (safe for live DB)
 *
 * Replaces ONLY the company with slug `pathpilo-demo`. Never truncates other tenants.
 * One-owner company, ~24 clients, services, subscriptions, invoices, and at least
 * one job on every calendar day of 2026.
 *
 * Usage (from repo root, with live or local .env):
 *   node public-demo-seed.js
 *
 * Login:
 *   demo@pathpilo.com  /  demo1234
 * Company slug: pathpilo-demo
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
require('dotenv').config({
  path: require('path').resolve(__dirname, 'api-server', '.env'),
  override: false,
});

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vevago_local',
  user: process.env.DB_USER || 'vevago_local',
  password: process.env.DB_PASSWORD || 'password123',
});

const COMPANY_SLUG = 'pathpilo-demo';
const PASSWORD = 'demo1234';
const DEMO_EMAIL = 'demo@pathpilo.com';
const YEAR = 2026;
const CHUNK = 400;

const fmt = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

const CLIENTS = [
  { type: 'person', name: 'Mads', last: 'Vestergaard', email: 'mads.vestergaard@demo.pathpilo.com', phone: '+45 2234 5678', address: 'Ordrupvej 45', city: 'Charlottenlund', zip: '2920', lat: 55.7581, lng: 12.5786 },
  { type: 'person', name: 'Birgitte', last: 'Møller', email: 'birgitte.moller@demo.pathpilo.com', phone: '+45 2345 6789', address: 'Frederiksberg Allé 78', city: 'Frederiksberg', zip: '2000', lat: 55.6758, lng: 12.5285 },
  { type: 'person', name: 'Søren', last: 'Hansen', email: 'soeren.h@demo.pathpilo.com', phone: '+45 2456 7890', address: 'Classensgade 12', city: 'København Ø', zip: '2100', lat: 55.7057, lng: 12.5778 },
  { type: 'person', name: 'Anne', last: 'Lindberg', email: 'anne.lindberg@demo.pathpilo.com', phone: '+45 2567 8901', address: 'Jægersborg Allé 23', city: 'Charlottenlund', zip: '2920', lat: 55.7512, lng: 12.5701 },
  { type: 'person', name: 'Jens', last: 'Bager', email: 'jens.bager@demo.pathpilo.com', phone: '+45 2678 9012', address: 'Strandvejen 201', city: 'Hellerup', zip: '2900', lat: 55.7283, lng: 12.5779 },
  { type: 'person', name: 'Lotte', last: 'Andersen', email: 'lotte.andersen@demo.pathpilo.com', phone: '+45 2789 0123', address: 'Gammel Kongevej 110', city: 'Frederiksberg', zip: '1850', lat: 55.6813, lng: 12.5332 },
  { type: 'person', name: 'Peter', last: 'Bjørnsson', email: 'peter.b@demo.pathpilo.com', phone: '+45 2890 1234', address: 'Strandmøllevej 8', city: 'Klampenborg', zip: '2930', lat: 55.7645, lng: 12.5889 },
  { type: 'person', name: 'Familie', last: 'Christensen', email: 'familie.c@demo.pathpilo.com', phone: '+45 2901 2345', address: 'Solbakken 12', city: 'Virum', zip: '2830', lat: 55.7817, lng: 12.4983 },
  { type: 'person', name: 'Bodil', last: 'Thygesen', email: 'bodil.t@demo.pathpilo.com', phone: '+45 3012 3456', address: 'Vodroffsvej 28', city: 'Frederiksberg', zip: '1900', lat: 55.682, lng: 12.5294 },
  { type: 'person', name: 'Hans-Ole', last: 'Madsen', email: 'hansole@demo.pathpilo.com', phone: '+45 3123 4567', address: 'Niels Andersens Vej 12', city: 'Hellerup', zip: '2900', lat: 55.7248, lng: 12.565 },
  { type: 'person', name: 'Rikke', last: 'Kjær', email: 'rikke.k@demo.pathpilo.com', phone: '+45 3234 5678', address: 'Smakkegårdsvej 45', city: 'Gentofte', zip: '2820', lat: 55.7441, lng: 12.5364 },
  { type: 'person', name: 'Thomas', last: 'Dalgaard', email: 'thomas.d@demo.pathpilo.com', phone: '+45 3345 6789', address: 'Nørre Allé 34', city: 'København N', zip: '2200', lat: 55.7, lng: 12.5539 },
  { type: 'person', name: 'Camilla', last: 'Skov', email: 'camilla.s@demo.pathpilo.com', phone: '+45 3456 7890', address: 'Bernstorffsvej 67', city: 'Hellerup', zip: '2900', lat: 55.731, lng: 12.5578 },
  { type: 'person', name: 'Erik', last: 'Nørgaard', email: 'erik.n@demo.pathpilo.com', phone: '+45 3567 8901', address: 'Lyngbyvej 89', city: 'Gentofte', zip: '2820', lat: 55.742, lng: 12.5483 },
  { type: 'person', name: 'Ida', last: 'Holm', email: 'ida.holm@demo.pathpilo.com', phone: '+45 3678 0123', address: 'Østerbrogade 120', city: 'København Ø', zip: '2100', lat: 55.712, lng: 12.577 },
  { type: 'person', name: 'Jonas', last: 'Krog', email: 'jonas.krog@demo.pathpilo.com', phone: '+45 3789 1234', address: 'Amagerbrogade 88', city: 'København S', zip: '2300', lat: 55.655, lng: 12.603 },
  { type: 'company', name: 'Advokatfirmaet Larsen & Co', last: null, email: 'reception@larsenco.demo.pathpilo.com', phone: '+45 3378 9012', address: 'Gothersgade 89', city: 'København K', zip: '1123', lat: 55.6851, lng: 12.5775 },
  { type: 'company', name: 'Tandlæge Karin Holm', last: null, email: 'klinik@karinholm.demo.pathpilo.com', phone: '+45 3489 0123', address: 'Østerbrogade 55', city: 'København Ø', zip: '2100', lat: 55.707, lng: 12.5745 },
  { type: 'company', name: 'Café Hyggehjørnet', last: null, email: 'post@hygge.demo.pathpilo.com', phone: '+45 3590 1234', address: 'Istedgade 67', city: 'København V', zip: '1650', lat: 55.6668, lng: 12.5539 },
  { type: 'company', name: 'Ejendomsselskabet Nord ApS', last: null, email: 'drift@nordej.demo.pathpilo.com', phone: '+45 3601 2345', address: 'Tagensvej 125', city: 'København N', zip: '2200', lat: 55.7083, lng: 12.5503 },
  { type: 'company', name: 'Klinik Øresund', last: null, email: 'info@oresund.demo.pathpilo.com', phone: '+45 3712 3456', address: 'Strandvejen 90', city: 'Hellerup', zip: '2900', lat: 55.722, lng: 12.575 },
  { type: 'company', name: 'Nordhavn Fitness', last: null, email: 'desk@nordhavnfit.demo.pathpilo.com', phone: '+45 3823 4567', address: 'Århusgade 88', city: 'København Ø', zip: '2100', lat: 55.7065, lng: 12.595 },
  { type: 'company', name: 'Bryggen Contorhotel', last: null, email: 'facility@bryggen.demo.pathpilo.com', phone: '+45 3934 5678', address: 'Islands Brygge 40', city: 'København S', zip: '2300', lat: 55.663, lng: 12.575 },
  { type: 'company', name: 'Frederiksberg Bogcafé', last: null, email: 'hej@bogcafe.demo.pathpilo.com', phone: '+45 4045 6789', address: 'Gammel Kongevej 55', city: 'Frederiksberg', zip: '1850', lat: 55.678, lng: 12.54 },
];

const SERVICES = [
  { title: 'Udvendig vinduesrensning', price: 275, duration: 40 },
  { title: 'Ind- og udvendig vinduesrensning', price: 425, duration: 70 },
  { title: 'Storvinduespudsning (erhverv)', price: 595, duration: 90 },
  { title: 'Tagrender rensning', price: 350, duration: 55 },
  { title: 'Altan- og facadevask', price: 480, duration: 80 },
];

const NOTES = [
  'Ring på dørklokken ved ankomst',
  'Nøgle under måtten ved bagdør',
  'Portkode: 1947',
  'Hund i haven – vær opmærksom',
  'Parkeringskort i postkassen',
  'Adgang via bagtrappe',
  null,
  null,
  null,
];

function minutesToTime(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function chunkedInsert(table, columns, rows, { returning } = {}) {
  const ids = [];
  for (const chunk of chunkArray(rows, CHUNK)) {
    if (!chunk.length) continue;
    const values = [];
    const tuples = [];
    let p = 1;
    for (const row of chunk) {
      tuples.push(`(${columns.map(() => `$${p++}`).join(',')})`);
      for (const col of columns) values.push(row[col]);
    }
    const sql =
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')}` +
      (returning ? ` RETURNING ${returning}` : '');
    const res = await pool.query(sql, values);
    if (returning) for (const r of res.rows) ids.push(r[returning]);
  }
  return ids;
}

async function wipeDemoCompany(slug) {
  const r = await pool.query('SELECT id, owner_id FROM companies WHERE slug = $1', [slug]);
  if (!r.rows.length) {
    // Also remove orphan demo user if company was deleted manually
    await pool.query('DELETE FROM users WHERE email = $1', [DEMO_EMAIL]).catch(() => {});
    return;
  }
  const companyId = r.rows[0].id;
  console.log(`🗑  Removing previous "${slug}" (id ${companyId})...`);

  const jobRows = await pool.query('SELECT id FROM jobs WHERE company_id = $1', [companyId]);
  const jobIds = jobRows.rows.map((x) => x.id);
  if (jobIds.length) {
    await pool.query('DELETE FROM job_services WHERE job_id = ANY($1::int[])', [jobIds]);
    await pool.query('DELETE FROM job_logs WHERE job_id = ANY($1::int[])', [jobIds]).catch(() => {});
  }
  await pool.query(
    'DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = $1)',
    [companyId],
  ).catch(() => {});
  await pool.query('DELETE FROM invoices WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM daily_routes WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM jobs WHERE company_id = $1', [companyId]);

  const subRows = await pool.query('SELECT id FROM recurring_jobs WHERE company_id = $1', [companyId]);
  const subIds = subRows.rows.map((x) => x.id);
  if (subIds.length) {
    await pool.query('DELETE FROM recurring_job_services WHERE recurring_job_id = ANY($1::int[])', [
      subIds,
    ]).catch(() => {});
  }
  await pool.query('DELETE FROM recurring_jobs WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM offers WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM leads WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM clients WHERE company_id = $1', [companyId]);
  await pool.query('DELETE FROM services WHERE company_id = $1', [companyId]);
  await pool.query('DELETE FROM email_templates WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM user_company_work_hours WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM company_default_work_hours WHERE company_id = $1', [companyId]).catch(() => {});
  await pool.query('DELETE FROM user_companies WHERE company_id = $1', [companyId]);
  await pool.query('UPDATE companies SET owner_id = NULL WHERE id = $1', [companyId]);
  await pool.query('DELETE FROM users WHERE company_id = $1 OR email = $2', [companyId, DEMO_EMAIL]);
  await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
}

/** Jobs per day: every calendar day gets work; weekends lighter. */
function jobsForDay(dow) {
  if (dow === 0) return rand(1, 2); // Sunday
  if (dow === 6) return rand(2, 4); // Saturday
  return rand(3, 6); // Mon–Fri
}

async function main() {
  console.log('\n✨  PathPilo public demo seed (one-owner, full year 2026)\n');

  await wipeDemoCompany(COMPANY_SLUG);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayStr = fmt(today);

  console.log('👤  Creating owner + company...');
  const ownerRes = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, language_code)
     VALUES ('Mikkel', 'Demo', $1, $2, 'company-owner', 'da')
     RETURNING id`,
    [DEMO_EMAIL, passwordHash],
  );
  const ownerId = ownerRes.rows[0].id;

  const companyRes = await pool.query(
    `INSERT INTO companies (
       name, slug, owner_id, country_code, plan, onboarding_completed,
       default_start_address, default_end_address, leads_enabled
     ) VALUES (
       'Nordlys Service', $1, $2, 'DK', 'pro', TRUE,
       'Strandvejen 100, 2900 Hellerup', 'Strandvejen 100, 2900 Hellerup', TRUE
     )
     RETURNING id`,
    [COMPANY_SLUG, ownerId],
  );
  const companyId = companyRes.rows[0].id;

  await pool.query('UPDATE users SET company_id = $1 WHERE id = $2', [companyId, ownerId]);
  await pool.query(`INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, 'owner')`, [
    ownerId,
    companyId,
  ]);

  await pool
    .query(
      `INSERT INTO user_company_work_hours (
        user_id, company_id, work_hours_mode,
        monday_start, monday_end, monday_break_minutes, monday_hours,
        tuesday_start, tuesday_end, tuesday_break_minutes, tuesday_hours,
        wednesday_start, wednesday_end, wednesday_break_minutes, wednesday_hours,
        thursday_start, thursday_end, thursday_break_minutes, thursday_hours,
        friday_start, friday_end, friday_break_minutes, friday_hours,
        saturday_start, saturday_end, saturday_break_minutes, saturday_hours,
        sunday_start, sunday_end, sunday_break_minutes, sunday_hours
      ) VALUES (
        $1, $2, 'fixed',
        '07:30', '16:30', 30, 8.5,
        '07:30', '16:30', 30, 8.5,
        '07:30', '16:30', 30, 8.5,
        '07:30', '16:30', 30, 8.5,
        '07:30', '15:30', 30, 7.5,
        '08:00', '13:00', 0, 5,
        NULL, NULL, 0, 0
      )`,
      [ownerId, companyId],
    )
    .catch(() => {});

  console.log('🛠  Services...');
  const svcRows = [];
  for (const s of SERVICES) {
    const r = await pool.query(
      `INSERT INTO services (company_id, title, price, duration_minutes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [companyId, s.title, s.price, s.duration],
    );
    svcRows.push({ id: r.rows[0].id, ...s });
  }

  console.log('👥  Clients...');
  const clientIds = [];
  for (const c of CLIENTS) {
    const r = await pool.query(
      `INSERT INTO clients
         (company_id, client_type, name, last_name, email, phone, address, city, zip_code, country, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Denmark',$10,$11)
       RETURNING id`,
      [
        companyId,
        c.type,
        c.name,
        c.last,
        c.email,
        c.phone,
        c.address,
        c.city,
        c.zip,
        c.lat,
        c.lng,
      ],
    );
    clientIds.push(r.rows[0].id);
  }

  // A few recurring subscriptions for the “Recurring” area
  console.log('🔁  Subscriptions...');
  for (let i = 0; i < 5; i++) {
    const clientId = clientIds[i];
    const svc = svcRows[i % svcRows.length];
    const start = `${YEAR}-01-${String(5 + i).padStart(2, '0')}`;
    const dow = (i % 5) + 1; // Mon–Fri
    let sub;
    try {
      sub = await pool.query(
        `INSERT INTO recurring_jobs (
           company_id, client_id, title, note,
           recurrence_type, day_of_week, interval_value, interval_weeks,
           starting_date, next_occurrence_date, assigned_user_id, status
         ) VALUES (
           $1, $2, $3, $4,
           'weekly', $5, 2, 2,
           $6, $6, $7, 'active'
         ) RETURNING id`,
        [companyId, clientId, svc.title, 'Fast rutekunde — hver anden uge', dow, start, ownerId],
      );
    } catch {
      sub = await pool.query(
        `INSERT INTO recurring_jobs (
           company_id, client_id, title, day_of_week, interval_weeks,
           starting_date, next_occurrence_date, assigned_user_id
         ) VALUES ($1,$2,$3,$4,2,$5,$5,$6) RETURNING id`,
        [companyId, clientId, svc.title, dow, start, ownerId],
      );
    }
    const subId = sub.rows[0].id;
    await pool
      .query(
        `INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes)
         VALUES ($1,$2,$3,$4)`,
        [subId, svc.id, svc.price, svc.duration],
      )
      .catch(() => {});
  }

  console.log(`📅  Jobs for every day in ${YEAR}...`);
  const pendingJobs = [];
  let clientCursor = 0;
  let sortGlobal = 0;
  const start = new Date(YEAR, 0, 1);
  const end = new Date(YEAR, 11, 31);

  for (let date = new Date(start); date <= end; date = addDays(date, 1)) {
    const dateStr = fmt(date);
    const dow = date.getDay();
    const count = jobsForDay(dow);
    const isPast = dateStr < todayStr;
    let timeCursor = dow === 0 ? 9 * 60 : 7 * 60 + 30;

    for (let n = 0; n < count; n++) {
      const clientId = clientIds[clientCursor % clientIds.length];
      clientCursor++;
      const svc = pick(svcRows);
      const jobMinutes = svc.duration + rand(0, 15);
      const timeFrom = minutesToTime(timeCursor);
      const timeTo = minutesToTime(timeCursor + jobMinutes);
      timeCursor += jobMinutes + rand(10, 25);

      let status = 'scheduled';
      if (isPast) status = Math.random() < 0.92 ? 'completed' : 'cancelled';
      else if (dateStr === todayStr) status = n < 2 ? 'completed' : 'scheduled';

      pendingJobs.push({
        company_id: companyId,
        client_id: clientId,
        assigned_user_id: ownerId,
        title: svc.title,
        note: pick(NOTES),
        scheduled_date: dateStr,
        scheduled_time_from: timeFrom,
        scheduled_time_to: timeTo,
        status,
        is_generated: false,
        sort_order: sortGlobal++,
        route_order: n,
        service_id: svc.id,
        service_price: svc.price,
        service_duration: svc.duration,
      });
    }
  }

  const jobColumns = [
    'company_id',
    'client_id',
    'assigned_user_id',
    'title',
    'note',
    'scheduled_date',
    'scheduled_time_from',
    'scheduled_time_to',
    'status',
    'is_generated',
    'sort_order',
    'route_order',
  ];
  const jobIds = await chunkedInsert(
    'jobs',
    jobColumns,
    pendingJobs.map((j) => ({
      company_id: j.company_id,
      client_id: j.client_id,
      assigned_user_id: j.assigned_user_id,
      title: j.title,
      note: j.note,
      scheduled_date: j.scheduled_date,
      scheduled_time_from: j.scheduled_time_from,
      scheduled_time_to: j.scheduled_time_to,
      status: j.status,
      is_generated: j.is_generated,
      sort_order: j.sort_order,
      route_order: j.route_order,
    })),
    { returning: 'id' },
  );

  const jsRows = jobIds.map((id, i) => ({
    job_id: id,
    service_id: pendingJobs[i].service_id,
    custom_price: pendingJobs[i].service_price,
    custom_duration_minutes: pendingJobs[i].service_duration,
    status:
      pendingJobs[i].status === 'completed'
        ? 'completed'
        : pendingJobs[i].status === 'cancelled'
          ? 'cancelled'
          : 'scheduled',
  }));
  await chunkedInsert('job_services', [
    'job_id',
    'service_id',
    'custom_price',
    'custom_duration_minutes',
    'status',
  ], jsRows);

  // Simple monthly invoices for completed work in past months of 2026
  console.log('🧾  Sample invoices...');
  let invoiceCount = 0;
  for (let month = 0; month < 12; month++) {
    const monthPrefix = `${YEAR}-${String(month + 1).padStart(2, '0')}`;
    if (monthPrefix > todayStr.slice(0, 7)) break;
    const clientId = clientIds[month % clientIds.length];
    const amount = 800 + month * 40 + rand(0, 200);
    const invDate = `${monthPrefix}-28`;
    if (invDate > todayStr) continue;
    const subtotal = amount;
    const taxAmount = Math.round(amount * 0.25);
    const total = subtotal + taxAmount;
    const inv = await pool.query(
      `INSERT INTO invoices (
         company_id, client_id, invoice_number, status, issue_date, due_date,
         subtotal, tax_rate, tax_amount, total, currency, created_by, paid_at
       ) VALUES (
         $1, $2, $3, 'paid', $4::date, $4::date,
         $5, 25, $6, $7, 'DKK', $8, ($4 || ' 12:00:00')::timestamp
       ) RETURNING id`,
      [
        companyId,
        clientId,
        `DEMO-${YEAR}-${String(month + 1).padStart(2, '0')}`,
        invDate,
        subtotal,
        taxAmount,
        total,
        ownerId,
      ],
    );
    if (inv?.rows?.[0]?.id) {
      invoiceCount++;
      // Link one completed job from that month when schema requires job_id on items
      const jobPick = await pool.query(
        `SELECT j.id AS job_id, js.service_id
         FROM jobs j
         JOIN job_services js ON js.job_id = j.id
         WHERE j.company_id = $1 AND j.status = 'completed'
           AND j.scheduled_date::text LIKE $2
         ORDER BY j.id ASC LIMIT 1`,
        [companyId, `${monthPrefix}%`],
      );
      if (jobPick.rows[0]) {
        await pool
          .query(
            `INSERT INTO invoice_items
               (invoice_id, job_id, service_id, description, quantity, unit_price, line_total)
             VALUES ($1,$2,$3,$4,1,$5,$5)`,
            [
              inv.rows[0].id,
              jobPick.rows[0].job_id,
              jobPick.rows[0].service_id,
              'Månedlig vindueservice',
              total,
            ],
          )
          .catch(() => {});
        await pool
          .query(`UPDATE jobs SET invoice_id = $1 WHERE id = $2`, [
            inv.rows[0].id,
            jobPick.rows[0].job_id,
          ])
          .catch(() => {});
      }
    }
  }

  // Email templates
  try {
    const { getSendInvoiceDefaults } = require('./api-server/utils/companyInvoiceEmailLocale');
    const sendInv = getSendInvoiceDefaults('DK');
    await pool.query(
      `INSERT INTO email_templates (company_id, template_type, subject, message)
       VALUES ($1,'send_invoice',$2,$3)
       ON CONFLICT (company_id, template_type) DO NOTHING`,
      [companyId, sendInv.subject, sendInv.message],
    );
  } catch {
    /* optional */
  }

  console.log('\n✅  Demo ready');
  console.log(`   Company: Nordlys Service  (/​${COMPANY_SLUG})`);
  console.log(`   Login:   ${DEMO_EMAIL}  /  ${PASSWORD}`);
  console.log(`   Clients: ${clientIds.length}`);
  console.log(`   Jobs:    ${jobIds.length} (every day of ${YEAR})`);
  console.log(`   Invoices:${invoiceCount}`);
  console.log('');

  await pool.end();
}

main().catch(async (e) => {
  console.error('\n❌  Seed failed:', e.message || e);
  await pool.end().catch(() => {});
  process.exit(1);
});
