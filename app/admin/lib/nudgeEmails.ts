/**
 * Funnel nudge emails — sent automatically when a lead goes inactive at a given step.
 *
 * Design principles (research-backed, 2026 SaaS activation best practice):
 *  - Behaviour-triggered: a lead only ever receives the emails for the step they
 *    are currently stuck on. The moment they advance, they exit that gap's series.
 *  - Front-loaded cadence: the first nudge fires within an hour or two, the second
 *    around 24h, and any third is a spaced-out, founder-voiced personal check-in.
 *  - One job, one CTA per email, deep-linked into the exact in-app action.
 *  - The "first value moment" is seeing a real optimised route on the map (step 4).
 *    Everything before it pulls toward that moment; everything after capitalises on it.
 *  - Re-engagement / final emails use a plain, personal "from the founder" template,
 *    which consistently outperforms polished HTML for that slot.
 *
 * afterHours = hours of inactivity after the lead enters `fromStep` before sending.
 */

export type EmailType =
  | 'transactional' // account-blocking step (verify email)
  | 'quick-win' // drive the single next action
  | 'value' // show the payoff (route, time saved, invoices)
  | 'founder' // plain personal check-in, reply-friendly
  | 'celebration' // capitalise right after the aha moment
  | 'final' // breakup / last chance

export interface NudgeEmail {
  /** Stable slug used as ID in logs / future DB rows. */
  id: string
  /** Human-readable name shown in the admin table. */
  name: string
  /** Gap this email lives in: between step `fromStep` and `fromStep + 1`. */
  fromStep: number
  /** Hours of inactivity after the lead enters `fromStep` before sending. */
  afterHours: number
  /** The single job this email is meant to do (shown in admin only). */
  goal: string
  type: EmailType
  subject: string
  /** Inbox preview / preheader text shown after the subject line. */
  previewText: string
  /** Full HTML body. Uses {{firstName}} / {{companyName}} as merge tags. */
  bodyHtml: string
}

const BASE = 'https://pathpilo.com'
const APP = 'https://app.pathpilo.com'

/**
 * Smart resume link used in CTA buttons.
 * - Pre-account (steps 1–2): → /register
 *   Step 1 = entered email only; step 2 = submitted registration form, pending
 *   email verification. Neither group has an active account yet.
 * - Account-holder (steps 3–5): → /login?resume=1
 *   After login the app reads the owner's onboarding_step and auto-redirects
 *   them to exactly the right wizard screen (via getOwnerSetupResumePath).
 *   No hardcoded slug needed, no stale deep links.
 */
function ctaUrl(fromStep: number): string {
  return fromStep <= 2 ? `${BASE}/register` : `${APP}/login?resume=1`
}

// ─── Templates ───────────────────────────────────────────────────────────────

/** Polished, branded template — welcome / value / celebration emails. */
function wrap(previewText: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PathPilo</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
    .header { background: #193434; padding: 24px 36px; }
    .header img { height: 30px; display: block; }
    .body { padding: 36px; color: #1a1a1a; }
    .body h1 { font-size: 23px; font-weight: 700; margin: 0 0 14px; color: #0f1f1f; line-height: 1.3; }
    .body p { font-size: 15px; line-height: 1.65; color: #4a5568; margin: 0 0 16px; }
    .body strong { color: #1a2e2e; }
    .cta { display: inline-block; background: #3DD57A; color: #ffffff !important; font-weight: 700; font-size: 15px; padding: 14px 30px; border-radius: 12px; text-decoration: none; margin: 8px 0 22px; }
    .steps { margin: 4px 0 24px; padding: 0; list-style: none; }
    .steps li { font-size: 14px; color: #4a5568; padding: 8px 0 8px 34px; position: relative; border-bottom: 1px solid #f1f3f5; }
    .steps li:last-child { border-bottom: none; }
    .steps .num { position: absolute; left: 0; top: 7px; width: 22px; height: 22px; border-radius: 50%; background: #ecfdf3; color: #15803d; font-size: 12px; font-weight: 700; text-align: center; line-height: 22px; }
    .divider { border: none; border-top: 1px solid #e8eaed; margin: 24px 0; }
    .quote { margin: 4px 0 24px; padding: 16px 18px; background: #f8fafc; border-left: 3px solid #3DD57A; border-radius: 8px; }
    .quote p { font-size: 14px; font-style: italic; color: #334155; margin: 0 0 6px; }
    .quote span { font-size: 12px; font-weight: 600; color: #64748b; font-style: normal; }
    .footer { background: #f8f9fb; padding: 20px 36px; font-size: 12px; color: #9ca3af; line-height: 1.5; }
    .footer a { color: #9ca3af; }
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>
  <div class="wrapper">
    <div class="header">
      <img src="/logo-white.png" alt="PathPilo" />
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      PathPilo &mdash; route planning software for field service businesses.<br />
      <a href="${BASE}/unsubscribe">Unsubscribe</a> &middot; <a href="${BASE}/privacy">Privacy policy</a>
    </div>
  </div>
</body>
</html>`
}

/** Plain, personal "from the founder" template — re-engagement / final emails. */
function wrapPlain(previewText: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PathPilo</title>
  <style>
    body { margin: 0; padding: 0; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrap { max-width: 520px; margin: 36px auto; padding: 0 26px; color: #1a1a1a; }
    .wrap p { font-size: 15px; line-height: 1.7; color: #2d3748; margin: 0 0 16px; }
    .wrap a { color: #0f766e; font-weight: 600; }
    .sig { margin-top: 20px; }
    .sig p { margin: 0; line-height: 1.5; }
    .sig .name { font-weight: 700; color: #1a2e2e; }
    .sig .role { font-size: 13px; color: #94a3b8; }
    .foot { margin-top: 30px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #9ca3af; line-height: 1.5; }
    .foot a { color: #9ca3af; }
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>
  <div class="wrap">
    ${content}
    <div class="foot">
      You're getting this because you started a PathPilo account.<br />
      <a href="${BASE}/unsubscribe">Unsubscribe</a> and I won't email you again.
    </div>
  </div>
</body>
</html>`
}

const SIGNATURE = `
  <div class="sig">
    <p class="name">Mikkel</p>
    <p class="role">Founder, PathPilo</p>
  </div>`

/** Styled placeholder for an image / gif / video. Replace with a real <img> once the asset exists. */
function mediaBlock(caption: string, sub: string, asset: string): string {
  return `
  <!-- ASSET NEEDED → /email-assets/${asset} -->
  <div style="margin:4px 0 24px;border:1px solid #d6ead9;border-radius:14px;background:#f0fdf4;padding:34px 24px;text-align:center;">
    <div style="display:inline-block;width:40px;height:40px;border-radius:50%;background:#dcfce7;line-height:40px;">
      <span style="color:#15803d;font-size:18px;">&#9656;</span>
    </div>
    <div style="font-size:13px;font-weight:700;color:#15803d;margin-top:10px;">${caption}</div>
    <div style="font-size:11px;color:#6b9a78;margin-top:3px;">${sub}</div>
  </div>`
}

// ─── Emails ────────────────────────────────────────────────────────────────────

export const NUDGE_EMAILS: NudgeEmail[] = [
  // ═══ Gap 1 → 2 : Finish signing up ══════════════════════════════════════════
  // Trigger: user typed their email but never completed the registration form
  // (name, last name, password). They haven't created an account yet.
  {
    id: 'signup-1',
    name: 'Finish creating your account',
    fromStep: 1,
    afterHours: 1,
    type: 'transactional',
    goal: 'Bring them back to complete the registration form while intent is still hot.',
    subject: 'Finish creating your PathPilo account',
    previewText: "You're one step away — takes less than a minute.",
    bodyHtml: wrap(
      "You're one step away — takes less than a minute.",
      `
      <h1>Finish creating your account</h1>
      <p>Hi {{firstName}},</p>
      <p>You entered your email to sign up for PathPilo but didn't quite finish. Your account is just a name, last name and password away.</p>
      <a class="cta" href="${ctaUrl(1)}">Complete my account &rarr;</a>
      <p style="font-size:13px;color:#6b7280;">Takes less than a minute. Your email is already saved.</p>
    `,
    ),
  },
  {
    id: 'signup-2',
    name: 'Still want to try PathPilo?',
    fromStep: 1,
    afterHours: 22,
    type: 'founder',
    goal: 'Last nudge before the draft expires. Plain, low-pressure.',
    subject: 'Still want to try PathPilo?',
    previewText: "Your spot is saved — takes 30 seconds to finish.",
    bodyHtml: wrapPlain(
      "Your spot is saved — takes 30 seconds to finish.",
      `
      <p>Hi {{firstName}},</p>
      <p>You started signing up to PathPilo but never finished. No worries — your email is saved and you can pick up where you left off in about 30 seconds.</p>
      <p><a href="${ctaUrl(1)}">Finish creating your account here</a>.</p>
      <p>If now isn't the right time, just ignore this. I won't email again unless you come back.</p>
      ${SIGNATURE}
    `,
    ),
  },

  // ═══ Gap 2 → 3 : Verify email ════════════════════════════════════════════════
  // Trigger: user completed the registration form (name, password) and a
  // verification code was sent — but they haven't clicked the link yet.
  {
    id: 'verify-1',
    name: 'Verify your email (reminder)',
    fromStep: 2,
    afterHours: 1,
    type: 'transactional',
    goal: 'Get them to click the verification link while intent is still hot.',
    subject: 'Your PathPilo link is waiting',
    previewText: 'One click and your account is live.',
    bodyHtml: wrap(
      'One click and your account is live.',
      `
      <h1>You're one click from your account</h1>
      <p>Hi {{firstName}},</p>
      <p>Thanks for signing up to PathPilo. Just confirm your email and you can add your first customer and plan your first route straight away.</p>
      <a class="cta" href="${ctaUrl(2)}">Confirm my email &rarr;</a>
      <p style="font-size:13px;color:#6b7280;">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>
    `,
    ),
  },
  {
    id: 'verify-2',
    name: 'Verify your email (last link)',
    fromStep: 2,
    afterHours: 22,
    type: 'transactional',
    goal: 'Recover unverified signups. Prompt a spam-folder check with a fresh link.',
    subject: 'Still want in? Fresh link inside',
    previewText: 'Your first link is about to expire.',
    bodyHtml: wrap(
      'Your first link is about to expire.',
      `
      <h1>Here's a fresh link</h1>
      <p>Hi {{firstName}},</p>
      <p>Your account still isn't active and your first verification link is about to expire. If our last email landed in spam, this new link will get you straight in.</p>
      <a class="cta" href="${ctaUrl(2)}">Confirm and get started &rarr;</a>
      <p style="font-size:13px;color:#6b7280;">If now isn't the right time, no problem. You can pick this up whenever you're ready.</p>
    `,
    ),
  },

  // ═══ Gap 3 → 4 : Add first customer ═════════════════════════════════════════
  // Trigger: verified, logged in, but hasn't added a customer yet.
  {
    id: 'welcome-add-client',
    name: 'Welcome + add first customer',
    fromStep: 3,
    afterHours: 1,
    type: 'quick-win',
    goal: 'Welcome them, set the path to the route planner, drive the single first action.',
    subject: "Welcome to PathPilo. Here's your first step",
    previewText: '30 seconds to your first customer, then the map does the work.',
    bodyHtml: wrap(
      '30 seconds to your first customer, then the map does the work.',
      `
      <h1>Welcome aboard, {{firstName}}</h1>
      <p>PathPilo turns your customers into the fastest daily route, so you spend less time driving and more time earning. Getting there takes three quick steps:</p>
      <ul class="steps">
        <li><span class="num">1</span> Add a customer (just a name and address)</li>
        <li><span class="num">2</span> Create a job for them</li>
        <li><span class="num">3</span> Watch PathPilo plan the route for you</li>
      </ul>
      <p>Start with the first one. It takes about 30 seconds.</p>
      <a class="cta" href="${ctaUrl(3)}">Add my first customer &rarr;</a>
    `,
    ),
  },
  {
    id: 'add-client-value',
    name: 'What happens once customers are in',
    fromStep: 3,
    afterHours: 24,
    type: 'value',
    goal: 'Show the payoff (scattered jobs become one tight route) to pull them forward.',
    subject: 'This is what PathPilo does with your customers',
    previewText: 'Scattered jobs become one tight route. Here it is.',
    bodyHtml: wrap(
      'Scattered jobs become one tight route. Here it is.',
      `
      <h1>Add them once. Save time every day.</h1>
      <p>Hi {{firstName}},</p>
      <p>Once your customers are in PathPilo, every working day it bundles their jobs into the shortest, smartest route automatically. No more planning the run in your head or doubling back across town.</p>
      ${mediaBlock(
        'Watch scattered jobs snap into one optimised route',
        'Animation: pins on a map reordering into a clean, efficient route',
        'route-optimise.gif',
      )}
      <p>It starts with one customer. You can add the rest later.</p>
      <a class="cta" href="${ctaUrl(3)}">Add a customer &rarr;</a>
    `,
    ),
  },
  {
    id: 'add-client-founder',
    name: 'Founder check-in (add customer)',
    fromStep: 3,
    afterHours: 72,
    type: 'founder',
    goal: 'Personal re-engagement. Ask what is blocking them. Invite a reply.',
    subject: "what's stopping you getting started?",
    previewText: "Genuinely asking. Just hit reply.",
    bodyHtml: wrapPlain(
      "Genuinely asking. Just hit reply.",
      `
      <p>Hi {{firstName}},</p>
      <p>I'm Mikkel, I run PathPilo.</p>
      <p>I noticed you created an account a few days ago but haven't added your first customer yet. I wanted to check in: was something in the way? The setup, a question about how it works, or are you just slammed out in the field?</p>
      <p>Whatever it is, hit reply and tell me. I read every email myself and I'll help you get going.</p>
      <p>If you'd rather just jump in, it takes about 30 seconds: <a href="${ctaUrl(3)}">add your first customer here</a>.</p>
      ${SIGNATURE}
    `,
    ),
  },

  // ═══ Gap 4 → 5 : Add first job → the aha moment ══════════════════════════════
  {
    id: 'add-job-1',
    name: 'One job from the best bit',
    fromStep: 4,
    afterHours: 2,
    type: 'quick-win',
    goal: 'Drive the job creation that unlocks the route planner (first value moment).',
    subject: "You're one job away from the best bit",
    previewText: 'Add a job and watch PathPilo plan the route.',
    bodyHtml: wrap(
      'Add a job and watch PathPilo plan the route.',
      `
      <h1>Nice, your first customer is in</h1>
      <p>Hi {{firstName}},</p>
      <p>Now add a job for them. The moment you do, PathPilo drops it on the map and starts planning your route. This is the part window cleaners, gutter crews and lawn care teams tell us they love.</p>
      <a class="cta" href="${ctaUrl(4)}">Add my first job &rarr;</a>
      <p>One job is all it takes to see it work.</p>
    `,
    ),
  },
  {
    id: 'add-job-value',
    name: 'How much driving you could cut',
    fromStep: 4,
    afterHours: 24,
    type: 'value',
    goal: 'Make the payoff concrete with time saved + social proof to push to the aha.',
    subject: 'How much driving could you cut this week?',
    previewText: 'One crew cut six hours of driving a week.',
    bodyHtml: wrap(
      'One crew cut six hours of driving a week.',
      `
      <h1>Less driving, more jobs</h1>
      <p>Hi {{firstName}},</p>
      <p>Every job you add gets slotted into the most efficient order for the day. For most teams that means an hour or more of driving saved daily, which is room for another job or an earlier finish.</p>
      ${mediaBlock(
        'See your day go from 3h 26m driving to 2h 10m',
        'Image: before and after route summary with drive time saved',
        'time-saved.png',
      )}
      <div class="quote">
        <p>"I used to plan the week in my head on a Sunday night. Now I add the jobs and PathPilo sorts the route. I'm finishing an hour earlier most days."</p>
        <span>James, window cleaning, Leeds</span>
      </div>
      <a class="cta" href="${ctaUrl(4)}">Add a job and see your route &rarr;</a>
    `,
    ),
  },
  {
    id: 'add-job-founder',
    name: 'Founder check-in (add job)',
    fromStep: 4,
    afterHours: 96,
    type: 'founder',
    goal: 'Remove the blocker on the most important step. Offer a walkthrough. Invite a reply.',
    subject: 'stuck adding your first job?',
    previewText: "Takes a minute. I'll walk you through it.",
    bodyHtml: wrapPlain(
      "Takes a minute. I'll walk you through it.",
      `
      <p>Hi {{firstName}},</p>
      <p>Mikkel here again. You've added a customer, which is the hard part, but you haven't created a job yet, so you haven't seen PathPilo actually plan a route. That's the bit that makes it click.</p>
      <p>If you got stuck, here's a 90 second walkthrough that shows exactly how: <a href="${BASE}/help/first-job">watch the quick walkthrough</a>.</p>
      <p>Or just reply to this email with what's tripping you up and I'll sort it with you.</p>
      ${SIGNATURE}
    `,
    ),
  },

  // ═══ Gap 5 → 6 : Setup business + complete account ════════════════════════════
  // Trigger: added a job and saw the route — now needs to enter business name.
  {
    id: 'setup-business-celebrate',
    name: 'You planned your first route',
    fromStep: 5,
    afterHours: 1,
    type: 'celebration',
    goal: 'Capitalise on the high right after the aha. Drive them to finish the account.',
    subject: 'You just planned your first route',
    previewText: 'Lock it in. One short step to make the account yours.',
    bodyHtml: wrap(
      'Lock it in. One short step to make the account yours.',
      `
      <h1>That's the magic, {{firstName}}</h1>
      <p>You just watched PathPilo plan a real route. That is exactly what it does for you every working day, and it only gets sharper as you add more jobs.</p>
      <p>Let's make it official. Add your business name so your account and invoices are ready for real customers.</p>
      <a class="cta" href="${ctaUrl(5)}">Finish setting up &rarr;</a>
      <p style="font-size:13px;color:#6b7280;">It takes about a minute and you'll have the full app.</p>
    `,
    ),
  },
  {
    id: 'setup-business-value',
    name: 'Get paid the day you finish',
    fromStep: 5,
    afterHours: 24,
    type: 'value',
    goal: 'Show what finishing unlocks: professional invoices and getting paid.',
    subject: 'Get paid the day you finish the job',
    previewText: 'Add your business name and your invoices are ready to send.',
    bodyHtml: wrap(
      'Add your business name and your invoices are ready to send.',
      `
      <h1>Your invoices, ready to send</h1>
      <p>Hi {{firstName}},</p>
      <p>Finishing your setup unlocks more than route planning. PathPilo turns a completed job into a professional invoice in a couple of taps, so you can get paid the same day instead of chasing it weeks later.</p>
      ${mediaBlock(
        'A clean, branded PathPilo invoice',
        'Image: example invoice with the company name and logo on it',
        'invoice-example.png',
      )}
      <p>Add your business name and it goes straight onto every invoice and your account.</p>
      <a class="cta" href="${ctaUrl(5)}">Add my business details &rarr;</a>
    `,
    ),
  },
  {
    id: 'setup-business-founder',
    name: 'Founder check-in (finish setup)',
    fromStep: 5,
    afterHours: 72,
    type: 'founder',
    goal: 'Reassure their work is saved. One field to go. Invite a reply.',
    subject: 'one field between you and done',
    previewText: "Your routes are saved. Let's finish this.",
    bodyHtml: wrapPlain(
      "Your routes are saved. Let's finish this.",
      `
      <p>Hi {{firstName}},</p>
      <p>Mikkel here. Good news: everything you set up — your customer, your job and your route — is all saved. You got the hard part done.</p>
      <p>The only thing left is your business name. Add it and your account is complete, with invoices and the full app ready to go.</p>
      <p><a href="${ctaUrl(5)}">Finish your account here</a>, or reply if anything's holding you back.</p>
      ${SIGNATURE}
    `,
    ),
  },
  {
    id: 'complete-1',
    name: 'Literally one field left',
    fromStep: 5,
    afterHours: 120,
    type: 'quick-win',
    goal: 'Tiny final push. One field. Make it feel effortless.',
    subject: 'Literally one field left',
    previewText: "Add your business name and you're done.",
    bodyHtml: wrap(
      "Add your business name and you're done.",
      `
      <h1>So close, {{firstName}}</h1>
      <p>You're on the very last step. Pop in your business name and your PathPilo account is fully set up. It'll appear on your invoices and across the app.</p>
      <a class="cta" href="${ctaUrl(5)}">Complete my account &rarr;</a>
    `,
    ),
  },
  {
    id: 'complete-2',
    name: 'Your account is 99% done',
    fromStep: 5,
    afterHours: 168,
    type: 'value',
    goal: 'Reassure and remind what full access gives them.',
    subject: 'Your PathPilo account is 99% done',
    previewText: 'The last 1% takes ten seconds.',
    bodyHtml: wrap(
      'The last 1% takes ten seconds.',
      `
      <h1>The last ten seconds</h1>
      <p>Hi {{firstName}},</p>
      <p>You've done everything except name your business. Add it and you get the full PathPilo: unlimited customers, recurring jobs, route planning and same-day invoices — all in one place.</p>
      <a class="cta" href="${ctaUrl(5)}">Finish and get full access &rarr;</a>
    `,
    ),
  },
  {
    id: 'complete-breakup',
    name: 'Breakup / last chance',
    fromStep: 5,
    afterHours: 240,
    type: 'final',
    goal: 'Last-chance breakup email. High reply rate. Either convert or learn why not.',
    subject: 'should I close your account?',
    previewText: "I'll stop emailing after this one.",
    bodyHtml: wrapPlain(
      "I'll stop emailing after this one.",
      `
      <p>Hi {{firstName}},</p>
      <p>Mikkel here, one last time. You got all the way to planning routes in PathPilo but never finished your account, and I don't want to keep cluttering your inbox.</p>
      <p>So this is the last email I'll send. If you'd like to finish, it's one field and about ten seconds: <a href="${ctaUrl(5)}">complete my account</a>.</p>
      <p>And if PathPilo wasn't the right fit, I'd genuinely love to know why. Just hit reply, even one line helps me make it better.</p>
      <p>Either way, thanks for giving us a go.</p>
      ${SIGNATURE}
    `,
    ),
  },
]

/** Group emails by the gap they belong to (keyed by fromStep). */
export const NUDGE_EMAILS_BY_STEP: Record<number, NudgeEmail[]> = {}
for (const email of NUDGE_EMAILS) {
  if (!NUDGE_EMAILS_BY_STEP[email.fromStep]) {
    NUDGE_EMAILS_BY_STEP[email.fromStep] = []
  }
  NUDGE_EMAILS_BY_STEP[email.fromStep].push(email)
}

export const STEP_LABELS: Record<number, string> = {
  1: 'Enter Email',
  2: 'Create Account',
  3: 'Add Client',
  4: 'Add Job',
  5: 'Setup Business',
  6: 'Complete',
}

/** Display metadata for email types — used by the admin emails page. */
export const EMAIL_TYPE_META: Record<EmailType, { label: string; cls: string }> = {
  transactional: { label: 'Transactional', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  'quick-win': { label: 'Quick win', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  value: { label: 'Value', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  founder: { label: 'Founder', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  celebration: { label: 'Celebration', cls: 'bg-green-50 text-green-700 ring-green-200' },
  final: { label: 'Final', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
}
