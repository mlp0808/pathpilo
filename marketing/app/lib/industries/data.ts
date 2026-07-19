import type { Industry } from './types'
import { WINDOW_CLEANING_COMPARISON } from '../comparisons/data'
import { DA_INDUSTRY_TRANSLATIONS } from './da-translations'

/**
 * Industry registry. Add a new trade by adding an entry to INDUSTRIES below.
 * The IndustryLanding template renders everything from this data — no new
 * layout code required for new industries.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Window cleaning
// ─────────────────────────────────────────────────────────────────────────────

const windowCleaning: Industry = {
  slug: 'window-cleaning-software',
  menuLabel: 'Window cleaners',
  trade: 'window cleaning',
  menuBlurb: 'Route planning, invoicing, and reminders. All free.',

  seoTitle: 'Window Cleaning Software: Free Route Planning, Scheduling and Invoicing | PathPilo',
  seoDescription:
    'Free window cleaning software with automatic route planning, customer reminders, and same-day invoicing. Fit in more jobs and spend less time on admin.',

  hero: {
    eyebrow: 'Window cleaning software',
    h1: 'Window cleaning software that plans your routes and gets you paid the same day',
    sub: 'PathPilo automatically orders your stops by area, texts customers before you arrive, and sends invoices the moment you finish. Fit in more jobs without working late.',
    trustLine: 'Free to start · No card needed · Set up in an afternoon',
    image: '/images/industries/window-cleaning-person-app.png',
    imageAlt: 'A window cleaner checking his route schedule on the PathPilo app',
  },

  trustBar: {
    label: 'Built for window cleaners — from solo operators to growing teams',
    points: ['Free to get started', 'Works on your phone', 'No contract, cancel anytime', 'Set up in an afternoon'],
  },

  pain: {
    title: 'Sound familiar?',
    sub: 'Most window cleaners lose hours every week to the same handful of problems. PathPilo was built to take them off your plate.',
    items: [
      'Your schedule lives in your head or a tatty notebook, and one missed page throws the whole week off.',
      'You drive across town and back because the day was never planned by area.',
      'Customers are out, the gate is locked, and the trip is wasted.',
      'You are still chasing payments from jobs you finished three weeks ago.',
      'Enquiries go cold because you could not reply until the evening.',
      'You spend your nights doing admin instead of being with family.',
    ],
  },

  outcomes: [
    {
      eyebrow: 'More hours in your day',
      title: 'Fit more jobs into the same hours',
      body: 'Instead of zig-zagging across town, PathPilo orders your stops so the nearest jobs come next. You spend less time driving and more time cleaning. That means more visits a day without working any later.',
      bullets: [
        'Your jobs automatically ordered by area, not by guesswork',
        'See your whole week at a glance and balance the days',
        'Squeeze in extra jobs without extending your day',
      ],
      visual: 'route',
      video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
      videoPoster: '/images/features/routeplanning-weekplanner-placeholder.svg',
    },
    {
      eyebrow: 'Fewer wasted trips',
      title: 'Stop losing trips to locked gates and empty houses',
      body: 'PathPilo texts your customers the day before so they know you are coming, and can send an automatic "on my way" message. Fewer surprises, fewer locked gates, and far fewer journeys for nothing.',
      bullets: [
        'Automatic reminder the day before each visit',
        'Optional "on my way" text as you head over',
        'Cut no-access trips that cost you time and fuel',
      ],
      visual: 'sms',
      video: '/images/features/routeplanning-automations.mp4',
      videoPoster: '/images/features/routeplanning-map-placeholder.svg',
    },
    {
      eyebrow: 'Get paid faster',
      title: 'Get paid the day you finish — without chasing',
      body: 'Mark a job done and the invoice sends itself. Polite reminders chase late payers for you, and customers can pay by card, bank transfer, or online link in a couple of taps. The money lands days sooner.',
      bullets: [
        'Invoices created automatically when a job is complete',
        'Friendly reminders that chase late payers for you',
        'Card, bank, and online payment options built in',
      ],
      visual: 'invoice',
      image: '/images/features/invoicing.png',
      imageAlt: 'PathPilo invoicing screen showing a completed window cleaning job with payment options',
      imagePlain: true,
    },
    {
      eyebrow: 'Win more customers',
      title: 'Turn enquiries into booked jobs',
      body: 'A simple booking form on your website captures new customers with their address and what they need, dropping straight into your list. No more back-and-forth texts. Just quote, confirm, and book them in.',
      bullets: [
        'Online booking form that captures every detail',
        'New enquiries land straight in your pipeline',
        'Quote and book in minutes, not days',
      ],
      visual: 'booking',
      image: '/images/industries/window-cleaning-person-van.png',
      imageAlt: 'A window cleaner standing by his van using the PathPilo app to manage new customer enquiries',
      imagePlain: true,
    },
  ],

  stats: [
    { value: 8, suffix: ' hrs', label: 'Admin saved every week, on average' },
    { value: 30, suffix: '%', label: 'Fewer missed and no-access appointments' },
    { value: 5, suffix: ' days', label: 'Faster payment with auto invoicing' },
    { value: 0, display: '£0', label: 'Free forever plan available' },
  ],

  featureGrid: {
    eyebrow: 'One simple app',
    title: 'Everything your window cleaning business needs, in one place',
    sub: 'No more juggling a notebook, a calendar, a spreadsheet, and your bank app. PathPilo brings it together and keeps it simple.',
    items: [
      { icon: 'route', title: 'Route planning', text: 'Your jobs ordered by area automatically so you drive less and clean more.' },
      { icon: 'calendar', title: 'Scheduling', text: 'See the whole week, drag jobs around, and never double-book.' },
      { icon: 'bell', title: 'Auto reminders', text: 'Text customers before each visit so they expect you.' },
      { icon: 'invoice', title: 'Invoicing', text: 'Invoices that send themselves the moment a job is done.' },
      { icon: 'card', title: 'Easy payments', text: 'Card, bank, and online payment links your customers can tap.' },
      { icon: 'users', title: 'Customer list', text: 'Every address, gate code, and note in one tidy place.' },
      { icon: 'form', title: 'Booking form', text: 'Capture new enquiries from your website automatically.' },
      { icon: 'phone', title: 'Works on your phone', text: 'Run your whole day from the van — no laptop needed.' },
    ],
  },

  testimonials: {
    title: 'Window cleaners who got their evenings back',
    sub: 'Real outcomes from window cleaners who switched to PathPilo.',
    items: [
      {
        quote: 'I used to spend Sunday nights working out my week. Now the schedule plans itself and I just clean. I have picked up an extra six jobs a week without working later.',
        name: 'Lee M.',
        role: 'Window cleaner',
        location: 'Leeds',
      },
      {
        quote: 'The text reminders alone paid for themselves. I barely get a locked gate anymore, and customers love knowing when I am coming.',
        name: 'Danny R.',
        role: 'Solo window cleaner',
        location: 'Bristol',
      },
      {
        quote: 'Invoices send the second I finish and the reminders chase the slow payers for me. I went from waiting three weeks to getting paid in days.',
        name: 'Sophie T.',
        role: 'Window & gutter cleaning',
        location: 'Manchester',
      },
      {
        quote: 'I am not a computer person and I had it running in an afternoon. My whole schedule is on my phone now and it just works.',
        name: 'Mark P.',
        role: 'Two-van window cleaning team',
        location: 'Glasgow',
      },
    ],
  },

  freePlan: {
    title: 'Start completely free',
    sub: 'Everything a window cleaner needs to run their business efficiently, at no cost. Upgrade only when you grow into a bigger team.',
    includes: [
      'Route planning and scheduling',
      'Your full customer list with notes and gate codes',
      'Automatic invoicing and payment links',
      'Customer reminders',
      'Online booking form',
      'The mobile app for the van',
    ],
    note: 'No credit card. No contract. Keep using the free plan for as long as it suits you.',
  },

  faq: {
    title: 'Window cleaning software questions, answered',
    sub: 'Everything you might want to know before you start.',
    items: [
      {
        q: 'Is PathPilo really free for window cleaners?',
        a: 'Yes. The free plan covers route planning, scheduling, your customer list, invoicing, payment links, customer reminders, and the mobile app. There is no card required and no time limit. You only pay if you grow into a larger team and want the extra team management features.',
      },
      {
        q: 'Do I need to be good with technology?',
        a: 'No. PathPilo is built to be simple enough to run from your phone in the van. Most window cleaners are up and running in an afternoon. If you can use a maps app and send a text, you can use PathPilo.',
      },
      {
        q: 'Can it handle recurring jobs on different frequencies, like 4-weekly or 8-weekly?',
        a: 'Yes. Set a customer to repeat every few weeks and PathPilo keeps adding their visits to your schedule automatically, in the right order on your route. You set it once and it runs.',
      },
      {
        q: 'Does it send text reminders to my customers?',
        a: 'Yes. PathPilo can text customers the day before their clean so they expect you, and send an optional "on my way" message when you set off. This is one of the biggest ways window cleaners cut wasted trips to locked gates.',
      },
      {
        q: 'How do my customers pay?',
        a: 'Invoices include a payment link so customers can pay by card or bank transfer in a couple of taps. You can also record cash payments. Automatic reminders chase anyone who forgets, so you are not the one having awkward conversations.',
      },
      {
        q: 'Can I use it on my phone while I am working?',
        a: 'Absolutely. Everything runs from the mobile app — see your next job, get directions, mark it done, and send the invoice, all from the van. Everything syncs so your records are always up to date.',
      },
      {
        q: 'Can I bring my existing customer list over?',
        a: 'Yes. You can add your customers quickly, including their address, gate codes, and any notes. Most window cleaners get everything set up within an afternoon and fill in the rest as they go.',
      },
      {
        q: 'Does it work for a one-man band and a team?',
        a: 'Both. A solo operator gets a simpler, faster way to manage their day, and as you add staff you can assign jobs, balance everyone\'s workload on the map, and keep the whole team on the same up-to-date schedule.',
      },
    ],
  },

  finalCta: {
    title: 'Ready to run a more organised, more profitable window cleaning business?',
    sub: 'Join the window cleaners who plan less, drive less, and get paid faster with PathPilo. Free to start, set up in an afternoon.',
  },

  comparison: {
    ...WINDOW_CLEANING_COMPARISON,
    detailHref: '/comparisons/pathpilo-vs-jobber-window-cleaning',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Domestic cleaning
// ─────────────────────────────────────────────────────────────────────────────

const domesticCleaning: Industry = {
  slug: 'domestic-cleaning-software',
  menuLabel: 'Domestic cleaners',
  trade: 'domestic cleaning',
  menuBlurb: 'Manage recurring clients, cut no-shows, and get paid on time.',

  seoTitle: 'Domestic Cleaning Software (Free) — Scheduling, Reminders & Invoicing | PathPilo',
  seoDescription:
    'Free domestic cleaning software that schedules your regular clients, sends automatic reminders, and invoices the moment a job is done. Spend less time on admin and more time cleaning.',

  hero: {
    eyebrow: 'Domestic cleaning software',
    h1: 'Domestic cleaning software that schedules your clients and handles the admin for you',
    sub: 'PathPilo organises your weekly client list by area, reminds customers before every clean, and sends invoices the second you finish. Nothing slips through the cracks.',
    trustLine: 'Free to start · No card needed · Works on your phone',
    image: '/images/industries/window-cleaning-person-app.png',
    imageAlt: 'A field service operator checking their schedule on the PathPilo app',
  },

  trustBar: {
    label: 'Built for cleaning businesses — from solo cleaners to growing agencies',
    points: ['Free to get started', 'Recurring client management', 'Automatic reminders', 'Set up in an afternoon'],
  },

  pain: {
    title: 'Sound familiar?',
    sub: 'Most domestic cleaning businesses lose time and money to the same avoidable problems every week.',
    items: [
      'You have 20 regular clients and keeping track of who is when is a full-time job in itself.',
      'A client is not home, the door is locked, and the journey is completely wasted.',
      'You drive all the way across town to do one job when you had three in the same street yesterday.',
      'Invoices pile up at the end of the month and chasing payment takes up your entire weekend.',
      'A new enquiry comes in while you are cleaning and by the evening they have moved on.',
      'You can not easily take time off because everything lives in your head.',
    ],
  },

  outcomes: [
    {
      eyebrow: 'More efficient days',
      title: 'Stop driving across town for one client',
      body: 'PathPilo groups your daily schedule by area so you move logically from one client to the next. Less fuel, less time behind the wheel, and more cleans in the same hours.',
      bullets: [
        'Daily schedule automatically ordered by location',
        'Balance your recurring clients across the week efficiently',
        'Fit in extra jobs without adding to your drive time',
      ],
      visual: 'route',
      video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
      videoPoster: '/images/features/routeplanning-weekplanner-placeholder.svg',
    },
    {
      eyebrow: 'Fewer no-shows',
      title: 'Clients who know you are coming and are ready',
      body: 'A text the day before means no more arriving at a locked house or finding a client mid-meeting. PathPilo sends it automatically so you never have to remember to do it yourself.',
      bullets: [
        'Automatic reminder sent the day before every clean',
        'Optional "on my way" text so clients can let you in',
        'Far fewer wasted journeys and last-minute cancellations',
      ],
      visual: 'sms',
      video: '/images/features/routeplanning-automations.mp4',
      videoPoster: '/images/features/routeplanning-map-placeholder.svg',
    },
    {
      eyebrow: 'Get paid on time',
      title: 'Invoices that send themselves every single time',
      body: 'Mark a clean complete and the invoice goes out immediately. If a client does not pay, PathPilo sends a polite reminder so you do not have to have that awkward conversation. Most clients pay within a day or two.',
      bullets: [
        'Invoice generated and sent the moment a job is marked done',
        'Automatic payment reminders for slow payers',
        'Card and bank transfer payment links included',
      ],
      visual: 'invoice',
      image: '/images/features/invoicing.png',
      imageAlt: 'PathPilo invoicing screen showing a completed job with payment options',
      imagePlain: true,
    },
    {
      eyebrow: 'Grow your client list',
      title: 'Never miss a new enquiry again',
      body: 'An online booking form on your website lets new customers send their details, address, and preferred schedule at any time of day. It lands straight in your pipeline so you can quote and confirm while the interest is fresh.',
      bullets: [
        'Booking form works 24/7 even when you are cleaning',
        'Every enquiry includes address and preferred schedule',
        'Quote and confirm in minutes from your phone',
      ],
      visual: 'booking',
      image: '/images/industries/window-cleaning-person-van.png',
      imageAlt: 'A service operator standing by their van checking new customer enquiries on PathPilo',
      imagePlain: true,
    },
  ],

  stats: [
    { value: 6, suffix: ' hrs', label: 'Admin saved every week on average' },
    { value: 35, suffix: '%', label: 'Reduction in no-shows with reminders' },
    { value: 3, suffix: ' days', label: 'Faster payment with auto invoicing' },
    { value: 0, display: '£0', label: 'Free forever plan available' },
  ],

  featureGrid: {
    eyebrow: 'One simple app',
    title: 'Everything your cleaning business needs, without the complexity',
    sub: 'Designed for cleaners who want to spend their time cleaning, not on a computer.',
    items: [
      { icon: 'calendar', title: 'Recurring clients', text: 'Set up weekly or fortnightly schedules and PathPilo handles the rest.' },
      { icon: 'route', title: 'Route planning', text: 'Your day ordered by area so you drive the shortest possible route.' },
      { icon: 'bell', title: 'Auto reminders', text: 'Clients get a text before every clean so they are always ready for you.' },
      { icon: 'invoice', title: 'Auto invoicing', text: 'Invoice sent automatically the moment you mark a job done.' },
      { icon: 'card', title: 'Easy payments', text: 'Clients pay by card or bank transfer from a link on their phone.' },
      { icon: 'users', title: 'Client notes', text: 'Key codes, pet names, special instructions — all in one place.' },
      { icon: 'form', title: 'Booking form', text: 'New clients can request a quote directly from your website.' },
      { icon: 'phone', title: 'Works on your phone', text: 'Manage your whole day from your phone — no office needed.' },
    ],
  },

  testimonials: {
    title: 'Cleaners who spend more time cleaning and less time on admin',
    sub: 'Real outcomes from domestic cleaning businesses that use PathPilo.',
    items: [
      {
        quote: 'I have 18 regular clients and I used to spend hours every Sunday sorting out the week. Now I spend about 10 minutes. It has changed my work-life balance completely.',
        name: 'Claire H.',
        role: 'Solo domestic cleaner',
        location: 'Birmingham',
      },
      {
        quote: 'The reminder texts have cut my no-shows by more than half. I used to drive to at least two locked houses a week. Now it is maybe one a month.',
        name: 'Tracey W.',
        role: 'Domestic cleaning',
        location: 'Cardiff',
      },
      {
        quote: 'Getting paid used to be the worst part of the job. Now invoices just go out and most clients pay within a day. I do not have to chase anyone anymore.',
        name: 'Natalie B.',
        role: 'Cleaning agency owner',
        location: 'Sheffield',
      },
      {
        quote: 'I have three cleaners now and giving them all access to their own schedules on the app has saved me an hour of phone calls every single morning.',
        name: 'Karen M.',
        role: 'Domestic cleaning team',
        location: 'Edinburgh',
      },
    ],
  },

  freePlan: {
    title: 'Start free — no card, no expiry',
    sub: 'Everything a domestic cleaner needs to run a professional, organised business. Upgrade only if you build a larger team.',
    includes: [
      'Unlimited recurring client scheduling',
      'Automatic reminders before every visit',
      'Auto invoicing and payment links',
      'Client notes (key codes, pet names, instructions)',
      'Online booking form for your website',
      'Mobile app — your whole day on your phone',
    ],
    note: 'No credit card. No time limit. The free plan covers everything a solo cleaner needs.',
  },

  faq: {
    title: 'Domestic cleaning software — your questions answered',
    sub: 'Common questions from cleaning businesses before they get started.',
    items: [
      {
        q: 'I have lots of regular weekly clients. Can PathPilo handle that?',
        a: 'Yes. PathPilo is built specifically for businesses with recurring clients. Set each client to repeat weekly, fortnightly, or on any custom schedule and PathPilo automatically creates their upcoming visits. Unlimited clients, unlimited recurring jobs — all included free.',
      },
      {
        q: 'Can I store key codes and access notes for each client?',
        a: 'Yes. Every client record has a notes field where you can store key safe codes, alarm codes, pet instructions, parking notes, or anything else. These are always visible when you are heading to that job.',
      },
      {
        q: 'Does it work for a cleaning agency with multiple staff?',
        a: 'Yes. The Company plan lets you add unlimited cleaners, assign jobs to specific team members, and give each cleaner their own app login so they only see their own schedule. You manage everything from one view.',
      },
      {
        q: 'What if a client cancels or skips a week?',
        a: 'Easy. You can skip a single visit without affecting the rest of their recurring schedule, or pause them entirely and resume when they are ready. The schedule adjusts automatically.',
      },
      {
        q: 'Can clients pay by Direct Debit or bank transfer?',
        a: 'Clients can pay using a payment link included on every invoice — card or bank transfer. Cash payments can also be recorded. Automatic reminders follow up anyone who has not paid yet.',
      },
      {
        q: 'Will it help me get more clients?',
        a: 'The online booking form means new clients can request a quote from your website at any hour. You get their address, preferred schedule, and contact details straight into PathPilo so you can respond and book them in quickly.',
      },
      {
        q: 'How long does it take to set up?',
        a: 'Most cleaning businesses are up and running within an afternoon. Add your clients, set their schedules, and your week is ready. The app walks you through each step.',
      },
      {
        q: 'I already use a spreadsheet. Why switch?',
        a: 'A spreadsheet does not send reminders, generate invoices, chase payments, or show your clients on a map. PathPilo does all of those automatically, which is the difference between finishing work at 6pm and finishing at 9pm.',
      },
    ],
  },

  finalCta: {
    title: 'Ready to run your cleaning business without the Sunday night admin?',
    sub: 'Join domestic cleaners who schedule smarter, get paid faster, and waste fewer journeys. Free to start, set up in an afternoon.',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Lawn care & garden maintenance
// ─────────────────────────────────────────────────────────────────────────────

const lawnCare: Industry = {
  slug: 'lawn-care-software',
  menuLabel: 'Lawn care & gardening',
  trade: 'lawn care and gardening',
  menuBlurb: 'Weekly routes, recurring clients, and invoices that take care of themselves.',

  seoTitle: 'Lawn Care Software (Free) — Route Planning, Scheduling & Invoicing | PathPilo',
  seoDescription:
    'Free lawn care and gardening software with weekly route planning, automatic client reminders, and same-day invoicing. Run more jobs without the admin overhead.',

  hero: {
    eyebrow: 'Lawn care & gardening software',
    h1: 'Lawn care software that plans your weekly routes and takes care of the admin',
    sub: 'PathPilo orders your daily stops by area, texts clients before you arrive, and generates invoices the moment you finish. Focus on the work, not the paperwork.',
    trustLine: 'Free to start · No card needed · Set up in an afternoon',
    image: '/images/industries/window-cleaning-person-app.png',
    imageAlt: 'A field service operator checking their route schedule on the PathPilo app',
  },

  trustBar: {
    label: 'Built for lawn care and gardening businesses — from solo gardeners to full teams',
    points: ['Free to get started', 'Weekly route planning', 'Recurring client management', 'Mobile-friendly'],
  },

  pain: {
    title: 'Sound familiar?',
    sub: 'Running a lawn care business is physical work — the admin should not be just as exhausting.',
    items: [
      'You are driving back and forth across the same streets because the day was never planned by area.',
      'Regular clients slip your mind or get forgotten when the season gets busy.',
      'You turn up at a property and no one is home to let you through the gate.',
      'Invoices sit unsent for days after the job because you forgot or ran out of time.',
      'You lose track of which clients are due this week and which were skipped last week.',
      'Taking on a new helper means more phone calls, more confusion, and more mistakes.',
    ],
  },

  outcomes: [
    {
      eyebrow: 'More jobs per day',
      title: 'Cut the driving time and fit in more clients',
      body: 'PathPilo clusters your day\'s jobs by location so you work street by street instead of criss-crossing town. Typical gardeners pick up one to two extra jobs a day just from cutting dead drive time.',
      bullets: [
        'Daily jobs automatically sorted by geographic area',
        'Map view shows your route and estimated drive time',
        'Balance clients across the week to keep days even',
      ],
      visual: 'route',
      video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
      videoPoster: '/images/features/routeplanning-weekplanner-placeholder.svg',
    },
    {
      eyebrow: 'No more missed gates',
      title: 'Clients who are ready for you when you arrive',
      body: 'An automatic text the day before every visit means gates are unlocked, pets are inside, and clients know their garden is being done. Fewer wasted journeys, happier clients.',
      bullets: [
        'Day-before reminder sent to every client automatically',
        'Reduce wasted trips to locked or inaccessible properties',
        'Clients feel looked after without any extra effort from you',
      ],
      visual: 'sms',
      video: '/images/features/routeplanning-automations.mp4',
      videoPoster: '/images/features/routeplanning-map-placeholder.svg',
    },
    {
      eyebrow: 'Get paid the same day',
      title: 'Invoices go out the moment the job is done',
      body: 'Mark a garden done, and the invoice lands in your client\'s inbox immediately. No more forgetting, no more end-of-month billing marathons, and no more waiting weeks to get paid.',
      bullets: [
        'Invoice auto-created and sent when a job is completed',
        'Payment reminders chase slow payers for you',
        'Card, bank transfer, and online payments supported',
      ],
      visual: 'invoice',
      image: '/images/features/invoicing.png',
      imageAlt: 'PathPilo invoicing screen showing a completed job with payment options',
      imagePlain: true,
    },
    {
      eyebrow: 'Grow without the chaos',
      title: 'Take on new clients without more paperwork',
      body: 'An online booking form captures new client details, address, garden size, and what they need, directly into PathPilo. No phone tag, no re-entering info. Just quote, confirm, and add them to your schedule.',
      bullets: [
        'Online quote request form for your website or social media',
        'New clients added to your schedule in minutes',
        'Easy to hand off to a second team member when you scale',
      ],
      visual: 'booking',
      image: '/images/industries/window-cleaning-person-van.png',
      imageAlt: 'A service operator by their van checking new client enquiries on PathPilo',
      imagePlain: true,
    },
  ],

  stats: [
    { value: 7, suffix: ' hrs', label: 'Admin time saved per week on average' },
    { value: 25, suffix: '%', label: 'Less drive time with area-based routing' },
    { value: 4, suffix: ' days', label: 'Faster payment with same-day invoicing' },
    { value: 0, display: '£0', label: 'Free forever plan available' },
  ],

  featureGrid: {
    eyebrow: 'One simple app',
    title: 'Everything a lawn care and gardening business needs, in one place',
    sub: 'Less time on the phone and at a desk. More time doing the work you enjoy.',
    items: [
      { icon: 'route', title: 'Route planning', text: 'Your daily jobs sorted by location to cut drive time automatically.' },
      { icon: 'calendar', title: 'Recurring clients', text: 'Weekly, fortnightly, or custom schedules that manage themselves.' },
      { icon: 'bell', title: 'Client reminders', text: 'Automated day-before text so clients are ready when you arrive.' },
      { icon: 'invoice', title: 'Auto invoicing', text: 'Invoice sent the moment a job is completed — no manual steps.' },
      { icon: 'card', title: 'Easy payments', text: 'Online payment links so clients can pay from their phone in seconds.' },
      { icon: 'users', title: 'Client details', text: 'Gate codes, dog warnings, parking notes — all visible before you arrive.' },
      { icon: 'form', title: 'Quote requests', text: 'Online form lets new clients request a quote at any time of day.' },
      { icon: 'phone', title: 'Mobile first', text: 'Everything you need is in your pocket — no laptop, no office.' },
    ],
  },

  testimonials: {
    title: 'Gardeners and lawn care businesses that work smarter',
    sub: 'Real results from lawn care and gardening businesses that use PathPilo.',
    items: [
      {
        quote: 'I added two extra gardens a day just by doing the same area on the same day. PathPilo showed me how badly I was routing myself before.',
        name: 'Phil T.',
        role: 'Lawn care and maintenance',
        location: 'Nottingham',
      },
      {
        quote: 'The invoices going out automatically has been massive. I used to forget half of them and end up billing weeks later. Now the money just appears.',
        name: 'Ryan S.',
        role: 'Solo gardener',
        location: 'Southampton',
      },
      {
        quote: 'I have four lads now and giving each of them their own app so they know exactly where to go has saved me loads of back-and-forth calls every morning.',
        name: 'Craig L.',
        role: 'Garden maintenance team',
        location: 'Newcastle',
      },
      {
        quote: 'Setting up recurring clients took about 20 minutes and now my whole regular schedule just runs itself. I just deal with any changes.',
        name: 'Ben A.',
        role: 'Lawn care',
        location: 'Brighton',
      },
    ],
  },

  freePlan: {
    title: 'Start free — no card, no time limit',
    sub: 'Everything a solo gardener or small team needs to run a tight, professional operation at no cost.',
    includes: [
      'Route planning — daily jobs sorted by area',
      'Recurring client scheduling (weekly, fortnightly, custom)',
      'Automatic day-before reminders',
      'Auto invoicing and payment links',
      'Client notes — gate codes, instructions, pet details',
      'Mobile app for the van or truck',
    ],
    note: 'No credit card required. Free forever for solo operators.',
  },

  faq: {
    title: 'Lawn care and gardening software — questions answered',
    sub: 'Everything you need to know before you get started.',
    items: [
      {
        q: 'Can PathPilo handle weekly and fortnightly clients on the same schedule?',
        a: 'Yes. Each client has their own recurring schedule — weekly, fortnightly, every four weeks, monthly, or any custom interval. PathPilo automatically creates the next visit and slots it into the right week on your schedule.',
      },
      {
        q: 'Does it work during the busy season when jobs change every day?',
        a: 'Yes. You can drag and drop jobs between days, add one-off jobs alongside regulars, and skip visits without affecting the recurring schedule. It is built to be flexible for the realities of outdoor work.',
      },
      {
        q: 'I have a mix of domestic and commercial clients. Can PathPilo handle both?',
        a: 'Yes. Each client record stores their address, contact details, job notes, and payment preferences. Commercial clients can have their own invoice terms and you can manage both in one place.',
      },
      {
        q: 'Can I add employees and give them their own schedules?',
        a: 'Yes. The Company plan lets you add unlimited team members with their own app login, assign specific jobs to specific people, and see everyone\'s location and progress on one map.',
      },
      {
        q: 'What about quoting? Can I send quotes to new clients?',
        a: 'Yes. You can create and send quotes directly from PathPilo. When a client accepts, the job is added to your schedule automatically — no re-entering anything.',
      },
      {
        q: 'Does the mobile app work with no signal?',
        a: 'The core features (viewing your schedule, marking jobs done, client notes) work offline and sync when your signal returns. Sending invoices and reminders requires a connection.',
      },
      {
        q: 'Can I see the whole week at once?',
        a: 'Yes. The week view shows all your jobs across each day with estimated times. You can drag jobs between days, add buffer time, and balance the workload visually.',
      },
      {
        q: 'Is it worth it for a one-person operation?',
        a: 'Absolutely. Solo gardeners typically save 5 to 7 hours of admin every week and pick up extra jobs by cutting unnecessary drive time. And the free plan costs nothing, so there is nothing to lose.',
      },
    ],
  },

  finalCta: {
    title: 'Ready to spend more time gardening and less time on admin?',
    sub: 'Join lawn care and gardening businesses that route smarter, get paid faster, and grow without the chaos. Free to start today.',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Gutter cleaning
// ─────────────────────────────────────────────────────────────────────────────

const gutterCleaning: Industry = {
  slug: 'gutter-cleaning-software',
  menuLabel: 'Gutter cleaners',
  trade: 'gutter cleaning',
  menuBlurb: 'Manage seasonal jobs, recurring clients, and same-day invoicing.',

  seoTitle: 'Gutter Cleaning Software (Free) — Scheduling, Route Planning & Invoicing | PathPilo',
  seoDescription:
    'Free gutter cleaning software for managing seasonal and recurring jobs. Route planning, automatic reminders, and invoicing all from your phone. Free forever for solo operators.',

  hero: {
    eyebrow: 'Gutter cleaning software',
    h1: 'Gutter cleaning software that keeps your schedule organised and your invoices paid',
    sub: 'PathPilo manages your recurring annual clients, orders your daily jobs by area, texts customers before you arrive, and sends invoices the moment you finish. All from your phone.',
    trustLine: 'Free to start · No card needed · Works on any phone',
    image: '/images/industries/window-cleaning-person-app.png',
    imageAlt: 'A field service operator checking their job schedule on the PathPilo app',
  },

  trustBar: {
    label: 'Built for gutter cleaners — seasonal, recurring, and one-off jobs all in one place',
    points: ['Free to get started', 'Seasonal job tracking', 'Recurring annual clients', 'Invoice from the van'],
  },

  pain: {
    title: 'Sound familiar?',
    sub: 'Gutter cleaning businesses deal with seasonal rushes, hard-to-reach customers, and scattered jobs. PathPilo brings it all under control.',
    items: [
      'Autumn arrives and you suddenly have 60 clients due at the same time and no easy way to schedule them.',
      'You drive from one side of town to the other when three jobs on the same street could have been done together.',
      'Annual or biannual clients fall off your radar and you miss the window to rebook them.',
      'Customers are not home, gates are locked, and you lose half a day to wasted trips.',
      'Invoices get sent days or weeks late because you are too busy on the tools.',
      'You cannot remember which jobs you have done this week and which are still outstanding.',
    ],
  },

  outcomes: [
    {
      eyebrow: 'Manage the seasonal rush',
      title: 'Get through the autumn backlog without the chaos',
      body: 'PathPilo lets you batch your annual clients and schedule them in an efficient geographic order. You can see exactly who is due, when, and where. Work through the list systematically rather than firefighting.',
      bullets: [
        'See all overdue and upcoming annual clients in one view',
        'Schedule multiple clients in the same street on the same day',
        'Track progress through seasonal jobs without a whiteboard',
      ],
      visual: 'route',
      video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
      videoPoster: '/images/features/routeplanning-weekplanner-placeholder.svg',
    },
    {
      eyebrow: 'Fewer wasted journeys',
      title: 'Cut the trips to locked gates and absent customers',
      body: 'Gutter cleaning usually requires access. PathPilo sends an automatic reminder to every customer the day before so they know you are coming, can unlock the gate, and do not book a plumber for the same morning.',
      bullets: [
        'Automatic text reminder before every booked visit',
        'Customers can confirm access or let you know in advance',
        'Fewer wasted journeys means more jobs completed per day',
      ],
      visual: 'sms',
      video: '/images/features/routeplanning-automations.mp4',
      videoPoster: '/images/features/routeplanning-map-placeholder.svg',
    },
    {
      eyebrow: 'Get paid immediately',
      title: 'Invoice before you put the ladder back in the van',
      body: 'The moment you mark a job done in the app, an invoice is sent to the customer automatically. Add photos of the cleared gutters as evidence if you like. Payment typically lands within a day.',
      bullets: [
        'Instant invoice sent when the job is marked complete',
        'Attach photos directly to the invoice from your phone',
        'Automatic reminders chase unpaid invoices for you',
      ],
      visual: 'invoice',
      image: '/images/features/invoicing.png',
      imageAlt: 'PathPilo invoicing screen showing a completed job with payment options',
      imagePlain: true,
    },
    {
      eyebrow: 'Never lose a client',
      title: 'Recurring clients that re-book themselves',
      body: 'Set each client to repeat annually or every six months and PathPilo adds the next visit to your schedule automatically. You never lose track of who is due and you do not have to remember to chase anyone.',
      bullets: [
        'Annual and biannual clients added to your schedule automatically',
        'SMS or email reminder sent to the client when they are due',
        'Your recurring revenue becomes truly predictable',
      ],
      visual: 'booking',
      image: '/images/industries/window-cleaning-person-van.png',
      imageAlt: 'A service operator by their van managing recurring client bookings on PathPilo',
      imagePlain: true,
    },
  ],

  stats: [
    { value: 5, suffix: ' hrs', label: 'Admin saved per week on average' },
    { value: 40, suffix: '%', label: 'Fewer no-access wasted visits' },
    { value: 2, suffix: ' days', label: 'Faster payment with instant invoicing' },
    { value: 0, display: '£0', label: 'Free forever plan available' },
  ],

  featureGrid: {
    eyebrow: 'One simple app',
    title: 'Everything a gutter cleaning business needs to stay organised',
    sub: 'From managing your annual client list to sending the invoice from the roof — all from your phone.',
    items: [
      { icon: 'calendar', title: 'Recurring client scheduling', text: 'Annual and biannual clients managed automatically — never miss a rebooking.' },
      { icon: 'route', title: 'Route planning', text: 'Your daily jobs ordered by area so you spend less time driving between properties.' },
      { icon: 'bell', title: 'Customer reminders', text: 'Automatic text before every visit so clients are ready and access is arranged.' },
      { icon: 'invoice', title: 'Instant invoicing', text: 'Invoice sent the second a job is marked done — from the van, on the roof, anywhere.' },
      { icon: 'card', title: 'Online payments', text: 'Customers pay by card or bank transfer from a link in their invoice.' },
      { icon: 'users', title: 'Customer notes', text: 'Gate codes, key safe numbers, access instructions — visible before every job.' },
      { icon: 'form', title: 'Booking form', text: 'New enquiries come in through a form on your website, ready to quote.' },
      { icon: 'phone', title: 'Works on your phone', text: 'Everything runs from your phone — no office, no laptop required.' },
    ],
  },

  testimonials: {
    title: 'Gutter cleaners who stay on top of their schedule all year',
    sub: 'Real results from gutter cleaning businesses using PathPilo.',
    items: [
      {
        quote: 'Autumn used to mean three weeks of chaos. Now I load up my annual clients in PathPilo, sort them by area, and work through them in order. It is so much calmer.',
        name: 'Dave K.',
        role: 'Gutter & fascia cleaning',
        location: 'Leicester',
      },
      {
        quote: 'I used to lose at least two jobs a day to locked gates. Since I started sending reminders the day before, I can count on one hand how often it happens now.',
        name: 'Tom F.',
        role: 'Solo gutter cleaner',
        location: 'York',
      },
      {
        quote: 'I take a before-and-after photo and attach it to the invoice in seconds. Customers love it and disputes have basically disappeared.',
        name: 'Matt B.',
        role: 'Gutter cleaning and repair',
        location: 'Coventry',
      },
      {
        quote: 'My annual clients just pop up when they are due. I text them, they book in, and it happens. I have not lost a regular client since I started using PathPilo.',
        name: 'Jason H.',
        role: 'Property maintenance',
        location: 'Reading',
      },
    ],
  },

  freePlan: {
    title: 'Start for free — no commitment',
    sub: 'Everything a gutter cleaning business needs to stay on top of seasonal jobs and recurring clients, at no cost.',
    includes: [
      'Recurring annual and biannual client scheduling',
      'Route planning — daily jobs sorted by area',
      'Automatic customer reminders before every visit',
      'Instant invoicing with photo attachments',
      'Card and bank transfer payment links',
      'Client notes — gate codes, access instructions',
    ],
    note: 'No credit card. No time limit. Upgrade only if you build a team.',
  },

  faq: {
    title: 'Gutter cleaning software — questions answered',
    sub: 'What gutter cleaning businesses ask most before getting started.',
    items: [
      {
        q: 'Can I manage annual clients who only need a visit once or twice a year?',
        a: 'Yes. PathPilo handles any recurring frequency — weekly, monthly, quarterly, biannual, annual. Set each client once and their next visit is automatically added to your schedule when it is due.',
      },
      {
        q: 'Can I attach before-and-after photos to invoices?',
        a: 'Yes. You can take or attach photos from your phone when completing a job, and they are included with the invoice sent to the customer. This is especially useful for gutter cleaning as evidence of the work done.',
      },
      {
        q: 'How does route planning work for gutter cleaning?',
        a: 'PathPilo shows your daily jobs on a map and orders them geographically. You can also drag and drop jobs to fine-tune the order, or let the system suggest the most efficient sequence. It cuts drive time significantly when you have multiple jobs in the same area.',
      },
      {
        q: 'I also do window cleaning. Can I manage both in one account?',
        a: 'Yes. PathPilo is built for multi-service businesses. Each job has its own service type, duration, and pricing. Customers who have both services are in one record, and you can schedule everything together.',
      },
      {
        q: 'What about quotes for one-off jobs?',
        a: 'You can create and send quotes directly from PathPilo. When a customer accepts, it converts to a booked job automatically. You can also set a follow-up reminder if they have not responded.',
      },
      {
        q: 'Can I remind annual clients that they are due without manually tracking them?',
        a: 'Yes. When a recurring job is coming up, PathPilo can automatically notify the client that their annual gutter clean is due and invite them to confirm the visit. You do not have to remember to contact anyone.',
      },
      {
        q: 'Is it suitable for a business with one person and a part-time helper?',
        a: 'Yes. The free plan covers a solo operator fully. When you add a helper, the Company plan lets you give them their own login, assign jobs to them, and see their progress during the day.',
      },
      {
        q: 'How quickly can I get set up?',
        a: 'Most gutter cleaners have their client list imported and their first week scheduled in under two hours. The mobile app is straightforward — if you can use a smartphone, you can use PathPilo.',
      },
    ],
  },

  finalCta: {
    title: 'Ready to stop losing jobs to disorganisation and missed invoices?',
    sub: 'Join gutter cleaning businesses that manage their seasonal workload with PathPilo. Free to start, no card needed.',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Pressure washing
// ─────────────────────────────────────────────────────────────────────────────

const pressureWashing: Industry = {
  slug: 'pressure-washing-software',
  menuLabel: 'Pressure washing',
  trade: 'pressure washing',
  menuBlurb: 'Schedule jobs, send professional invoices, and grow your client list.',

  seoTitle: 'Pressure Washing Software (Free) — Scheduling, Route Planning & Invoicing | PathPilo',
  seoDescription:
    'Free pressure washing software with job scheduling, route planning, customer reminders, and instant invoicing. Manage residential and commercial clients from your phone.',

  hero: {
    eyebrow: 'Pressure washing software',
    h1: 'Pressure washing software that organises your jobs and handles your invoicing automatically',
    sub: 'PathPilo schedules your jobs by area, sends reminders before every visit, and gets invoices out the second a job is done. Spend your time on the work, not chasing it.',
    trustLine: 'Free to start · No card needed · Set up in under an hour',
    image: '/images/industries/window-cleaning-person-app.png',
    imageAlt: 'A field service operator checking their job schedule on the PathPilo app',
  },

  trustBar: {
    label: 'Built for pressure washing businesses — residential, commercial, and contract work',
    points: ['Free to get started', 'Works on your phone', 'Recurring client management', 'Professional invoicing'],
  },

  pain: {
    title: 'Sound familiar?',
    sub: 'Pressure washing businesses waste time on avoidable admin. PathPilo is built to fix the most common ones.',
    items: [
      'Jobs are scattered across town with no logical order, burning fuel and time between every visit.',
      'You quote a job, the customer says yes, and then you forget to follow it up and book it in.',
      'Commercial clients pay on 30-day terms and chasing invoices eats into your working week.',
      'You do a great job and then forget to invoice for it until a week later.',
      'Customers call to ask when you are coming when a quick text reminder would have saved the call.',
      'Your customer list is split between your phone contacts, a notebook, and your head.',
    ],
  },

  outcomes: [
    {
      eyebrow: 'More jobs, less driving',
      title: 'Cluster your jobs by area and cut the dead miles',
      body: 'PathPilo orders your daily jobs geographically so you work through an area efficiently rather than driving across town between every stop. For pressure washing businesses with multiple small jobs per day, this adds up fast.',
      bullets: [
        'Daily jobs automatically sorted by location',
        'See drive time between jobs before you start the day',
        'Fit in an extra job or two by eliminating unnecessary travel',
      ],
      visual: 'route',
      video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
      videoPoster: '/images/features/routeplanning-weekplanner-placeholder.svg',
    },
    {
      eyebrow: 'Professional client experience',
      title: 'Keep clients informed automatically',
      body: 'An automatic text the day before tells the customer when to expect you, what to leave accessible, and confirms the booking is on. Fewer rescheduled appointments and a noticeably more professional impression.',
      bullets: [
        'Automatic day-before reminder for every job',
        'Customers know what is happening without you having to call',
        'Fewer last-minute cancellations and access problems',
      ],
      visual: 'sms',
      video: '/images/features/routeplanning-automations.mp4',
      videoPoster: '/images/features/routeplanning-map-placeholder.svg',
    },
    {
      eyebrow: 'Get paid without chasing',
      title: 'Invoice the moment you finish, get paid within days',
      body: 'Mark a job done in the app and the invoice is sent immediately, with photos of the completed work attached if you want. Polite automated reminders follow up anyone who has not paid, so you rarely need to chase manually.',
      bullets: [
        'Invoice sent automatically when you mark a job complete',
        'Attach before-and-after photos as proof of work',
        'Automated follow-ups for overdue payments',
      ],
      visual: 'invoice',
      image: '/images/features/invoicing.png',
      imageAlt: 'PathPilo invoicing screen showing a completed job with payment options',
      imagePlain: true,
    },
    {
      eyebrow: 'Win more work',
      title: 'Quote and book new clients faster than your competition',
      body: 'An online quote request form on your website captures new enquiries with their property details and what they need cleaned. You can reply and book while they are still comparing options. The job lands straight in your schedule.',
      bullets: [
        'Online form captures enquiries at any hour',
        'Reply and book while the client is still interested',
        'New jobs added to your schedule without re-entering anything',
      ],
      visual: 'booking',
      image: '/images/industries/window-cleaning-person-van.png',
      imageAlt: 'A service operator by their van managing new client enquiries on PathPilo',
      imagePlain: true,
    },
  ],

  stats: [
    { value: 6, suffix: ' hrs', label: 'Admin saved per week on average' },
    { value: 20, suffix: '%', label: 'Less drive time between jobs' },
    { value: 4, suffix: ' days', label: 'Faster payment with instant invoicing' },
    { value: 0, display: '£0', label: 'Free forever plan available' },
  ],

  featureGrid: {
    eyebrow: 'One simple app',
    title: 'Everything a pressure washing business needs to run professionally',
    sub: 'Manage jobs, clients, quotes, and invoices from one app — whether you are on a residential driveway or a commercial site.',
    items: [
      { icon: 'route', title: 'Route planning', text: 'Daily jobs ordered by area so you cut drive time between every stop.' },
      { icon: 'calendar', title: 'Job scheduling', text: 'One-off and recurring jobs in one clear weekly view.' },
      { icon: 'bell', title: 'Customer reminders', text: 'Automatic text before every visit — clients know when to expect you.' },
      { icon: 'invoice', title: 'Instant invoicing', text: 'Invoice sent automatically the moment a job is marked done.' },
      { icon: 'card', title: 'Easy payments', text: 'Card and bank transfer payment links on every invoice.' },
      { icon: 'users', title: 'Client records', text: 'Property details, access notes, and job history all in one place.' },
      { icon: 'form', title: 'Quote request form', text: 'Capture new enquiries from your website 24/7.' },
      { icon: 'phone', title: 'Mobile first', text: 'Your entire business runs from your phone — no desktop needed.' },
    ],
  },

  testimonials: {
    title: 'Pressure washing businesses running smarter with PathPilo',
    sub: 'Real results from pressure washing operators who made the switch.',
    items: [
      {
        quote: 'I was spending 45 minutes at the end of every day doing invoices. Now they go out the second I finish each job and I just drive home.',
        name: 'Steve R.',
        role: 'Pressure washing and driveway cleaning',
        location: 'Exeter',
      },
      {
        quote: 'I started sending the day-before reminder and the number of "I forgot you were coming" calls dropped to almost zero.',
        name: 'Josh M.',
        role: 'Residential pressure washing',
        location: 'Leeds',
      },
      {
        quote: 'The quote form on my website works even when I am on a job. I come off a big driveway and there are two new enquiries waiting. It is brilliant.',
        name: 'Andy P.',
        role: 'Pressure washing and patio cleaning',
        location: 'Milton Keynes',
      },
      {
        quote: 'Commercial clients on 30-day terms were always an issue. PathPilo sends the chase email for me on day 31 and I just have to read the reply.',
        name: 'Laura C.',
        role: 'Commercial and residential washing',
        location: 'Bristol',
      },
    ],
  },

  freePlan: {
    title: 'Start completely free',
    sub: 'Everything a pressure washing business needs to look professional and stay organised — at no cost.',
    includes: [
      'Job scheduling — one-off and recurring',
      'Route planning by area',
      'Automatic customer reminders before every visit',
      'Instant invoicing with photo attachments',
      'Card and bank payment links',
      'Online quote request form for your website',
    ],
    note: 'No credit card needed. No trial period. Free forever for solo operators.',
  },

  faq: {
    title: 'Pressure washing software — questions answered',
    sub: 'Common questions from pressure washing businesses before they get started.',
    items: [
      {
        q: 'Does it work for both one-off residential jobs and recurring commercial contracts?',
        a: 'Yes. PathPilo handles one-off jobs and recurring contracts equally well. You can set a commercial client to repeat monthly, quarterly, or on any custom schedule, and PathPilo creates the jobs automatically.',
      },
      {
        q: 'Can I attach before-and-after photos to my invoices?',
        a: 'Yes. When completing a job, you can attach photos taken on your phone. They are included with the invoice sent to the customer, which is particularly useful for pressure washing as proof of the transformation.',
      },
      {
        q: 'I work on large commercial sites that take a full day. Does it still make sense?',
        a: 'Yes. You can set the estimated duration for any job, so a full-day commercial site appears correctly in your schedule. Multi-day jobs can be split into sessions. The invoicing and client management works the same regardless of job size.',
      },
      {
        q: 'Can I send quotes from the app?',
        a: 'Yes. You can create and send a professional quote from your phone. When the customer accepts it, the job is added to your schedule automatically. You can also set an automated follow-up if they have not responded after a few days.',
      },
      {
        q: 'What currencies and payment methods does it support?',
        a: 'PathPilo supports any currency. Clients can pay using an online payment link (card or bank transfer) included on every invoice. You can also record cash or cheque payments. Payment processing fees depend on your payment provider.',
      },
      {
        q: 'Can I manage a small team of operators?',
        a: 'Yes. The Company plan lets you add unlimited team members, assign jobs to specific people, and see everyone\'s schedule and location from one view. Each team member has their own app login.',
      },
      {
        q: 'How do I handle cancellations or rescheduling?',
        a: 'You can reschedule any job with a drag-and-drop in the weekly calendar, or cancel a single visit without affecting recurring jobs. PathPilo can automatically notify the customer of any changes.',
      },
      {
        q: 'Is PathPilo worth it if I only do a few jobs a week?',
        a: 'Yes — and the free plan costs nothing, so there is no risk. Even doing 3-4 jobs a week, the time saved on invoicing, reminders, and scheduling typically adds up to 3-4 hours. And the professional impression on clients is immediate.',
      },
    ],
  },

  finalCta: {
    title: 'Ready to run a more organised, more professional pressure washing business?',
    sub: 'Join pressure washing businesses that waste less time on admin and more on the work. Free to start today.',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Bin cleaning
// ─────────────────────────────────────────────────────────────────────────────

const binCleaning: Industry = {
  slug: 'bin-cleaning-software',
  menuLabel: 'Bin cleaning',
  trade: 'bin cleaning',
  menuBlurb: 'Route-based recurring visits, automatic payments, and zero admin.',

  seoTitle: 'Bin Cleaning Software (Free) — Route Planning, Recurring Clients & Invoicing | PathPilo',
  seoDescription:
    'Free bin cleaning software with automatic route planning, recurring client management, and same-day invoicing. Built for mobile bin cleaning businesses. Free to get started.',

  hero: {
    eyebrow: 'Bin cleaning software',
    h1: 'Bin cleaning software built for route-based businesses that run on repeat visits',
    sub: 'PathPilo automatically orders your daily stops by street, manages your recurring clients, and collects payments without you lifting a finger. Focus on the cleaning.',
    trustLine: 'Free to start · No card needed · Built for route-based work',
    image: '/images/industries/window-cleaning-person-app.png',
    imageAlt: 'A field service operator managing their daily route on the PathPilo app',
  },

  trustBar: {
    label: 'Built for bin cleaning businesses — route-based, recurring, and mobile',
    points: ['Free to get started', 'Street-by-street routing', 'Recurring client management', 'Auto payments'],
  },

  pain: {
    title: 'Sound familiar?',
    sub: 'Bin cleaning lives and dies by the efficiency of the route. PathPilo fixes the parts that slow you down.',
    items: [
      'Your route is not optimised and you spend more time driving between streets than you spend cleaning.',
      'Tracking which clients have been done, which are next, and which are overdue is harder than it should be.',
      'Collecting payment from 40 clients a week manually takes almost as long as the work itself.',
      'New customers sign up but getting them onto the right route at the right time is a constant headache.',
      'You are running the whole business from a combination of memory, paper, and WhatsApp.',
      'Scaling up means more vans, more staff, and a disproportionate increase in admin.',
    ],
  },

  outcomes: [
    {
      eyebrow: 'More stops, less driving',
      title: 'Do more streets in less time with automatic route planning',
      body: 'PathPilo clusters your daily stops by street and area so you work through neighbourhoods efficiently rather than jumping across town. Bin cleaning businesses typically add 15 to 20% more stops per day just from better routing.',
      bullets: [
        'Daily stops ordered geographically for the shortest possible route',
        'See the full day\'s route on a map before you start',
        'Add new clients to the nearest route segment automatically',
      ],
      visual: 'route',
      video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
      videoPoster: '/images/features/routeplanning-weekplanner-placeholder.svg',
    },
    {
      eyebrow: 'Let clients know you are coming',
      title: 'Automatic notifications keep clients happy and bins out',
      body: 'A text to each customer the evening before tells them to put their bin out. Fewer missed bins, fewer complaints, and a more professional service without any extra effort on your part.',
      bullets: [
        'Evening-before notification sent automatically to every client',
        'Clients put their bins out without you having to remind them',
        'Reduce the number of missed visits and follow-up calls',
      ],
      visual: 'sms',
      video: '/images/features/routeplanning-automations.mp4',
      videoPoster: '/images/features/routeplanning-map-placeholder.svg',
    },
    {
      eyebrow: 'Get paid automatically',
      title: 'Payments that collect themselves every month',
      body: 'Set up monthly recurring payments for each client and PathPilo handles the invoicing and collection automatically. No more chasing 40 different people for £10 every month. The money just arrives.',
      bullets: [
        'Monthly invoices generated and sent automatically',
        'Payment reminders for anyone who misses a payment',
        'Clear view of paid, unpaid, and overdue accounts',
      ],
      visual: 'invoice',
      image: '/images/features/invoicing.png',
      imageAlt: 'PathPilo invoicing screen showing recurring monthly payments and invoice status',
      imagePlain: true,
    },
    {
      eyebrow: 'Grow without the chaos',
      title: 'Add new clients to the right route in seconds',
      body: 'When a new customer signs up from your website, a flyer, or a referral, their address drops straight into PathPilo and you can slot them onto the nearest route segment in a few taps. No spreadsheet updates, no confusion.',
      bullets: [
        'Online sign-up form captures address and payment details',
        'New clients assigned to the nearest route automatically',
        'Scale to multiple vans without disproportionate admin',
      ],
      visual: 'booking',
      image: '/images/industries/window-cleaning-person-van.png',
      imageAlt: 'A service operator by their van managing new customer sign-ups on PathPilo',
      imagePlain: true,
    },
  ],

  stats: [
    { value: 15, suffix: '%', label: 'More stops per day with optimised routing' },
    { value: 5, suffix: ' hrs', label: 'Admin saved every week' },
    { value: 90, suffix: '%', label: 'Of payments collected on time with auto invoicing' },
    { value: 0, display: '£0', label: 'Free forever plan available' },
  ],

  featureGrid: {
    eyebrow: 'One simple app',
    title: 'Everything a bin cleaning business needs to scale efficiently',
    sub: 'Run a tight operation whether you have one van or five. Everything in one place, everything on your phone.',
    items: [
      { icon: 'route', title: 'Route optimisation', text: 'Daily stops sorted street by street for the most efficient possible route.' },
      { icon: 'calendar', title: 'Recurring schedules', text: 'Weekly, fortnightly, or monthly clients managed automatically.' },
      { icon: 'bell', title: 'Client notifications', text: 'Evening-before text so bins are out and clients know you are coming.' },
      { icon: 'invoice', title: 'Auto invoicing', text: 'Monthly invoices sent automatically — no manual billing needed.' },
      { icon: 'card', title: 'Easy payments', text: 'Clients pay by card or bank transfer from a link on their phone.' },
      { icon: 'users', title: 'Client management', text: 'Every client, every bin, every note in one organised place.' },
      { icon: 'form', title: 'Online sign-up form', text: 'New customers sign up through your website and land straight in the system.' },
      { icon: 'phone', title: 'Run it from the van', text: 'The whole business fits in your pocket — no paperwork required.' },
    ],
  },

  testimonials: {
    title: 'Bin cleaning businesses that run like clockwork',
    sub: 'Real results from bin cleaning operators who switched to PathPilo.',
    items: [
      {
        quote: 'I added 12 more stops a day just by sorting the route properly. I was driving around the same streets in completely the wrong order before.',
        name: 'Gary W.',
        role: 'Bin cleaning round',
        location: 'Derby',
      },
      {
        quote: 'The automatic invoicing has completely changed how the business feels. I used to spend Friday afternoons chasing payments. Now I just check in and everything is already sorted.',
        name: 'Sarah K.',
        role: 'Domestic bin cleaning',
        location: 'Swindon',
      },
      {
        quote: 'Sending the evening reminder has more or less eliminated missed bins. Clients remember to put them out and I have far fewer callback jobs to rebook.',
        name: 'Chris T.',
        role: 'Bin cleaning',
        location: 'Wolverhampton',
      },
      {
        quote: 'I have got two vans now and PathPilo lets me see both routes, both drivers, and what has been done — all from my phone while I am on the other van.',
        name: 'Darren M.',
        role: 'Bin cleaning team',
        location: 'Stoke-on-Trent',
      },
    ],
  },

  freePlan: {
    title: 'Start free — built for route-based businesses',
    sub: 'Everything a solo bin cleaning operator needs to manage their route professionally, at no cost.',
    includes: [
      'Route planning — stops ordered by street and area',
      'Unlimited recurring clients (weekly, fortnightly, monthly)',
      'Automatic evening-before client notifications',
      'Auto invoicing with recurring monthly billing',
      'Online sign-up form for new customers',
      'Full mobile app for the van',
    ],
    note: 'No credit card. No time limit. Free forever for solo operators.',
  },

  faq: {
    title: 'Bin cleaning software — your questions answered',
    sub: 'Common questions from bin cleaning businesses before they get started.',
    items: [
      {
        q: 'Is PathPilo designed for route-based businesses like bin cleaning?',
        a: 'Yes. PathPilo is built specifically for businesses that do recurring visits across a geographic area — exactly like bin cleaning. Route optimisation, recurring schedules, automatic notifications, and monthly billing are all central features, not add-ons.',
      },
      {
        q: 'Can PathPilo handle 40 to 60 stops per day?',
        a: 'Yes. PathPilo handles high-density daily routes efficiently. The route planner displays all stops on a map and orders them by area. You can mark each stop done from the app as you go.',
      },
      {
        q: 'Can I set up monthly direct payments for recurring clients?',
        a: 'Yes. Each client can have a recurring monthly invoice set up. PathPilo sends the invoice automatically on the right date and follows up with payment reminders for anyone who has not paid.',
      },
      {
        q: 'What if a client wants to skip or pause for a month?',
        a: 'Easy. You can skip a single visit or pause a client\'s recurring schedule without affecting others. The billing adjusts accordingly and the client is easy to reactivate when ready.',
      },
      {
        q: 'Can I manage two vans with separate routes?',
        a: 'Yes. The Company plan lets you add multiple team members and assign each one their own route. You can see both drivers and their progress in real time from your phone.',
      },
      {
        q: 'Does the online sign-up form work with my website?',
        a: 'Yes. PathPilo generates an embeddable form that you can add to any website. New customers fill in their address and details, and they appear in your PathPilo account ready to be added to the right route segment.',
      },
      {
        q: 'How does the evening-before notification work?',
        a: 'PathPilo sends an automated text message to each client scheduled for the following day. You can customise the message and timing. It runs automatically — you do not need to do anything once it is set up.',
      },
      {
        q: 'How long does it take to set up?',
        a: 'Most bin cleaning businesses have their client list imported and their first route set up within a couple of hours. The route planning and recurring schedules are straightforward to configure and the app guides you through it.',
      },
    ],
  },

  finalCta: {
    title: 'Ready to run a tighter, more profitable bin cleaning business?',
    sub: 'Join bin cleaning operators who route smarter, collect payments automatically, and scale without the chaos. Free to start today.',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const INDUSTRIES: Industry[] = [
  windowCleaning,
  domesticCleaning,
  lawnCare,
  gutterCleaning,
  pressureWashing,
  binCleaning,
]

const BY_SLUG: Record<string, Industry> = Object.fromEntries(
  INDUSTRIES.map((i) => [i.slug, i]),
)

export function getIndustry(slug: string | undefined | null): Industry | undefined {
  if (!slug) return undefined
  return BY_SLUG[slug]
}

/**
 * Returns the industry data for the given slug, with optional locale overrides
 * merged on top. Falls back to English if no translation exists for the locale.
 */
export function getLocalizedIndustry(slug: string | undefined | null, locale: string): Industry | undefined {
  const base = getIndustry(slug)
  if (!base) return undefined
  if (locale !== 'da') return base

  const da = DA_INDUSTRY_TRANSLATIONS[base.slug]
  if (!da) return base

  return {
    ...base,
    menuLabel: da.menuLabel ?? base.menuLabel,
    trade: da.trade ?? base.trade,
    menuBlurb: da.menuBlurb ?? base.menuBlurb,
    seoTitle: da.seoTitle ?? base.seoTitle,
    seoDescription: da.seoDescription ?? base.seoDescription,
    hero: { ...base.hero, ...da.hero },
    trustBar: da.trustBar ?? base.trustBar,
    pain: da.pain ?? base.pain,
    outcomes: da.outcomes ?? base.outcomes,
    stats: da.stats ?? base.stats,
    featureGrid: da.featureGrid ?? base.featureGrid,
    testimonials: da.testimonials ?? base.testimonials,
    freePlan: da.freePlan ?? base.freePlan,
    faq: da.faq ?? base.faq,
    finalCta: da.finalCta ?? base.finalCta,
    calculator: da.calculator ?? base.calculator,
  }
}

export function getIndustrySlugs(): string[] {
  return INDUSTRIES.map((i) => i.slug)
}
