'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from 'react'
import { usePathname } from 'next/navigation'
import { marketingImages } from '../config/marketingImages'
import {
  ArrowRightIcon,
  Bars3Icon,
  BellAlertIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  LifebuoyIcon,
  MapIcon,
  ScaleIcon,
  Squares2X2Icon,
  UserGroupIcon,
  UsersIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import {
  getLocaleFromPathname,
  withAppLanguageParam,
  withLocalePath,
} from '../lib/i18n'
import { pushCtaClick } from '../lib/dataLayer'
import { INDUSTRIES } from '../lib/industries/data'
import { DA_INDUSTRY_TRANSLATIONS } from '../lib/industries/da-translations'
import { COMPARISON_PAGES } from '../lib/comparisons/data'
import { DA_COMPARISON_TRANSLATIONS } from '../lib/comparisons/da-translations'

type IconType = ComponentType<SVGProps<SVGSVGElement>>

type MenuKey = 'platform' | 'solutions' | 'resources' | null

type NavItem = {
  title: string
  description: string
  href: string
  icon: IconType
  badge?: string
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSection, setMobileSection] = useState<MenuKey>(null)
  const [openMenu, setOpenMenu] = useState<MenuKey>(null)
  const [scrolled, setScrolled] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathname = usePathname()
  const locale = getLocaleFromPathname(pathname || '/')
  const da = locale === 'da'
  const navHref = (href: string) => withLocalePath(locale, href)
  const loginHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/login')
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')
  const helpHref = 'https://help.pathpilo.com/'

  const platformItems: NavItem[] = [
    {
      title: da ? 'Ruteplanlægning' : 'Route Planning',
      description: da ? 'Kort, AI-ruter og live ETA.' : 'Map, AI routes, and live ETA.',
      href: navHref('/features/routeplanning'),
      icon: MapIcon,
    },
    {
      title: da ? 'Opgaveplanlægning' : 'Job Scheduling',
      description: da ? 'Ugekalender med træk-og-slip.' : 'Week calendar with drag-and-drop.',
      href: navHref('/features/scheduling'),
      icon: CalendarDaysIcon,
    },
    {
      title: da ? 'Abonnementsopgaver' : 'Recurring Jobs',
      description: da ? 'Tilbagevendende arbejde automatisk.' : 'Recurring work on autopilot.',
      href: navHref('/features/subscriptions'),
      icon: DocumentTextIcon,
    },
    {
      title: da ? 'Leadformularer' : 'Lead Forms',
      description: da ? 'Fang tilbudsanmodninger fra websitet.' : 'Capture quote requests from your site.',
      href: navHref('/features/leads'),
      icon: UsersIcon,
    },
    {
      title: da ? 'Kundepåmindelser' : 'Client Reminders',
      description: da ? 'Emails og SMS der stopper no-shows.' : 'Email and SMS that cut no-shows.',
      href: navHref('/features/reminders'),
      icon: BellAlertIcon,
    },
    {
      title: da ? 'Teamstyring' : 'Team Management',
      description: da ? 'Medarbejdere, timer og live status.' : 'Employees, hours, and live progress.',
      href: navHref('/features/team'),
      icon: UserGroupIcon,
    },
    {
      title: da ? 'Ydelser' : 'Service Catalog',
      description: da ? 'Pris og varighed klar til jobs.' : 'Price and duration ready for jobs.',
      href: navHref('/features/services'),
      icon: Squares2X2Icon,
    },
    {
      title: da ? 'Dashboard & statistik' : 'Analytics',
      description: da ? 'Omsætning, jobs og teamoverblik.' : 'Revenue, jobs, and team overview.',
      href: navHref('/features/analytics'),
      icon: ChartBarIcon,
    },
  ]

  const solutionItems: NavItem[] = INDUSTRIES.map((ind) => ({
    title:
      (da && DA_INDUSTRY_TRANSLATIONS[ind.slug]?.menuLabel) ||
      ind.menuLabel,
    description:
      (da && DA_INDUSTRY_TRANSLATIONS[ind.slug]?.menuBlurb) ||
      ind.menuBlurb,
    href: withLocalePath(locale, `/industries/${ind.slug}`),
    icon: WrenchScrewdriverIcon,
  }))

  const resourceItems: NavItem[] = [
    {
      title: da ? 'Gratis ruteplanlægger' : 'Free route planner',
      description: da ? 'Planlæg på kortet — ingen login.' : 'Plan on a map — no sign-up.',
      href: navHref('/tools/route-planner'),
      icon: MapIcon,
      badge: da ? 'Gratis' : 'Free',
    },
    {
      title: da ? 'Artikler' : 'Articles',
      description: da ? 'Guides til servicevirksomheder.' : 'Guides for service businesses.',
      href: navHref('/articles'),
      icon: BookOpenIcon,
    },
    {
      title: da ? 'Sammenligninger' : 'Comparisons',
      description: da ? 'PathPilo vs. andre systemer.' : 'PathPilo vs other platforms.',
      href: withLocalePath(locale, '/comparisons'),
      icon: ScaleIcon,
    },
    {
      title: da ? 'Hjælpecenter' : 'Help Center',
      description: da ? 'Sådan bruger du PathPilo.' : 'How to use PathPilo.',
      href: helpHref,
      icon: LifebuoyIcon,
    },
  ]

  const open = (key: MenuKey) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpenMenu(key)
  }
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpenMenu(null), 120)
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setMobileSection(null)
    setOpenMenu(null)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  const navBtn = (active: boolean) =>
    `inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
      active
        ? 'bg-primary-50 text-primary-800'
        : 'text-gray-600 hover:bg-gray-50 hover:text-primary-800'
    }`

  return (
    <header
      className={`sticky top-0 z-[70] border-b bg-white transition-shadow duration-300 ${
        scrolled || openMenu ? 'border-gray-200/80 shadow-sm' : 'border-transparent'
      }`}
    >
      <nav className="relative mx-auto max-w-7xl px-4 md:px-6">
        {/* Desktop */}
        <div className="hidden h-16 items-center justify-between gap-6 lg:flex">
          <div className="flex min-w-0 items-center gap-1">
            <Link href={navHref('/')} className="mr-4 flex shrink-0 items-center py-1">
              <Image
                src={marketingImages.brand.logoHeader}
                alt="PathPilo"
                width={180}
                height={44}
                className="h-8 w-auto"
                priority
              />
            </Link>

            <div
              className="relative"
              onMouseEnter={() => open('platform')}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                className={navBtn(openMenu === 'platform')}
                aria-expanded={openMenu === 'platform'}
                onClick={() => setOpenMenu(openMenu === 'platform' ? null : 'platform')}
              >
                {da ? 'Platform' : 'Platform'}
                <ChevronDownIcon
                  className={`h-3.5 w-3.5 transition-transform ${openMenu === 'platform' ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            <div
              className="relative"
              onMouseEnter={() => open('solutions')}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                className={navBtn(openMenu === 'solutions')}
                aria-expanded={openMenu === 'solutions'}
                onClick={() => setOpenMenu(openMenu === 'solutions' ? null : 'solutions')}
              >
                {da ? 'Løsninger' : 'Solutions'}
                <ChevronDownIcon
                  className={`h-3.5 w-3.5 transition-transform ${openMenu === 'solutions' ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            <div
              className="relative"
              onMouseEnter={() => open('resources')}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                className={navBtn(openMenu === 'resources')}
                aria-expanded={openMenu === 'resources'}
                onClick={() => setOpenMenu(openMenu === 'resources' ? null : 'resources')}
              >
                {da ? 'Ressourcer' : 'Resources'}
                <ChevronDownIcon
                  className={`h-3.5 w-3.5 transition-transform ${openMenu === 'resources' ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            <Link href={navHref('/pricing')} className={navBtn(false)}>
              {da ? 'Priser' : 'Pricing'}
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <a
              href={loginHref}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-primary-800"
            >
              {da ? 'Log ind' : 'Log in'}
            </a>
            <Link
              href={registerHref}
              className="inline-flex items-center rounded-full bg-primary-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
              onClick={() =>
                pushCtaClick({
                  ctaType: 'register',
                  ctaLabel: da ? 'Opret gratis' : 'Start free',
                  linkUrl: registerHref,
                  location: 'header',
                })
              }
            >
              {da ? 'Opret gratis' : 'Start free'}
            </Link>
          </div>
        </div>

        {/* Desktop megamenu panel */}
        {openMenu && (
          <div
            className="absolute inset-x-0 top-full z-50 hidden lg:block"
            onMouseEnter={() => open(openMenu)}
            onMouseLeave={scheduleClose}
          >
            <div className="border-t border-gray-100 bg-white shadow-[0_20px_50px_-24px_rgba(15,40,40,0.35)]">
              <div className="mx-auto max-w-7xl px-6 py-8">
                {openMenu === 'platform' && (
                  <MegaPanel
                    eyebrow={da ? 'Platform' : 'Platform'}
                    title={da ? 'Alt til at drive din servicevirksomhed' : 'Everything to run your service business'}
                    items={platformItems}
                    columns={3}
                    promo={{
                      title: da ? 'Prøv gratis ruteplanlægger' : 'Try the free route planner',
                      body: da
                        ? 'Planlæg en rute i browseren — uden konto.'
                        : 'Plan a route in the browser — no account needed.',
                      href: navHref('/tools/route-planner'),
                      cta: da ? 'Åbn værktøjet' : 'Open the tool',
                    }}
                  />
                )}
                {openMenu === 'solutions' && (
                  <MegaPanel
                    eyebrow={da ? 'Løsninger' : 'Solutions'}
                    title={da ? 'Bygget til din branche' : 'Built for your trade'}
                    items={solutionItems}
                    columns={2}
                    promo={{
                      title: da ? 'Se alle brancher' : 'See all industries',
                      body: da
                        ? 'Ruteplanlægning, påmindelser og fakturering tilpasset dit fag.'
                        : 'Route planning, reminders, and invoicing tailored to your trade.',
                      href: withLocalePath(locale, '/industries'),
                      cta: da ? 'Udforsk brancher' : 'Browse industries',
                    }}
                  />
                )}
                {openMenu === 'resources' && (
                  <MegaPanel
                    eyebrow={da ? 'Ressourcer' : 'Resources'}
                    title={da ? 'Lær, sammenlign og prøv' : 'Learn, compare, and try'}
                    items={resourceItems}
                    columns={2}
                    footerLinks={[
                      ...COMPARISON_PAGES.slice(0, 3).map((c) => ({
                        label:
                          (da && DA_COMPARISON_TRANSLATIONS[c.slug]?.headline) || c.headline,
                        href: withLocalePath(locale, `/comparisons/${c.slug}`),
                      })),
                    ]}
                    footerLabel={da ? 'Populære sammenligninger' : 'Popular comparisons'}
                    promo={{
                      title: da ? 'Hjælp når du skal bruge det' : 'Help when you need it',
                      body: da
                        ? 'Guides og svar fra PathPilo-teamet.'
                        : 'Guides and answers from the PathPilo team.',
                      href: helpHref,
                      cta: da ? 'Åbn hjælpecenter' : 'Open help center',
                      external: true,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mobile top bar */}
        <div className="flex h-14 items-center justify-between lg:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg p-2 text-gray-700 hover:bg-gray-50"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
            <Link href={navHref('/')} className="flex items-center">
              <Image
                src={marketingImages.brand.logoHeader}
                alt="PathPilo"
                width={150}
                height={38}
                className="h-7 w-auto"
                priority
              />
            </Link>
          </div>
          <Link
            href={registerHref}
            className="rounded-full bg-primary-800 px-3.5 py-1.5 text-sm font-semibold text-white"
            onClick={() =>
              pushCtaClick({
                ctaType: 'register',
                ctaLabel: da ? 'Opret gratis' : 'Start free',
                linkUrl: registerHref,
                location: 'header_mobile_top',
              })
            }
          >
            {da ? 'Opret gratis' : 'Start free'}
          </Link>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 top-14 z-[65] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-x-0 top-0 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-gray-200 bg-white shadow-xl">
            <div className="space-y-1 px-3 py-3">
              <MobileAccordion
                label={da ? 'Platform' : 'Platform'}
                open={mobileSection === 'platform'}
                onToggle={() => setMobileSection(mobileSection === 'platform' ? null : 'platform')}
                items={platformItems}
              />
              <MobileAccordion
                label={da ? 'Løsninger' : 'Solutions'}
                open={mobileSection === 'solutions'}
                onToggle={() => setMobileSection(mobileSection === 'solutions' ? null : 'solutions')}
                items={solutionItems}
              />
              <MobileAccordion
                label={da ? 'Ressourcer' : 'Resources'}
                open={mobileSection === 'resources'}
                onToggle={() => setMobileSection(mobileSection === 'resources' ? null : 'resources')}
                items={resourceItems}
              />
              <Link
                href={navHref('/pricing')}
                className="block rounded-xl px-3 py-3 text-sm font-semibold text-primary-800 hover:bg-gray-50"
              >
                {da ? 'Priser' : 'Pricing'}
              </Link>
              <Link
                href={navHref('/contact')}
                className="block rounded-xl px-3 py-3 text-sm font-semibold text-primary-800 hover:bg-gray-50"
              >
                {da ? 'Kontakt' : 'Contact'}
              </Link>
            </div>
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={loginHref}
                  className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-primary-800"
                >
                  {da ? 'Log ind' : 'Log in'}
                </a>
                <a
                  href={registerHref}
                  className="inline-flex items-center justify-center rounded-full bg-primary-800 px-3 py-2.5 text-sm font-semibold text-white"
                >
                  {da ? 'Opret gratis' : 'Start free'}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

function MegaPanel({
  eyebrow,
  title,
  items,
  columns = 3,
  promo,
  footerLinks,
  footerLabel = 'Popular',
}: {
  eyebrow: string
  title: string
  items: NavItem[]
  columns?: 2 | 3
  promo?: { title: string; body: string; href: string; cta: string; external?: boolean }
  footerLinks?: { label: string; href: string }[]
  footerLabel?: string
}) {
  const grid =
    columns === 3
      ? 'sm:grid-cols-2 lg:grid-cols-3'
      : 'sm:grid-cols-2'

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-600">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-bold text-primary-800">{title}</h2>
        <div className={`mt-6 grid gap-1 ${grid}`}>
          {items.map((item) => (
            <MegaLink key={item.href} item={item} />
          ))}
        </div>
        {footerLinks && footerLinks.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              {footerLabel}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {footerLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm text-gray-500 transition hover:text-primary-800"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {promo && (
        <div className="rounded-2xl bg-primary-800 p-6 text-white">
          <p className="text-lg font-bold leading-snug">{promo.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-white/70">{promo.body}</p>
          {promo.external ? (
            <a
              href={promo.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-400 hover:text-accent-300"
            >
              {promo.cta}
              <ArrowRightIcon className="h-4 w-4" />
            </a>
          ) : (
            <Link
              href={promo.href}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-400 hover:text-accent-300"
            >
              {promo.cta}
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function MegaLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  const external = item.href.startsWith('http')
  const className =
    'group flex gap-3 rounded-xl p-3 transition-colors hover:bg-primary-50'
  const inner = (
    <>
      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-primary-100 bg-white text-primary-800 group-hover:border-accent-300 group-hover:text-accent-700">
        <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-primary-800">{item.title}</span>
          {item.badge && (
            <span className="rounded-full bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-700">
              {item.badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{item.description}</span>
      </span>
    </>
  )

  if (external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={item.href} className={className}>
      {inner}
    </Link>
  )
}

function MobileAccordion({
  label,
  open,
  onToggle,
  items,
}: {
  label: string
  open: boolean
  onToggle: () => void
  items: NavItem[]
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold text-primary-800 hover:bg-gray-50"
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mb-2 space-y-0.5 rounded-xl bg-gray-50 p-2">
          {items.map((item) => {
            const Icon = item.icon
            const external = item.href.startsWith('http')
            const content = (
              <>
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-700" />
                <span>
                  <span className="block font-semibold text-primary-800">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{item.description}</span>
                </span>
              </>
            )
            if (external) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 rounded-lg px-3 py-2.5 hover:bg-white"
                >
                  {content}
                </a>
              )
            }
            return (
              <Link key={item.href} href={item.href} className="flex gap-3 rounded-lg px-3 py-2.5 hover:bg-white">
                {content}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
