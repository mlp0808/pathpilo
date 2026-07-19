import Image from 'next/image'
import Header from '../Header'
import Footer from '../Footer'
import Reveal from './Reveal'
import Mockup from './Mockups'
import HeroVisual from './HeroVisual'
import IndustryCTA from './IndustryCTA'
import CountUpStats from './CountUpStats'
import RevenueCalculator from './RevenueCalculator'
import TestimonialsCarousel from './TestimonialsCarousel'
import IndustryFAQ from './IndustryFAQ'
import ComparisonSection from './ComparisonSection'
import type { IconKey, Industry } from '../../lib/industries/types'
import {
  MapIcon,
  MapPinIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
  DevicePhoneMobileIcon,
  CalendarDaysIcon,
  UsersIcon,
  BellAlertIcon,
  CreditCardIcon,
  ChartBarIcon,
  SparklesIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import type { ComponentType, SVGProps } from 'react'

const ICONS: Record<IconKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  route: MapIcon,
  map: MapPinIcon,
  clock: ClockIcon,
  chat: ChatBubbleLeftRightIcon,
  invoice: DocumentTextIcon,
  form: ClipboardDocumentCheckIcon,
  phone: DevicePhoneMobileIcon,
  calendar: CalendarDaysIcon,
  users: UsersIcon,
  bell: BellAlertIcon,
  card: CreditCardIcon,
  chart: ChartBarIcon,
  sparkles: SparklesIcon,
  check: CheckCircleIcon,
}

export default function IndustryLanding({ data, locale = 'en' }: { data: Industry; locale?: string }) {
  const da = locale === 'da'
  return (
    <>
      <Header />

      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden bg-[#0a1414]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]" aria-hidden />
        <div className="pointer-events-none absolute -right-1/4 top-0 h-[520px] w-[520px] rounded-full bg-accent-500/10 blur-[120px]" aria-hidden />
        <div className="pointer-events-none absolute -left-1/4 bottom-0 h-[380px] w-[380px] rounded-full bg-teal-600/5 blur-[100px]" aria-hidden />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-14 pb-16 sm:px-6 md:pt-20 md:pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent-400">
                {data.hero.eyebrow}
              </h2>
              <h1 className="text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-4xl md:text-5xl">
                {data.hero.h1}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-gray-300 sm:text-lg lg:max-w-lg">
                {data.hero.sub}
              </p>

              <div className="mt-9 flex flex-col items-stretch gap-3 sm:mx-auto sm:max-w-md sm:flex-row sm:items-center sm:justify-center lg:mx-0 lg:justify-start">
                <IndustryCTA label={da ? 'Kom i gang gratis' : 'Get started free'} location="industry_hero" industry={data.slug} />
                <a
                  href="#how"
                  className="inline-flex justify-center py-2 text-base font-semibold text-white/90 underline decoration-white/30 underline-offset-4 transition hover:text-white"
                >
                  {da ? 'Se hvordan det virker' : 'See how it works'}
                </a>
              </div>

              <p className="mt-6 text-sm text-white/50">{data.hero.trustLine}</p>
            </div>

            <div className="w-full">
              <HeroVisual src={data.hero.image} alt={data.hero.imageAlt || data.hero.h1} />
            </div>
          </div>
        </div>
      </section>

      {/* ─── TRUST BAR ─── */}
      <section className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <p className="text-center text-sm font-medium text-gray-500">{data.trustBar.label}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            {data.trustBar.points.map((p) => (
              <span key={p} className="inline-flex items-center gap-2 text-sm font-semibold text-primary-800">
                <CheckCircleIcon className="h-5 w-5 text-accent-500" />
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PAIN ─── */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
            <h2 className="section-title">{data.pain.title}</h2>
            <p className="section-subtitle mx-auto mb-0">{data.pain.sub}</p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.pain.items.map((item, i) => (
              <Reveal key={item} delay={i * 60} className="h-full">
                <div className="flex h-full items-start gap-3 rounded-2xl border border-gray-200/80 bg-gray-50/60 p-5">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 10-1.4-1.4L10 8.6 8.7 7.3z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  <p className="text-[15px] leading-relaxed text-gray-700">{item}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── MID-PAGE PHOTO BREAK (optional) ─── */}
      {data.midpagePhoto && (
        <div className="relative h-[340px] overflow-hidden sm:h-[420px] md:h-[480px]">
          <Image
            src={data.midpagePhoto.src}
            alt={data.midpagePhoto.alt}
            fill
            className="object-cover object-top"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          {data.midpagePhoto.caption && (
            <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-sm font-medium text-white/90">
              {data.midpagePhoto.caption}
            </p>
          )}
        </div>
      )}

      {/* ─── OUTCOMES ─── */}
      <section id="how" className="bg-gradient-to-b from-white via-primary-50/40 to-white py-16 md:py-24">
        <div className="mx-auto max-w-6xl space-y-16 px-4 sm:px-6 md:space-y-28">
          {data.outcomes.map((o, i) => {
            const flip = i % 2 === 1
            return (
              <Reveal key={o.title}>
                <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                  <div className={flip ? 'lg:order-2' : ''}>
                    <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">{o.eyebrow}</p>
                    <h3 className="text-2xl font-bold text-primary-800 md:text-3xl lg:text-4xl">{o.title}</h3>
                    <p className="mt-4 text-base leading-relaxed text-gray-600 md:text-lg">{o.body}</p>
                    <ul className="mt-6 space-y-3">
                      {o.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-3">
                          <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-500" />
                          <span className="text-[15px] text-gray-700">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={flip ? 'lg:order-1' : ''}>
                    {o.video ? (
                      <div className="relative overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-xl">
                        <video
                          className="h-auto w-full"
                          autoPlay
                          muted
                          loop
                          playsInline
                          poster={o.videoPoster}
                        >
                          <source src={o.video} type="video/mp4" />
                        </video>
                      </div>
                    ) : o.image ? (
                      o.imagePlain ? (
                        <div className="overflow-hidden rounded-2xl">
                          <Image
                            src={o.image}
                            alt={o.imageAlt || o.title}
                            width={900}
                            height={600}
                            className="h-auto w-full object-cover"
                            sizes="(max-width: 1024px) 100vw, 50vw"
                          />
                        </div>
                      ) : (
                        <div className="relative overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-xl">
                          <Image
                            src={o.image}
                            alt={o.imageAlt || o.title}
                            width={900}
                            height={600}
                            className="h-auto w-full object-cover"
                            sizes="(max-width: 1024px) 100vw, 50vw"
                          />
                        </div>
                      )
                    ) : (
                      <Mockup visual={o.visual} />
                    )}
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* ─── CALCULATOR (optional) ─── */}
      {data.calculator && (
        <section className="bg-white py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <Reveal className="mx-auto mb-10 max-w-2xl text-center">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
                {data.calculator.eyebrow}
              </p>
              <h2 className="section-title">{data.calculator.title}</h2>
              <p className="section-subtitle mx-auto mb-0">{data.calculator.sub}</p>
            </Reveal>
            <Reveal>
              <RevenueCalculator config={data.calculator} locale={locale} />
            </Reveal>
          </div>
        </section>
      )}

      {/* ─── STATS (dark) ─── */}
      <section className="relative overflow-hidden bg-[#0a1414] py-16 md:py-20">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]" aria-hidden />
        <div className="pointer-events-none absolute -right-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-accent-500/10 blur-[120px]" aria-hidden />
        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
          <CountUpStats stats={data.stats} />
        </div>
      </section>

      {/* ─── FEATURE GRID ─── */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {data.featureGrid.eyebrow}
            </p>
            <h2 className="section-title">{data.featureGrid.title}</h2>
            <p className="section-subtitle mx-auto mb-0">{data.featureGrid.sub}</p>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
            {data.featureGrid.items.map((f, i) => {
              const Icon = ICONS[f.icon] ?? CheckCircleIcon
              return (
                <Reveal key={f.title} delay={(i % 4) * 70} className="h-full">
                  <div className="group h-full rounded-2xl border border-gray-200/90 bg-white p-6 transition-all duration-300 hover:border-primary-200 hover:shadow-lg">
                    <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary-800">
                      <Icon className="h-6 w-6 stroke-[1.8]" />
                    </div>
                    <h3 className="mb-1.5 text-lg font-bold text-primary-800">{f.title}</h3>
                    <p className="text-sm leading-relaxed text-gray-600">{f.text}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="bg-primary-50 py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="section-title">{data.testimonials.title}</h2>
            <p className="section-subtitle mx-auto mb-0">{data.testimonials.sub}</p>
          </Reveal>
          <Reveal>
            <TestimonialsCarousel items={data.testimonials.items} />
          </Reveal>
        </div>
      </section>

      {/* ─── COMPARISON ─── */}
      {data.comparison && (
        <ComparisonSection data={data.comparison} detailHref={data.comparison.detailHref} locale={locale} />
      )}

      {/* ─── FREE PLAN ─── */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <Reveal>
            <div className="overflow-hidden rounded-3xl border border-primary-100 bg-gradient-to-br from-primary-50 to-white shadow-lg">
              <div className="grid gap-8 p-8 sm:p-12 md:grid-cols-2 md:items-center">
                <div>
                  <span className="inline-flex items-center rounded-full bg-accent-500 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                    {da ? 'Gratis for altid' : 'Free forever plan'}
                  </span>
                  <h2 className="mt-4 text-3xl font-bold text-primary-800 md:text-4xl">{data.freePlan.title}</h2>
                  <p className="mt-3 text-gray-600">{data.freePlan.sub}</p>
                  <div className="mt-6">
                    <IndustryCTA label={da ? 'Start gratis nu' : 'Start free now'} location="industry_free_plan" industry={data.slug} />
                  </div>
                  <p className="mt-4 text-sm text-gray-500">{data.freePlan.note}</p>
                </div>
                <ul className="space-y-3">
                  {data.freePlan.includes.map((inc) => (
                    <li key={inc} className="flex items-start gap-3">
                      <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-500" />
                      <span className="text-[15px] font-medium text-primary-800">{inc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="bg-primary-50 py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
            <h2 className="section-title">{data.faq.title}</h2>
            <p className="section-subtitle mx-auto mb-0">{data.faq.sub}</p>
          </Reveal>
          <Reveal>
            <IndustryFAQ items={data.faq.items} />
          </Reveal>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="relative overflow-hidden bg-[#0a1414] py-20 md:py-28">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-accent-500/10 blur-[120px]" aria-hidden />
        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white md:text-4xl lg:text-5xl">{data.finalCta.title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-300">{data.finalCta.sub}</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <IndustryCTA label={da ? 'Kom i gang gratis' : 'Get started free'} location="industry_final_cta" industry={data.slug} variant="light" />
            <a
              href="/articles"
              className="inline-flex items-center justify-center py-2 text-base font-semibold text-white/90 underline decoration-white/30 underline-offset-4 transition hover:text-white"
            >
              {da ? 'Læs guiderne' : 'Read the guides'}
            </a>
          </div>
          <p className="mt-6 text-sm text-white/50">{data.hero.trustLine}</p>
        </div>
      </section>

      <Footer />
    </>
  )
}
