'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { marketingImages } from '../config/marketingImages'
import { getLocaleFromPathname, withAppLanguageParam, withLocalePath } from '../lib/i18n'
import { pushCtaClick } from '../lib/dataLayer'

const COLLAGE = {
  main: marketingImages.hero.collageMain,
  top: marketingImages.hero.collageTop,
  bottom: marketingImages.hero.collageBottom,
} as const

export default function HeroSection() {
  const pathname = usePathname()
  const locale = getLocaleFromPathname(pathname || '/')
  const da = locale === 'da'
  return (
    <section className="hero-section relative -mt-[76px] overflow-hidden bg-[#0a1414] pt-[92px] pb-20 md:-mt-[84px] md:pt-[112px] md:pb-28 lg:pt-[124px] lg:pb-32">
      {/* Background: depth + brand teal */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-1/4 top-0 h-[600px] w-[600px] rounded-full bg-accent-500/10 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-teal-600/5 blur-[100px]"
        aria-hidden
      />
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Copy */}
          <div className="max-w-xl lg:max-w-none">
            <p className="mb-4 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-accent-400 backdrop-blur-sm">
              {da ? 'Bygget til teams i marken' : 'Built for teams in the field'}
            </p>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-5xl lg:text-[3.25rem] xl:text-6xl">
              {da ? 'Driv din servicevirksomhed' : 'Run your service company'}
              <span className="mt-2 block bg-gradient-to-r from-accent-400 to-emerald-300 bg-clip-text text-transparent">
                {da ? 'fra varevognen til kontoret' : 'from the van to the office'}
              </span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-gray-400 md:text-xl">
              {da
                ? 'Planlægning, ruter, kunder og fakturering samlet ét sted - så rengøring, anlæg, håndværk og mobile teams bruger mindre tid på administration og mere tid på at få betaling.'
                : 'Scheduling, routes, clients, and invoicing in one place—so cleaners, landscapers, trades, and mobile crews spend less time on admin and more time getting paid.'}
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href={withAppLanguageParam(locale, 'https://app.pathpilo.com/register')}
                className="btn-primary inline-flex justify-center text-center text-lg px-8 py-4"
                onClick={() =>
                  pushCtaClick({
                    ctaType: 'register',
                    ctaLabel: da ? 'Kom i gang gratis' : 'Get Started Free',
                    linkUrl: withAppLanguageParam(locale, 'https://app.pathpilo.com/register'),
                    location: 'hero',
                  })
                }
              >
                {da ? 'Kom i gang gratis' : 'Get Started Free'}
              </Link>
              <Link
                href={withLocalePath(locale, '/pricing')}
                className="inline-flex justify-center rounded-xl border border-white/20 bg-white/5 px-8 py-4 text-lg font-semibold text-white backdrop-blur transition hover:border-white/30 hover:bg-white/10"
                onClick={() =>
                  pushCtaClick({
                    ctaType: 'secondary',
                    ctaLabel: da ? 'Se priser' : 'View pricing',
                    linkUrl: withLocalePath(locale, '/pricing'),
                    location: 'hero',
                  })
                }
              >
                {da ? 'Se priser' : 'View pricing'}
              </Link>
            </div>
            <p className="mt-6 text-sm text-gray-500">
              {da ? 'Gratis at komme i gang · Intet kreditkort påkrævet · Kom i gang på få minutter' : 'Free to get started · No credit card required · Set up in minutes'}
            </p>
          </div>

          {/* Collage + motion */}
          <div className="relative mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none">
            {/* Glow behind collage */}
            <div className="absolute left-1/2 top-1/2 h-[min(90%,420px)] w-[min(90%,420px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/15 blur-3xl" />

            <div className="relative aspect-[4/5] w-full max-w-md sm:aspect-[5/6] lg:ml-auto lg:max-w-none lg:pr-4">
              {/* Main panel — slow float */}
              <div
                className="animate-hero-float absolute left-0 top-[8%] z-20 w-[72%] overflow-hidden rounded-2xl shadow-2xl shadow-black/40 ring-1 ring-white/10"
                style={{ animationDelay: '0s' }}
              >
                <div className="relative aspect-[3/4] w-full">
                  <Image
                    src={COLLAGE.main.src}
                    alt={COLLAGE.main.alt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 70vw, 35vw"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a1414]/60 via-transparent to-transparent" />
                </div>
              </div>

              {/* Top-right tile */}
              <div
                className="animate-hero-float-delayed absolute right-0 top-0 z-30 w-[48%] overflow-hidden rounded-xl shadow-xl shadow-black/30 ring-1 ring-white/10"
                style={{ animationDelay: '-2s' }}
              >
                <div className="relative aspect-square w-full">
                  <Image
                    src={COLLAGE.top.src}
                    alt={COLLAGE.top.alt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 40vw, 20vw"
                  />
                </div>
              </div>

              {/* Bottom-right tile */}
              <div
                className="animate-hero-drift absolute bottom-[6%] right-[4%] z-10 w-[44%] overflow-hidden rounded-xl shadow-xl shadow-black/30 ring-1 ring-white/10"
              >
                <div className="relative aspect-[4/3] w-full">
                  <Image
                    src={COLLAGE.bottom.src}
                    alt={COLLAGE.bottom.alt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 38vw, 18vw"
                  />
                </div>
              </div>

              {/* Floating accent shapes */}
              <div className="animate-spin-slow pointer-events-none absolute -right-2 top-1/3 z-0 h-24 w-24 rounded-2xl border border-accent-500/20 bg-accent-500/5" />
              <div className="animate-spin-slow-reverse pointer-events-none absolute bottom-1/4 -left-4 z-0 h-16 w-16 rounded-full border border-white/10 bg-white/5" />
            </div>
          </div>
        </div>

        {/* Social proof — on dark */}
        <div className="mt-16 flex flex-col items-center justify-center gap-8 border-t border-white/10 pt-12 text-sm md:flex-row md:gap-12">
          <div className="flex items-center space-x-1 text-gray-400">
            {[...Array(5)].map((_, i) => (
              <svg key={i} className="h-5 w-5 fill-current text-amber-400/90" viewBox="0 0 20 20" aria-hidden>
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
            <span className="ml-2 font-semibold text-white">4.9/5</span>
            <span className="ml-1">{da ? 'fra serviceteams' : 'from service teams'}</span>
          </div>
          <div className="hidden h-6 w-px bg-white/20 md:block" />
          <p className="max-w-md text-center text-gray-400 md:text-left">
            {da ? (
              <>
                <span className="font-semibold text-gray-300">Betroet af</span> rengøringsfirmaer,
                anlægsgartnere, håndværkere og serviceteams
              </>
            ) : (
              <>
                <span className="font-semibold text-gray-300">Trusted by</span> cleaning companies,
                landscapers, trades & maintenance crews
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  )
}
