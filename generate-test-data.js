require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

/**
 * Generate comprehensive test data for PathPilo
 * - 500 clients
 * - Each client gets a subscription with varying recurrence patterns
 * - Jobs generated from subscriptions (past = completed, future = scheduled)
 * - Random manual jobs
 * - Everything distributed across 3 users
 */

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vevago_local',
  user: process.env.DB_USER || 'vevago_local',
  password: process.env.DB_PASSWORD || 'password123'
});

// Danish names and addresses for realism
const firstNames = [
  'Lars', 'Peter', 'Michael', 'Jens', 'Henrik', 'Thomas', 'Anders', 'Martin', 'Christian', 'Mads',
  'Anne', 'Mette', 'Hanne', 'Lise', 'Karen', 'Susanne', 'Maria', 'Camilla', 'Louise', 'Nina',
  'Søren', 'Ole', 'Jan', 'Erik', 'Niels', 'Klaus', 'Brian', 'Kim', 'John', 'Daniel',
  'Anna', 'Emma', 'Sofia', 'Ida', 'Freja', 'Clara', 'Alberte', 'Ella', 'Agnes', 'Olivia'
];

const lastNames = [
  'Hansen', 'Jensen', 'Nielsen', 'Andersen', 'Pedersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Petersen',
  'Jørgensen', 'Madsen', 'Kristensen', 'Olsen', 'Thomsen', 'Christiansen', 'Poulsen', 'Johansen', 'Møller', 'Mortensen',
  'Knudsen', 'Jakobsen', 'Holm', 'Schmidt', 'Lauridsen', 'Mikkelsen', 'Frederiksen', 'Henriksen', 'Hansen', 'Eriksen'
];

const companyNames = [
  'Nordic Solutions', 'Scandinavian Services', 'Copenhagen Clean', 'Aarhus Maintenance', 'Odense Care',
  'Aalborg Services', 'Esbjerg Solutions', 'Roskilde Services', 'Horsens Clean', 'Vejle Maintenance',
  'Herning Services', 'Silkeborg Solutions', 'Næstved Clean', 'Kolding Services', 'Randers Maintenance',
  'Viborg Solutions', 'Hjørring Services', 'Holstebro Clean', 'Slagelse Maintenance', 'Hillerød Services'
];

const streetNames = [
  'Hovedgaden', 'Strandvejen', 'Kongensgade', 'Dronningensgade', 'Storegade', 'Kirkegade', 'Skolegade', 'Parkvej',
  'Bakkevej', 'Skovvej', 'Havnegade', 'Markvej', 'Vejlevej', 'Åboulevard', 'Boulevarden', 'Østergade', 'Vestergade',
  'Nørregade', 'Søndergade', 'Bredgade', 'Langgade', 'Nyvej', 'Gammelgade', 'Centrumgade'
];

const cities = [
  'København', 'Aarhus', 'Odense', 'Aalborg', 'Esbjerg', 'Randers', 'Kolding', 'Horsens', 'Vejle', 'Roskilde',
  'Herning', 'Helsingør', 'Silkeborg', 'Næstved', 'Fredericia', 'Viborg', 'Køge', 'Holstebro', 'Taastrup', 'Sønderborg'
];

const serviceTypes = [
  { title: 'Window Cleaning', price: 250, duration: 60 },
  { title: 'Deep Cleaning', price: 800, duration: 180 },
  { title: 'Regular Cleaning', price: 400, duration: 120 },
  { title: 'Carpet Cleaning', price: 600, duration: 150 },
  { title: 'Office Cleaning', price: 500, duration: 120 },
  { title: 'Garden Maintenance', price: 350, duration: 90 },
  { title: 'Lawn Mowing', price: 200, duration: 45 },
  { title: 'Hedge Trimming', price: 300, duration: 60 },
  { title: 'Snow Removal', price: 400, duration: 90 },
  { title: 'Property Inspection', price: 450, duration: 60 }
];

const jobNotes = [
  'Please use side entrance', 'Customer prefers morning visits', 'Ring doorbell twice', 'Leave key under mat',
  'Park in designated area', 'Customer has pets - be careful', 'Use eco-friendly products only', 'Customer prefers afternoon',
  'Access via back gate', 'Customer will be home', 'Leave invoice in mailbox', 'Call 30 min before arrival',
  'Special instructions provided', 'Customer requested extra attention to kitchen', 'No need to ring - just enter',
  'Customer prefers quiet hours', 'Use back door only', 'Customer will leave key', 'Park on street, not driveway'
];

function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(hours, minutes = 0) {
  const h = typeof hours === 'string' ? hours : String(hours).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');
  // If hours is already a time string like "08:30:00", return it
  if (typeof hours === 'string' && hours.includes(':')) {
    return hours.includes(':00') ? hours : hours + ':00';
  }
  return `${h}:${m}:00`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addWeeks(date, weeks) {
  return addDays(date, weeks * 7);
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

async function generateTestData() {
  console.log('🚀 Starting test data generation...\n');

  try {
    // Get or create company and users
    console.log('📋 Setting up company and users...');
    
    // Find existing company or create one
    let companyResult = await pool.query('SELECT id FROM companies LIMIT 1');
    let companyId;
    
    if (companyResult.rows.length === 0) {
      // Create company
      const companyName = 'Test Service Company';
      const slug = companyName.toLowerCase().replace(/\s+/g, '-');
      companyResult = await pool.query(
        'INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING id',
        [companyName, slug]
      );
      companyId = companyResult.rows[0].id;
      console.log(`✅ Created company: ${companyName} (ID: ${companyId})`);
    } else {
      companyId = companyResult.rows[0].id;
      console.log(`✅ Using existing company (ID: ${companyId})`);
    }

    // Get or create 3 users
    let users = [];
    const userEmails = ['employee1@test.com', 'employee2@test.com', 'employee3@test.com'];
    const passwordHash = await bcrypt.hash('password123', 10);

    for (let i = 0; i < 3; i++) {
      let userResult = await pool.query('SELECT id FROM users WHERE email = $1', [userEmails[i]]);
      
      if (userResult.rows.length === 0) {
        userResult = await pool.query(
          `INSERT INTO users (first_name, last_name, email, password_hash, role) 
           VALUES ($1, $2, $3, $4, 'employee') RETURNING id`,
          [`Employee${i + 1}`, 'Test', userEmails[i], passwordHash]
        );
        
        // Link user to company
        await pool.query(
          'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [userResult.rows[0].id, companyId, 'employee']
        );
        
        users.push(userResult.rows[0].id);
        console.log(`✅ Created user: ${userEmails[i]} (ID: ${userResult.rows[0].id})`);
      } else {
        users.push(userResult.rows[0].id);
        console.log(`✅ Using existing user: ${userEmails[i]} (ID: ${userResult.rows[0].id})`);
      }
    }

    // Create services if they don't exist
    console.log('\n📦 Creating services...');
    const serviceIds = [];
    for (const service of serviceTypes) {
      const result = await pool.query(
        'SELECT id FROM services WHERE company_id = $1 AND title = $2',
        [companyId, service.title]
      );
      
      if (result.rows.length === 0) {
        const insertResult = await pool.query(
          'INSERT INTO services (company_id, title, price, duration_minutes) VALUES ($1, $2, $3, $4) RETURNING id',
          [companyId, service.title, service.price, service.duration]
        );
        const serviceId = insertResult.rows[0].id;
        serviceIds.push(serviceId);
        console.log(`   Created service: ${service.title} (ID: ${serviceId}, Price: ${service.price}, Duration: ${service.duration}m)`);
      } else {
        const serviceId = result.rows[0].id;
        serviceIds.push(serviceId);
        console.log(`   Found existing service: ${service.title} (ID: ${serviceId})`);
      }
    }
    console.log(`✅ Created/found ${serviceIds.length} services`);
    console.log(`   Service IDs: [${serviceIds.join(', ')}]`);

    // Generate 500 clients
    console.log('\n👥 Creating 500 clients...');
    const clientIds = [];
    const today = new Date();
    const sixMonthsAgo = addMonths(today, -6);
    
    for (let i = 0; i < 500; i++) {
      const isCompany = Math.random() > 0.6; // 40% companies, 60% individuals
      const firstName = randomElement(firstNames);
      const lastName = randomElement(lastNames);
      const streetNum = randomInt(1, 200);
      const zipCode = randomInt(1000, 9999);
      const city = randomElement(cities);
      
      let clientData;
      if (isCompany) {
        const companyName = randomElement(companyNames) + ' ' + randomElement(['A/S', 'ApS', 'IVS', '']);
        clientData = {
          client_type: 'company',
          name: companyName,
          company_number: `CVR ${randomInt(10000000, 99999999)}`,
          contact_name: `${firstName} ${lastName}`,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${companyName.toLowerCase().replace(/\s+/g, '')}.dk`,
          phone: `+45 ${randomInt(20, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
          address: `${randomElement(streetNames)} ${streetNum}`,
          zip_code: zipCode.toString(),
          city: city,
          country: 'Denmark'
        };
      } else {
        clientData = {
          client_type: 'person',
          name: firstName,
          last_name: lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.dk`,
          phone: `+45 ${randomInt(20, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
          address: `${randomElement(streetNames)} ${streetNum}`,
          zip_code: zipCode.toString(),
          city: city,
          country: 'Denmark'
        };
      }

      const result = await pool.query(
        `INSERT INTO clients (company_id, client_type, name, last_name, company_number, contact_name, 
         email, phone, address, zip_code, city, country, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          companyId,
          clientData.client_type,
          clientData.name,
          clientData.last_name || null,
          clientData.company_number || null,
          clientData.contact_name || null,
          clientData.email,
          clientData.phone,
          clientData.address,
          clientData.zip_code,
          clientData.city,
          clientData.country,
          randomDate(sixMonthsAgo, today)
        ]
      );
      
      clientIds.push(result.rows[0].id);
      
      if ((i + 1) % 100 === 0) {
        console.log(`   Created ${i + 1}/500 clients...`);
      }
    }
    console.log(`✅ Created ${clientIds.length} clients`);

    // Create subscriptions for each client with varying recurrence patterns
    console.log('\n🔄 Creating subscriptions...');
    const subscriptionIds = [];
    const recurrencePatterns = [
      { type: 'weekly', interval: 1, dayOfWeek: null },      // Every week
      { type: 'weekly', interval: 2, dayOfWeek: null },       // Every 2 weeks
      { type: 'weekly', interval: 4, dayOfWeek: null },       // Every 4 weeks
      { type: 'weekly', interval: 8, dayOfWeek: null },       // Every 8 weeks
      { type: 'monthly', interval: 1, dayOfMonth: null },     // Every month
      { type: 'monthly', interval: 2, dayOfMonth: null },      // Every 2 months
      { type: 'monthly', interval: 3, dayOfMonth: null },    // Every 3 months
    ];

    for (let i = 0; i < clientIds.length; i++) {
      const clientId = clientIds[i];
      const pattern = randomElement(recurrencePatterns);
      const assignedUserId = users[i % users.length]; // Distribute across users
      const serviceId = randomElement(serviceIds);
      const service = serviceTypes[serviceIds.indexOf(serviceId)];
      
      // Starting date between 6 months ago and 1 month ago
      const startDate = randomDate(addMonths(today, -6), addMonths(today, -1));
      // Always provide day_of_week (even for monthly, though it won't be used)
      const dayOfWeek = pattern.type === 'weekly' ? randomInt(0, 6) : 0; // Use 0 (Sunday) as default for monthly
      const dayOfMonth = pattern.type === 'monthly' ? randomInt(1, 28) : null;
      
      // Calculate next occurrence
      let nextOccurrence = new Date(startDate);
      if (pattern.type === 'weekly') {
        // Find next occurrence of that day of week
        const daysToAdd = (dayOfWeek - nextOccurrence.getDay() + 7) % 7;
        if (daysToAdd === 0) nextOccurrence = addWeeks(nextOccurrence, pattern.interval);
        else nextOccurrence = addDays(nextOccurrence, daysToAdd);
      } else {
        nextOccurrence.setDate(dayOfMonth);
        if (nextOccurrence < startDate) {
          nextOccurrence = addMonths(nextOccurrence, pattern.interval);
        }
      }
      
      const timeFrom = randomInt(8, 15); // 8 AM to 3 PM
      const durationHours = Math.ceil(service.duration / 60);
      const timeTo = Math.min(timeFrom + durationHours, 18); // Don't go past 6 PM
      
      // Ensure day_of_week is never null (required by DB constraint)
      const finalDayOfWeek = dayOfWeek !== null && dayOfWeek !== undefined ? dayOfWeek : 0;
      
      const result = await pool.query(
        `INSERT INTO recurring_jobs 
         (company_id, client_id, assigned_user_id, title, note, scheduled_time_from, scheduled_time_to,
          recurrence_type, day_of_week, day_of_month, interval_value, is_active, starting_date, next_occurrence_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [
          companyId,
          clientId,
          assignedUserId,
          `${service.title} - ${pattern.type === 'weekly' ? `Every ${pattern.interval} week(s)` : `Every ${pattern.interval} month(s)`}`,
          Math.random() > 0.7 ? randomElement(jobNotes) : null,
          formatTime(timeFrom, 0),
          formatTime(timeTo, 0),
          pattern.type,
          finalDayOfWeek, // Always a number, never null
          dayOfMonth,
          pattern.interval,
          true,
          formatDate(startDate),
          formatDate(nextOccurrence)
        ]
      );
      
      const subscriptionId = result.rows[0].id;
      subscriptionIds.push(subscriptionId);
      
      // Add service to subscription
      await pool.query(
        'INSERT INTO recurring_job_services (recurring_job_id, service_id) VALUES ($1, $2)',
        [subscriptionId, serviceId]
      );
      
      if ((i + 1) % 100 === 0) {
        console.log(`   Created ${i + 1}/500 subscriptions...`);
      }
    }
    console.log(`✅ Created ${subscriptionIds.length} subscriptions`);

    // Generate jobs from subscriptions (past = completed, future = scheduled)
    console.log('\n📅 Generating jobs from subscriptions...');
    let jobCount = 0;
    const oneYearAgo = addMonths(today, -12);
    const threeMonthsFuture = addMonths(today, 3);
    
    for (const subscriptionId of subscriptionIds) {
      const subResult = await pool.query(
        `SELECT * FROM recurring_jobs WHERE id = $1`,
        [subscriptionId]
      );
      const sub = subResult.rows[0];
      
      if (!sub) continue;
      
      const startDate = new Date(sub.starting_date);
      const endDate = new Date(Math.min(threeMonthsFuture, addDays(today, 90)));
      
      // Start from the beginning or one year ago, whichever is later
      let currentDate = new Date(Math.max(startDate, oneYearAgo));
      
      // Generate jobs
      let iterations = 0;
      const maxIterations = 100; // Safety limit
      
      while (currentDate <= endDate && iterations < maxIterations) {
        iterations++;
        let jobDate = null;
        
        if (sub.recurrence_type === 'weekly') {
          // Find the first occurrence of the target day_of_week from currentDate
          const currentDayOfWeek = currentDate.getDay();
          let daysToAdd = (sub.day_of_week - currentDayOfWeek + 7) % 7;
          
          if (daysToAdd === 0 && currentDate.getTime() >= startDate.getTime()) {
            // Already on the right day
            jobDate = new Date(currentDate);
          } else {
            jobDate = addDays(currentDate, daysToAdd);
          }
          
          // Move to next interval
          currentDate = addWeeks(jobDate, sub.interval_value);
        } else {
          // Monthly
          jobDate = new Date(currentDate);
          jobDate.setDate(sub.day_of_month);
          
          // If the date is before startDate, move to next month
          if (jobDate < startDate) {
            jobDate = addMonths(jobDate, sub.interval_value);
          }
          
          // Move to next interval
          currentDate = addMonths(jobDate, sub.interval_value);
        }
        
        // Only create jobs within our date range
        if (jobDate && jobDate >= oneYearAgo && jobDate <= endDate) {
          const status = jobDate < today ? 'completed' : 'scheduled';
          let timeFrom = sub.scheduled_time_from;
          let timeTo = sub.scheduled_time_to;
          
          if (!timeFrom) {
            const hours = randomInt(8, 15);
            timeFrom = formatTime(hours, 0);
            timeTo = formatTime(Math.min(hours + 2, 18), 0);
          } else if (!timeTo) {
            const [hours] = timeFrom.split(':').map(Number);
            timeTo = formatTime(Math.min(hours + 2, 18), 0);
          }
          
          // Get service price for realistic total_price
          const serviceResult = await pool.query(
            'SELECT s.price, s.duration_minutes FROM recurring_job_services rjs JOIN services s ON rjs.service_id = s.id WHERE rjs.recurring_job_id = $1 LIMIT 1',
            [subscriptionId]
          );
          
          const basePrice = serviceResult.rows[0]?.price || 400;
          const baseDuration = serviceResult.rows[0]?.duration_minutes || 120;
          
          const jobResult = await pool.query(
            `INSERT INTO jobs 
             (company_id, client_id, assigned_user_id, title, note, scheduled_date, scheduled_time_from, 
              scheduled_time_to, status, recurring_job_id, is_generated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [
              companyId,
              sub.client_id,
              sub.assigned_user_id,
              sub.title,
              sub.note,
              formatDate(jobDate),
              timeFrom,
              timeTo,
              status,
              subscriptionId,
              true
            ]
          );
          
          // Add job services
          const servicesResult = await pool.query(
            'SELECT service_id FROM recurring_job_services WHERE recurring_job_id = $1',
            [subscriptionId]
          );
          
          for (const row of servicesResult.rows) {
            if (row.service_id) {
              // Verify service exists before linking
              const serviceCheck = await pool.query(
                'SELECT id FROM services WHERE id = $1 AND company_id = $2',
                [row.service_id, companyId]
              );
              
              if (serviceCheck.rows.length > 0) {
                await pool.query(
                  'INSERT INTO job_services (job_id, service_id) VALUES ($1, $2)',
                  [jobResult.rows[0].id, row.service_id]
                );
              } else {
                console.warn(`⚠️ Service ${row.service_id} not found for job ${jobResult.rows[0].id}`);
              }
            }
          }
          
          jobCount++;
        }
      }
      
      if (subscriptionIds.indexOf(subscriptionId) % 100 === 0) {
        console.log(`   Processed ${subscriptionIds.indexOf(subscriptionId) + 1}/${subscriptionIds.length} subscriptions, generated ${jobCount} jobs...`);
      }
    }
    console.log(`✅ Generated ${jobCount} jobs from subscriptions`);

    // Generate random manual jobs
    console.log('\n📝 Creating random manual jobs...');
    const manualJobCount = 200;
    const manualJobDates = [];
    
    // Mix of past and future dates
    for (let i = 0; i < manualJobCount; i++) {
      const isPast = Math.random() > 0.3; // 70% past, 30% future
      const date = isPast 
        ? randomDate(oneYearAgo, today)
        : randomDate(today, threeMonthsFuture);
      manualJobDates.push(date);
    }
    
    for (let i = 0; i < manualJobCount; i++) {
      const clientId = randomElement(clientIds);
      const assignedUserId = users[i % users.length];
      const serviceId = randomElement(serviceIds);
      const service = serviceTypes[serviceIds.indexOf(serviceId)];
      const jobDate = manualJobDates[i];
      const status = jobDate < today ? 'completed' : 'scheduled';
      const timeFrom = randomInt(8, 15);
      const durationHours = Math.ceil(service.duration / 60);
      const timeTo = Math.min(timeFrom + durationHours, 18);
      
      const jobResult = await pool.query(
        `INSERT INTO jobs 
         (company_id, client_id, assigned_user_id, title, note, scheduled_date, scheduled_time_from, 
          scheduled_time_to, status, is_generated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          companyId,
          clientId,
          assignedUserId,
          service.title,
          Math.random() > 0.5 ? randomElement(jobNotes) : null,
          formatDate(jobDate),
          formatTime(timeFrom, 0),
          formatTime(timeTo, 0),
          status,
          false
        ]
      );
      
      // Verify service exists before linking
      const serviceCheck = await pool.query(
        'SELECT id FROM services WHERE id = $1 AND company_id = $2',
        [serviceId, companyId]
      );
      
      if (serviceCheck.rows.length > 0) {
        await pool.query(
          'INSERT INTO job_services (job_id, service_id) VALUES ($1, $2)',
          [jobResult.rows[0].id, serviceId]
        );
      } else {
        console.warn(`⚠️ Service ${serviceId} not found for manual job ${jobResult.rows[0].id}`);
      }
      
      if ((i + 1) % 50 === 0) {
        console.log(`   Created ${i + 1}/${manualJobCount} manual jobs...`);
      }
    }
    console.log(`✅ Created ${manualJobCount} manual jobs`);

    // Verify data integrity
    console.log('\n🔍 Verifying data integrity...');
    const verifyResult = await pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(js.id) as jobs_with_services,
        COUNT(CASE WHEN js.service_id IS NOT NULL THEN 1 END) as jobs_with_service_id,
        COUNT(CASE WHEN s.id IS NOT NULL THEN 1 END) as jobs_with_valid_service
      FROM jobs j
      LEFT JOIN job_services js ON j.id = js.job_id
      LEFT JOIN services s ON js.service_id = s.id
      WHERE j.company_id = $1
    `, [companyId]);
    
    const verify = verifyResult.rows[0];
    console.log(`   - Total jobs: ${verify.total_jobs}`);
    console.log(`   - Jobs with job_services: ${verify.jobs_with_services}`);
    console.log(`   - Jobs with service_id: ${verify.jobs_with_service_id}`);
    console.log(`   - Jobs with valid service link: ${verify.jobs_with_valid_service}`);
    
    if (verify.jobs_with_valid_service < verify.total_jobs) {
      console.warn(`   ⚠️ Warning: ${verify.total_jobs - verify.jobs_with_valid_service} jobs have invalid service links`);
    }

    // Summary
    console.log('\n✨ Test data generation complete!');
    console.log('\n📊 Summary:');
    console.log(`   - Company ID: ${companyId}`);
    console.log(`   - Users: ${users.length}`);
    console.log(`   - Clients: ${clientIds.length}`);
    console.log(`   - Subscriptions: ${subscriptionIds.length}`);
    console.log(`   - Jobs from subscriptions: ${jobCount}`);
    console.log(`   - Manual jobs: ${manualJobCount}`);
    console.log(`   - Total jobs: ${jobCount + manualJobCount}`);
    console.log('\n✅ All past jobs are marked as completed');
    console.log('✅ All future jobs are marked as scheduled');
    console.log('✅ Jobs are distributed across 3 users');
    console.log('\n🎉 Your platform is now alive with realistic data!');

  } catch (error) {
    console.error('❌ Error generating test data:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
generateTestData().catch(console.error);
