'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { marketingImages } from '../config/marketingImages'
import { Bars3Icon, ChevronDownIcon, LifebuoyIcon, XMarkIcon } from '@heroicons/react/24/outline'
import {
  getLocaleFromPathname,
  stripLocalePrefix,
  withAppLanguageParam,
  withLocalePath,
} from '../lib/i18n'
import { pushCtaClick } from '../lib/dataLayer'
import { BLOG_CATEGORIES } from '../lib/blog/taxonomy'
import { INDUSTRIES } from '../lib/industries/data'
import { DA_INDUSTRY_TRANSLATIONS } from '../lib/industries/da-translations'
import { COMPARISON_PAGES } from '../lib/comparisons/data'
import { DA_COMPARISON_TRANSLATIONS } from '../lib/comparisons/da-translations'

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileFeaturesOpen, setMobileFeaturesOpen] = useState(false)
  const [mobileLearnOpen, setMobileLearnOpen] = useState(false)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const [desktopFeaturesOpen, setDesktopFeaturesOpen] = useState(false)
  const [desktopLearnOpen, setDesktopLearnOpen] = useState(false)
  const [desktopToolsOpen, setDesktopToolsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()
  const locale = getLocaleFromPathname(pathname || '/')
  const basePath = stripLocalePrefix(pathname || '/')
  const da = locale === 'da'
  const navHref = (href: string) => withLocalePath(locale, href)
  const loginHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/login')
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')
  const helpHref = 'https://help.pathpilo.com/'
  const featureItems = [
    {
      title: da ? 'Routeplanning' : 'Route Planning',
      description: da ? 'Ugeplanlaegger, AI-ruter og live ETA-overblik.' : 'Week planner, AI routing, and live ETA impact.',
      href: navHref('/features/routeplanning'),
    },
    {
      title: da ? 'Abonnementsopgaver' : 'Subscription tasks',
      description: da
        ? 'Tilbagevendende opgaver, paamindelser, fakturering og online bekraeftelser.'
        : 'Recurring work, reminders, invoicing, and online confirmations.',
      href: navHref('/features/subscriptions'),
    },
    {
      title: da ? 'Teamstyring' : 'Team management',
      description: da
        ? 'Medarbejdere, arbejdstider, fri-anmodninger og live status fra mobilen.'
        : 'Employees, hours, time-off requests, and live progress from mobile.',
      href: navHref('/features/team'),
    },
  ]
  const toolItems = [
    {
      title: da ? 'Ruteplanlægger' : 'Route Planning',
      description: da
        ? 'Planlæg og optimér din rute gratis på et kort — ingen login.'
        : 'Plan and optimise your route free on a map — no sign-up.',
      href: navHref('/tools/route-planner'),
      badge: da ? 'Gratis' : 'Free',
    },
    {
      title: da ? 'Alle værktøjer' : 'All tools',
      description: da
        ? 'Se alle gratis PathPilo-værktøjer ét sted.'
        : 'Browse all free PathPilo tools in one place.',
      href: navHref('/tools'),
    },
  ]

  const isHome = basePath === '/'
  const isDarkTop = isHome && !scrolled
  const desktopLinkClass = `text-sm font-medium transition-colors ${
    isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
  }`
  const mobileLinkClass = `block py-2 text-sm font-medium transition-colors ${
    isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
  }`

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileMenuOpen(false)
    setMobileFeaturesOpen(false)
    setMobileLearnOpen(false)
    setMobileToolsOpen(false)
    setDesktopFeaturesOpen(false)
    setDesktopLearnOpen(false)
    setDesktopToolsOpen(false)
  }, [pathname])

  return (
    <header
      className={`sticky top-0 z-[70] transition-all duration-300 ${
        isDarkTop
          ? 'bg-black/25 backdrop-blur-sm border-b border-white/10 shadow-none'
          : 'bg-white/95 backdrop-blur-md border-b border-primary-100 shadow-sm'
      }`}
    >
      <nav className="relative max-w-7xl mx-auto px-4 md:px-6 py-3.5 md:py-4">
        <div className="hidden md:flex items-center justify-between gap-8">
          <div className="flex items-center gap-8">
            <Link href={navHref('/')} className="group flex items-center gap-2 py-1">
              <Image
                src={
                  isDarkTop
                    ? marketingImages.brand.logoHeaderWhite
                    : marketingImages.brand.logoHeader
                }
                alt="PathPilo"
                width={180}
                height={44}
                className="h-9 w-auto md:h-10 transition duration-300"
                priority
              />
            </Link>
            <div
              className="relative"
              onMouseEnter={() => setDesktopFeaturesOpen(true)}
              onMouseLeave={() => setDesktopFeaturesOpen(false)}
            >
              <button
                type="button"
                className={`inline-flex items-center gap-1 text-sm font-medium transition-colors ${
                  isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
                }`}
                onClick={() => setDesktopFeaturesOpen((v) => !v)}
                aria-expanded={desktopFeaturesOpen}
                aria-controls="desktop-features-menu"
              >
                {locale === 'da' ? 'Features' : 'Features'}
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${desktopFeaturesOpen ? 'rotate-180' : ''}`} />
              </button>

              {desktopFeaturesOpen && (
                <div
                  id="desktop-features-menu"
                  className="absolute left-0 top-full z-50 w-[min(92vw,720px)] pt-4"
                >
                  <div className="rounded-2xl border border-primary-100 bg-white shadow-xl p-4">
                    <div className="grid sm:grid-cols-2 gap-3">
                      {featureItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="rounded-xl border border-primary-100 bg-primary-50/50 p-4 hover:bg-primary-50 transition-colors"
                        >
                          <p className="font-semibold text-primary-800 mb-1">{item.title}</p>
                          <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
                        </Link>
                      ))}
                      <div className="rounded-xl border border-dashed border-primary-200 p-4 bg-white">
                        <p className="font-semibold text-primary-700 mb-1">{da ? 'Flere kommer snart' : 'More coming soon'}</p>
                        <p className="text-sm text-gray-600">
                          {da ? 'Vi udvider løbende med flere feature-sider i samme format.' : 'We are expanding this with more feature pages in the same format.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div
              className="relative"
              onMouseEnter={() => setDesktopToolsOpen(true)}
              onMouseLeave={() => setDesktopToolsOpen(false)}
            >
              <button
                type="button"
                className={`inline-flex items-center gap-1 text-sm font-medium transition-colors ${
                  isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
                }`}
                onClick={() => setDesktopToolsOpen((v) => !v)}
                aria-expanded={desktopToolsOpen}
                aria-controls="desktop-tools-menu"
              >
                {da ? 'Værktøjer' : 'Tools'}
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${desktopToolsOpen ? 'rotate-180' : ''}`} />
              </button>

              {desktopToolsOpen && (
                <div id="desktop-tools-menu" className="absolute left-0 top-full z-50 w-[min(92vw,560px)] pt-4">
                  <div className="rounded-2xl border border-primary-100 bg-white shadow-xl p-4">
                    <div className="grid gap-3">
                      {toolItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="rounded-xl border border-primary-100 bg-primary-50/50 p-4 hover:bg-primary-50 transition-colors"
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <p className="font-semibold text-primary-800">{item.title}</p>
                            {item.badge && (
                              <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-700">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
                        </Link>
                      ))}
                      <div className="rounded-xl border border-dashed border-primary-200 p-4 bg-white">
                        <p className="font-semibold text-primary-700 mb-1">{da ? 'Flere værktøjer kommer' : 'More tools coming'}</p>
                        <p className="text-sm text-gray-600">
                          {da ? 'Gratis værktøjer du kan bruge uden login.' : 'Free tools you can use without signing up.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link
              href={navHref('/pricing')}
              className={desktopLinkClass}
            >
              {locale === 'da' ? 'Priser' : 'Pricing'}
            </Link>

            <div
              className="relative"
              onMouseEnter={() => setDesktopLearnOpen(true)}
              onMouseLeave={() => setDesktopLearnOpen(false)}
            >
              <button
                type="button"
                className={`inline-flex items-center gap-1 text-sm font-medium transition-colors ${
                  isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
                }`}
                onClick={() => setDesktopLearnOpen((v) => !v)}
                aria-expanded={desktopLearnOpen}
                aria-controls="desktop-learn-menu"
              >
                {da ? 'Lær mere' : 'Learn more'}
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${desktopLearnOpen ? 'rotate-180' : ''}`} />
              </button>

              {desktopLearnOpen && (
                <div
                  id="desktop-learn-menu"
                  className="absolute left-1/2 top-full z-50 w-[min(96vw,900px)] -translate-x-1/2 pt-3"
                >
                  <div className="rounded-xl border border-gray-200 bg-white shadow-xl">
                    <div className="grid grid-cols-3 divide-x divide-gray-100">

                      {/* Articles */}
                      <div className="px-6 py-5">
                        <div className="mb-4 flex items-baseline justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                            {da ? 'Artikler' : 'Articles'}
                          </span>
                          <Link href={navHref('/articles')} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                            {da ? 'Se alle' : 'View all'}
                          </Link>
                        </div>
                        <div className="space-y-0.5">
                          {BLOG_CATEGORIES.map((c) => (
                            <Link
                              key={c.slug}
                              href={`/articles/category/${c.slug}`}
                              className="block rounded-md px-2 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                            >
                              {c.label}
                            </Link>
                          ))}
                        </div>
                      </div>

                      {/* Comparisons */}
                      <div className="px-6 py-5">
                        <div className="mb-4 flex items-baseline justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                            {da ? 'Sammenligninger' : 'Comparisons'}
                          </span>
                          <Link href={withLocalePath(locale, '/comparisons')} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                            {da ? 'Se alle' : 'View all'}
                          </Link>
                        </div>
                        <div className="space-y-0.5">
                          {COMPARISON_PAGES.map((c) => {
                            const label = (da && DA_COMPARISON_TRANSLATIONS[c.slug]?.headline) ? DA_COMPARISON_TRANSLATIONS[c.slug]!.headline! : c.headline
                            return (
                              <Link
                                key={c.slug}
                                href={withLocalePath(locale, `/comparisons/${c.slug}`)}
                                className="block rounded-md px-2 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                              >
                                {label}
                              </Link>
                            )
                          })}
                        </div>
                      </div>

                      {/* Industries */}
                      <div className="px-6 py-5">
                        <div className="mb-4 flex items-baseline justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                            {da ? 'Brancher' : 'Industries'}
                          </span>
                          <Link href={withLocalePath(locale, '/industries')} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                            {da ? 'Se alle' : 'View all'}
                          </Link>
                        </div>
                        <div className="space-y-0.5">
                          {INDUSTRIES.map((ind) => {
                            const label = (da && DA_INDUSTRY_TRANSLATIONS[ind.slug]?.menuLabel) ? DA_INDUSTRY_TRANSLATIONS[ind.slug]!.menuLabel! : ind.menuLabel
                            return (
                              <Link
                                key={ind.slug}
                                href={withLocalePath(locale, `/industries/${ind.slug}`)}
                                className="block rounded-md px-2 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                              >
                                {label}
                              </Link>
                            )
                          })}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link href={navHref('/contact')} className={desktopLinkClass}>
              {da ? 'Kontakt' : 'Contact'}
            </Link>
          </div>
          <div className="flex items-center gap-5">
            <a
              href={helpHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${desktopLinkClass} inline-flex items-center gap-1.5`}
            >
              <LifebuoyIcon className="h-4 w-4" />
              {locale === 'da' ? 'Hjælpecenter' : 'Help Center'}
            </a>
            <Link
              href={registerHref}
              className="btn-primary"
              onClick={() =>
                pushCtaClick({
                  ctaType: 'register',
                  ctaLabel: locale === 'da' ? 'Kom i gang' : 'Get Started',
                  linkUrl: registerHref,
                  location: 'header',
                })
              }
            >
              {locale === 'da' ? 'Kom i gang' : 'Get Started'}
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between md:hidden">
          <div className="flex items-center gap-2">
            <button
              className={`rounded-lg p-2 transition-colors ${
                isDarkTop ? 'text-white/90 hover:bg-white/10 hover:text-white' : 'text-gray-700 hover:bg-primary-50 hover:text-primary-800'
              }`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <XMarkIcon className="w-6 h-6" />
              ) : (
                <Bars3Icon className="w-6 h-6" />
              )}
            </button>
            <Link href={navHref('/')} className="group flex items-center">
              <Image
                src={
                  isDarkTop
                    ? marketingImages.brand.logoHeaderWhite
                    : marketingImages.brand.logoHeader
                }
                alt="PathPilo"
                width={150}
                height={38}
                className="h-8 w-auto transition duration-300"
                priority
              />
            </Link>
          </div>

          <Link
            href={registerHref}
            className="btn-primary py-2 px-4 text-sm"
            onClick={() =>
              pushCtaClick({
                ctaType: 'register',
                ctaLabel: locale === 'da' ? 'Kom i gang' : 'Get Started',
                linkUrl: registerHref,
                location: 'header_mobile_top',
              })
            }
          >
            {locale === 'da' ? 'Kom i gang' : 'Get Started'}
          </Link>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div
            className={`md:hidden absolute left-4 right-4 top-[calc(100%+0.5rem)] z-[80] overflow-hidden rounded-2xl border shadow-xl ${
              isDarkTop
                ? 'border-white/15 bg-[#0d1f1f]/95 backdrop-blur-md shadow-black/25'
                : 'border-primary-100 bg-white/95 backdrop-blur-md'
            }`}
          >
            <div className="space-y-1 px-3 py-3">
              <button
                type="button"
                onClick={() => setMobileFeaturesOpen((v) => !v)}
                className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isDarkTop ? 'text-white/90 hover:bg-white/10' : 'text-primary-800 hover:bg-primary-50'
                }`}
                aria-expanded={mobileFeaturesOpen}
              >
                <span>{locale === 'da' ? 'Features' : 'Features'}</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${mobileFeaturesOpen ? 'rotate-180' : ''}`} />
              </button>
              {mobileFeaturesOpen && (
                <div className={`rounded-xl p-2 space-y-2 ${isDarkTop ? 'bg-white/10' : 'bg-primary-50'}`}>
                  {featureItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-lg p-3 ${
                        isDarkTop ? 'bg-white/10 text-white/90 hover:bg-white/15' : 'bg-white text-primary-800 border border-primary-100'
                      }`}
                    >
                      <p className="font-semibold">{item.title}</p>
                      <p className={`text-xs mt-1 ${isDarkTop ? 'text-white/75' : 'text-gray-600'}`}>{item.description}</p>
                    </Link>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setMobileToolsOpen((v) => !v)}
                className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isDarkTop ? 'text-white/90 hover:bg-white/10' : 'text-primary-800 hover:bg-primary-50'
                }`}
                aria-expanded={mobileToolsOpen}
              >
                <span>{da ? 'Værktøjer' : 'Tools'}</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${mobileToolsOpen ? 'rotate-180' : ''}`} />
              </button>
              {mobileToolsOpen && (
                <div className={`rounded-xl p-2 space-y-2 ${isDarkTop ? 'bg-white/10' : 'bg-primary-50'}`}>
                  {toolItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-lg p-3 ${
                        isDarkTop ? 'bg-white/10 text-white/90 hover:bg-white/15' : 'bg-white text-primary-800 border border-primary-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{item.title}</p>
                        {item.badge && (
                          <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-700">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs mt-1 ${isDarkTop ? 'text-white/75' : 'text-gray-600'}`}>{item.description}</p>
                    </Link>
                  ))}
                </div>
              )}
              <Link
                href={navHref('/pricing')}
                className={`block rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isDarkTop ? 'text-white/90 hover:bg-white/10' : 'text-primary-800 hover:bg-primary-50'
                }`}
              >
                {locale === 'da' ? 'Priser' : 'Pricing'}
              </Link>
              <button
                type="button"
                onClick={() => setMobileLearnOpen((v) => !v)}
                className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isDarkTop ? 'text-white/90 hover:bg-white/10' : 'text-primary-800 hover:bg-primary-50'
                }`}
                aria-expanded={mobileLearnOpen}
              >
                <span>{da ? 'Lær mere' : 'Learn more'}</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${mobileLearnOpen ? 'rotate-180' : ''}`} />
              </button>
              {mobileLearnOpen && (
                <div className={`rounded-xl divide-y ${isDarkTop ? 'bg-white/10 divide-white/10' : 'bg-gray-50 divide-gray-200'}`}>
                  {/* Articles */}
                  <div className="px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className={`text-[10px] font-semibold uppercase tracking-widest ${isDarkTop ? 'text-white/50' : 'text-gray-400'}`}>
                        {da ? 'Artikler' : 'Articles'}
                      </p>
                      <Link href={navHref('/articles')} className={`text-xs ${isDarkTop ? 'text-white/60' : 'text-gray-400'}`}>
                        {da ? 'Se alle' : 'View all'}
                      </Link>
                    </div>
                    <div className="space-y-0.5">
                      {BLOG_CATEGORIES.map((c) => (
                        <Link
                          key={c.slug}
                          href={`/articles/category/${c.slug}`}
                          className={`block rounded-md px-2 py-1.5 text-sm ${
                            isDarkTop ? 'text-white/80 hover:bg-white/10' : 'text-gray-700 hover:bg-white'
                          }`}
                        >
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                  {/* Comparisons */}
                  <div className="px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className={`text-[10px] font-semibold uppercase tracking-widest ${isDarkTop ? 'text-white/50' : 'text-gray-400'}`}>
                        {da ? 'Sammenligninger' : 'Comparisons'}
                      </p>
                      <Link href={withLocalePath(locale, '/comparisons')} className={`text-xs ${isDarkTop ? 'text-white/60' : 'text-gray-400'}`}>
                        {da ? 'Se alle' : 'View all'}
                      </Link>
                    </div>
                    <div className="space-y-0.5">
                      {COMPARISON_PAGES.map((c) => {
                        const label = (da && DA_COMPARISON_TRANSLATIONS[c.slug]?.headline) ? DA_COMPARISON_TRANSLATIONS[c.slug]!.headline! : c.headline
                        return (
                          <Link
                            key={c.slug}
                            href={withLocalePath(locale, `/comparisons/${c.slug}`)}
                            className={`block rounded-md px-2 py-1.5 text-sm ${
                              isDarkTop ? 'text-white/80 hover:bg-white/10' : 'text-gray-700 hover:bg-white'
                            }`}
                          >
                            {label}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                  {/* Industries */}
                  <div className="px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className={`text-[10px] font-semibold uppercase tracking-widest ${isDarkTop ? 'text-white/50' : 'text-gray-400'}`}>
                        {da ? 'Brancher' : 'Industries'}
                      </p>
                      <Link href={withLocalePath(locale, '/industries')} className={`text-xs ${isDarkTop ? 'text-white/60' : 'text-gray-400'}`}>
                        {da ? 'Se alle' : 'View all'}
                      </Link>
                    </div>
                    <div className="space-y-0.5">
                      {INDUSTRIES.map((ind) => {
                        const label = (da && DA_INDUSTRY_TRANSLATIONS[ind.slug]?.menuLabel) ? DA_INDUSTRY_TRANSLATIONS[ind.slug]!.menuLabel! : ind.menuLabel
                        return (
                          <Link
                            key={ind.slug}
                            href={withLocalePath(locale, `/industries/${ind.slug}`)}
                            className={`block rounded-md px-2 py-1.5 text-sm ${
                              isDarkTop ? 'text-white/80 hover:bg-white/10' : 'text-gray-700 hover:bg-white'
                            }`}
                          >
                            {label}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
              <Link
                href={navHref('/contact')}
                className={`block rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isDarkTop ? 'text-white/90 hover:bg-white/10' : 'text-primary-800 hover:bg-primary-50'
                }`}
              >
                {da ? 'Kontakt' : 'Contact'}
              </Link>
            </div>

            <div className={`border-t px-4 py-4 ${isDarkTop ? 'border-white/10 bg-black/10' : 'border-primary-100 bg-primary-50/50'}`}>
              <a
                href={helpHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                  isDarkTop ? 'text-white/90 hover:text-white' : 'text-primary-800 hover:text-primary-900'
                }`}
              >
                <LifebuoyIcon className="h-4 w-4" />
                {locale === 'da' ? 'Hjælpecenter' : 'Help Center'}
              </a>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href={loginHref}
                  className={`inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    isDarkTop ? 'border-white/20 text-white/85 hover:bg-white/10 hover:text-white' : 'border-primary-200 text-primary-800 hover:bg-white'
                  }`}
                >
                  {locale === 'da' ? 'Log ind' : 'Login'}
                </a>
                <a
                  href={loginHref}
                  className={`inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    isDarkTop ? 'border-white/20 text-white/85 hover:bg-white/10 hover:text-white' : 'border-primary-200 text-primary-800 hover:bg-white'
                  }`}
                >
                  {locale === 'da' ? 'Registrering' : 'Registration'}
                </a>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
