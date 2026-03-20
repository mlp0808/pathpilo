/**
 * demo-seed.js — Realistic window cleaning demo for Copenhagen area
 *
 * CLEARS all existing data and creates a fresh demo dataset.
 *
 * Usage:  node demo-seed.js
 *
 * Login after running:
 *   admin@glasklart.dk   / demo1234   (owner/admin)
 *   mikkel@glasklart.dk  / demo1234   (employee — the window cleaner)
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'vevago_local',
  user:     process.env.DB_USER     || 'vevago_local',
  password: process.env.DB_PASSWORD || 'password123',
});

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Return Monday of the week containing `date`
const monday = (date) => {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

// Weekdays (Mon–Fri) for a given week offset from today's week
const weekdays = (weekOffset = 0) => {
  const mon = monday(new Date());
  mon.setDate(mon.getDate() + weekOffset * 7);
  return [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
};

// today's date string
const todayStr = fmt(new Date());

// ─── data ────────────────────────────────────────────────────────────────────

const CLIENTS = [
  // Private clients — apartments & houses in greater Copenhagen
  { type: 'person', name: 'Mads',      last: 'Vestergaard',  email: 'mads.vestergaard@gmail.com',   phone: '+45 2234 5678', address: 'Ordrupvej 45',           city: 'Charlottenlund', zip: '2920', lat: 55.7581, lng: 12.5786 },
  { type: 'person', name: 'Birgitte',  last: 'Møller',       email: 'birgitte.moller@outlook.dk',   phone: '+45 2345 6789', address: 'Frederiksberg Allé 78',  city: 'Frederiksberg',  zip: '2000', lat: 55.6758, lng: 12.5285 },
  { type: 'person', name: 'Søren',     last: 'Hansen',       email: 'soeren.h@gmail.com',           phone: '+45 2456 7890', address: 'Classensgade 12',        city: 'København Ø',    zip: '2100', lat: 55.7057, lng: 12.5778 },
  { type: 'person', name: 'Anne',      last: 'Lindberg',     email: 'anne.lindberg@me.com',         phone: '+45 2567 8901', address: 'Jægersborg Allé 23',     city: 'Charlottenlund', zip: '2920', lat: 55.7512, lng: 12.5701 },
  { type: 'person', name: 'Jens',      last: 'Bager',        email: 'jens.bager@mail.dk',           phone: '+45 2678 9012', address: 'Strandvejen 201',        city: 'Hellerup',       zip: '2900', lat: 55.7283, lng: 12.5779 },
  { type: 'person', name: 'Lotte',     last: 'Andersen',     email: 'lotte.andersen@privat.dk',     phone: '+45 2789 0123', address: 'Gammel Kongevej 110',    city: 'Frederiksberg',  zip: '1850', lat: 55.6813, lng: 12.5332 },
  { type: 'person', name: 'Peter',     last: 'Bjørnsson',    email: 'peter.bjoernsson@gmail.com',   phone: '+45 2890 1234', address: 'Strandmøllevej 8',       city: 'Klampenborg',    zip: '2930', lat: 55.7645, lng: 12.5889 },
  { type: 'person', name: 'Familie',   last: 'Christensen',  email: 'familie.christensen@home.dk',  phone: '+45 2901 2345', address: 'Solbakken 12',           city: 'Virum',          zip: '2830', lat: 55.7817, lng: 12.4983 },
  { type: 'person', name: 'Bodil',     last: 'Thygesen',     email: 'bodil.thygesen@gmail.com',     phone: '+45 3012 3456', address: 'Vodroffsvej 28',         city: 'Frederiksberg',  zip: '1900', lat: 55.6820, lng: 12.5294 },
  { type: 'person', name: 'Hans-Ole',  last: 'Madsen',       email: 'hansole.madsen@mail.dk',       phone: '+45 3123 4567', address: 'Niels Andersens Vej 12', city: 'Hellerup',       zip: '2900', lat: 55.7248, lng: 12.5650 },
  { type: 'person', name: 'Rikke',     last: 'Kjær',         email: 'rikke.kjaer@privat.dk',        phone: '+45 3234 5678', address: 'Smakkegårdsvej 45',      city: 'Gentofte',       zip: '2820', lat: 55.7441, lng: 12.5364 },
  { type: 'person', name: 'Thomas',    last: 'Dalgaard',     email: 'thomas.dalgaard@hotmail.dk',   phone: '+45 3345 6789', address: 'Nørre Allé 34',          city: 'København N',    zip: '2200', lat: 55.7000, lng: 12.5539 },
  { type: 'person', name: 'Camilla',   last: 'Skov',         email: 'camilla.skov@gmail.com',       phone: '+45 3456 7890', address: 'Bernstorffsvej 67',      city: 'Hellerup',       zip: '2900', lat: 55.7310, lng: 12.5578 },
  { type: 'person', name: 'Erik',      last: 'Nørgaard',     email: 'erik.noergaard@mail.dk',       phone: '+45 3567 8901', address: 'Lyngbyvej 89',           city: 'Gentofte',       zip: '2820', lat: 55.7420, lng: 12.5483 },
  // Business clients
  { type: 'company', name: 'Advokatfirmaet Larsen & Co', last: null, email: 'reception@larsenco.dk',   phone: '+45 3378 9012', address: 'Gothersgade 89',      city: 'København K',    zip: '1123', lat: 55.6851, lng: 12.5775 },
  { type: 'company', name: 'Tandlæge Karin Holm',        last: null, email: 'klinik@kariinholm.dk',    phone: '+45 3489 0123', address: 'Østerbrogade 55',     city: 'København Ø',    zip: '2100', lat: 55.7070, lng: 12.5745 },
  { type: 'company', name: 'Café Hyggehjørnet',           last: null, email: 'post@hyggekafee.dk',      phone: '+45 3590 1234', address: 'Istedgade 67',        city: 'København V',    zip: '1650', lat: 55.6668, lng: 12.5539 },
  { type: 'company', name: 'Ejendomsselskabet Nord ApS',  last: null, email: 'drift@nordej.dk',         phone: '+45 3601 2345', address: 'Tagensvej 125',       city: 'København N',    zip: '2200', lat: 55.7083, lng: 12.5503 },
];

// Services offered by a window cleaning company in Denmark
const SERVICES = [
  { title: 'Udvendig vinduesrensning',             price: 275,  duration: 40 },  // exterior only
  { title: 'Ind- og udvendig vinduesrensning',     price: 425,  duration: 70 },  // both sides
  { title: 'Storvinduespudsning (erhverv)',         price: 595,  duration: 90 },  // commercial
  { title: 'Tagrender rensning',                   price: 350,  duration: 55 },  // gutter cleaning
];

// Job notes that a window cleaner might actually write
const NOTES = [
  'Ring på dørklokken ved ankomst',
  'Nøgle under måtten ved bagdør',
  'Port kode: 1947',
  'Hund i haven – vær opmærksom',
  'Kontakt Hanne på mobil ved ankomst',
  'Parkeringskort ligger i hoveddør-kassen',
  'Adgang via bagtrappe',
  'Vinduerne er sidst rengjort for 3 måneder siden',
  'Lad venligst lågen bag sig',
  null,
  null,
  null, // most jobs have no note
];

const pickNote = () => NOTES[Math.floor(Math.random() * NOTES.length)];

// Times a window cleaner would start jobs at
const START_TIMES = ['07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '12:00', '13:00', '13:30', '14:00'];

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🪟  Glasklart Vinduespudsning — demo data generator\n');

  const passwordHash = await bcrypt.hash('demo1234', 10);

  // ── 1. Wipe all existing data ─────────────────────────────────────────────
  console.log('🗑  Clearing existing data...');
  await pool.query(`
    TRUNCATE TABLE
      job_logs, job_services, invoice_items, invoices,
      recurring_job_services, recurring_jobs,
      jobs, clients, services,
      email_templates,
      user_companies, companies, users
    RESTART IDENTITY CASCADE
  `);
  console.log('   Done.\n');

  // ── 2. Users ──────────────────────────────────────────────────────────────
  console.log('👤  Creating users...');

  const ownerRes = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role)
     VALUES ('Lars', 'Christiansen', 'admin@glasklart.dk', $1, 'company-owner')
     RETURNING id`,
    [passwordHash]
  );
  const ownerId = ownerRes.rows[0].id;

  const employeeRes = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role)
     VALUES ('Mikkel', 'Andersen', 'mikkel@glasklart.dk', $1, 'employee')
     RETURNING id`,
    [passwordHash]
  );
  const employeeId = employeeRes.rows[0].id;

  // ── 3. Company ────────────────────────────────────────────────────────────
  console.log('🏢  Creating company...');

  const companyRes = await pool.query(
    `INSERT INTO companies (name, slug, owner_id)
     VALUES ('Glasklart Vinduespudsning', 'glasklart-vinduespudsning', $1)
     RETURNING id`,
    [ownerId]
  );
  const companyId = companyRes.rows[0].id;

  await pool.query(`UPDATE users SET company_id = $1 WHERE id = ANY($2::int[])`,
    [companyId, [ownerId, employeeId]]);

  await pool.query(
    `INSERT INTO user_companies (user_id, company_id, role) VALUES
     ($1, $3, 'owner'),
     ($2, $3, 'employee')`,
    [ownerId, employeeId, companyId]
  );

  // ── 4. Services ───────────────────────────────────────────────────────────
  console.log('🛠  Creating services...');

  const svcIds = [];
  for (const s of SERVICES) {
    const r = await pool.query(
      `INSERT INTO services (company_id, title, price, duration_minutes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [companyId, s.title, s.price, s.duration]
    );
    svcIds.push({ id: r.rows[0].id, ...s });
  }

  // ── 5. Clients ────────────────────────────────────────────────────────────
  console.log('👥  Creating clients...');

  const clientIds = [];
  for (const c of CLIENTS) {
    const r = await pool.query(
      `INSERT INTO clients
         (company_id, client_type, name, last_name, email, phone, address, city, zip_code, country, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [companyId, c.type, c.name, c.last, c.email, c.phone,
       c.address, c.city, c.zip, 'Denmark', c.lat, c.lng]
    );
    clientIds.push(r.rows[0].id);
  }

  // ── 6. Email templates (empty defaults) ──────────────────────────────────
  for (const t of ['change_date', 'change_time', 'change_employee', 'cancel_job', 'send_invoice']) {
    await pool.query(
      `INSERT INTO email_templates (company_id, template_type, subject, message)
       VALUES ($1,$2,'','') ON CONFLICT (company_id, template_type) DO NOTHING`,
      [companyId, t]
    );
  }

  // ── 7. Build the schedule ─────────────────────────────────────────────────
  //
  // 5 weeks: -2, -1, current, +1, +2
  // Weekday counts per day chosen to look natural (not exactly same every day)
  //
  console.log('📅  Building job schedule...');

  const schedule = []; // { date, clientIdx, services: [svcId], status, timeFrom, timeNote }

  // Each week has a different job count pattern (Mon–Fri)
  const weekPatterns = [
    [4, 5, 3, 6, 4],   // 2 weeks ago
    [5, 4, 6, 3, 5],   // last week
    [5, 5, 4, 6, 4],   // this week (Mon-Wed past, Thu-Fri future)
    [4, 6, 5, 4, 3],   // next week
    [3, 5, 4, 5, 4],   // week after
  ];

  // Simple rotation across clients — ensures variety per day
  let clientCursor = 0;
  const nextClient = () => {
    const idx = clientCursor % clientIds.length;
    clientCursor++;
    return idx;
  };

  // Choose 1-2 services for a job, weighted towards single service
  const pickServices = (clientIdx) => {
    const c = CLIENTS[clientIdx];
    if (c.type === 'company') {
      // businesses get commercial cleaning
      return [svcIds[2]]; // Storvinduespudsning
    }
    const roll = Math.random();
    if (roll < 0.55) return [svcIds[1]];        // both sides — most common
    if (roll < 0.80) return [svcIds[0]];        // exterior only
    if (roll < 0.90) return [svcIds[1], svcIds[3]]; // both + gutters
    return [svcIds[0], svcIds[3]];              // exterior + gutters
  };

  const timeSlots = [...START_TIMES];

  for (let weekOffset = -2; weekOffset <= 2; weekOffset++) {
    const days = weekdays(weekOffset);
    const pattern = weekPatterns[weekOffset + 2];

    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const date = days[dayIdx];
      const dateStr = fmt(date);
      const count = pattern[dayIdx];
      const isInPast = dateStr < todayStr;
      const isToday  = dateStr === todayStr;

      // Shuffle time slots for this day
      const dayTimes = [...timeSlots].sort(() => Math.random() - 0.5).slice(0, count);
      dayTimes.sort(); // chronological order

      for (let jobIdx = 0; jobIdx < count; jobIdx++) {
        const cIdx = nextClient();
        const svcs = pickServices(cIdx);
        const totalDur = svcs.reduce((s, sv) => s + sv.duration, 0);
        const timeFrom = dayTimes[jobIdx];

        // Calculate timeTo
        const [h, m] = timeFrom.split(':').map(Number);
        const endMin = h * 60 + m + totalDur;
        const timeTo = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

        // Status: past = completed (occasionally cancelled), today = first half completed, future = scheduled
        let status = 'scheduled';
        if (isInPast) {
          status = Math.random() < 0.92 ? 'completed' : 'cancelled';
        } else if (isToday) {
          status = jobIdx < Math.floor(count / 2) ? 'completed' : 'scheduled';
        }

        schedule.push({
          dateStr,
          clientId: clientIds[cIdx],
          svcs,
          status,
          timeFrom,
          timeTo,
          note: pickNote(),
          sortOrder: jobIdx,
          routeOrder: jobIdx,
        });
      }
    }
  }

  // ── 8. Insert jobs ────────────────────────────────────────────────────────
  console.log(`💼  Inserting ${schedule.length} jobs...`);

  const insertedJobs = [];
  for (const j of schedule) {
    const title = j.svcs.length === 1
      ? j.svcs[0].title
      : `${j.svcs[0].title} + ${j.svcs[1].title}`;

    const jobRes = await pool.query(
      `INSERT INTO jobs
         (company_id, client_id, assigned_user_id, title, note,
          scheduled_date, scheduled_time_from, scheduled_time_to,
          status, is_generated, sort_order, route_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11)
       RETURNING id, status`,
      [companyId, j.clientId, employeeId, title, j.note,
       j.dateStr, j.timeFrom, j.timeTo,
       j.status, j.sortOrder, j.routeOrder]
    );
    const jobId = jobRes.rows[0].id;
    insertedJobs.push({ id: jobId, clientId: j.clientId, status: j.status, svcs: j.svcs, dateStr: j.dateStr });

    // Add job_services (all marked completed if job is completed)
    for (const svc of j.svcs) {
      const svcStatus = j.status === 'completed' ? 'completed' : (j.status === 'cancelled' ? 'cancelled' : 'scheduled');
      await pool.query(
        `INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes, status)
         VALUES ($1,$2,$3,$4,$5)`,
        [jobId, svc.id, svc.price, svc.duration, svcStatus]
      );
    }
  }

  // ── 9. Invoices for past completed jobs ──────────────────────────────────
  console.log('🧾  Creating invoices...');

  // Group completed jobs from 2 weeks ago by client, invoice each client once
  const twoWeeksAgo = weekdays(-2);
  const twoWeeksAgoStrs = new Set(twoWeeksAgo.map(fmt));

  // Collect jobs from -2 week that are completed
  const invoiceableJobs = insertedJobs.filter(
    j => j.status === 'completed' && twoWeeksAgoStrs.has(j.dateStr)
  );

  // Group by client
  const byClient = {};
  for (const j of invoiceableJobs) {
    if (!byClient[j.clientId]) byClient[j.clientId] = [];
    byClient[j.clientId].push(j);
  }

  let invNum = 1;
  for (const [clientId, jobs] of Object.entries(byClient)) {
    const subtotal = jobs.reduce((sum, j) =>
      sum + j.svcs.reduce((s, sv) => s + sv.price, 0), 0);
    const taxRate  = 25;
    const taxAmount = subtotal * 0.25;
    const total    = subtotal + taxAmount;
    const issueDate = twoWeeksAgo[4]; // Friday of -2 week
    const dueDate   = addDays(issueDate, 14);
    const invNumber = `INV-2026-${String(invNum++).padStart(4, '0')}`;

    const invRes = await pool.query(
      `INSERT INTO invoices
         (company_id, client_id, invoice_number, issue_date, due_date,
          subtotal, tax_rate, tax_amount, total, currency, notes, payment_terms, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DKK',$10,$11,$12)
       RETURNING id`,
      [companyId, clientId, invNumber, fmt(issueDate), fmt(dueDate),
       subtotal, taxRate, taxAmount, total,
       'Tak for din ordre.',
       'Betaling inden 14 dage.',
       ownerId]
    );
    const invoiceId = invRes.rows[0].id;

    // Invoice items + mark jobs as invoiced
    for (const j of jobs) {
      for (const svc of j.svcs) {
        await pool.query(
          `INSERT INTO invoice_items
             (invoice_id, job_id, service_id, description, quantity, unit_price, line_total)
           VALUES ($1,$2,$3,$4,1,$5,$5)`,
          [invoiceId, j.id, svc.id, svc.title, svc.price]
        );
      }
      await pool.query(`UPDATE jobs SET invoice_id = $1 WHERE id = $2`, [invoiceId, j.id]);
    }
  }
  console.log(`   Created ${invNum - 1} invoices.\n`);

  // ── 10. Subscriptions (3 recurring clients) ───────────────────────────────
  console.log('🔄  Creating subscriptions...');

  // Client 0 (Mads Vestergaard): monthly exterior cleaning
  const sub1 = await pool.query(
    `INSERT INTO recurring_jobs
       (company_id, client_id, assigned_user_id, title, note,
        scheduled_time_from, scheduled_time_to, day_of_week, interval_weeks,
        is_active, starting_date, next_occurrence_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11)
     RETURNING id`,
    [companyId, clientIds[0], employeeId,
     'Månedlig vinduesrensning', 'Ring på dørklokken',
     '08:00', '09:00',
     2, 4, // every 4 weeks on Tuesday
     fmt(addDays(new Date(), -28)),
     fmt(addDays(new Date(), 7))]
  );
  await pool.query(
    `INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes)
     VALUES ($1,$2,$3,$4)`,
    [sub1.rows[0].id, svcIds[0].id, svcIds[0].price, svcIds[0].duration]
  );

  // Client 4 (Jens Bager): bi-weekly both sides
  const sub2 = await pool.query(
    `INSERT INTO recurring_jobs
       (company_id, client_id, assigned_user_id, title, note,
        scheduled_time_from, scheduled_time_to, day_of_week, interval_weeks,
        is_active, starting_date, next_occurrence_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11)
     RETURNING id`,
    [companyId, clientIds[4], employeeId,
     'Halvmånedlig vinduesrensning', null,
     '10:00', '11:10',
     4, 2, // every 2 weeks on Thursday
     fmt(addDays(new Date(), -14)),
     fmt(addDays(new Date(), 9))]
  );
  await pool.query(
    `INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes)
     VALUES ($1,$2,$3,$4)`,
    [sub2.rows[0].id, svcIds[1].id, svcIds[1].price, svcIds[1].duration]
  );

  // Client 15 (Advokatfirmaet): monthly commercial
  const sub3 = await pool.query(
    `INSERT INTO recurring_jobs
       (company_id, client_id, assigned_user_id, title, note,
        scheduled_time_from, scheduled_time_to, day_of_week, interval_weeks,
        is_active, starting_date, next_occurrence_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11)
     RETURNING id`,
    [companyId, clientIds[14], employeeId,
     'Månedlig erhvervs vinduesrensning', 'Adgang via kælder – nøgle hos receptionen',
     '07:30', '09:00',
     1, 4, // every 4 weeks on Monday
     fmt(addDays(new Date(), -21)),
     fmt(addDays(new Date(), 7))]
  );
  await pool.query(
    `INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes)
     VALUES ($1,$2,$3,$4)`,
    [sub3.rows[0].id, svcIds[2].id, svcIds[2].price, svcIds[2].duration]
  );

  // ── done ──────────────────────────────────────────────────────────────────
  console.log('\n✅  Demo seed complete!\n');
  console.log('─'.repeat(52));
  console.log('🏢  Company:   Glasklart Vinduespudsning');
  console.log(`📋  Clients:   ${CLIENTS.length}`);
  console.log(`💼  Jobs:      ${schedule.length} (${schedule.filter(j => j.status === 'completed').length} completed, ${schedule.filter(j => j.status === 'scheduled').length} scheduled, ${schedule.filter(j => j.status === 'cancelled').length} cancelled)`);
  console.log(`🧾  Invoices:  ${invNum - 1}`);
  console.log('🔄  Subscriptions: 3');
  console.log('─'.repeat(52));
  console.log('\n👤  Login credentials (password: demo1234)');
  console.log('   admin@glasklart.dk     — owner (admin view)');
  console.log('   mikkel@glasklart.dk    — employee (Mikkel Andersen)\n');
  console.log('🌐  Company slug: glasklart-vinduespudsning\n');

  await pool.end();
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
