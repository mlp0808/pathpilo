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

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileFeaturesOpen, setMobileFeaturesOpen] = useState(false)
  const [desktopFeaturesOpen, setDesktopFeaturesOpen] = useState(false)
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
    setDesktopFeaturesOpen(false)
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
            <Link
              href={navHref('/pricing')}
              className={desktopLinkClass}
            >
              {locale === 'da' ? 'Priser' : 'Pricing'}
            </Link>
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
              <Link
                href={navHref('/pricing')}
                className={`block rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isDarkTop ? 'text-white/90 hover:bg-white/10' : 'text-primary-800 hover:bg-primary-50'
                }`}
              >
                {locale === 'da' ? 'Priser' : 'Pricing'}
              </Link>
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
