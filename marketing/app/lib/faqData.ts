import type { MarketingLocale } from './i18n'
import type { FaqItem } from './schema'

/** Site FAQ used by `/faq` UI and FAQPage JSON-LD. Keep Q/A in sync. */
const FAQ_EN: FaqItem[] = [
  {
    q: 'What types of service businesses is PathPilo designed for?',
    a: 'PathPilo is perfect for any mobile service business that schedules appointments and manages multiple employees. This includes cleaning companies, landscaping services, home maintenance and repair, property management companies, HVAC services, plumbing, electrical services, and more. If you have recurring jobs, multiple team members, and need to coordinate schedules, PathPilo is built for you.',
  },
  {
    q: 'How does recurring job scheduling work?',
    a: 'PathPilo makes recurring jobs simple. You can set up subscriptions with weekly or monthly schedules, choose specific days (like every Monday or the 15th of each month), and set custom intervals (every 2 weeks, every 3 months, etc.). Once configured, PathPilo automatically creates jobs based on your schedule. You can pause, skip dates, or modify subscriptions anytime without affecting past jobs.',
  },
  {
    q: 'Can I manage multiple employees and their schedules?',
    a: 'Absolutely! PathPilo is built for teams. You can add unlimited employees, set individual work hours for each team member, assign jobs to specific employees, and track performance. The system automatically checks employee availability when scheduling to prevent conflicts. Role-based access control lets you set permissions (owner, manager, employee) so everyone sees what they need.',
  },
  {
    q: 'How does invoicing work?',
    a: 'PathPilo makes invoicing fast and professional. Select completed jobs, choose your invoice style (by job, by task, or detailed breakdown), apply discounts if needed, add tax rates, and generate professional invoices in minutes. You can email invoices directly to clients or export as PDFs. All invoices are stored in your account for easy reference and payment tracking.',
  },
  {
    q: 'Can I capture leads from my website?',
    a: "Yes! PathPilo includes a powerful lead capture system. Create custom lead forms with our drag-and-drop builder, embed them on your website or share via social media. Leads can select services, provide preferred dates/times, and fill out custom fields. You'll receive instant email notifications when leads are submitted, and you can convert them directly into clients and jobs.",
  },
  {
    q: 'Is PathPilo mobile-friendly?',
    a: 'PathPilo is fully responsive and mobile-optimized. Your team can access everything from smartphones and tablets—view schedules, create jobs, check client information, and more. The interface is touch-optimized and works great on any device. No app download required; it works in any modern web browser.',
  },
  {
    q: 'How does client communication work?',
    a: 'PathPilo automates client communication to save you time. Clients automatically receive professional emails for job confirmations, schedule changes, cancellations, and invoices. You can customize all email templates to match your brand voice. The system uses placeholders to personalize each message with client names, dates, times, and job details.',
  },
  {
    q: 'What kind of analytics and reporting do you provide?',
    a: 'PathPilo provides comprehensive business intelligence. View real-time revenue (completed and projected), job completion statistics, team performance metrics, client activity, and more. You can analyze any date range and export reports for accounting. Interactive charts help you visualize trends and make data-driven decisions.',
  },
  {
    q: 'How secure is my business data?',
    a: 'Security is a top priority. PathPilo uses industry-standard encryption, secure token-based authentication, and role-based access control. Your data is stored securely in the cloud with regular backups. We never share your information with third parties, and you maintain full control over who can access your account.',
  },
  {
    q: 'Can I try PathPilo before committing?',
    a: 'Yes! PathPilo is free to get started, so you can explore all features risk-free. No credit card required. Set up your company, add services and clients, create jobs, and see how PathPilo works for your business.',
  },
  {
    q: 'What if I need help getting started?',
    a: 'We provide comprehensive onboarding support. Our step-by-step setup wizard guides you through initial configuration. We also offer documentation, best practices guides, and customer support. Most businesses are up and running within an hour. If you need additional help, contact our support team.',
  },
  {
    q: 'Can I export my data if I need to?',
    a: "Yes, you maintain full control of your data. You can export client information, job history, invoices, and reports at any time. We believe in data portability, so you're never locked in. Export formats include CSV and PDF for easy integration with other tools.",
  },
]

const FAQ_DA: FaqItem[] = [
  {
    q: 'Hvilke typer servicevirksomheder er PathPilo bygget til?',
    a: 'PathPilo er ideel til mobile servicevirksomheder med planlægning, aftaler og flere medarbejdere. Det gælder fx rengøring, anlæg, vedligehold, VVS, el, ejendomsservice m.fl.',
  },
  {
    q: 'Hvordan fungerer gentagne opgaver?',
    a: 'Du kan oprette abonnementer med ugentlige eller månedlige intervaller, vælge faste dage og lade PathPilo oprette opgaver automatisk.',
  },
  {
    q: 'Kan jeg administrere flere medarbejdere og deres tider?',
    a: 'Ja. Du kan tilføje medarbejdere, sætte arbejdstider, tildele opgaver og bruge roller (owner/manager/employee) for adgangsstyring.',
  },
  {
    q: 'Hvordan fungerer fakturering?',
    a: 'Vælg afsluttede opgaver, vælg fakturatype, tilføj rabat/moms og send faktura på få minutter. Du kan også eksportere PDF.',
  },
  {
    q: 'Kan jeg få leads fra min hjemmeside?',
    a: 'Ja. Du kan oprette lead-formularer, dele dem via link, få notifikationer og konvertere leads direkte til kunder og opgaver.',
  },
  {
    q: 'Er PathPilo mobilvenlig?',
    a: 'Ja, hele platformen er responsiv og optimeret til mobil og tablet - uden app-download.',
  },
  {
    q: 'Hvordan fungerer kundekommunikation?',
    a: 'PathPilo kan sende automatiske e-mails om bekræftelser, ændringer, aflysninger og fakturaer med skabeloner, du selv tilpasser.',
  },
  {
    q: 'Hvilke analyser og rapporter får jeg?',
    a: 'Du får indsigt i omsætning, opgavestatus, teamperformance og kundeadfærd med filtre på dato og mulighed for eksport.',
  },
  {
    q: 'Hvor sikker er mine data?',
    a: 'Vi bruger moderne sikkerhedsstandarder, adgangsstyring og backup i cloud. Dine data deles ikke med tredjeparter.',
  },
  {
    q: 'Kan jeg prøve PathPilo gratis først?',
    a: 'Ja. Du kan komme i gang gratis uden kreditkort og bruge alle kernefunktioner med det samme.',
  },
  {
    q: 'Hvad hvis jeg har brug for hjælp til opstart?',
    a: 'Vi tilbyder onboarding, vejledninger og support, så de fleste kommer hurtigt i gang.',
  },
  {
    q: 'Kan jeg eksportere mine data?',
    a: 'Ja, du kan eksportere kunder, opgaver, fakturaer og rapporter, når du vil.',
  },
]

export function getSiteFaqs(locale: MarketingLocale): FaqItem[] {
  return locale === 'da' ? FAQ_DA : FAQ_EN
}
