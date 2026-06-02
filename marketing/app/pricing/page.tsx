'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Header from '../components/Header'
import Footer from '../components/Footer'
import {
  getLocaleFromPathname,
  isMarketingLocale,
  withAppLanguageParam,
} from '../lib/i18n'
import type { MarketingLocale } from '../lib/i18n'
import { pushCtaClick } from '../lib/dataLayer'
import { CheckIcon, MinusIcon } from '@heroicons/react/24/solid'
import { ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline'

const SMS_TIERS = [
  { mails: 500,   price: 26  },
  { mails: 1000,  price: 49  },
  { mails: 2500,  price: 129 },
  { mails: 5000,  price: 239 },
  { mails: 7500,  price: 345 },
  { mails: 10000, price: 440 },
] as const

type FeatureValue = true | false | string

interface FeatureRow {
  label:   { en: string; da: string }
  solo:    FeatureValue
  company: FeatureValue
}

interface FeatureGroup {
  heading: { en: string; da: string }
  rows:    FeatureRow[]
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    heading: { en: 'Scheduling & Jobs', da: 'Planlægning og opgaver' },
    rows: [
      { label: { en: 'Unlimited jobs & tasks',               da: 'Ubegrænsede opgaver'               }, solo: true,  company: true  },
      { label: { en: 'Recurring jobs & subscriptions',       da: 'Gentagne opgaver og abonnementer'   }, solo: true,  company: true  },
      { label: { en: 'Drag-and-drop calendar',               da: 'Træk-og-slip kalender'             }, solo: true,  company: true  },
      { label: { en: 'Route planning & optimisation',        da: 'Ruteplanlægning og optimering'      }, solo: true,  company: true  },
      { label: { en: 'Live ETA tracking',                    da: 'Live ETA-sporing'                   }, solo: true,  company: true  },
    ],
  },
  {
    heading: { en: 'Clients & Leads', da: 'Kunder og leads' },
    rows: [
      { label: { en: 'Unlimited clients',                    da: 'Ubegrænsede kunder'                 }, solo: true,  company: true  },
      { label: { en: 'Lead capture forms',                   da: 'Lead-formularer'                    }, solo: true,  company: true  },
      { label: { en: 'Client portal',                        da: 'Kundeportal'                        }, solo: true,  company: true  },
      { label: { en: 'Client notes & history',               da: 'Kundenoter og historik'              }, solo: true,  company: true  },
    ],
  },
  {
    heading: { en: 'Invoicing & Payments', da: 'Fakturering og betalinger' },
    rows: [
      { label: { en: 'Quotes & invoices',                    da: 'Tilbud og fakturaer'                }, solo: true,  company: true  },
      { label: { en: 'Payment tracking',                     da: 'Betalingssporing'                   }, solo: true,  company: true  },
      { label: { en: 'Bank transfer support',                da: 'Bankoverførsel'                     }, solo: true,  company: true  },
      { label: { en: 'Custom invoice numbering',             da: 'Brugerdefineret fakturanummerering'  }, solo: true,  company: true  },
      { label: { en: 'Due-date reminders',                   da: 'Forfaldspåmindelser'                }, solo: true,  company: true  },
    ],
  },
  {
    heading: { en: 'Team & Employees', da: 'Team og medarbejdere' },
    rows: [
      { label: { en: 'Team members',                         da: 'Teammedlemmer'                      }, solo: false, company: { en: 'Unlimited', da: 'Ubegrænset' } },
      { label: { en: 'Employee roles & permissions',         da: 'Medarbejderroller og rettigheder'    }, solo: false, company: true  },
      { label: { en: 'Time-off requests',                    da: 'Fravær og fridagsanmodninger'        }, solo: false, company: true  },
      { label: { en: 'Live mobile progress from field',      da: 'Live mobilstatus fra marken'         }, solo: false, company: true  },
      { label: { en: 'Working hours tracking',               da: 'Arbejdstidssporing'                  }, solo: false, company: true  },
    ],
  },
  {
    heading: { en: 'Analytics & Reporting', da: 'Analyser og rapporter' },
    rows: [
      { label: { en: 'Business dashboards',                  da: 'Forretningsdashboards'               }, solo: true,  company: true  },
      { label: { en: 'Job & revenue reports',                da: 'Opgave- og omsætningsrapporter'      }, solo: true,  company: true  },
      { label: { en: 'Export data (CSV)',                    da: 'Eksportér data (CSV)'                }, solo: true,  company: true  },
    ],
  },
  {
    heading: { en: 'Platform & Support', da: 'Platform og support' },
    rows: [
      { label: { en: 'Mobile-friendly (all devices)',        da: 'Mobilvenlig (alle enheder)'          }, solo: true,  company: true  },
      { label: { en: 'Secure cloud storage',                 da: 'Sikker cloud-lagring'                }, solo: true,  company: true  },
      { label: { en: 'Email notifications',                  da: 'E-mailnotifikationer'                }, solo: true,  company: true  },
      { label: { en: 'Custom email templates',               da: 'Tilpassede e-mailskabeloner'         }, solo: true,  company: true  },
      { label: { en: 'Help Center access',                   da: 'Adgang til hjælpecenter'             }, solo: true,  company: true  },
      { label: { en: 'SMS add-on available',                 da: 'SMS-tilvalg tilgængeligt'            }, solo: true,  company: true  },
    ],
  },
]

function FeatureCell({ value, da }: { value: FeatureValue; da: boolean }) {
  if (value === true)  return <CheckIcon className="mx-auto h-5 w-5 text-accent-600" />
  if (value === false) return <MinusIcon  className="mx-auto h-5 w-5 text-gray-300"  />
  return (
    <span className="text-sm font-semibold text-primary-800">
      {da && typeof value === 'object' ? (value as { en: string; da: string }).da : (value as { en: string; da: string }).en}
    </span>
  )
}

export default function PricingPage({ locale: localeProp }: { locale?: string }) {
  const pathname = usePathname()
  const locale: MarketingLocale =
    localeProp && isMarketingLocale(localeProp)
      ? localeProp
      : getLocaleFromPathname(pathname || '/')
  const da = locale === 'da'
  const registerUrl     = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')
  const registerProUrl  = withAppLanguageParam(locale, 'https://app.pathpilo.com/register?plan=pro')

  const [tierIndex,    setTierIndex]    = useState(0)
  const [annualBilling, setAnnualBilling] = useState(false)

  const selectedTier = SMS_TIERS[tierIndex]
  const COMPANY_MONTHLY   = 39
  const annualTotal        = Math.round(COMPANY_MONTHLY * 12 * 0.65)
  const annualMonthly      = +(annualTotal / 12).toFixed(2)
  const annualSavings      = COMPANY_MONTHLY * 12 - annualTotal
  const displayPrice       = annualBilling ? annualMonthly : COMPANY_MONTHLY

  return (
    <>
      <Header />

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-[#060f0f] to-[#0d2020] pb-20 pt-20 md:pt-28">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-[3.25rem] md:leading-[1.1]">
            {da ? 'Enkel prissætning til servicevirksomheder' : 'Simple pricing for service businesses'}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-teal-100/70">
            {da
              ? 'Start gratis som solooperatør. Skaler til Company-planen når du er klar til at bygge et team.'
              : 'Start free as a solo operator. Scale to the Company plan when you\'re ready to build a team.'}
          </p>

          {/* Billing toggle */}
          <div className="mt-8 inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/10 p-1 backdrop-blur">
            <button
              type="button"
              onClick={() => setAnnualBilling(false)}
              className={`rounded-lg px-5 py-2 text-sm font-semibold transition-all ${
                !annualBilling ? 'bg-white text-primary-900 shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              {da ? 'Månedlig' : 'Monthly'}
            </button>
            <button
              type="button"
              onClick={() => setAnnualBilling(true)}
              className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all ${
                annualBilling ? 'bg-white text-primary-900 shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              {da ? 'Årlig' : 'Annual'}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${annualBilling ? 'bg-accent-600 text-white' : 'bg-accent-500/30 text-accent-300'}`}>
                {da ? 'Spar 35%' : 'Save 35%'}
              </span>
            </button>
          </div>
        </div>

        {/* ── PLAN CARDS ──────────────────────────────────────────────── */}
        <div className="mx-auto mt-10 max-w-5xl px-6">
          <div className="grid gap-5 md:grid-cols-2">

            {/* Solo */}
            <div className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-widest text-white/50">
                {da ? 'Solo' : 'Solo'}
              </p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-5xl font-black text-white">£0</span>
                <span className="mb-1.5 text-sm text-white/60">/ {da ? 'måned' : 'month'}</span>
              </div>
              <p className="mt-2 text-sm text-white/60">
                {da ? 'Ingen kreditkort nødvendig. For altid gratis.' : 'No credit card needed. Free forever.'}
              </p>

              <hr className="my-6 border-white/10" />

              <ul className="space-y-3 text-sm text-white/85">
                {(da ? [
                  'Alt til planlægning, kunder og fakturering',
                  'Recurring jobs og abonnementer',
                  'Ruteplanlægning og live ETA',
                  'Lead-formularer og klientportal',
                  'Dashboards og rapporter',
                  'Mobilvenlig på alle enheder',
                ] : [
                  'Full scheduling, clients, and invoicing',
                  'Recurring jobs and subscriptions',
                  'Route planning and live ETA',
                  'Lead forms and client portal',
                  'Dashboards and reporting',
                  'Mobile-friendly on all devices',
                ]).map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-400" />
                    {f}
                  </li>
                ))}
                <li className="flex items-start gap-2.5 text-white/45">
                  <MinusIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  {da ? 'Ingen team- eller medarbejderadgang' : 'No team or employee access'}
                </li>
              </ul>

              <div className="mt-auto pt-8">
                <a
                  href={registerUrl}
                  className="block w-full rounded-xl border border-white/25 py-3 text-center text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/10"
                  onClick={() => pushCtaClick({ ctaType: 'register', ctaLabel: 'Start Solo', linkUrl: registerUrl, location: 'pricing_solo' })}
                >
                  {da ? 'Kom i gang gratis' : 'Get started free'}
                </a>
              </div>
            </div>

            {/* Company */}
            <div className="relative flex flex-col rounded-2xl border border-accent-400/40 bg-white p-8 shadow-xl shadow-black/20">
              <span className="absolute right-5 top-5 rounded-full bg-accent-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                {da ? 'Mest valgt' : 'Most popular'}
              </span>
              <p className="text-xs font-bold uppercase tracking-widest text-accent-700">
                {da ? 'Company' : 'Company'}
              </p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-5xl font-black text-primary-900">
                  £{displayPrice}
                </span>
                <span className="mb-1.5 text-sm text-gray-500">/ {da ? 'måned' : 'month'}</span>
              </div>
              {annualBilling ? (
                <p className="mt-2 text-sm font-semibold text-accent-700">
                  {da ? `Faktureres som £${annualTotal}/år · spar £${annualSavings}` : `Billed as £${annualTotal}/year · save £${annualSavings}`}
                </p>
              ) : (
                <p className="mt-2 text-sm text-gray-500">
                  {da ? 'Skift til årlig og spar 35% →' : 'Switch to annual and save 35% →'}
                </p>
              )}

              <hr className="my-6 border-gray-100" />

              <ul className="space-y-3 text-sm text-gray-700">
                {(da ? [
                  'Alt fra Solo-planen',
                  'Ubegrænsede medarbejdere og teams',
                  'Medarbejderroller og rettigheder',
                  'Arbejdstid og fravær',
                  'Live mobilstatus fra marken',
                  'Prioriteret support',
                ] : [
                  'Everything in Solo',
                  'Unlimited employees and teams',
                  'Employee roles and permissions',
                  'Working hours and time-off',
                  'Live field mobile updates',
                  'Priority support',
                ]).map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-600" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-8">
                <a
                  href={registerProUrl}
                  className="btn-primary block w-full py-3 text-center"
                  onClick={() => pushCtaClick({ ctaType: 'register', ctaLabel: 'Start Company trial', linkUrl: registerProUrl, location: 'pricing_company' })}
                >
                  {da ? 'Start 14-dages gratis prøve' : 'Start 14-day free trial'}
                </a>
                <p className="mt-3 text-center text-xs text-gray-400">
                  {da ? 'Ingen kreditkort · Ingen binding' : 'No credit card · No lock-in'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SMS CALCULATOR ────────────────────────────────────────────── */}
      <section className="border-t border-gray-100 bg-white py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex items-center gap-3">
            <ChatBubbleBottomCenterTextIcon className="h-6 w-6 text-accent-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-accent-700">
              {da ? 'SMS-tilvalg · Kommer snart' : 'SMS add-on · Coming soon'}
            </span>
          </div>

          <h2 className="mt-3 text-3xl font-bold text-primary-900 md:text-4xl">
            {da ? 'Hvor mange SMS sender du om måneden?' : 'How many SMS do you send each month?'}
          </h2>
          <p className="mt-2 text-gray-500">
            {da
              ? 'Træk slideren for at beregne din månedlige pris. Priser vises allerede nu så du kan budgettere.'
              : 'Drag the slider to calculate your monthly cost. Prices shown now so you can plan ahead.'}
          </p>

          <div className="mt-10 grid gap-8 md:grid-cols-[1fr_auto]">
            <div>
              {/* Big volume display */}
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-5xl font-black text-primary-900 tabular-nums">
                  {selectedTier.mails.toLocaleString('en-GB')}
                </span>
                <span className="text-lg font-medium text-gray-400">SMS / {da ? 'måned' : 'month'}</span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={0}
                max={SMS_TIERS.length - 1}
                step={1}
                value={tierIndex}
                onChange={(e) => setTierIndex(Number(e.target.value))}
                className="mt-2 h-2 w-full cursor-pointer accent-accent-500"
                aria-label={da ? 'SMS-volumen' : 'SMS volume'}
              />
              {/* Tick labels */}
              <div className="mt-2 flex justify-between text-xs font-medium text-gray-400">
                {SMS_TIERS.map((t) => (
                  <span
                    key={t.mails}
                    className={t.mails === selectedTier.mails ? 'font-bold text-accent-600' : ''}
                  >
                    {t.mails >= 1000 ? `${t.mails / 1000}k` : t.mails}
                  </span>
                ))}
                <span className="text-gray-400">∞</span>
              </div>

              {/* Tier cards row */}
              <div className="mt-8 grid grid-cols-3 gap-2 sm:grid-cols-6 md:grid-cols-3 lg:grid-cols-6">
                {SMS_TIERS.map((tier, i) => (
                  <button
                    type="button"
                    key={tier.mails}
                    onClick={() => setTierIndex(i)}
                    className={`rounded-xl border px-2 py-3 text-center transition ${
                      tier.mails === selectedTier.mails
                        ? 'border-accent-500 bg-accent-50 shadow-sm'
                        : 'border-gray-200 hover:border-accent-300 hover:bg-gray-50'
                    }`}
                  >
                    <p className={`text-sm font-bold ${tier.mails === selectedTier.mails ? 'text-accent-700' : 'text-primary-800'}`}>
                      {tier.mails >= 1000 ? `${tier.mails / 1000}k` : tier.mails}
                    </p>
                    <p className={`mt-0.5 text-[11px] ${tier.mails === selectedTier.mails ? 'text-accent-600' : 'text-gray-500'}`}>
                      £{tier.price}
                    </p>
                  </button>
                ))}
              </div>
              <div className="mt-2 rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-center text-sm text-gray-500">
                {da ? '10,000+ mails — ' : '10,000+ mails — '}
                <a href={withAppLanguageParam(locale, 'https://app.pathpilo.com/contact')} className="font-semibold text-accent-600 underline-offset-2 hover:underline">
                  {da ? 'Kontakt os' : 'Contact us'}
                </a>
              </div>
            </div>

            {/* Live price box */}
            <div className="flex flex-col justify-center rounded-2xl border border-accent-200 bg-accent-50 px-8 py-8 text-center md:min-w-[200px]">
              <p className="text-xs font-bold uppercase tracking-widest text-accent-700">
                {da ? 'Din pris' : 'Your price'}
              </p>
              <p className="mt-3 text-6xl font-black leading-none text-accent-700 tabular-nums">
                £{selectedTier.price}
              </p>
              <p className="mt-2 text-sm text-accent-700/75">/ {da ? 'måned' : 'month'}</p>
              <hr className="my-4 border-accent-200" />
              <p className="text-xs text-gray-600">
                {selectedTier.mails.toLocaleString('en-GB')} {da ? 'SMS inkluderet' : 'SMS included'}
              </p>
              <a
                href={registerUrl}
                className="mt-5 block rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 transition hover:bg-accent-700"
                onClick={() => pushCtaClick({ ctaType: 'register', ctaLabel: 'Start SMS', linkUrl: registerUrl, location: 'pricing_sms' })}
              >
                {da ? 'Underret mig' : 'Notify me'}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE COMPARISON TABLE ──────────────────────────────────── */}
      <section className="bg-gray-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-primary-900 md:text-4xl">
              {da ? 'Sammenlign planer' : 'Compare plans'}
            </h2>
            <p className="mt-3 text-gray-500">
              {da ? 'Et komplet overblik over hvad der er inkluderet i hver plan.' : 'A complete breakdown of what\'s included in each plan.'}
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_100px_100px] border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div />
              <div className="text-center text-sm font-bold text-primary-800">Solo</div>
              <div className="text-center text-sm font-bold text-accent-700">Company</div>
            </div>

            {FEATURE_GROUPS.map((group) => (
              <div key={group.heading.en}>
                {/* Group heading */}
                <div className="border-b border-gray-100 bg-gray-50/80 px-6 py-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    {da ? group.heading.da : group.heading.en}
                  </span>
                </div>
                {/* Rows */}
                {group.rows.map((row, i) => (
                  <div
                    key={row.label.en}
                    className={`grid grid-cols-[1fr_100px_100px] items-center border-b border-gray-100 px-6 py-3.5 ${
                      i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                    }`}
                  >
                    <span className="text-sm text-gray-700">{da ? row.label.da : row.label.en}</span>
                    <div className="flex justify-center">
                      <FeatureCell value={row.solo}    da={da} />
                    </div>
                    <div className="flex justify-center">
                      <FeatureCell value={row.company} da={da} />
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* CTA footer row */}
            <div className="grid grid-cols-[1fr_100px_100px] items-center border-t border-gray-200 bg-gray-50 px-6 py-5">
              <div />
              <div className="flex justify-center">
                <a
                  href={registerUrl}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-primary-800 transition hover:border-accent-400 hover:text-accent-700"
                  onClick={() => pushCtaClick({ ctaType: 'register', ctaLabel: 'Solo CTA table', linkUrl: registerUrl, location: 'pricing_table_solo' })}
                >
                  {da ? 'Start gratis' : 'Start free'}
                </a>
              </div>
              <div className="flex justify-center">
                <a
                  href={registerProUrl}
                  className="rounded-xl bg-accent-600 px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-accent-700"
                  onClick={() => pushCtaClick({ ctaType: 'register', ctaLabel: 'Company CTA table', linkUrl: registerProUrl, location: 'pricing_table_company' })}
                >
                  {da ? 'Prøv gratis' : 'Try free'}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-[#0d2020] to-[#060f0f] py-20 text-center">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            {da ? 'Klar til at komme i gang?' : 'Ready to get started?'}
          </h2>
          <p className="mt-4 text-teal-100/70">
            {da
              ? 'Opret din gratis konto i dag. Ingen kreditkort. Ingen binding.'
              : 'Create your free account today. No credit card. No lock-in.'}
          </p>
          <a
            href={registerUrl}
            className="btn-primary mt-8 inline-block px-8 py-4 text-base"
            onClick={() => pushCtaClick({ ctaType: 'register', ctaLabel: 'Bottom CTA', linkUrl: registerUrl, location: 'pricing_bottom' })}
          >
            {da ? 'Opret gratis konto' : 'Create free account'}
          </a>
        </div>
      </section>

      <Footer />
    </>
  )
}
