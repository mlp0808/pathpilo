'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import CTASection from '../../components/CTASection'
import FeaturePageAnalytics from '../../components/FeaturePageAnalytics'
import FeatureMedia from '../../components/FeatureMedia'
import Breadcrumbs, { BREADCRUMB_ON_DARK } from '../../components/Breadcrumbs'
import { marketingImages } from '../../config/marketingImages'
import { breadcrumbsForRoute } from '../../lib/breadcrumbs'
import { resolveMarketingLocale, withAppLanguageParam } from '../../lib/i18n'
import { pushCtaClick } from '../../lib/dataLayer'
import {
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  CodeBracketIcon,
  EnvelopeIcon,
  PaintBrushIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'

export default function LeadFormsFeaturePage({ locale: localeProp = 'en' }: { locale?: string }) {
  const pathname = usePathname()
  const locale = resolveMarketingLocale(pathname, localeProp)
  const da = locale === 'da'
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')

  return (
    <>
      <FeaturePageAnalytics featureKey="leads" />
      <Header />

      <section className="relative overflow-hidden bg-[#0a1414]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]" aria-hidden />
        <div className="pointer-events-none absolute -right-1/4 top-0 h-[520px] w-[520px] rounded-full bg-accent-500/10 blur-[120px]" aria-hidden />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 md:pt-20 md:pb-24">
          <Breadcrumbs
            items={breadcrumbsForRoute(locale, 'features/leads')}
            className={BREADCRUMB_ON_DARK}
          />
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent-400">
                {da ? 'Leadformularer' : 'Lead forms'}
              </p>
              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
                {da
                  ? 'Få flere tilbudsanmodninger direkte ind i PathPilo'
                  : 'Get more quote requests straight into PathPilo'}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg">
                {da
                  ? 'Byg en branded leadformular, del den på din hjemmeside, og konvertér henvendelser til kunder og jobs — uden at miste dem i indbakken.'
                  : 'Build a branded lead form, put it on your website, and convert enquiries into clients and jobs — without losing them in your inbox.'}
              </p>
              <ul className="mt-8 space-y-3 text-left">
                {(da
                  ? [
                      'Tilpas felter, farver og tekst til dit brand',
                      'Del via link eller indlejring på websitet',
                      'Konvertér leads til kunder og opret jobs med ét klik',
                    ]
                  : [
                      'Customise fields, colours, and copy to match your brand',
                      'Share via link or embed on your website',
                      'Convert leads to clients and create jobs in one click',
                    ]
                ).map((line) => (
                  <li key={line} className="flex gap-3 text-sm text-gray-300 sm:text-base">
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-400" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-10">
                <Link
                  href={registerHref}
                  className="btn-primary inline-flex justify-center !px-6 !py-3 !text-base hover:!scale-100"
                  onClick={() =>
                    pushCtaClick({
                      ctaType: 'register',
                      ctaLabel: da ? 'Kom i gang gratis' : 'Get Started Free',
                      linkUrl: registerHref,
                      location: 'feature_hero',
                      featureKey: 'leads',
                    })
                  }
                >
                  {da ? 'Kom i gang gratis' : 'Get Started Free'}
                </Link>
              </div>
            </div>
            <div className="flex w-full justify-center lg:justify-end">
              <FeatureMedia
                src={marketingImages.features.leads}
                alt={da ? 'PathPilo leadformular' : 'PathPilo lead form'}
                className="max-h-[min(42vh,380px)] max-w-xl lg:max-h-none lg:max-w-none"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-white via-primary-50/40 to-primary-50/80 py-16 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Funktioner' : 'Capabilities'}
            </p>
            <h2 className="section-title">
              {da ? 'Fra henvendelse til booket job' : 'From enquiry to booked job'}
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {(
              [
                {
                  icon: PaintBrushIcon,
                  title: da ? 'Branded formular' : 'Branded form builder',
                  text: da
                    ? 'Vælg felter, tema og tekst, så formularen matcher dit firma.'
                    : 'Choose fields, theme, and copy so the form matches your business.',
                },
                {
                  icon: CodeBracketIcon,
                  title: da ? 'Link eller indlejring' : 'Link or embed',
                  text: da
                    ? 'Del et link på Facebook, eller indlejr formularen på din hjemmeside.'
                    : 'Share a link on social, or embed the form on your website.',
                },
                {
                  icon: EnvelopeIcon,
                  title: da ? 'Notifikation ved ny lead' : 'Notify on new leads',
                  text: da
                    ? 'Få besked med det samme, så du kan svare mens kunden stadig er varm.'
                    : 'Get notified instantly so you can reply while the lead is still warm.',
                },
                {
                  icon: ClipboardDocumentCheckIcon,
                  title: da ? 'Lead-pipeline' : 'Lead pipeline',
                  text: da
                    ? 'Følg status: ny, kontaktet, vundet eller tabt.'
                    : 'Track status: new, contacted, won, or lost.',
                },
                {
                  icon: UserPlusIcon,
                  title: da ? 'Konvertér til kunde' : 'Convert to client',
                  text: da
                    ? 'Opret kunden i PathPilo og start et job uden at taste alt ind igen.'
                    : 'Create the client in PathPilo and start a job without retyping everything.',
                },
                {
                  icon: CheckCircleIcon,
                  title: da ? 'Ønsket dato/tid' : 'Preferred date & time',
                  text: da
                    ? 'Lad kunden angive et ønsket tidspunkt — du booker det, der passer.'
                    : 'Let customers suggest a preferred time — you book what fits.',
                },
              ] as const
            ).map((card) => (
              <article key={card.title} className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-sm md:p-8">
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-primary-200 bg-white text-primary-800">
                  <card.icon className="h-6 w-6 stroke-[1.8]" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-primary-800">{card.title}</h3>
                <p className="leading-relaxed text-gray-600">{card.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="section-title text-left">
                {da ? 'Ikke et booking-system — et lead-system' : 'Not a booking engine — a lead system'}
              </h2>
              <p className="mt-4 text-gray-600 leading-relaxed">
                {da
                  ? 'PathPilos leadformular er bygget til servicevirksomheder, der selv styrer kalenderen. Kunden sender en anmodning; du beslutter hvornår det passer — så undgår du dobbeltbookinger og urealistiske forventninger.'
                  : 'PathPilo’s lead form is built for service businesses that control their own calendar. Customers send a request; you decide when it fits — so you avoid double-bookings and false expectations.'}
              </p>
            </div>
            <FeatureMedia
              src="/images/features/leads-detail.webp"
              alt={da ? 'PathPilo leadformular detalje' : 'PathPilo lead form detail'}
              width={1200}
              height={800}
            />
          </div>
        </div>
      </section>

      <CTASection
        title={da ? 'Stop med at miste leads i indbakken' : 'Stop losing leads in your inbox'}
        subtitle={
          da
            ? 'Opret din leadformular gratis og få henvendelser ind hvor du allerede planlægger jobs.'
            : 'Create your lead form free and get enquiries where you already schedule jobs.'
        }
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt os' : 'Contact Us'}
        secondaryLink="/contact"
        analyticsLocation="cta_section_feature"
        featureKey="leads"
      />
      <Footer />
    </>
  )
}
