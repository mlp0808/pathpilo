/**
 * Comparison data.
 *
 * All pricing figures are sourced from each product's public pricing page and
 * verified as of the date shown in each ComparisonPage.lastUpdated field.
 * Pricing changes frequently. Treat figures as indicative, not contractual.
 */
import type { ComparisonPage, ComparisonSection } from './types'

// ---------------------------------------------------------------------------
// Shared competitor definitions
// ---------------------------------------------------------------------------

export const JOBBER = {
  id: 'jobber',
  name: 'Jobber',
  tagline: 'Multi-trade platform for growing service businesses',
  startingPrice: 'from $25/month',
  hasFreePlan: false,
  pricingUrl: 'https://getjobber.com/pricing',
}

export const SQUEEGEE = {
  id: 'squeegee',
  name: 'Squeegee',
  tagline: 'Window-cleaning-specific app, UK-focused',
  startingPrice: 'from £19/user/month',
  hasFreePlan: false,
  pricingUrl: 'https://squeeg.ee/pricing',
}

export const HOUSECALL_PRO = {
  id: 'housecallpro',
  name: 'Housecall Pro',
  tagline: 'HVAC and plumbing focused, US market',
  startingPrice: 'from $59/month',
  hasFreePlan: false,
  pricingUrl: 'https://housecallpro.com/pricing',
}

export const SERVICEM8 = {
  id: 'servicem8',
  name: 'ServiceM8',
  tagline: 'Job-volume pricing, iOS-first field service app',
  startingPrice: 'Free (30 jobs/month) or $29/month',
  hasFreePlan: true,
  pricingUrl: 'https://servicem8.com/pricing',
}

// ---------------------------------------------------------------------------
// Landing-page comparison section (used inside IndustryLanding)
// ---------------------------------------------------------------------------

export const WINDOW_CLEANING_COMPARISON: ComparisonSection = {
  title: 'How PathPilo compares',
  sub: 'The main alternatives for window cleaners with route planning, compared on the things that matter for a small team or solo operator.',
  disclaimer:
    'Prices shown at annual billing rate where available (cheapest option). Figures sourced from each product\'s public pricing page, June 2026. Pricing changes, so verify with each provider before purchasing.',
  competitors: [
    { ...JOBBER, startingPrice: 'from $25/month' },
    { ...SQUEEGEE, startingPrice: 'from £19/user/month' },
    { ...HOUSECALL_PRO, startingPrice: 'from $59/month' },
  ],
  rows: [
    {
      feature: 'Free plan (not just a trial)',
      pathpilo: true,
      jobber: false,
      squeegee: false,
      housecallpro: false,
    },
    {
      feature: 'Route planning included from day one',
      pathpilo: true,
      jobber: 'Connect plan ($83/month)',
      squeegee: true,
      housecallpro: 'Essentials plan ($149/month)',
    },
    {
      feature: 'Automated customer reminders',
      pathpilo: true,
      jobber: 'Connect plan ($83/month)',
      squeegee: true,
      housecallpro: 'Essentials plan ($149/month)',
    },
    {
      feature: 'Online booking form',
      pathpilo: true,
      jobber: true,
      squeegee: true,
      housecallpro: true,
    },
    {
      feature: 'Invoicing and payment links',
      pathpilo: true,
      jobber: true,
      squeegee: true,
      housecallpro: true,
    },
    {
      feature: 'Unlimited clients',
      pathpilo: true,
      jobber: true,
      squeegee: true,
      housecallpro: true,
    },
    {
      feature: 'Unlimited recurring jobs / subscriptions',
      pathpilo: true,
      jobber: true,
      squeegee: true,
      housecallpro: 'Add-on on lower plans',
    },
    {
      feature: 'Team of 5 employees, monthly cost',
      pathpilo: 'from £25/month (unlimited team)',
      jobber: '$124/month (5-user cap)',
      squeegee: '£95/month (5 x £19)',
      housecallpro: '$149/month (5-user cap)',
    },
    {
      feature: 'Mobile-first design',
      pathpilo: true,
      jobber: true,
      squeegee: true,
      housecallpro: true,
    },
    {
      feature: 'Setup without a sales call',
      pathpilo: true,
      jobber: true,
      squeegee: true,
      housecallpro: true,
    },
  ],
}

// ---------------------------------------------------------------------------
// PathPilo vs Jobber (window cleaning)
// ---------------------------------------------------------------------------

export const PATHPILO_VS_JOBBER_WINDOW_CLEANING: ComparisonPage = {
  slug: 'pathpilo-vs-jobber-window-cleaning',
  seoTitle: 'PathPilo vs Jobber for Window Cleaners (2026): Honest Comparison',
  seoDescription:
    'PathPilo vs Jobber for window cleaning businesses in 2026. Side-by-side pricing, route planning, reminders, and invoicing. Find out which is better for a solo operator or small team.',
  headline: 'PathPilo vs Jobber for window cleaners',
  sub: 'Jobber is one of the most widely used field service tools. PathPilo is built for smaller, mobile-first teams. Here is an honest look at how they compare for a window cleaning business.',
  lastUpdated: '2026-06-18',
  verdict:
    'Jobber is a mature, feature-rich platform best suited for multi-trade businesses or larger operations that need advanced reporting and integrations. For a solo window cleaner or a small team, PathPilo offers the same core workflow at no cost and without the complexity that comes with a platform built for bigger operations.',

  competitors: [JOBBER],

  sections: [
    {
      id: 'what-each-is-built-for',
      title: 'What each platform is built for',
      body: "Jobber started in 2011 and has grown into a comprehensive field service platform serving dozens of trades. It has a deep feature set covering everything from quote follow-ups to job costing to a marketing suite. That breadth is its strength and its trade-off: it is a genuinely powerful tool, but it is built around the needs of a business with 3 to 15 technicians across multiple trade types, not a solo window cleaner managing 30 recurring customers.\n\nPathPilo is built for mobile service teams that run their business from a phone. The focus is on the three things window cleaners need every week: stops ordered by area, customers who know you are coming, and getting paid without chasing. It is simpler by design.",
    },
    {
      id: 'pricing',
      title: 'Pricing: what you actually pay',
      body: "Jobber's published pricing starts at $39/month for the Core plan ($25/month billed annually). That sounds reasonable until you look at what Core includes for a window cleaner: scheduling, invoicing, a basic CRM, and online booking. What it does not include is automated appointment reminders or route optimization. Both of those are locked behind the Connect plan at $83/month annually.\n\nFor a solo window cleaner who wants to text customers the day before and have the system order stops efficiently, Jobber Connect is realistically the minimum useful tier, at more than three times the cost of PathPilo's team plan.\n\nPathPilo's free plan includes route planning, automated reminders, invoicing with payment links, and an online booking form. No minimum spend. No trial expiry.",
    },
    {
      id: 'route-planning',
      title: 'Route planning and scheduling',
      body: "Jobber's route optimization is available on Connect and above. It orders stops by geography and integrates with the week planner. For larger operations with multiple technicians, its map view and drag-and-drop balancing tools are genuinely useful.\n\nFor a window cleaning business, the core requirement is simpler: the day's jobs ordered by area so you drive less. PathPilo handles this automatically, with recurring job management that keeps regular customers coming up in the right order week after week. Both platforms serve this use case. The difference is that Jobber requires you to pay for Connect to get it.",
    },
    {
      id: 'reminders',
      title: 'Customer reminders and communication',
      body: "Automated appointment reminders are one of the most valuable features for window cleaners. Fewer locked gates, fewer wasted trips, happier customers. In Jobber, automated reminders are a Connect-tier feature at $119/month or $83/month annually. On Core you can send reminders manually but there is no automation.\n\nPathPilo includes automated reminders in the free plan: a text to the customer the day before, and an optional on-my-way message when you set off. Both are sent automatically with no manual steps.",
    },
    {
      id: 'team-pricing',
      title: 'Team pricing: the cost that scales fastest',
      body: "This is where the comparison changes significantly. Jobber's pricing scales with users. Core is $39/month for one user ($25/month annually). Add a second person and you pay an extra $29/month. A 5-person team on Jobber Connect costs $124/month annually. A 10-person team on Grow costs $249/month annually.\n\nPathPilo's Company plan is billed at £299 per year, roughly £25/month, and covers an unlimited number of team members. Whether you have 2 cleaners or 20, the monthly cost stays the same.\n\nFor a 5-person window cleaning team: Jobber is $124/month annually. PathPilo is £25/month annually. For a 10-person team: Jobber is $249/month. PathPilo is still £25/month. The gap widens every time you hire.",
    },
    {
      id: 'recurring',
      title: 'Recurring jobs and unlimited subscriptions',
      body: "Window cleaners typically work on repeat visits with the same customers week after week. The software needs to handle these as standing recurring jobs rather than manually recreating each one.\n\nBoth PathPilo and Jobber support unlimited recurring jobs on all plans. In PathPilo, recurring jobs are set up per client and automatically create the next visit when the previous one is completed. Unlimited clients and unlimited subscriptions are included from day one on the free plan.",
    },
    {
      id: 'complexity',
      title: 'Setup and day-to-day simplicity',
      body: "Jobber is a powerful platform and that power has a cost in complexity. Reviewers consistently note that getting the most out of Jobber requires learning a substantial number of features, settings, and workflows. For a growing operation with office staff, a dedicated dispatcher, or multiple trade types, that investment pays off.\n\nFor a solo window cleaner or a 2-3 van operation, most of Jobber's depth is unused overhead. PathPilo's interface is designed to be used from the van, on the day, by someone whose primary skill is cleaning windows rather than operating software.",
    },
  ],

  pricingBreakdown: {
    title: 'Pricing side by side, annual billing, June 2026',
    rows: [
      { label: 'Solo operator with routing, reminders, and invoicing', pathpilo: 'Free forever', jobber: '$83/month (Connect, annual)' },
      { label: '2-person team', pathpilo: 'from £25/month (Company plan)', jobber: '$124/month (Connect Teams, annual, up to 5 users)' },
      { label: '5-person team', pathpilo: 'from £25/month (unlimited team)', jobber: '$124/month (Connect Teams, annual, up to 5 users)' },
      { label: '10-person team', pathpilo: 'from £25/month (same flat price)', jobber: '$249/month (Grow Teams, annual, up to 10 users)' },
      { label: 'Automated customer reminders', pathpilo: 'Included free', jobber: 'Requires Connect ($83/month annually)' },
      { label: 'Route optimization', pathpilo: 'Included free', jobber: 'Requires Connect ($83/month annually)' },
      { label: 'Unlimited clients', pathpilo: 'Included free', jobber: 'Included on all plans' },
      { label: 'Unlimited recurring jobs', pathpilo: 'Included free', jobber: 'Included on all plans' },
      { label: 'Free plan or trial', pathpilo: 'Free plan (no expiry)', jobber: '14-day trial, then paid' },
    ],
    note: 'Jobber pricing sourced from getjobber.com/pricing, June 2026. PathPilo Company plan at £299/year (£25/month). Pricing changes, so verify before purchasing.',
  },

  prosCons: {
    pathpilo: {
      pros: [
        'Free plan with route planning and reminders included',
        'Flat team pricing: unlimited employees from £25/month',
        'Designed for mobile-first, phone-based operation',
        'Simple enough to use from the van without a learning curve',
        'No contract, no credit card to start',
      ],
      cons: [
        'Newer platform with fewer third-party integrations than Jobber',
        'Less suited to multi-trade operations needing advanced reporting',
        'No job costing or QuickBooks sync yet',
      ],
    },
    jobber: {
      pros: [
        'Very mature platform with a deep feature set',
        'Strong quote and estimate workflow',
        'Job costing, two-way SMS, and advanced reporting on higher tiers',
        'Works across multiple trades',
        'Large user community and extensive documentation',
      ],
      cons: [
        'Route optimization requires Connect tier ($83/month annually)',
        'Automated reminders also locked to Connect ($83/month annually)',
        'Significant complexity for a solo window cleaner',
        'No free plan, only a 14-day trial',
        'Cost grows quickly with team size at $29/user per month over the cap',
      ],
    },
  },

  whoShouldChoose: {
    pathpilo:
      'A solo window cleaner or small team (1 to 5 people) who wants their day planned by area automatically, customers reminded before each visit, and invoices sent the moment a job is done, without paying a monthly fee or spending a week learning new software.',
    jobber:
      'A multi-trade service business, or a window cleaning company that has grown past 10 or more employees, needs QuickBooks integration, job costing, or advanced reporting, and has the budget to pay for Connect or Grow.',
  },

  faq: [
    {
      q: 'Does Jobber have a free plan for window cleaners?',
      a: 'No. Jobber does not offer a free plan. They offer a 14-day free trial on any paid plan. Plans start at $39/month for Core, though most window cleaners will find they need Connect ($119/month or $83/month annually) to get route optimization and automated reminders.',
    },
    {
      q: "Does Jobber's cheapest plan include route planning?",
      a: 'No. Jobber Core ($39/month or $25/month annually) includes scheduling, invoicing, a basic CRM, and online booking, but route optimization is a Connect-tier feature. Source: getjobber.com/pricing, June 2026.',
    },
    {
      q: 'Does Jobber include automated appointment reminders on the Core plan?',
      a: 'No. Automated appointment reminders require the Connect plan at $83/month annually. On Core you can send reminders manually, but automation requires upgrading. Source: getjobber.com/pricing, June 2026.',
    },
    {
      q: 'Is PathPilo good enough for a window cleaning business or is Jobber better?',
      a: 'For most solo window cleaners and small teams of 1 to 5 people, PathPilo covers every core need at no cost: route planning, customer reminders, invoicing with payment links, and an online booking form. Jobber\'s advantage is its depth for larger, multi-trade operations.',
    },
    {
      q: 'What about Squeegee? Is that a better option than both?',
      a: 'Squeegee is a solid window-cleaning-specific app, particularly popular in the UK. It starts at £19/user/month and is designed specifically for managing recurring window cleaning jobs. It does not offer a free plan (30-day trial only) and the per-user pricing adds up quickly for larger teams.',
    },
    {
      q: 'Can I switch from Jobber to PathPilo?',
      a: 'Yes. Your customer list and job history can be exported from Jobber and imported into PathPilo. Most window cleaners are up and running within an afternoon.',
    },
  ],
}

// ---------------------------------------------------------------------------
// PathPilo vs Squeegee (window cleaning)
// ---------------------------------------------------------------------------

export const PATHPILO_VS_SQUEEGEE_WINDOW_CLEANING: ComparisonPage = {
  slug: 'pathpilo-vs-squeegee-window-cleaning',
  seoTitle: 'PathPilo vs Squeegee for Window Cleaners (2026): Honest Comparison',
  seoDescription:
    'PathPilo vs Squeegee for window cleaning businesses in 2026. Compare pricing, free plan availability, route planning, and team costs. Which is better for UK window cleaners?',
  headline: 'PathPilo vs Squeegee for window cleaners',
  sub: 'Squeegee is a well-known app built specifically for window cleaning. PathPilo is a free alternative that covers the same core needs. Here is how they compare.',
  lastUpdated: '2026-06-18',
  verdict:
    'Squeegee is a solid, purpose-built app for window cleaning, particularly popular in the UK and Ireland. It has strong round management and native UK payment integrations. PathPilo\'s advantage is straightforward: a genuinely free plan with no expiry, and flat team pricing that becomes significantly cheaper than Squeegee as soon as you have two or more people.',

  competitors: [SQUEEGEE],

  sections: [
    {
      id: 'what-each-is-built-for',
      title: 'What each platform is built for',
      body: "Squeegee was built from the ground up for window cleaning businesses, particularly in the UK, Ireland, and Commonwealth markets. It has native support for recurring route management, GoCardless Direct Debit, HMRC-compliant VAT submissions, and the specific workflow of a mobile cleaning business. For UK window cleaners, it feels purpose-made because it essentially is.\n\nPathPilo is built for mobile service teams more broadly, covering window cleaning, domestic cleaning, lawn care, bin cleaning, and other recurring field service trades. The core features, route planning, reminders, invoicing, and recurring job management, are the same. The difference is that PathPilo starts free.",
    },
    {
      id: 'pricing',
      title: 'Pricing: what you actually pay',
      body: "Squeegee charges per user per month. The Core tier is £19/user/month, Advanced is £25/user/month, and Ultimate is £33/user/month. There is no free plan, only a 30-day trial. For a solo window cleaner that is £19/month. For a 3-person team on Core it is £57/month. For a 5-person team it is £95/month.\n\nPathPilo's free plan has no expiry and covers a solo operator fully. The Company plan is £299/year (roughly £25/month) and covers an unlimited number of team members. A 5-person team on PathPilo costs the same as a 1-person team on Squeegee Advanced.",
    },
    {
      id: 'route-planning',
      title: 'Route planning and job management',
      body: "Both platforms handle recurring job scheduling and route management well. Squeegee has a mobile-first route interface that lets you drag and reorder stops, mark jobs done, and navigate to the next address. It is designed specifically for the window cleaning workflow.\n\nPathPilo approaches route management similarly: recurring clients come up in the right order, stops can be reordered, and the map view shows the day's jobs by area. Both tools cover the core use case effectively. Squeegee has a slight edge in window-cleaning-specific UI details built up over years of serving that specific market.",
    },
    {
      id: 'reminders',
      title: 'Customer reminders',
      body: "Both platforms support automatic customer reminders before scheduled visits. Squeegee can send reminders via SMS and email, and the feature is available on all paid plans. PathPilo includes reminders on the free plan, with automatic day-before texts and optional on-my-way messages.\n\nFor a solo window cleaner, both work well. The difference is cost: Squeegee charges £19/month from day one, while PathPilo's reminders are included with no charge.",
    },
    {
      id: 'uk-features',
      title: 'UK-specific features',
      body: "Squeegee has a genuine advantage for UK window cleaners who use GoCardless Direct Debit for collecting monthly payments. The integration is native, meaning customers can authorise a Direct Debit mandate through Squeegee and payments are collected automatically each month without manual invoicing.\n\nPathPilo uses payment links on invoices, which require the customer to pay manually each time. For businesses with monthly Direct Debit customers, Squeegee's integration is a meaningful operational advantage that saves chasing payments entirely. If most of your customers pay by cash, card, or bank transfer, this difference matters less.",
    },
    {
      id: 'team-pricing',
      title: 'Team size and pricing',
      body: "This is where the two platforms diverge most clearly. Squeegee's per-user model means costs scale with every person you add. A 2-person team on Squeegee Core is £38/month. A 5-person team is £95/month. A 10-person team is £190/month.\n\nPathPilo's Company plan is £299/year (£25/month) regardless of team size. A 2-person team costs the same as a 10-person team. For any window cleaning business with more than one person, PathPilo becomes significantly cheaper than Squeegee within the first month.",
    },
    {
      id: 'complexity',
      title: 'Ease of setup',
      body: "Squeegee is well-regarded for being straightforward to set up for someone already familiar with how window cleaning work is managed. The UI is purpose-built for the trade and most users get their customer list and schedule running within a few hours.\n\nPathPilo is similarly quick to set up and is designed to be usable by anyone comfortable with a smartphone, no prior software experience required. Because it is simpler and more general, there are fewer window-cleaning-specific UI touches, but the core workflow, add customers, set recurring schedules, do the work, send invoice, is equally fast.",
    },
  ],

  pricingBreakdown: {
    title: 'Pricing side by side, June 2026',
    rows: [
      { label: 'Solo operator', pathpilo: 'Free forever', squeegee: '£19/month (Core)' },
      { label: '2-person team', pathpilo: 'from £25/month (Company plan)', squeegee: '£38/month (2 x £19, Core)' },
      { label: '3-person team', pathpilo: 'from £25/month (unlimited team)', squeegee: '£57/month (3 x £19, Core)' },
      { label: '5-person team', pathpilo: 'from £25/month (unlimited team)', squeegee: '£95/month (5 x £19, Core)' },
      { label: '10-person team', pathpilo: 'from £25/month (same flat price)', squeegee: '£190/month (10 x £19, Core)' },
      { label: 'Route planning', pathpilo: 'Included free', squeegee: 'Included on all plans' },
      { label: 'Customer reminders', pathpilo: 'Included free', squeegee: 'Included on all plans' },
      { label: 'Free plan', pathpilo: 'Yes, no expiry', squeegee: 'No, 30-day trial only' },
      { label: 'GoCardless Direct Debit', pathpilo: 'Not natively integrated', squeegee: 'Native integration' },
    ],
    note: 'Squeegee pricing sourced from squeeg.ee/pricing, June 2026. PathPilo Company plan at £299/year (£25/month). Pricing changes, so verify before purchasing.',
  },

  prosCons: {
    pathpilo: {
      pros: [
        'Free plan with no expiry covers a solo operator fully',
        'Flat team pricing: unlimited employees from £25/month',
        'Works on any device, Android and iOS',
        'No contract, no credit card to start',
        'Covers multiple service types beyond window cleaning',
      ],
      cons: [
        'No native GoCardless Direct Debit integration',
        'Fewer window-cleaning-specific UI touches than Squeegee',
        'Newer platform with a smaller user community',
      ],
    },
    squeegee: {
      pros: [
        'Built specifically for window cleaning workflows',
        'Native GoCardless Direct Debit integration for UK operators',
        'HMRC-compliant VAT submission built in',
        'Strong UK user community and support',
        '30-day free trial',
      ],
      cons: [
        'No free plan beyond the trial period',
        'Per-user pricing adds up quickly for teams of 3 or more',
        'A 5-person team costs £95/month vs £25/month for PathPilo',
        'Primarily designed for the UK market',
      ],
    },
  },

  whoShouldChoose: {
    pathpilo:
      'A solo window cleaner or growing team (especially 2 or more people) who wants free software with route planning, reminders, and invoicing, without paying per person. Also the better choice if you run multiple services alongside window cleaning.',
    squeegee:
      'A UK window cleaner who collects monthly payments via GoCardless Direct Debit and wants window-cleaning-specific software built around that exact workflow. Particularly worthwhile as a solo operator where the per-user cost is manageable.',
  },

  faq: [
    {
      q: 'Is Squeegee free for window cleaners?',
      a: 'No. Squeegee does not offer a free plan. There is a 30-day free trial, after which the Core plan is £19/user/month. PathPilo offers a free plan with no expiry for solo operators.',
    },
    {
      q: 'Does Squeegee work outside the UK?',
      a: 'Yes, Squeegee works in multiple countries, though it is primarily designed for the UK, Irish, and Commonwealth markets. Features like GoCardless Direct Debit and HMRC VAT returns are UK-specific. For non-UK window cleaners, some of these advantages do not apply.',
    },
    {
      q: 'Does PathPilo support GoCardless?',
      a: 'Not natively at this time. PathPilo collects payment via online payment links on invoices, which customers use to pay by card or bank transfer. If monthly Direct Debit collection is central to your business model, Squeegee has a genuine advantage here.',
    },
    {
      q: 'How does team pricing compare for a 3-person window cleaning team?',
      a: 'On Squeegee Core, a 3-person team costs £57/month. PathPilo\'s Company plan is £25/month regardless of how many team members you have. The saving grows with every person you add.',
    },
    {
      q: 'Can I switch from Squeegee to PathPilo?',
      a: 'Yes. You can export your customer list from Squeegee and import it into PathPilo. Your recurring schedules will need to be recreated, but most window cleaners get set up within an afternoon.',
    },
    {
      q: 'Is Squeegee better than PathPilo for a solo window cleaner?',
      a: 'For a solo operator, the main consideration is cost. Squeegee is £19/month after the trial. PathPilo is free. Both cover route planning, recurring jobs, reminders, and invoicing. If you use GoCardless for monthly payments, Squeegee\'s native integration is a real advantage. Otherwise, the free plan on PathPilo covers the same core needs.',
    },
  ],
}

// ---------------------------------------------------------------------------
// PathPilo vs Housecall Pro
// ---------------------------------------------------------------------------

export const PATHPILO_VS_HOUSECALL_PRO: ComparisonPage = {
  slug: 'pathpilo-vs-housecall-pro-window-cleaning',
  seoTitle: 'PathPilo vs Housecall Pro for Window Cleaners (2026): Comparison',
  seoDescription:
    'PathPilo vs Housecall Pro for window cleaning businesses. Compare pricing, route planning, team costs, and ease of use. Find out which is better for a small service team.',
  headline: 'PathPilo vs Housecall Pro for window cleaners',
  sub: 'Housecall Pro is a popular choice for home service businesses. PathPilo is a free, simpler alternative designed for smaller mobile teams. Here is how they compare for window cleaning.',
  lastUpdated: '2026-06-18',
  verdict:
    'Housecall Pro is a capable platform built primarily for HVAC, plumbing, and electrical businesses. It has a lot of depth but comes with pricing and complexity that most window cleaning businesses will find disproportionate to what they need. PathPilo covers the core workflow, route planning, reminders, invoicing, recurring jobs, at no cost and is significantly easier to get started with.',

  competitors: [HOUSECALL_PRO],

  sections: [
    {
      id: 'what-each-is-built-for',
      title: 'What each platform is built for',
      body: "Housecall Pro was built for the home services market with a particular focus on HVAC, plumbing, electrical, and similar trades. It has features built around the needs of those businesses: flat-rate price books, equipment tracking for HVAC systems, a CSR (customer service representative) AI for answering calls, and advanced marketing tools. It is a mature, full-featured platform.\n\nWindow cleaning businesses can use Housecall Pro, but they are paying for a lot of features they will not use. The platform is built for businesses that have an office, a dispatcher, and multiple trade types. A solo window cleaner or a small 2-3 van operation will find most of it unnecessary.\n\nPathPilo is built for the type of work window cleaning actually is: recurring visits to the same customers, ordered by area, with automatic reminders and same-day invoicing.",
    },
    {
      id: 'pricing',
      title: 'Pricing: what the numbers actually look like',
      body: "Housecall Pro's Basic plan starts at $59/month (billed annually). That sounds competitive until you look at what is included: scheduling, invoicing, payments, and review management. What Basic does not include is GPS tracking or QuickBooks integration. Both of those are locked behind the Essentials plan at $149/month annually.\n\nFor a window cleaner who wants to track their team on a map and sync with their accounting software, the realistic entry point is $149/month. That is before any add-ons.\n\nPathPilo's free plan includes route planning, reminders, invoicing, and an online booking form. The Company plan covering an unlimited number of team members is £25/month (£299/year). There are no add-ons for core functionality.",
    },
    {
      id: 'route-planning',
      title: 'Route planning for window cleaning',
      body: "Housecall Pro includes GPS tracking on the Essentials plan and above, which lets you see where your team is in real time. Scheduling is map-based and you can drag and drop jobs between team members. For a larger operation with a dispatcher and multiple vehicles, this is a useful view.\n\nFor a window cleaning business, route planning is typically about ordering stops geographically at the start of the day, not live GPS dispatch. PathPilo automatically orders daily jobs by area and supports recurring schedules where the same customers come up in the right sequence week after week. It is a simpler implementation of routing, appropriate for the simpler use case.",
    },
    {
      id: 'reminders',
      title: 'Customer reminders',
      body: "Housecall Pro supports automated appointment reminders on the Essentials plan and above ($149/month annually). On Basic ($59/month), reminders are manual.\n\nPathPilo includes automated reminders on the free plan. Customers receive a text the day before each visit and an optional on-my-way message. This is arguably the single highest-value feature for window cleaners, and PathPilo includes it at no charge.",
    },
    {
      id: 'complexity',
      title: 'Complexity and setup time',
      body: "Housecall Pro is a feature-rich platform with a corresponding setup time. Reviewers consistently note that getting full value from it requires significant time investment in configuring price books, automations, integrations, and workflows. For a larger operation with office staff, this investment pays off over time.\n\nFor a solo window cleaner or small team, the setup cost is rarely justified. PathPilo is designed to be running within an afternoon. Add customers, set their recurring schedules, and start working. There is no price book to configure, no flat-rate logic to set up, and no dispatch interface to learn.",
    },
    {
      id: 'team-pricing',
      title: 'Team pricing',
      body: "Housecall Pro's Essentials plan covers up to 5 users at $149/month annually. Additional users beyond the plan's cap cost $35/month each. A 10-person team on Essentials would be $149 plus $175 (5 extra users at $35 each), totalling $324/month.\n\nPathPilo's Company plan covers unlimited team members at £25/month annually (£299/year). The cost does not change as you hire more people.",
    },
  ],

  pricingBreakdown: {
    title: 'Pricing side by side, annual billing, June 2026',
    rows: [
      { label: 'Solo operator with routing, reminders, and invoicing', pathpilo: 'Free forever', housecallpro: '$149/month (Essentials, routing and reminders require this tier)' },
      { label: '2-person team', pathpilo: 'from £25/month (Company plan)', housecallpro: '$149/month (Essentials, up to 5 users)' },
      { label: '5-person team', pathpilo: 'from £25/month (unlimited)', housecallpro: '$149/month (Essentials, up to 5 users)' },
      { label: '10-person team', pathpilo: 'from £25/month (same flat price)', housecallpro: '$324/month ($149 + 5 users at $35 each)' },
      { label: 'Route planning / GPS tracking', pathpilo: 'Included free', housecallpro: 'Requires Essentials ($149/month)' },
      { label: 'Automated customer reminders', pathpilo: 'Included free', housecallpro: 'Requires Essentials ($149/month)' },
      { label: 'Free plan', pathpilo: 'Yes, no expiry', housecallpro: 'No, 14-day trial only' },
      { label: 'QuickBooks integration', pathpilo: 'Not currently available', housecallpro: 'Included on Essentials and above' },
    ],
    note: 'Housecall Pro pricing sourced from housecallpro.com/pricing, June 2026. PathPilo Company plan at £299/year (£25/month). Pricing changes, so verify before purchasing.',
  },

  prosCons: {
    pathpilo: {
      pros: [
        'Free plan with routing, reminders, and invoicing included',
        'Flat team pricing from £25/month regardless of team size',
        'Designed for mobile-first service teams',
        'Much simpler to set up and use day to day',
        'No contract, no card to start',
      ],
      cons: [
        'No QuickBooks or Xero accounting integration yet',
        'Less suited to businesses needing advanced dispatch or price books',
        'Newer platform with fewer integrations overall',
      ],
    },
    housecallpro: {
      pros: [
        'Mature platform with a very deep feature set',
        'QuickBooks two-way sync on Essentials and above',
        'AI call answering and marketing tools included on higher plans',
        'Good for larger operations needing a dispatcher view',
        'Strong reporting and analytics',
      ],
      cons: [
        'Route planning and reminders require Essentials at $149/month annually',
        'Basic plan ($59/month) lacks GPS and QuickBooks',
        'Built primarily for HVAC, plumbing, and electrical, not window cleaning',
        'Significant complexity for small teams',
        'No free plan, only a 14-day trial',
      ],
    },
  },

  whoShouldChoose: {
    pathpilo:
      'A solo window cleaner or small team that wants route planning, customer reminders, recurring jobs, and invoicing without paying $149/month or spending weeks setting up software designed for a different trade.',
    housecallpro:
      'A multi-trade home service company that needs QuickBooks sync, flat-rate price books, AI call answering, and a full dispatcher view, and has the team size and budget to justify the Essentials or MAX plan.',
  },

  faq: [
    {
      q: 'Is Housecall Pro good for window cleaning businesses?',
      a: 'It can work, but it is primarily designed for HVAC, plumbing, and electrical businesses. Window cleaners will pay for many features they do not need and will not have access to routing or reminders unless they are on the $149/month Essentials plan or above.',
    },
    {
      q: "Does Housecall Pro's Basic plan include route planning?",
      a: 'No. GPS tracking and route planning require the Essentials plan at $149/month annually. The Basic plan ($59/month) covers scheduling, invoicing, payments, and review management, but not routing. Source: housecallpro.com/pricing, June 2026.',
    },
    {
      q: 'Does Housecall Pro include automated customer reminders on the Basic plan?',
      a: 'No. Automated reminders require the Essentials plan at $149/month annually. Basic allows manual reminders only.',
    },
    {
      q: 'How does team pricing compare for a 5-person window cleaning team?',
      a: 'Housecall Pro Essentials covers up to 5 users at $149/month annually. PathPilo Company plan is £25/month for an unlimited number of team members. Even at current exchange rates, PathPilo is significantly cheaper for teams of any size.',
    },
    {
      q: 'Can I use Housecall Pro in the UK?',
      a: 'Housecall Pro operates primarily in the US and Canada. While it can be used internationally, pricing is in USD, payment integrations are US-focused, and support is primarily designed for the North American market.',
    },
    {
      q: 'Can I switch from Housecall Pro to PathPilo?',
      a: 'Yes. You can export your customer list from Housecall Pro and import it into PathPilo. Most window cleaners are up and running within an afternoon.',
    },
  ],
}

// ---------------------------------------------------------------------------
// PathPilo vs ServiceM8
// ---------------------------------------------------------------------------

export const PATHPILO_VS_SERVICEM8: ComparisonPage = {
  slug: 'pathpilo-vs-servicem8-window-cleaning',
  seoTitle: 'PathPilo vs ServiceM8 for Window Cleaners (2026): Comparison',
  seoDescription:
    'PathPilo vs ServiceM8 for window cleaning and field service businesses. Compare free plans, job volume limits, team pricing, and ease of use. Which is better for a small team?',
  headline: 'PathPilo vs ServiceM8 for window cleaners',
  sub: 'ServiceM8 is an iOS-first field service app with job-volume-based pricing. PathPilo is free for solo operators and charges a flat team rate. Here is how they compare for window cleaning.',
  lastUpdated: '2026-06-18',
  verdict:
    'ServiceM8 and PathPilo both have free-tier offerings and avoid per-user pricing on paid plans. ServiceM8 is a strong, well-built tool, particularly for iOS users who do trade work. Its main limitations for window cleaning businesses are the 30-job monthly cap on the free plan and the iOS-first requirement. PathPilo is free with no job limit and works on any device.',

  competitors: [SERVICEM8],

  sections: [
    {
      id: 'what-each-is-built-for',
      title: 'What each platform is built for',
      body: "ServiceM8 is an iOS-first field service platform originally built for the Australian and UK markets, covering trades like plumbing, electrical, HVAC, and cleaning. It has a clean, polished interface and a pricing model based on how many jobs you create per month rather than how many users you have.\n\nPathPilo is built for mobile service teams doing recurring route-based work: window cleaning, domestic cleaning, lawn care, bin cleaning, and similar trades. The focus is on recurring job management, area-based routing, automated reminders, and same-day invoicing.",
    },
    {
      id: 'free-plan',
      title: 'Free plans: what they actually cover',
      body: "Both platforms have a free tier, but they work very differently.\n\nServiceM8's free plan covers one user and 30 jobs per month. For a solo window cleaner doing 10 jobs a day, 5 days a week, that is 200 jobs per month, which is more than six times the free plan limit. In practice, the ServiceM8 free plan is useful for testing the software but not viable for daily commercial use.\n\nPathPilo's free plan has no job volume limit. A solo window cleaner can manage as many recurring customers as they need, run automatic reminders, and send invoices every day, all on the free plan indefinitely.",
    },
    {
      id: 'pricing',
      title: 'Pricing: how the tiers work',
      body: "ServiceM8 charges by monthly job volume. The Starter plan is $29/month for 50 jobs per month with unlimited users. Growing is $79/month for 150 jobs per month. Premium is $149/month for 500 jobs per month.\n\nFor a window cleaning business doing 8 jobs a day, 5 days a week, that is 160 jobs per month, which requires the $79/month Growing plan. A bin cleaning business doing 40 stops a day would need 800 credits per month, requiring the $149/month Premium plan.\n\nPathPilo's free plan has no job limit for solo operators. The Company plan at £25/month covers unlimited team members and unlimited jobs.",
    },
    {
      id: 'ios-requirement',
      title: 'iOS requirement',
      body: "ServiceM8 is iOS-first. The full app experience is designed for iPhone and iPad. There is a basic Android companion app available, but it has significantly fewer features than the iOS version and is not the recommended way to use the platform. Job cards, forms, photos, and the main scheduling interface are built around iOS.\n\nThis is a meaningful limitation for window cleaning businesses where staff use Android phones, which are common in the UK and Europe. PathPilo works on any device, iOS or Android, with no feature difference between platforms.",
    },
    {
      id: 'route-planning',
      title: 'Route planning and recurring jobs',
      body: "ServiceM8 supports scheduling and job management but its route planning is more basic than platforms built specifically around recurring geographic routes. It works well for businesses that schedule jobs reactively (a plumber taking a call and adding a job) but is less optimised for the structured daily routing of a window cleaning or bin cleaning business.\n\nPathPilo is built specifically around recurring route-based work. Customers are set up on recurring schedules, the daily job list is ordered by area, and the workflow is designed around working through a predictable list of regular customers rather than ad-hoc job dispatch.",
    },
    {
      id: 'team-pricing',
      title: 'Team pricing',
      body: "ServiceM8 includes unlimited users on all paid plans, which is a genuine advantage over per-user platforms like Squeegee or Jobber. A 5-person window cleaning team on ServiceM8 Growing would pay $79/month for 150 jobs. If they do more than 150 jobs in a month, additional jobs are billed at $0.20 each.\n\nPathPilo's Company plan is £25/month (£299/year) for an unlimited team with no job volume caps. At typical window cleaning volumes, PathPilo is cheaper and more predictable.",
    },
  ],

  pricingBreakdown: {
    title: 'Pricing side by side, June 2026',
    rows: [
      { label: 'Solo operator, 30 jobs per month or fewer', pathpilo: 'Free forever (no job limit)', servicem8: 'Free (30 jobs/month limit)' },
      { label: 'Solo operator, 100 to 160 jobs per month', pathpilo: 'Free forever', servicem8: '$79/month (Growing, 150 jobs/month limit)' },
      { label: '5-person team, 160 jobs per month', pathpilo: 'from £25/month (unlimited jobs)', servicem8: '$79/month (Growing, 150 jobs/month)' },
      { label: 'Bin cleaner, 800 jobs per month', pathpilo: 'from £25/month (unlimited jobs)', servicem8: '$149/month (Premium, 500 jobs) plus overage' },
      { label: 'Unlimited job volume', pathpilo: 'Yes, on all plans', servicem8: 'No, billed by job volume' },
      { label: 'Works on Android', pathpilo: 'Yes, full feature parity', servicem8: 'Limited (iOS-first platform)' },
      { label: 'Free plan job limit', pathpilo: 'No limit', servicem8: '30 jobs per month' },
      { label: 'Automated customer reminders', pathpilo: 'Included free', servicem8: 'Available on paid plans' },
    ],
    note: 'ServiceM8 pricing sourced from servicem8.com/pricing, June 2026. PathPilo Company plan at £299/year (£25/month). Pricing changes, so verify before purchasing.',
  },

  prosCons: {
    pathpilo: {
      pros: [
        'Free plan with no job volume limit',
        'Works on any device, iOS and Android',
        'Built specifically for recurring route-based work',
        'Flat team pricing: unlimited employees from £25/month',
        'No per-job overage charges',
      ],
      cons: [
        'Fewer trade-specific add-ons than ServiceM8',
        'Smaller ecosystem of third-party integrations',
        'Newer platform with a smaller user community',
      ],
    },
    servicem8: {
      pros: [
        'Polished, well-designed iOS interface',
        'Unlimited users on all paid plans',
        'Strong job card workflow with photos, signatures, and forms',
        'Good for mixed trade businesses, not just window cleaning',
        'Free plan available (30 jobs/month)',
      ],
      cons: [
        'Free plan limited to 30 jobs per month, which is too low for most window cleaners',
        'iOS-first design means Android users get a limited experience',
        'Job volume caps mean costs increase as business grows',
        'Overage charges apply when you exceed your plan limit',
        'Less optimised for structured recurring route management',
      ],
    },
  },

  whoShouldChoose: {
    pathpilo:
      'A window cleaner or other recurring field service business that wants a free plan with no job limits, needs Android support, and runs structured daily routes rather than reactive job dispatch.',
    servicem8:
      'A trade business that primarily uses iPhones or iPads, does a lower volume of varied jobs rather than high-volume recurring routes, and wants a polished iOS-native experience with strong job card and form features.',
  },

  faq: [
    {
      q: 'Does ServiceM8 have a free plan?',
      a: 'Yes, ServiceM8 has a free plan for solo operators, but it is limited to 30 jobs per month. Most active window cleaners will exceed this within the first week. The next tier (Starter) is $29/month for 50 jobs per month, which is still limiting for a busy window cleaner. PathPilo\'s free plan has no job volume limit.',
    },
    {
      q: 'Does ServiceM8 work on Android?',
      a: 'ServiceM8 has a limited Android companion app, but the platform is primarily designed for iOS. The full job management experience, including job cards, photos, and forms, is available on iPhone and iPad. For Android-first teams, this is a significant limitation.',
    },
    {
      q: 'How does ServiceM8 pricing work for a window cleaning team?',
      a: 'ServiceM8 charges by monthly job volume, not by number of users. A window cleaning team doing 8 jobs per day across 5 days would create around 160 jobs per month, which requires the $79/month Growing plan (150-job limit) or the $149/month Premium plan (500-job limit). Additional jobs over the cap cost $0.20 each on the higher plans.',
    },
    {
      q: 'Is PathPilo really free with no restrictions?',
      a: 'PathPilo\'s free plan covers one operator with no job volume limit, unlimited clients, recurring jobs, automatic reminders, invoicing, and the mobile app. The only upgrade needed is the Company plan (£25/month) when you want to add team members.',
    },
    {
      q: 'Which is better for a bin cleaning business with high job volumes?',
      a: 'PathPilo is better for high-volume recurring route businesses. Bin cleaning operators doing 40 to 60 stops per day would need 800 to 1200 job credits per month on ServiceM8, which requires the $149/month Premium plan plus overage charges. PathPilo has no job volume limit at £25/month.',
    },
    {
      q: 'Can I switch from ServiceM8 to PathPilo?',
      a: 'Yes. You can export your client list from ServiceM8 and import it into PathPilo. Your recurring schedules will need to be recreated, but most operators are up and running within an afternoon.',
    },
  ],
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const COMPARISON_PAGES: ComparisonPage[] = [
  PATHPILO_VS_JOBBER_WINDOW_CLEANING,
  PATHPILO_VS_SQUEEGEE_WINDOW_CLEANING,
  PATHPILO_VS_HOUSECALL_PRO,
  PATHPILO_VS_SERVICEM8,
]

const BY_SLUG: Record<string, ComparisonPage> = Object.fromEntries(
  COMPARISON_PAGES.map((c) => [c.slug, c]),
)

export function getComparison(slug: string | undefined | null): ComparisonPage | undefined {
  if (!slug) return undefined
  return BY_SLUG[slug]
}

export function getComparisonSlugs(): string[] {
  return COMPARISON_PAGES.map((c) => c.slug)
}
