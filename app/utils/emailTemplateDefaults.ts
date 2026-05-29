/**
 * Language-aware default templates for all email and SMS notification types.
 * The language is determined by the company's country code, not the UI user's language.
 *
 * Supported country codes → language:
 *   DK → Danish
 *   SE → Swedish
 *   NO → Norwegian
 *   DE → German
 *   US, GB, and all others → English
 */

export interface MessageTemplate {
  id: string
  kind: 'automated' | 'template'
  channel: 'email' | 'sms'
  title: string
  description: string
  subject: string
  message: string
}

export interface AutomationSetting {
  id: string
  title: string
  description: string
  enabled: boolean
  channel: 'email' | 'sms'
  leadValue: number
  leadUnit: 'minutes' | 'hours'
}

// ─── Per-template translations ────────────────────────────────────────────────

type TemplateLang = { subject: string; message: string }

const translations: Record<string, Record<string, TemplateLang>> = {
  // ── email_job_created ─────────────────────────────────────────────────────
  email_job_created: {
    en: {
      subject: 'Your booking with {Company name} is confirmed for {Job date}',
      message: 'Your appointment is booked. Here is a summary of the details.',
    },
    da: {
      subject: 'Din booking hos {Company name} er bekræftet den {Job date}',
      message: 'Din aftale er bekræftet. Her er en oversigt over detaljerne.',
    },
    sv: {
      subject: 'Din bokning hos {Company name} är bekräftad den {Job date}',
      message: 'Din bokning är bekräftad. Här är en sammanfattning av detaljerna.',
    },
    nb: {
      subject: 'Din bestilling hos {Company name} er bekreftet den {Job date}',
      message: 'Din time er bekreftet. Her er en oversikt over detaljene.',
    },
    de: {
      subject: 'Ihre Buchung bei {Company name} ist bestätigt für den {Job date}',
      message: 'Ihr Termin ist gebucht. Hier ist eine Übersicht der Details.',
    },
  },

  // ── email_job_reminder ────────────────────────────────────────────────────
  email_job_reminder: {
    en: {
      subject: 'Reminder: We are coming on {Job date}',
      message: 'We look forward to seeing you. Here is a summary of your appointment.',
    },
    da: {
      subject: 'Påmindelse: Vi kommer den {Job date}',
      message: 'Vi glæder os til at se dig. Her er en oversigt over din aftale.',
    },
    sv: {
      subject: 'Påminnelse: Vi kommer {Job date}',
      message: 'Vi ser fram emot att träffa dig. Här är en sammanfattning av din bokning.',
    },
    nb: {
      subject: 'Påminnelse: Vi kommer den {Job date}',
      message: 'Vi ser frem til å se deg. Her er en oversikt over din time.',
    },
    de: {
      subject: 'Erinnerung: Wir kommen am {Job date}',
      message: 'Wir freuen uns, Sie zu sehen. Hier ist eine Übersicht Ihres Termins.',
    },
  },

  // ── email_invoice_send (manual first send) ───────────────────────────────
  email_invoice_send: {
    en: {
      subject: 'Invoice {invoice_number} from {Company name}',
      message:
        'Hi {Client first name},\n\nYour invoice is ready. Open the e-invoice from the email to view details and payment options.\n\nBest regards,\n{Company name}',
    },
    da: {
      subject: 'Faktura {invoice_number} fra {Company name}',
      message:
        'Hej {Client first name},\n\nDin faktura er klar. Åbn e-fakturaen fra mailen for detaljer og betalingsmuligheder.\n\nMed venlig hilsen,\n{Company name}',
    },
    sv: {
      subject: 'Faktura {invoice_number} från {Company name}',
      message:
        'Hej {Client first name},\n\nDin faktura är klar. Öppna e-fakturan från mailet för detaljer och betalningsalternativ.\n\nMed vänliga hälsningar,\n{Company name}',
    },
    nb: {
      subject: 'Faktura {invoice_number} fra {Company name}',
      message:
        'Hei {Client first name},\n\nFakturaen din er klar. Åpne e-fakturaen fra e-posten for detaljer og betalingsalternativer.\n\nMed vennlig hilsen,\n{Company name}',
    },
    de: {
      subject: 'Rechnung {invoice_number} von {Company name}',
      message:
        'Guten Tag {Client first name},\n\nIhre Rechnung ist bereit. Öffnen Sie die E-Rechnung aus der E-Mail für Details und Zahlungsoptionen.\n\nMit freundlichen Grüßen,\n{Company name}',
    },
  },

  // ── email_invoice_due_reminder (automated; opening line + email layout) ──
  email_invoice_due_reminder: {
    en: {
      subject: 'Reminder: Invoice {invoice_number}',
      message: 'This is a friendly reminder that payment is coming due. You can view and pay using the link in the email.',
    },
    da: {
      subject: 'Påmindelse: Faktura {invoice_number}',
      message: 'Venlig påmindelse om betaling. Du kan se og betale via linket i mailen.',
    },
    sv: {
      subject: 'Påminnelse: Faktura {invoice_number}',
      message: 'En vänlig påminnelse om betalning. Du kan se och betala via länken i mailet.',
    },
    nb: {
      subject: 'Påminnelse: Faktura {invoice_number}',
      message: 'En vennlig påminnelse om betaling. Du kan se og betale via lenken i e-posten.',
    },
    de: {
      subject: 'Erinnerung: Rechnung {invoice_number}',
      message: 'Freundliche Erinnerung an die Zahlung. Sie können die E-Rechnung über den Link in der E-Mail öffnen.',
    },
  },

  // ── email_date_changed ────────────────────────────────────────────────────
  email_date_changed: {
    en: {
      subject: 'Your appointment date has been changed to {Job new date}',
      message:
        'Hi {Client first name},\n\nYour scheduled appointment has been moved to a new date.\n\nPrevious date: {Job old date}\nNew date: {Job new date}\nTime: {Job time from} - {Job time to}\n\nPlease contact us if the new date does not work for you.\n\nBest regards,\n{Company name}',
    },
    da: {
      subject: 'Din aftaledato er ændret til {Job new date}',
      message:
        'Hej {Client first name},\n\nDin planlagte aftale er blevet rykket til en ny dato.\n\nTidligere dato: {Job old date}\nNy dato: {Job new date}\nTid: {Job time from} - {Job time to}\n\nKontakt os venligst, hvis den nye dato ikke passer dig.\n\nMed venlig hilsen,\n{Company name}',
    },
    sv: {
      subject: 'Ditt bokningsdatum har ändrats till {Job new date}',
      message:
        'Hej {Client first name},\n\nDitt planerade uppdrag har flyttats till ett nytt datum.\n\nTidigare datum: {Job old date}\nNytt datum: {Job new date}\nTid: {Job time from} - {Job time to}\n\nKontakta oss om det nya datumet inte passar dig.\n\nMed vänliga hälsningar,\n{Company name}',
    },
    nb: {
      subject: 'Datoen for avtalen din er endret til {Job new date}',
      message:
        'Hei {Client first name},\n\nDin planlagte avtale er blitt flyttet til en ny dato.\n\nForrige dato: {Job old date}\nNy dato: {Job new date}\nTid: {Job time from} - {Job time to}\n\nKontakt oss hvis den nye datoen ikke passer deg.\n\nMed vennlig hilsen,\n{Company name}',
    },
    de: {
      subject: 'Ihr Termindatum wurde auf den {Job new date} geändert',
      message:
        'Guten Tag {Client first name},\n\nIhr geplanter Termin wurde auf ein neues Datum verlegt.\n\nVorheriges Datum: {Job old date}\nNeues Datum: {Job new date}\nUhrzeit: {Job time from} - {Job time to}\n\nBitte kontaktieren Sie uns, wenn das neue Datum nicht passt.\n\nMit freundlichen Grüßen,\n{Company name}',
    },
  },

  // ── email_job_cancelled ───────────────────────────────────────────────────
  email_job_cancelled: {
    en: {
      subject: 'Your appointment on {Job date} has been cancelled',
      message:
        'Hi {Client first name},\n\nWe are sorry, but your scheduled appointment on {Job date} has been cancelled.\n\nOriginal time: {Job time from} - {Job time to}\nServices: {Job services}\n\nPlease contact us if you would like to rebook.\n\nBest regards,\n{Company name}',
    },
    da: {
      subject: 'Din aftale den {Job date} er annulleret',
      message:
        'Hej {Client first name},\n\nVi beklager, men din planlagte aftale den {Job date} er annulleret.\n\nOprindeig tid: {Job time from} - {Job time to}\nYdelser: {Job services}\n\nKontakt os venligst, hvis du ønsker at booke en ny aftale.\n\nMed venlig hilsen,\n{Company name}',
    },
    sv: {
      subject: 'Din bokning den {Job date} har avbokats',
      message:
        'Hej {Client first name},\n\nVi beklagar, men din planerade bokning den {Job date} har avbokats.\n\nOriginal tid: {Job time from} - {Job time to}\nTjänster: {Job services}\n\nKontakta oss om du vill boka om.\n\nMed vänliga hälsningar,\n{Company name}',
    },
    nb: {
      subject: 'Avtalen din den {Job date} er avlyst',
      message:
        'Hei {Client first name},\n\nVi beklager, men den planlagte avtalen din den {Job date} er avlyst.\n\nOpprinnelig tid: {Job time from} - {Job time to}\nTjenester: {Job services}\n\nKontakt oss hvis du ønsker å booke en ny avtale.\n\nMed vennlig hilsen,\n{Company name}',
    },
    de: {
      subject: 'Ihr Termin am {Job date} wurde storniert',
      message:
        'Guten Tag {Client first name},\n\nLeider musste Ihr geplanter Termin am {Job date} storniert werden.\n\nUrsprüngliche Uhrzeit: {Job time from} - {Job time to}\nLeistungen: {Job services}\n\nBitte kontaktieren Sie uns, wenn Sie einen neuen Termin vereinbaren möchten.\n\nMit freundlichen Grüßen,\n{Company name}',
    },
  },

  // ── email_time_updated ────────────────────────────────────────────────────
  email_time_updated: {
    en: {
      subject: 'Updated time for your appointment on {Job date}',
      message:
        'Hi {Client first name},\n\nThe time for your scheduled appointment has changed.\n\nPrevious time: {Job old time from} - {Job old time to}\nNew time: {Job new time from} - {Job new time to}\nDate: {Job date}\n\nThank you for your understanding.\n\nBest regards,\n{Company name}',
    },
    da: {
      subject: 'Opdateret tid for din aftale den {Job date}',
      message:
        'Hej {Client first name},\n\nTidspunktet for din planlagte aftale er ændret.\n\nTidligere tid: {Job old time from} - {Job old time to}\nNy tid: {Job new time from} - {Job new time to}\nDato: {Job date}\n\nTak for din forståelse.\n\nMed venlig hilsen,\n{Company name}',
    },
    sv: {
      subject: 'Uppdaterad tid för din bokning den {Job date}',
      message:
        'Hej {Client first name},\n\nTiden för din planerade bokning har ändrats.\n\nTidigare tid: {Job old time from} - {Job old time to}\nNy tid: {Job new time from} - {Job new time to}\nDatum: {Job date}\n\nTack för din förståelse.\n\nMed vänliga hälsningar,\n{Company name}',
    },
    nb: {
      subject: 'Oppdatert tid for avtalen din den {Job date}',
      message:
        'Hei {Client first name},\n\nTidspunktet for den planlagte avtalen din er endret.\n\nForrige tid: {Job old time from} - {Job old time to}\nNy tid: {Job new time from} - {Job new time to}\nDato: {Job date}\n\nTakk for din forståelse.\n\nMed vennlig hilsen,\n{Company name}',
    },
    de: {
      subject: 'Aktualisierte Uhrzeit für Ihren Termin am {Job date}',
      message:
        'Guten Tag {Client first name},\n\nDie Uhrzeit für Ihren geplanten Termin hat sich geändert.\n\nVorherige Uhrzeit: {Job old time from} - {Job old time to}\nNeue Uhrzeit: {Job new time from} - {Job new time to}\nDatum: {Job date}\n\nVielen Dank für Ihr Verständnis.\n\nMit freundlichen Grüßen,\n{Company name}',
    },
  },

  // ── email_employee_changed ────────────────────────────────────────────────
  email_employee_changed: {
    en: {
      subject: 'Update: your assigned team member has changed',
      message:
        'Hi {Client first name},\n\nYour appointment will now be handled by {Employee new name}.\n\nPrevious team member: {Employee old name}\nNew team member: {Employee new name}\n\nIf you have any questions, please reply to this email.\n\nBest regards,\n{Company name}',
    },
    da: {
      subject: 'Opdatering: Din tilknyttede medarbejder er ændret',
      message:
        'Hej {Client first name},\n\nDin aftale vil nu blive håndteret af {Employee new name}.\n\nTidligere medarbejder: {Employee old name}\nNy medarbejder: {Employee new name}\n\nHvis du har spørgsmål, er du velkommen til at svare på denne e-mail.\n\nMed venlig hilsen,\n{Company name}',
    },
    sv: {
      subject: 'Uppdatering: Din tilldelade medarbetare har bytts',
      message:
        'Hej {Client first name},\n\nDitt uppdrag kommer nu att hanteras av {Employee new name}.\n\nTidigare medarbetare: {Employee old name}\nNy medarbetare: {Employee new name}\n\nOm du har frågor, vänligen svara på detta e-postmeddelande.\n\nMed vänliga hälsningar,\n{Company name}',
    },
    nb: {
      subject: 'Oppdatering: Din tildelte ansatt er endret',
      message:
        'Hei {Client first name},\n\nDin avtale vil nå bli håndtert av {Employee new name}.\n\nForrige ansatt: {Employee old name}\nNy ansatt: {Employee new name}\n\nHvis du har spørsmål, vennligst svar på denne e-posten.\n\nMed vennlig hilsen,\n{Company name}',
    },
    de: {
      subject: 'Aktualisierung: Ihr zugewiesener Mitarbeiter wurde geändert',
      message:
        'Guten Tag {Client first name},\n\nIhr Termin wird nun von {Employee new name} bearbeitet.\n\nVorheriger Mitarbeiter: {Employee old name}\nNeuer Mitarbeiter: {Employee new name}\n\nBei Fragen können Sie gerne auf diese E-Mail antworten.\n\nMit freundlichen Grüßen,\n{Company name}',
    },
  },

  // ── email_on_the_way ──────────────────────────────────────────────────────
  email_on_the_way: {
    en: {
      subject: 'We are on our way',
      message:
        'Hi {Client first name},\n\n' +
        'We are on our way to you right now and expect to arrive in about {Selected minutes} minutes.\n\n' +
        'The agreed location is {Client location}.\n\n' +
        'Kind regards,\n' +
        '{Owner name}\n' +
        '{Company name}',
    },
    da: {
      subject: 'Vi er på vej',
      message:
        'Hej {Client first name},\n\n' +
        'Vi er på vej til dig nu og forventer at ankomme om cirka {Selected minutes} minutter.\n\n' +
        'Den aftalte adresse er {Client location}.\n\n' +
        'Med venlig hilsen,\n' +
        '{Owner name}\n' +
        '{Company name}',
    },
    sv: {
      subject: 'Vi är på väg',
      message:
        'Hej {Client first name},\n\n' +
        'Vi är på väg till dig nu och beräknar att vara framme om cirka {Selected minutes} minuter.\n\n' +
        'Den överenskomna adressen är {Client location}.\n\n' +
        'Med vänliga hälsningar,\n' +
        '{Owner name}\n' +
        '{Company name}',
    },
    nb: {
      subject: 'Vi er på vei',
      message:
        'Hei {Client first name},\n\n' +
        'Vi er på vei til deg nå og forventer å ankomme om cirka {Selected minutes} minutter.\n\n' +
        'Den avtalte adressen er {Client location}.\n\n' +
        'Med vennlig hilsen,\n' +
        '{Owner name}\n' +
        '{Company name}',
    },
    de: {
      subject: 'Wir sind unterwegs',
      message:
        'Guten Tag {Client first name},\n\n' +
        'Wir sind gerade auf dem Weg zu Ihnen und erwarten in etwa {Selected minutes} Minuten anzukommen.\n\n' +
        'Der vereinbarte Ort ist {Client location}.\n\n' +
        'Mit freundlichen Grüßen,\n' +
        '{Owner name}\n' +
        '{Company name}',
    },
  },

  // ── sms_on_the_way ────────────────────────────────────────────────────────
  sms_on_the_way: {
    en: {
      subject: '',
      message:
        'Hi {Client first name}! {Employee name} from {Company name} is on the way to {Job address}. See you soon.',
    },
    da: {
      subject: '',
      message:
        'Hej {Client first name}! {Employee name} fra {Company name} er på vej til {Job address}. Vi ses snart.',
    },
    sv: {
      subject: '',
      message:
        'Hej {Client first name}! {Employee name} från {Company name} är på väg till {Job address}. Vi ses snart.',
    },
    nb: {
      subject: '',
      message:
        'Hei {Client first name}! {Employee name} fra {Company name} er på vei til {Job address}. Vi sees snart.',
    },
    de: {
      subject: '',
      message:
        'Hallo {Client first name}! {Employee name} von {Company name} ist auf dem Weg zu {Job address}. Bis gleich.',
    },
  },

  // ── sms_day_before ────────────────────────────────────────────────────────
  sms_day_before: {
    en: {
      subject: '',
      message:
        'Reminder from {Company name}: We are visiting you on {Job date} at {Job time from}. Reply if you need to reschedule.',
    },
    da: {
      subject: '',
      message:
        'Påmindelse fra {Company name}: Vi besøger dig den {Job date} kl. {Job time from}. Svar venligst, hvis du ønsker at ændre tidspunktet.',
    },
    sv: {
      subject: '',
      message:
        'Påminnelse från {Company name}: Vi besöker dig den {Job date} kl. {Job time from}. Svara om du behöver boka om.',
    },
    nb: {
      subject: '',
      message:
        'Påminnelse fra {Company name}: Vi besøker deg den {Job date} kl. {Job time from}. Svar hvis du trenger å ombooke.',
    },
    de: {
      subject: '',
      message:
        'Erinnerung von {Company name}: Wir besuchen Sie am {Job date} um {Job time from} Uhr. Antworten Sie, wenn Sie umbuchen möchten.',
    },
  },
}

// ─── Country → language mapping ───────────────────────────────────────────────

function countryToLang(countryCode: string): string {
  const code = String(countryCode || '').trim().toUpperCase()
  switch (code) {
    case 'DK': return 'da'
    case 'SE': return 'sv'
    case 'NO': return 'nb'
    case 'DE': return 'de'
    default:   return 'en'
  }
}

function getTranslation(templateId: string, countryCode: string): TemplateLang {
  const lang = countryToLang(countryCode)
  const byLang = translations[templateId]
  if (!byLang) return { subject: '', message: '' }
  return byLang[lang] || byLang['en'] || { subject: '', message: '' }
}

// ─── Sync country code from localStorage (for useState initialisers) ──────────

export function getCompanyCountryCodeSync(): string {
  if (typeof window === 'undefined') return 'DK'
  try {
    const rawCompany = localStorage.getItem('company')
    if (rawCompany) {
      const c = JSON.parse(rawCompany)
      if (c?.countryCode) return String(c.countryCode)
    }
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    const code =
      u.activeCompany?.countryCode ||
      (Array.isArray(u.companies)
        ? u.companies.find((co: { id?: number }) => co?.id === u.companyId)?.countryCode
        : undefined)
    if (code) return String(code)
  } catch { /* ignore */ }
  return 'DK'
}

export function getCompanyNameSync(): string {
  if (typeof window === 'undefined') return ''
  try {
    const rawCompany = localStorage.getItem('company')
    if (rawCompany) {
      const c = JSON.parse(rawCompany)
      if (c?.name) return String(c.name)
    }
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    const name =
      u.activeCompany?.name ||
      (Array.isArray(u.companies)
        ? u.companies.find((co: { id?: number }) => co?.id === u.companyId)?.name
        : undefined)
    if (name) return String(name)
  } catch { /* ignore */ }
  return ''
}

// ─── Template metadata (titles/descriptions don't change per language) ────────

const templateMeta: Record<string, Pick<MessageTemplate, 'id' | 'kind' | 'channel' | 'title' | 'description'>> = {
  email_job_created: {
    id: 'email_job_created',
    kind: 'automated',
    channel: 'email',
    title: 'Job created confirmation',
    description: 'Automated email sent shortly after a job is created.',
  },
  email_job_reminder: {
    id: 'email_job_reminder',
    kind: 'automated',
    channel: 'email',
    title: 'Before-job reminder',
    description: 'Automated reminder before arrival.',
  },
  email_invoice_send: {
    id: 'email_invoice_send',
    kind: 'template',
    channel: 'email',
    title: 'First invoice email',
    description: 'Default subject and message when you send an invoice to a client (e-invoice link).',
  },
  email_invoice_due_reminder: {
    id: 'email_invoice_due_reminder',
    kind: 'automated',
    channel: 'email',
    title: 'Invoice due reminder',
    description: 'Automatically reminds the client before the due date if the invoice is still unpaid.',
  },
  email_date_changed: {
    id: 'email_date_changed',
    kind: 'template',
    channel: 'email',
    title: 'Job moved to another day',
    description: 'Manual template used when date is changed and you choose to send.',
  },
  email_job_cancelled: {
    id: 'email_job_cancelled',
    kind: 'template',
    channel: 'email',
    title: 'Job cancelled',
    description: 'Manual template used when cancellation notice is sent.',
  },
  email_time_updated: {
    id: 'email_time_updated',
    kind: 'template',
    channel: 'email',
    title: 'Job time updated',
    description: 'Manual template used when time changes and you choose to send.',
  },
  email_employee_changed: {
    id: 'email_employee_changed',
    kind: 'template',
    channel: 'email',
    title: 'Assigned team member changed',
    description: 'Manual template used when the assigned employee is changed and you choose to notify.',
  },
  email_on_the_way: {
    id: 'email_on_the_way',
    kind: 'template',
    channel: 'email',
    title: 'On the way',
    description: 'Sent from the mobile app when you notify a client that you are on your way.',
  },
  sms_on_the_way: {
    id: 'sms_on_the_way',
    kind: 'automated',
    channel: 'sms',
    title: 'Employee is on the way',
    description: 'Automated SMS when technician starts driving to client.',
  },
  sms_day_before: {
    id: 'sms_day_before',
    kind: 'automated',
    channel: 'sms',
    title: 'Day-before reminder',
    description: 'Automated reminder sent before arrival day.',
  },
}

const TEMPLATE_ORDER = [
  'email_job_created',
  'email_job_reminder',
  'email_invoice_send',
  'email_invoice_due_reminder',
  'email_date_changed',
  'email_job_cancelled',
  'email_time_updated',
  'email_employee_changed',
  'email_on_the_way',
  'sms_on_the_way',
  'sms_day_before',
]

/**
 * Returns default templates in the language appropriate for the given company country code.
 */
export function getDefaultTemplates(countryCode?: string): MessageTemplate[] {
  const cc = countryCode || getCompanyCountryCodeSync()
  return TEMPLATE_ORDER.map((id) => {
    const meta = templateMeta[id]
    const text = getTranslation(id, cc)
    return { ...meta, ...text }
  })
}

/**
 * Returns the default (language-appropriate) text for a single template.
 */
export function getDefaultTemplate(templateId: string, countryCode?: string): TemplateLang {
  const cc = countryCode || getCompanyCountryCodeSync()
  return getTranslation(templateId, cc)
}

/**
 * Default automation settings (not language-specific — just timing/toggle config).
 */
export const defaultAutomationSettings: AutomationSetting[] = [
  {
    id: 'email_job_created',
    title: 'Email confirmation after job is created',
    description: 'Send a confirmation email automatically after creating a job.',
    enabled: false,
    channel: 'email',
    leadValue: 5,
    leadUnit: 'minutes',
  },
  {
    id: 'email_job_reminder',
    title: 'Email reminder before job',
    description: 'Send reminder email automatically before the visit.',
    enabled: false,
    channel: 'email',
    leadValue: 24,
    leadUnit: 'hours',
  },
  {
    id: 'email_invoice_due_reminder',
    title: 'Invoice due reminder',
    description: 'Send an email automatically before the invoice due date if it is still unpaid.',
    enabled: false,
    channel: 'email',
    leadValue: 48,
    leadUnit: 'hours',
  },
  {
    id: 'sms_day_before',
    title: 'SMS reminder before job',
    description: 'Send reminder SMS before arrival.',
    enabled: false,
    channel: 'sms',
    leadValue: 24,
    leadUnit: 'hours',
  },
  {
    id: 'sms_on_the_way',
    title: 'SMS when employee is on the way',
    description: 'Send SMS automatically when route status changes to on-the-way.',
    enabled: false,
    channel: 'sms',
    leadValue: 1,
    leadUnit: 'hours',
  },
]

// ─── Automated email UI strings (used in the HTML email layout by the backend) ─

export interface AutomatedEmailLabels {
  dateLabel: string
  arrivalLabel: string
  locationLabel: string
  serviceLabel: string
  priceLabel: string
  totalLabel: string
  noServicesText: string
  notPlanned: string
  signOffConfirmation: string
  signOffReminder: string
}

const emailLabels: Record<string, AutomatedEmailLabels> = {
  en: {
    dateLabel: 'Date',
    arrivalLabel: 'Est. Arrival',
    locationLabel: 'Location',
    serviceLabel: 'Service',
    priceLabel: 'Price',
    totalLabel: 'Total',
    noServicesText: 'No services listed',
    notPlanned: 'not planned',
    signOffConfirmation: 'Best regards,',
    signOffReminder: 'See you soon,',
  },
  da: {
    dateLabel: 'Dato',
    arrivalLabel: 'Forventet ankomst',
    locationLabel: 'Adresse',
    serviceLabel: 'Ydelse',
    priceLabel: 'Pris',
    totalLabel: 'I alt',
    noServicesText: 'Ingen ydelser angivet',
    notPlanned: 'ikke planlagt',
    signOffConfirmation: 'Med venlig hilsen,',
    signOffReminder: 'Vi ses snart,',
  },
  sv: {
    dateLabel: 'Datum',
    arrivalLabel: 'Beräknad ankomst',
    locationLabel: 'Plats',
    serviceLabel: 'Tjänst',
    priceLabel: 'Pris',
    totalLabel: 'Totalt',
    noServicesText: 'Inga tjänster listade',
    notPlanned: 'inte planerad',
    signOffConfirmation: 'Med vänliga hälsningar,',
    signOffReminder: 'Vi ses snart,',
  },
  nb: {
    dateLabel: 'Dato',
    arrivalLabel: 'Forventet ankomst',
    locationLabel: 'Adresse',
    serviceLabel: 'Tjeneste',
    priceLabel: 'Pris',
    totalLabel: 'Totalt',
    noServicesText: 'Ingen tjenester angitt',
    notPlanned: 'ikke planlagt',
    signOffConfirmation: 'Med vennlig hilsen,',
    signOffReminder: 'Vi sees snart,',
  },
  de: {
    dateLabel: 'Datum',
    arrivalLabel: 'Geschätzte Ankunft',
    locationLabel: 'Ort',
    serviceLabel: 'Leistung',
    priceLabel: 'Preis',
    totalLabel: 'Gesamt',
    noServicesText: 'Keine Leistungen aufgelistet',
    notPlanned: 'nicht geplant',
    signOffConfirmation: 'Mit freundlichen Grüßen,',
    signOffReminder: 'Bis bald,',
  },
}

export function getAutomatedEmailLabels(countryCode?: string): AutomatedEmailLabels {
  const lang = countryToLang(countryCode || 'DK')
  return emailLabels[lang] || emailLabels['en']
}
