'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { marketingImages } from '../config/marketingImages'
import { Bars3Icon, ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline'
import {
  getLocaleFromPathname,
  stripLocalePrefix,
  withAppLanguageParam,
  withLocalePath,
  type MarketingLocale,
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
  const switchTo = (next: MarketingLocale) => withLocalePath(next, basePath)
  const navHref = (href: string) => withLocalePath(locale, href)
  const loginHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/login')
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')
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
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isDarkTop
          ? 'bg-black/25 backdrop-blur-sm border-b border-white/10 shadow-none'
          : 'bg-white/95 backdrop-blur-md border-b border-primary-100 shadow-sm'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
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

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <div
              className="relative"
              onMouseEnter={() => setDesktopFeaturesOpen(true)}
              onMouseLeave={() => setDesktopFeaturesOpen(false)}
            >
              <button
                type="button"
                className={`inline-flex items-center gap-1 font-medium transition-colors ${
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
              href={navHref('/about')}
              className={`font-medium transition-colors ${
                isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
              }`}
            >
              {locale === 'da' ? 'Om os' : 'About'}
            </Link>
            <Link
              href={navHref('/faq')}
              className={`font-medium transition-colors ${
                isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
              }`}
            >
              FAQ
            </Link>
            <Link
              href={navHref('/contact')}
              className={`font-medium transition-colors ${
                isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
              }`}
            >
              {locale === 'da' ? 'Kontakt' : 'Contact'}
            </Link>
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white/80 px-1 py-1">
              <Link href={switchTo('en')} className={`px-2 py-1 text-xs font-semibold rounded ${locale === 'en' ? 'bg-primary-500 text-white' : 'text-gray-600 hover:text-primary-800'}`}>EN</Link>
              <Link href={switchTo('da')} className={`px-2 py-1 text-xs font-semibold rounded ${locale === 'da' ? 'bg-primary-500 text-white' : 'text-gray-600 hover:text-primary-800'}`}>DA</Link>
            </div>
            <Link
              href={loginHref}
              className={`font-medium transition-colors ${
                isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
              }`}
            >
              {locale === 'da' ? 'Log ind' : 'Sign In'}
            </Link>
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

          {/* Mobile menu button */}
          <button
            className={`md:hidden p-2 transition-colors ${
              isDarkTop ? 'text-white/90 hover:text-white' : 'text-gray-600 hover:text-primary-800'
            }`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <XMarkIcon className="w-6 h-6" />
            ) : (
              <Bars3Icon className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div
            className={`md:hidden mt-4 pb-4 space-y-3 pt-4 ${
              isDarkTop
                ? 'border-t border-white/15 bg-black/30 rounded-xl px-4 backdrop-blur-md'
                : 'border-t border-primary-100'
            }`}
          >
            <Link
              href={navHref('/about')}
              className={`block py-2 font-medium transition-colors ${
                isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
              }`}
            >
              {locale === 'da' ? 'Om os' : 'About'}
            </Link>
            <Link
              href={navHref('/faq')}
              className={`block py-2 font-medium transition-colors ${
                isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
              }`}
            >
              FAQ
            </Link>
            <Link
              href={navHref('/contact')}
              className={`block py-2 font-medium transition-colors ${
                isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
              }`}
            >
              {locale === 'da' ? 'Kontakt' : 'Contact'}
            </Link>
            <button
              type="button"
              onClick={() => setMobileFeaturesOpen((v) => !v)}
              className={`w-full flex items-center justify-between py-2 font-medium transition-colors ${
                isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
              }`}
              aria-expanded={mobileFeaturesOpen}
            >
              <span>{locale === 'da' ? 'Features' : 'Features'}</span>
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${mobileFeaturesOpen ? 'rotate-180' : ''}`} />
            </button>
            {mobileFeaturesOpen && (
              <div className={`rounded-xl p-3 space-y-2 ${isDarkTop ? 'bg-white/10' : 'bg-primary-50'}`}>
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
            <div className="flex items-center gap-2 pt-1">
              <Link href={switchTo('en')} className={`px-2 py-1 text-xs font-semibold rounded border ${locale === 'en' ? 'bg-primary-500 text-white border-primary-500' : 'text-gray-600 border-gray-300'}`}>EN</Link>
              <Link href={switchTo('da')} className={`px-2 py-1 text-xs font-semibold rounded border ${locale === 'da' ? 'bg-primary-500 text-white border-primary-500' : 'text-gray-600 border-gray-300'}`}>DA</Link>
            </div>
            <Link
              href={loginHref}
              className={`block py-2 font-medium transition-colors ${
                isDarkTop ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-primary-800'
              }`}
            >
              {locale === 'da' ? 'Log ind' : 'Sign In'}
            </Link>
            <Link
              href={registerHref}
              className="block btn-primary text-center mt-4"
              onClick={() =>
                pushCtaClick({
                  ctaType: 'register',
                  ctaLabel: locale === 'da' ? 'Kom i gang' : 'Get Started',
                  linkUrl: registerHref,
                  location: 'header_mobile',
                })
              }
            >
              {locale === 'da' ? 'Kom i gang' : 'Get Started'}
            </Link>
          </div>
        )}
      </nav>
    </header>
  )
}
