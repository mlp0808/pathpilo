'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { marketingImages } from '../config/marketingImages'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import {
  getLocaleFromPathname,
  stripLocalePrefix,
  withAppLanguageParam,
  withLocalePath,
  type MarketingLocale,
} from '../lib/i18n'

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()
  const locale = getLocaleFromPathname(pathname || '/')
  const basePath = stripLocalePrefix(pathname || '/')
  const switchTo = (next: MarketingLocale) => withLocalePath(next, basePath)
  const navHref = (href: string) => withLocalePath(locale, href)
  const loginHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/login')
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')

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
              src={marketingImages.brand.logoHeader}
              alt="PathPilo"
              width={180}
              height={44}
              className={`h-9 w-auto md:h-10 transition duration-300 ${isDarkTop ? 'invert' : ''}`}
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
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
            <Link href={registerHref} className="btn-primary">
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
            <Link href={registerHref} className="block btn-primary text-center mt-4">
              {locale === 'da' ? 'Kom i gang' : 'Get Started'}
            </Link>
          </div>
        )}
      </nav>
    </header>
  )
}
