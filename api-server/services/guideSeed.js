/**
 * First-run content for the in-app guides. Converted from the old hardcoded
 * app/config/missions.ts so a fresh database already has something useful.
 * Once seeded, the admin panel is the source of truth — this file is never
 * applied again.
 *
 * `body` uses the limited markdown the guide viewer renders: **bold** and
 * [text](href). `{slug}` in an href is replaced with the company slug.
 * `doneTrigger` is a count key with a target (`clients>=1`) or `visit:<page>`.
 */

const GUIDE_SEED = [
  {
    slug: 'get-started',
    title: 'Get started',
    description: 'Clients, services and your first job — the basics before everything else.',
    icon: '🚀',
    steps: [
      {
        title: 'Create your first client',
        body: 'Open [Clients](/{slug}/clients) and click **+ New client**. Name and location are the only things you must fill in — everything else can wait.',
        ctaLabel: 'Open clients',
        ctaHref: '/{slug}/clients',
        doneTrigger: 'clients>=1',
      },
      {
        title: 'Add your first service',
        body: 'Open [Items](/{slug}/services), then **Add item**. Give it a name, a price and how long it takes, so jobs can use it.',
        ctaLabel: 'Open items',
        ctaHref: '/{slug}/services',
        doneTrigger: 'services>=1',
      },
      {
        title: 'Schedule your first job',
        body: 'Pick a client, choose a service and a **date**, then save. You land on [Schedule](/{slug}/jobs) in that week.',
        ctaLabel: 'Open schedule',
        ctaHref: '/{slug}/jobs',
        doneTrigger: 'jobs>=1',
      },
    ],
  },
  {
    slug: 'win-work',
    title: 'Win new work',
    description: 'Collect requests with your lead form, work them in the pipeline and send an offer.',
    icon: '🎯',
    steps: [
      {
        title: 'Turn on your lead form',
        body: 'Open [Settings → Lead form](/{slug}/settings/leads-form), adjust the fields you want and switch the form **On**. Then copy the link or embed it on your website.',
        ctaLabel: 'Open lead form',
        ctaHref: '/{slug}/settings/leads-form',
        doneTrigger: 'lead_form_enabled>=1',
      },
      {
        title: 'Get your first lead',
        body: 'Submit your own form once to see how it feels, or add one by hand from [Pipeline](/{slug}/pipeline). New requests land in the **New** column and ring the bell.',
        ctaLabel: 'Open pipeline',
        ctaHref: '/{slug}/pipeline',
        doneTrigger: 'leads>=1',
      },
      {
        title: 'Work a lead in the pipeline',
        body: 'Open a lead in [Pipeline](/{slug}/pipeline) and move it forward — mark it **Contacted**, send a quote, or turn it into a client.',
        ctaLabel: 'Open pipeline',
        ctaHref: '/{slug}/pipeline',
        doneTrigger: 'leads_handled>=1',
      },
      {
        title: 'Send an offer',
        body: 'Click **New offer**, pick a client or lead, add services and a few suggested days, then **Send**. You can see when they open it.',
        ctaLabel: 'New offer',
        ctaHref: '/{slug}/offers?new=1',
        doneTrigger: 'offers_sent>=1',
      },
    ],
  },
  {
    slug: 'book-and-deliver',
    title: 'Book and deliver',
    description: 'Turn an accepted offer into a confirmed job on your schedule.',
    icon: '📆',
    steps: [
      {
        title: 'Get an offer accepted',
        body: 'Open a sent offer and use **Copy link**. Open it the way a customer would and **accept a day** — a real client goes through exactly the same screen.',
        ctaLabel: 'Open offers',
        ctaHref: '/{slug}/offers',
        doneTrigger: 'offers_accepted>=1',
      },
      {
        title: 'Confirm the booking',
        body: 'In [Pipeline](/{slug}/pipeline), find the accepted offer and press **Verify** (or **Change day**). Confirming puts the job on your schedule for real.',
        ctaLabel: 'Open pipeline',
        ctaHref: '/{slug}/pipeline',
        doneTrigger: 'bookings_confirmed>=1',
      },
    ],
  },
  {
    slug: 'recurring-work',
    title: 'Recurring work',
    description: 'Set up subscriptions and rounds so repeat visits fill your schedule on their own.',
    icon: '🔁',
    steps: [
      {
        title: 'Create a subscription',
        body: 'Open **Recurring → Subscriptions** and click **Create subscription**. Pick a client and service, set the schedule, and future visits appear on the schedule automatically.',
        ctaLabel: 'Create subscription',
        ctaHref: '/{slug}/recurring/subscriptions?create=1',
        doneTrigger: 'subscriptions>=1',
      },
      {
        title: 'Create a round',
        body: 'Open **Recurring → Rounds** and click **Create round**. A round is a reusable set of stops you can place on any day — ideal for a neighbourhood you clean together.',
        ctaLabel: 'Open rounds',
        ctaHref: '/{slug}/recurring/rounds',
        doneTrigger: 'rounds>=1',
      },
    ],
  },
  {
    slug: 'route-planning',
    title: 'Route planning',
    description: 'Fill a day with jobs, plan the driving order, then see it all on the map.',
    icon: '🗺️',
    steps: [
      {
        title: 'Schedule 4 jobs on one day',
        body: 'On [Schedule](/{slug}/jobs), add jobs that share the **same date** until you have four. The counter follows your fullest day.',
        ctaLabel: 'Open schedule',
        ctaHref: '/{slug}/jobs',
        doneTrigger: 'jobs_same_day>=4',
      },
      {
        title: 'Save a planned route',
        body: 'On [Schedule](/{slug}/jobs), open a busy day and click **Plan route**. Adjust the order if you like, then **Save** to store it.',
        ctaLabel: 'Open schedule',
        ctaHref: '/{slug}/jobs',
        doneTrigger: 'routes>=1',
      },
      {
        title: 'Explore the map',
        body: 'Open the [Map](/{slug}/map) to see clients and jobs by location. Search an address, tap a pin, and spot the gaps between your stops.',
        ctaLabel: 'Open map',
        ctaHref: '/{slug}/map',
        doneTrigger: 'visit:map',
      },
    ],
  },
  {
    slug: 'team',
    title: 'Teams and employees',
    description: 'Start a 14-day free trial, invite employees and hand them jobs.',
    icon: '👥',
    steps: [
      {
        title: 'Start your 14-day free trial',
        body: 'Team features are on the Company plan. Add a card to start — **you pay nothing today**. After 14 days the card is charged automatically; change or cancel any time in billing.',
        ctaLabel: 'Open team',
        ctaHref: '/{slug}/team',
        doneTrigger: 'pro_access>=1',
      },
      {
        title: 'Invite your first employee',
        body: 'On [Team](/{slug}/team), click **Invite employee** and add their email and role. They get a link to join your workspace.',
        ctaLabel: 'Open team',
        ctaHref: '/{slug}/team',
        doneTrigger: 'team_members>=1',
      },
      {
        title: 'Assign a job to your team',
        body: 'When you create or open a job on [Schedule](/{slug}/jobs), choose an **employee**. The day view shows everyone\'s route side by side.',
        ctaLabel: 'Open schedule',
        ctaHref: '/{slug}/jobs',
        doneTrigger: 'team_assigned_jobs>=1',
      },
    ],
  },
  {
    slug: 'invoicing',
    title: 'Invoicing',
    description: 'Set up how your invoices look, finish work on the schedule, then invoice and send.',
    icon: '🧾',
    steps: [
      {
        title: 'Set up your invoice details',
        body: 'Open [Settings → Invoices](/{slug}/settings/invoices) to add payment details, numbering and terms. Add your logo under **Business** so invoices look like yours.',
        ctaLabel: 'Open invoice settings',
        ctaHref: '/{slug}/settings/invoices',
        doneTrigger: 'visit:invoice_settings',
      },
      {
        title: 'Complete a job',
        body: 'Open [Schedule](/{slug}/jobs), click a job to open it, then tap **Complete** in the top right. Completed work is what you can invoice.',
        ctaLabel: 'Open schedule',
        ctaHref: '/{slug}/jobs',
        doneTrigger: 'completed_jobs>=1',
      },
      {
        title: 'Create an invoice',
        body: 'Open **Invoices → New invoice**, pick a client, add the completed work and create the invoice.',
        ctaLabel: 'Create invoice',
        ctaHref: '/{slug}/invoices/new',
        doneTrigger: 'invoices>=1',
      },
      {
        title: 'Send an invoice',
        body: 'Open the invoice, check the preview and press **Send**. Your client gets a link they can pay from, and you can follow the status.',
        ctaLabel: 'Open invoices',
        ctaHref: '/{slug}/invoices',
        doneTrigger: 'invoices_sent>=1',
      },
    ],
  },
  {
    slug: 'level-up',
    title: 'Level up',
    description: 'Organise your catalogue, protect your time with fees, and automate reminders.',
    icon: '⚡',
    steps: [
      {
        title: 'Create a custom group',
        body: 'On [Items](/{slug}/services), click **New group**, name it, and organise your services the way your team works.',
        ctaLabel: 'Open items',
        ctaHref: '/{slug}/services',
        doneTrigger: 'custom_groups>=1',
      },
      {
        title: 'Set up a cancellation fee',
        body: 'On [Items](/{slug}/services), find **Cancellation fee**, switch it **Enabled** and set the amount.',
        ctaLabel: 'Open items',
        ctaHref: '/{slug}/services',
        doneTrigger: 'cancellation_fee>=1',
      },
      {
        title: 'Review client messages',
        body: 'Open [Settings → Notifications](/{slug}/settings/notifications) to choose which reminders and confirmations your clients get by email or SMS.',
        ctaLabel: 'Open notifications',
        ctaHref: '/{slug}/settings/notifications',
        doneTrigger: 'visit:notifications_settings',
      },
    ],
  },
];

module.exports = { GUIDE_SEED };
