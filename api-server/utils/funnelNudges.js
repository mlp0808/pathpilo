/**
 * Funnel nudge email engine.
 *
 * Runs on the existing 60-second server tick. For every lead stuck at a given
 * funnel step it checks:
 *   1. Has enough inactivity time passed since they entered that step?
 *   2. Has this specific nudge email already been sent?
 *   3. Have they already advanced past this step? (suppress if so)
 *
 * Sends via the existing sendEmail() helper (Resend / SMTP).
 * Records every send in funnel_nudge_sends so no one gets the same email twice.
 *
 * CTA links use /login?resume=1 for account-holders (the app auto-redirects them
 * to their current wizard step after login) and /register for pre-account leads.
 */

const { pool } = require('./database');
const { sendEmail } = require('./email');

const APP_URL = process.env.APP_URL || 'https://app.pathpilo.com';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://pathpilo.com';
const FROM_EMAIL = process.env.FUNNEL_FROM_EMAIL || process.env.FROM_EMAIL || 'mikkel@pathpilo.com';
const FROM_NAME = process.env.FUNNEL_FROM_NAME || process.env.FROM_NAME || 'Mikkel from PathPilo';

// ─── Schema ──────────────────────────────────────────────────────────────────

async function ensureFunnelNudgeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS funnel_nudge_sends (
      id            SERIAL PRIMARY KEY,
      nudge_id      VARCHAR(64)  NOT NULL,
      email         VARCHAR(320) NOT NULL,
      funnel_step   INTEGER      NOT NULL,
      sent_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
      UNIQUE (nudge_id, email)
    )
  `);
  // Index for fast "has this email been sent?" lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fns_email ON funnel_nudge_sends (email)
  `);
}

// ─── Nudge definitions ────────────────────────────────────────────────────────
// Mirror of app/admin/lib/nudgeEmails.ts — source of truth for timing + IDs.
// HTML bodies are regenerated server-side from the template functions below.
//
// Step/gap mapping (matches the 6-step funnel display):
//   fromStep 1 → gap 1→2 : user entered email but never filled name/password
//   fromStep 2 → gap 2→3 : filled name/password, verification email sent, not clicked yet
//   fromStep 3 → gap 3→4 : email verified, logged in, hasn't added a customer
//   fromStep 4 → gap 4→5 : has a customer, hasn't added a job
//   fromStep 5 → gap 5→6 : added a job / saw route, hasn't completed business setup

const NUDGES = [
  // Gap 1→2 : Finish signing up (entered email, never submitted registration form)
  { id: 'signup-1', fromStep: 1, afterHours: 1  },
  { id: 'signup-2', fromStep: 1, afterHours: 22 },
  // Gap 2→3 : Verify email (submitted form, verification code sent, not clicked yet)
  { id: 'verify-1', fromStep: 2, afterHours: 1  },
  { id: 'verify-2', fromStep: 2, afterHours: 22 },
  // Gap 3→4 : Add first customer
  { id: 'welcome-add-client', fromStep: 3, afterHours: 1  },
  { id: 'add-client-value',   fromStep: 3, afterHours: 24 },
  { id: 'add-client-founder', fromStep: 3, afterHours: 72 },
  // Gap 4→5 : Add first job (the aha moment)
  { id: 'add-job-1',       fromStep: 4, afterHours: 2  },
  { id: 'add-job-value',   fromStep: 4, afterHours: 24 },
  { id: 'add-job-founder', fromStep: 4, afterHours: 96 },
  // Gap 5→6 : Setup business + complete account
  { id: 'setup-business-celebrate', fromStep: 5, afterHours: 1   },
  { id: 'setup-business-value',     fromStep: 5, afterHours: 24  },
  { id: 'setup-business-founder',   fromStep: 5, afterHours: 72  },
  { id: 'complete-1',               fromStep: 5, afterHours: 120 },
  { id: 'complete-2',               fromStep: 5, afterHours: 168 },
  { id: 'complete-breakup',         fromStep: 5, afterHours: 240 },
];

// ─── Email subjects + bodies ──────────────────────────────────────────────────
// CTA links:
//   Steps 1-2 (pre-account) → SITE_URL/register
//   Account-holders (steps 3-5) → APP_URL/login?resume=1
//     After login the app reads onboarding_step and auto-redirects to the right wizard screen.

const LOGO_URL = `${SITE_URL}/logo-white.png`;

function buildHtml(previewText, content, isPlain = false) {
  if (isPlain) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    body{margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
    .wrap{max-width:520px;margin:36px auto;padding:0 26px;color:#1a1a1a;}
    .wrap p{font-size:15px;line-height:1.7;color:#2d3748;margin:0 0 16px;}
    .wrap a{color:#0f766e;font-weight:600;}
    .sig{margin-top:20px;}
    .sig p{margin:0;line-height:1.5;}
    .sig .name{font-weight:700;color:#1a2e2e;}
    .sig .role{font-size:13px;color:#94a3b8;}
    .foot{margin-top:30px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#9ca3af;line-height:1.5;}
    .foot a{color:#9ca3af;}
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>
  <div class="wrap">
    ${content}
    <div class="foot">
      You're getting this because you started a PathPilo account.<br/>
      <a href="${SITE_URL}/unsubscribe">Unsubscribe</a> and I won't email you again.
    </div>
  </div>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    body{margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
    .wrapper{max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);}
    .header{background:#193434;padding:24px 36px;}
    .header img{height:30px;display:block;}
    .body{padding:36px;color:#1a1a1a;}
    .body h1{font-size:23px;font-weight:700;margin:0 0 14px;color:#0f1f1f;line-height:1.3;}
    .body p{font-size:15px;line-height:1.65;color:#4a5568;margin:0 0 16px;}
    .body strong{color:#1a2e2e;}
    .cta{display:inline-block;background:#3DD57A;color:#fff!important;font-weight:700;font-size:15px;padding:14px 30px;border-radius:12px;text-decoration:none;margin:8px 0 22px;}
    .steps{margin:4px 0 24px;padding:0;list-style:none;}
    .steps li{font-size:14px;color:#4a5568;padding:8px 0 8px 34px;position:relative;border-bottom:1px solid #f1f3f5;}
    .steps li:last-child{border-bottom:none;}
    .steps .num{position:absolute;left:0;top:7px;width:22px;height:22px;border-radius:50%;background:#ecfdf3;color:#15803d;font-size:12px;font-weight:700;text-align:center;line-height:22px;}
    .divider{border:none;border-top:1px solid #e8eaed;margin:24px 0;}
    .quote{margin:4px 0 24px;padding:16px 18px;background:#f8fafc;border-left:3px solid #3DD57A;border-radius:8px;}
    .quote p{font-size:14px;font-style:italic;color:#334155;margin:0 0 6px;}
    .quote span{font-size:12px;font-weight:600;color:#64748b;font-style:normal;}
    .footer{background:#f8f9fb;padding:20px 36px;font-size:12px;color:#9ca3af;line-height:1.5;}
    .footer a{color:#9ca3af;}
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>
  <div class="wrapper">
    <div class="header"><img src="${LOGO_URL}" alt="PathPilo"/></div>
    <div class="body">${content}</div>
    <div class="footer">
      PathPilo &mdash; route planning software for field service businesses.<br/>
      <a href="${SITE_URL}/unsubscribe">Unsubscribe</a> &middot; <a href="${SITE_URL}/privacy">Privacy policy</a>
    </div>
  </div>
</body>
</html>`;
}

const SIG = `
  <div class="sig">
    <p class="name">Mikkel</p>
    <p class="role">Founder, PathPilo</p>
  </div>`;

function emailContent(nudgeId, firstName, resumeLink) {
  const name = firstName || 'there';
  switch (nudgeId) {
    // ── Gap 1→2 : Finish signing up ────────────────────────────────────────────
    case 'signup-1':
      return {
        subject: 'Finish creating your PathPilo account',
        previewText: "You're one step away — takes less than a minute.",
        html: buildHtml("You're one step away — takes less than a minute.", `
          <h1>Finish creating your account</h1>
          <p>Hi ${name},</p>
          <p>You entered your email to sign up for PathPilo but didn't quite finish. Your account is just a name, last name and password away.</p>
          <a class="cta" href="${resumeLink}">Complete my account &rarr;</a>
          <p style="font-size:13px;color:#6b7280;">Takes less than a minute. Your email is already saved.</p>
        `),
      };
    case 'signup-2':
      return {
        subject: 'Still want to try PathPilo?',
        previewText: "Your spot is saved — takes 30 seconds to finish.",
        html: buildHtml("Your spot is saved — takes 30 seconds to finish.", `
          <p>Hi ${name},</p>
          <p>You started signing up to PathPilo but never finished. No worries — your email is saved and you can pick up where you left off in about 30 seconds.</p>
          <p><a href="${resumeLink}">Finish creating your account here</a>.</p>
          <p>If now isn't the right time, just ignore this. I won't email again unless you come back.</p>
          ${SIG}
        `, true),
      };

    // ── Gap 2→3 : Verify email ──────────────────────────────────────────────────
    case 'verify-1':
      return {
        subject: 'Your PathPilo link is waiting',
        previewText: 'One click and your account is live.',
        html: buildHtml('One click and your account is live.', `
          <h1>You're one click from your account</h1>
          <p>Hi ${name},</p>
          <p>Thanks for signing up to PathPilo. Just confirm your email and you can add your first customer and plan your first route straight away.</p>
          <a class="cta" href="${resumeLink}">Confirm my email &rarr;</a>
          <p style="font-size:13px;color:#6b7280;">This link expires in 24 hours. If you didn't sign up, you can safely ignore this email.</p>
        `),
      };
    case 'verify-2':
      return {
        subject: "Still want in? Fresh link inside",
        previewText: 'Your first link is about to expire.',
        html: buildHtml('Your first link is about to expire.', `
          <h1>Here's a fresh link</h1>
          <p>Hi ${name},</p>
          <p>Your account still isn't active and your first verification link is about to expire. If our last email landed in spam, this new link will get you straight in.</p>
          <a class="cta" href="${resumeLink}">Confirm and get started &rarr;</a>
          <p style="font-size:13px;color:#6b7280;">If now isn't the right time, no problem. You can pick this up whenever you're ready.</p>
        `),
      };

    // ── Gap 3→4 : Add first customer ───────────────────────────────────────────
    case 'welcome-add-client':
      return {
        subject: "Welcome to PathPilo. Here's your first step",
        previewText: '30 seconds to your first customer, then the map does the work.',
        html: buildHtml('30 seconds to your first customer, then the map does the work.', `
          <h1>Welcome aboard, ${name}</h1>
          <p>PathPilo turns your customers into the fastest daily route, so you spend less time driving and more time earning. Getting there takes three quick steps:</p>
          <ul class="steps">
            <li><span class="num">1</span> Add a customer (just a name and address)</li>
            <li><span class="num">2</span> Create a job for them</li>
            <li><span class="num">3</span> Watch PathPilo plan the route for you</li>
          </ul>
          <p>Start with the first one. It takes about 30 seconds.</p>
          <a class="cta" href="${resumeLink}">Add my first customer &rarr;</a>
        `),
      };
    case 'add-client-value':
      return {
        subject: 'This is what PathPilo does with your customers',
        previewText: 'Scattered jobs become one tight route.',
        html: buildHtml('Scattered jobs become one tight route.', `
          <h1>Add them once. Save time every day.</h1>
          <p>Hi ${name},</p>
          <p>Once your customers are in PathPilo, every working day it bundles their jobs into the shortest, smartest route automatically. No more planning the run in your head or doubling back across town.</p>
          <p>It starts with one customer. You can add the rest later.</p>
          <a class="cta" href="${resumeLink}">Add a customer &rarr;</a>
        `),
      };
    case 'add-client-founder':
      return {
        subject: "what's stopping you getting started?",
        previewText: "Genuinely asking. Just hit reply.",
        html: buildHtml("Genuinely asking. Just hit reply.", `
          <p>Hi ${name},</p>
          <p>I'm Mikkel, I run PathPilo.</p>
          <p>I noticed you created an account a few days ago but haven't added your first customer yet. I wanted to check in — was something in the way? The setup, a question about how it works, or are you just slammed out in the field?</p>
          <p>Whatever it is, hit reply and tell me. I read every email myself and I'll help you get going.</p>
          <p>If you'd rather just jump in, it takes about 30 seconds: <a href="${resumeLink}">add your first customer here</a>.</p>
          ${SIG}
        `, true),
      };

    // ── Gap 4→5 : Add first job ────────────────────────────────────────────────
    case 'add-job-1':
      return {
        subject: "You're one job away from the best bit",
        previewText: 'Add a job and watch PathPilo plan the route.',
        html: buildHtml('Add a job and watch PathPilo plan the route.', `
          <h1>Nice, your first customer is in</h1>
          <p>Hi ${name},</p>
          <p>Now add a job for them. The moment you do, PathPilo drops it on the map and starts planning your route. This is the part window cleaners, gutter crews and lawn care teams tell us they love.</p>
          <a class="cta" href="${resumeLink}">Add my first job &rarr;</a>
          <p>One job is all it takes to see it work.</p>
        `),
      };
    case 'add-job-value':
      return {
        subject: 'How much driving could you cut this week?',
        previewText: 'One crew cut over an hour of driving every day.',
        html: buildHtml('One crew cut over an hour of driving every day.', `
          <h1>Less driving, more jobs</h1>
          <p>Hi ${name},</p>
          <p>Every job you add gets slotted into the most efficient order for the day. For most teams that means an hour or more of driving saved daily — room for another job or an earlier finish.</p>
          <div class="quote">
            <p>"I used to plan the week in my head on a Sunday night. Now I add the jobs and PathPilo sorts the route. I'm finishing an hour earlier most days."</p>
            <span>James, window cleaning, Leeds</span>
          </div>
          <a class="cta" href="${resumeLink}">Add a job and see your route &rarr;</a>
        `),
      };
    case 'add-job-founder':
      return {
        subject: 'stuck adding your first job?',
        previewText: "Takes a minute. I'll walk you through it.",
        html: buildHtml("Takes a minute. I'll walk you through it.", `
          <p>Hi ${name},</p>
          <p>Mikkel here again. You've added a customer, which is the hard part, but you haven't created a job yet — so you haven't seen PathPilo actually plan a route. That's the bit that makes it click.</p>
          <p>If you got stuck, here's a 90-second walkthrough: <a href="${SITE_URL}/help/first-job">watch the quick walkthrough</a>.</p>
          <p>Or reply to this email with what's tripping you up and I'll sort it with you.</p>
          ${SIG}
        `, true),
      };

    // ── Gap 5→6 : Setup business + complete ───────────────────────────────────
    case 'setup-business-celebrate':
      return {
        subject: 'You just planned your first route',
        previewText: "Lock it in. One short step to make the account yours.",
        html: buildHtml("Lock it in. One short step to make the account yours.", `
          <h1>That's the magic, ${name}</h1>
          <p>You just watched PathPilo plan a real route. That is exactly what it does for you every working day, and it only gets sharper as you add more jobs.</p>
          <p>Let's make it official. Add your business name so your account and invoices are ready for real customers.</p>
          <a class="cta" href="${resumeLink}">Finish setting up &rarr;</a>
          <p style="font-size:13px;color:#6b7280;">It takes about a minute and you'll have the full app.</p>
        `),
      };
    case 'setup-business-value':
      return {
        subject: 'Get paid the day you finish the job',
        previewText: 'Add your business name and your invoices are ready to send.',
        html: buildHtml('Add your business name and your invoices are ready to send.', `
          <h1>Your invoices, ready to send</h1>
          <p>Hi ${name},</p>
          <p>Finishing your setup unlocks more than route planning. PathPilo turns a completed job into a professional invoice in a couple of taps — so you can get paid the same day instead of chasing it weeks later.</p>
          <p>Add your business name and it goes straight onto every invoice and your account.</p>
          <a class="cta" href="${resumeLink}">Add my business details &rarr;</a>
        `),
      };
    case 'setup-business-founder':
      return {
        subject: 'one field between you and done',
        previewText: "Your routes are saved. Let's finish this.",
        html: buildHtml("Your routes are saved. Let's finish this.", `
          <p>Hi ${name},</p>
          <p>Mikkel here. Good news: everything you set up — your customer, your job and your route — is all saved. You got the hard part done.</p>
          <p>The only thing left is your business name. Add it and your account is complete, with invoices and the full app ready to go.</p>
          <p><a href="${resumeLink}">Finish your account here</a>, or reply if anything's holding you back.</p>
          ${SIG}
        `, true),
      };

    case 'complete-1':
      return {
        subject: 'Literally one field left',
        previewText: "Add your business name and you're done.",
        html: buildHtml("Add your business name and you're done.", `
          <h1>So close, ${name}</h1>
          <p>You're on the very last step. Pop in your business name and your PathPilo account is fully set up. It'll appear on your invoices and across the app.</p>
          <a class="cta" href="${resumeLink}">Complete my account &rarr;</a>
        `),
      };
    case 'complete-2':
      return {
        subject: 'Your PathPilo account is 99% done',
        previewText: 'The last 1% takes ten seconds.',
        html: buildHtml('The last 1% takes ten seconds.', `
          <h1>The last ten seconds</h1>
          <p>Hi ${name},</p>
          <p>You've done everything except name your business. Add it and you get the full PathPilo: unlimited customers, recurring jobs, route planning and same-day invoices — all in one place.</p>
          <a class="cta" href="${resumeLink}">Finish and get full access &rarr;</a>
        `),
      };
    case 'complete-breakup':
      return {
        subject: 'should I close your account?',
        previewText: "I'll stop emailing after this one.",
        html: buildHtml("I'll stop emailing after this one.", `
          <p>Hi ${name},</p>
          <p>Mikkel here, one last time. You got all the way to planning routes in PathPilo but never finished your account, and I don't want to keep cluttering your inbox.</p>
          <p>So this is the last email I'll send. If you'd like to finish, it's one field and about ten seconds: <a href="${resumeLink}">complete my account</a>.</p>
          <p>And if PathPilo wasn't the right fit, I'd genuinely love to know why — just hit reply, even one line helps me make it better.</p>
          <p>Either way, thanks for giving us a go.</p>
          ${SIG}
        `, true),
      };
    default:
      return null;
  }
}

// ─── onboarding_step → nudge fromStep mapping ────────────────────────────────
//
// fromStep 1 and 2 are handled directly in runFunnelNudgeTick (pre-account).
// fromStep 3–5 target account-holders at specific onboarding_step values:
//
//   fromStep 3 → emails in gap 3→4 → targets onboarding_step IN ('clients', ...)
//                (email verified, logged in, hasn't added a customer yet)
//   fromStep 4 → emails in gap 4→5 → targets onboarding_step = 'jobs'
//                (has a customer, hasn't added a job yet)
//   fromStep 5 → emails in gap 5→6 → targets onboarding_step IN ('route', 'business')
//                (added job + saw route, hasn't completed business setup)
//
// Legacy values 'company', 'services', 'plan' all resolve to 'clients' behaviour.

function stepToOnboardingValues(fromStep) {
  switch (fromStep) {
    case 3: return ['clients', 'company', 'services', 'plan'];
    case 4: return ['jobs'];
    case 5: return ['route', 'business'];
    default: return [];
  }
}

// ─── Main tick ───────────────────────────────────────────────────────────────

async function runFunnelNudgeTick() {
  try {
    for (const nudge of NUDGES) {
      const thresholdMs = nudge.afterHours * 60 * 60 * 1000;

      if (nudge.fromStep === 1) {
        // ── Gap 1→2: entered email only, haven't submitted registration form ────
        // Targets signup_progress_drafts where step != 'code_sent'.
        const { rows } = await pool.query(`
          SELECT
            COALESCE(d.first_name, '') AS first_name,
            d.email,
            d.updated_at
          FROM signup_progress_drafts d
          LEFT JOIN users u ON LOWER(TRIM(d.email)) = LOWER(u.email)
          LEFT JOIN funnel_nudge_sends s
            ON s.nudge_id = $1 AND LOWER(s.email) = LOWER(TRIM(d.email))
          WHERE d.email IS NOT NULL
            AND COALESCE(d.step, 'name_entered') != 'code_sent'
            AND u.id IS NULL
            AND s.id IS NULL
            AND (NOW() - d.updated_at) >= ($2 * interval '1 millisecond')
          LIMIT 50
        `, [nudge.id, thresholdMs]);

        for (const row of rows) {
          const content = emailContent(nudge.id, row.first_name, `${SITE_URL}/register`);
          if (!content) continue;
          try {
            await sendEmail({
              to: row.email,
              from: FROM_EMAIL,
              fromName: FROM_NAME,
              replyTo: FROM_EMAIL,
              subject: content.subject,
              html: content.html,
              skipFooter: true,
            });
            await pool.query(
              `INSERT INTO funnel_nudge_sends (nudge_id, email, funnel_step)
               VALUES ($1, $2, $3)
               ON CONFLICT (nudge_id, email) DO NOTHING`,
              [nudge.id, row.email.toLowerCase().trim(), nudge.fromStep]
            );
            console.log(`[funnelNudge] sent ${nudge.id} → ${row.email}`);
          } catch (err) {
            console.error(`[funnelNudge] failed ${nudge.id} → ${row.email}:`, err.message || err);
          }
        }

      } else if (nudge.fromStep === 2) {
        // ── Gap 2→3: submitted registration form, verification code sent ────────
        // Targets registration_verification_codes (email still unconsumed, no user account).
        const { rows } = await pool.query(`
          SELECT
            r.email,
            COALESCE(d.first_name, '') AS first_name,
            MAX(r.created_at) AS created_at
          FROM registration_verification_codes r
          LEFT JOIN signup_progress_drafts d
            ON LOWER(TRIM(d.email)) = LOWER(TRIM(r.email))
          LEFT JOIN users u ON LOWER(u.email) = LOWER(TRIM(r.email))
          LEFT JOIN funnel_nudge_sends s
            ON s.nudge_id = $1 AND LOWER(s.email) = LOWER(TRIM(r.email))
          WHERE r.consumed_at IS NULL
            AND u.id IS NULL
            AND s.id IS NULL
          GROUP BY r.email, d.first_name
          HAVING (NOW() - MAX(r.created_at)) >= ($2 * interval '1 millisecond')
          LIMIT 50
        `, [nudge.id, thresholdMs]);

        for (const row of rows) {
          const content = emailContent(nudge.id, row.first_name, `${SITE_URL}/register`);
          if (!content) continue;
          try {
            await sendEmail({
              to: row.email,
              from: FROM_EMAIL,
              fromName: FROM_NAME,
              replyTo: FROM_EMAIL,
              subject: content.subject,
              html: content.html,
              skipFooter: true,
            });
            await pool.query(
              `INSERT INTO funnel_nudge_sends (nudge_id, email, funnel_step)
               VALUES ($1, $2, $3)
               ON CONFLICT (nudge_id, email) DO NOTHING`,
              [nudge.id, row.email.toLowerCase().trim(), nudge.fromStep]
            );
            console.log(`[funnelNudge] sent ${nudge.id} → ${row.email}`);
          } catch (err) {
            console.error(`[funnelNudge] failed ${nudge.id} → ${row.email}:`, err.message || err);
          }
        }

      } else {
        // ── Account-holder: query companies + owner ───────────────────────────
        const targetSteps = stepToOnboardingValues(nudge.fromStep);
        if (!targetSteps.length) continue;
        const targetSet = new Set(targetSteps);

        const { rows } = await pool.query(`
          SELECT
            c.onboarding_step,
            c.updated_at,
            u.email,
            COALESCE(u.first_name, '') AS first_name
          FROM companies c
          INNER JOIN users u ON u.id = c.owner_id
          LEFT JOIN funnel_nudge_sends s
            ON s.nudge_id = $1 AND LOWER(s.email) = LOWER(u.email)
          WHERE COALESCE(c.onboarding_completed, false) = false
            AND c.onboarding_step = ANY($2::text[])
            AND s.id IS NULL
            AND (NOW() - c.updated_at) >= ($3 * interval '1 millisecond')
          LIMIT 50
        `, [nudge.id, targetSteps, thresholdMs]);

        for (const row of rows) {
          // Race-condition guard: skip if they advanced while we were querying
          if (!targetSet.has(row.onboarding_step)) continue;

          const content = emailContent(nudge.id, row.first_name, `${APP_URL}/login?resume=1`);
          if (!content) continue;

          try {
            await sendEmail({
              to: row.email,
              from: FROM_EMAIL,
              fromName: FROM_NAME,
              replyTo: FROM_EMAIL,
              subject: content.subject,
              html: content.html,
              skipFooter: true,
            });
            await pool.query(
              `INSERT INTO funnel_nudge_sends (nudge_id, email, funnel_step)
               VALUES ($1, $2, $3)
               ON CONFLICT (nudge_id, email) DO NOTHING`,
              [nudge.id, row.email.toLowerCase().trim(), nudge.fromStep]
            );
            console.log(`[funnelNudge] sent ${nudge.id} → ${row.email}`);
          } catch (err) {
            console.error(`[funnelNudge] failed ${nudge.id} → ${row.email}:`, err.message || err);
          }
        }
      }
    }
  } catch (err) {
    console.error('[funnelNudge] tick error:', err.message || err);
  }
}

/**
 * Force-send a specific nudge to all currently eligible leads,
 * bypassing the afterHours inactivity threshold.
 * Used by the admin "Send now" button.
 */
async function sendNudgeNow(nudgeId) {
  const nudge = NUDGES.find(n => n.id === nudgeId);
  if (!nudge) throw new Error(`Unknown nudge id: ${nudgeId}`);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const sendOne = async (email, firstName, resumeLink) => {
    const content = emailContent(nudge.id, firstName, resumeLink);
    if (!content) { skipped++; return; }
    try {
      await sendEmail({
        to: email,
        from: FROM_EMAIL,
        fromName: FROM_NAME,
        replyTo: FROM_EMAIL,
        subject: content.subject,
        html: content.html,
        skipFooter: true,
      });
      await pool.query(
        `INSERT INTO funnel_nudge_sends (nudge_id, email, funnel_step)
         VALUES ($1, $2, $3)
         ON CONFLICT (nudge_id, email) DO NOTHING`,
        [nudge.id, email.toLowerCase().trim(), nudge.fromStep]
      );
      console.log(`[funnelNudge/sendNow] sent ${nudge.id} → ${email}`);
      sent++;
    } catch (err) {
      console.error(`[funnelNudge/sendNow] failed ${nudge.id} → ${email}:`, err.message || err);
      errors++;
    }
  };

  if (nudge.fromStep === 1) {
    // Entered email only, haven't submitted registration form
    const { rows } = await pool.query(`
      SELECT d.email, COALESCE(d.first_name, '') AS first_name
      FROM signup_progress_drafts d
      LEFT JOIN users u ON LOWER(TRIM(d.email)) = LOWER(u.email)
      LEFT JOIN funnel_nudge_sends s
        ON s.nudge_id = $1 AND LOWER(s.email) = LOWER(TRIM(d.email))
      WHERE d.email IS NOT NULL
        AND COALESCE(d.step, 'name_entered') != 'code_sent'
        AND u.id IS NULL AND s.id IS NULL
      LIMIT 200
    `, [nudge.id]);
    for (const row of rows) {
      await sendOne(row.email, row.first_name, `${SITE_URL}/register`);
    }
  } else if (nudge.fromStep === 2) {
    // Submitted registration form, verification code sent but not yet clicked
    const { rows } = await pool.query(`
      SELECT r.email, COALESCE(d.first_name, '') AS first_name
      FROM registration_verification_codes r
      LEFT JOIN signup_progress_drafts d
        ON LOWER(TRIM(d.email)) = LOWER(TRIM(r.email))
      LEFT JOIN users u ON LOWER(u.email) = LOWER(TRIM(r.email))
      LEFT JOIN funnel_nudge_sends s
        ON s.nudge_id = $1 AND LOWER(s.email) = LOWER(TRIM(r.email))
      WHERE r.consumed_at IS NULL AND u.id IS NULL AND s.id IS NULL
      LIMIT 200
    `, [nudge.id]);
    for (const row of rows) {
      await sendOne(row.email, row.first_name, `${SITE_URL}/register`);
    }
  } else {
    const targetSteps = stepToOnboardingValues(nudge.fromStep);
    if (!targetSteps.length) return { sent: 0, skipped: 0, errors: 0 };
    const targetSet = new Set(targetSteps);
    const { rows } = await pool.query(`
      SELECT u.email, COALESCE(u.first_name, '') AS first_name, c.onboarding_step
      FROM companies c
      INNER JOIN users u ON u.id = c.owner_id
      LEFT JOIN funnel_nudge_sends s
        ON s.nudge_id = $1 AND LOWER(s.email) = LOWER(u.email)
      WHERE COALESCE(c.onboarding_completed, false) = false
        AND c.onboarding_step = ANY($2::text[])
        AND s.id IS NULL
      LIMIT 200
    `, [nudge.id, targetSteps]);
    for (const row of rows) {
      if (!targetSet.has(row.onboarding_step)) { skipped++; continue; }
      await sendOne(row.email, row.first_name, `${APP_URL}/login?resume=1`);
    }
  }

  return { sent, skipped, errors };
}

/**
 * Force-send a specific nudge to one specific email address immediately,
 * regardless of their funnel step or inactivity threshold.
 * Allows re-sending (ON CONFLICT DO UPDATE).
 */
async function sendNudgeToEmail(nudgeId, targetEmail) {
  const nudge = NUDGES.find(n => n.id === nudgeId);
  if (!nudge) throw new Error(`Unknown nudge id: ${nudgeId}`);

  const normalizedEmail = targetEmail.toLowerCase().trim();

  // Find first name — try registered users first, then pre-account drafts
  let firstName = '';
  const userRes = await pool.query(
    `SELECT first_name FROM users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
    [normalizedEmail]
  );
  if (userRes.rows.length > 0) {
    firstName = userRes.rows[0].first_name || '';
  } else {
    const draftRes = await pool.query(
      `SELECT first_name FROM signup_progress_drafts WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
      [normalizedEmail]
    );
    if (draftRes.rows.length > 0) firstName = draftRes.rows[0].first_name || '';
  }

  // Steps 1 and 2 are pre-account (no login possible yet); step 3+ have accounts
  const resumeLink = nudge.fromStep <= 2 ? `${SITE_URL}/register` : `${APP_URL}/login?resume=1`;
  const content = emailContent(nudge.id, firstName, resumeLink);
  if (!content) throw new Error(`No email template for nudge: ${nudgeId}`);

  await sendEmail({
    to: targetEmail,
    from: FROM_EMAIL,
    fromName: FROM_NAME,
    replyTo: FROM_EMAIL,
    subject: content.subject,
    html: content.html,
    skipFooter: true,
  });

  // Record or update the send timestamp (allows admin re-sends)
  await pool.query(
    `INSERT INTO funnel_nudge_sends (nudge_id, email, funnel_step)
     VALUES ($1, $2, $3)
     ON CONFLICT (nudge_id, email) DO UPDATE SET sent_at = NOW()`,
    [nudge.id, normalizedEmail, nudge.fromStep]
  );

  console.log(`[funnelNudge/sendToEmail] sent ${nudge.id} → ${targetEmail}`);
  return { sent: 1 };
}

module.exports = {
  ensureFunnelNudgeSchema,
  runFunnelNudgeTick,
  sendNudgeNow,
  sendNudgeToEmail,
};
