'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { marketingImages } from '../config/marketingImages'
import { getLocaleFromPathname, stripLocalePrefix, withAppLanguageParam, withLocalePath } from '../lib/i18n'
import { pushCtaClick } from '../lib/dataLayer'

export default function Footer() {
  const pathname = usePathname()
  const locale = getLocaleFromPathname(pathname || '/')
  const basePath = stripLocalePrefix(pathname || '/')
  const da = locale === 'da'
  const navHref = (href: string) => withLocalePath(locale, href)
  const switchTo = (next: 'en' | 'da') => withLocalePath(next, basePath)
  const loginHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/login')
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')

  return (
    <footer className="bg-primary-800 text-white">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand Column */}
          <div className="col-span-1 md:col-span-2">
            <Link href={navHref('/')} className="mb-4 inline-flex items-center">
              <Image
                src={marketingImages.brand.logoFooterWhite}
                alt="PathPilo"
                width={180}
                height={44}
                className="h-10 w-auto"
              />
            </Link>
            <p className="text-gray-300 mb-6 max-w-md">
              {da
                ? 'Den komplette serviceplatform til mobile servicevirksomheder. Effektivisér planlægning, kundestyring og teamkoordinering.'
                : 'The complete service management platform for mobile service businesses. Streamline scheduling, client management, and team coordination.'}
            </p>
            <div className="flex space-x-4">
              {/* Social links placeholder */}
              <a href="#" className="w-10 h-10 bg-primary-700 rounded-lg flex items-center justify-center hover:bg-accent-500 transition-colors" aria-label="LinkedIn">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
              </a>
              <a href="#" className="w-10 h-10 bg-primary-700 rounded-lg flex items-center justify-center hover:bg-accent-500 transition-colors" aria-label="Twitter">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="font-semibold text-lg mb-4">{da ? 'Produkt' : 'Product'}</h3>
            <ul className="space-y-2">
              <li>
                <Link href={navHref('/features/routeplanning')} className="text-gray-300 hover:text-white transition-colors">
                  {da ? 'Routeplanning' : 'Route Planning'}
                </Link>
              </li>
              <li>
                <Link href={navHref('/features/subscriptions')} className="text-gray-300 hover:text-white transition-colors">
                  {da ? 'Abonnementsopgaver' : 'Subscription tasks'}
                </Link>
              </li>
              <li>
                <Link href={navHref('/features/team')} className="text-gray-300 hover:text-white transition-colors">
                  {da ? 'Teamstyring' : 'Team management'}
                </Link>
              </li>
              <li>
                <Link href={navHref('/about')} className="text-gray-300 hover:text-white transition-colors">
                  {da ? 'Om os' : 'About'}
                </Link>
              </li>
              <li>
                <Link href={navHref('/faq')} className="text-gray-300 hover:text-white transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h3 className="font-semibold text-lg mb-4">{da ? 'Ressourcer' : 'Resources'}</h3>
            <ul className="space-y-2">
              <li>
                <Link href={navHref('/contact')} className="text-gray-300 hover:text-white transition-colors">
                  {da ? 'Kontakt os' : 'Contact Us'}
                </Link>
              </li>
              <li>
                <a href={loginHref} className="text-gray-300 hover:text-white transition-colors">
                  {da ? 'Log ind' : 'Sign In'}
                </a>
              </li>
              <li>
                <a
                  href={registerHref}
                  className="text-gray-300 hover:text-white transition-colors"
                  onClick={() =>
                    pushCtaClick({
                      ctaType: 'register',
                      ctaLabel: da ? 'Kom i gang gratis' : 'Get Started Free',
                      linkUrl: registerHref,
                      location: 'footer',
                    })
                  }
                >
                  {da ? 'Kom i gang gratis' : 'Get Started Free'}
                </a>
              </li>
              <li>
                <Link href="#" className="text-gray-300 hover:text-white transition-colors">
                  {da ? 'Dokumentation' : 'Documentation'}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-primary-700 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm mb-4 md:mb-0">
            © {new Date().getFullYear()} PathPilo. {da ? 'Alle rettigheder forbeholdes.' : 'All rights reserved.'}
          </p>
          <div className="flex items-center gap-5 text-sm text-gray-400">
            <div className="flex items-center gap-1 rounded-lg border border-primary-600 bg-primary-700/70 px-1 py-1">
              <Link
                href={switchTo('en')}
                className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${
                  locale === 'en' ? 'bg-accent-500 text-white' : 'text-gray-200 hover:text-white'
                }`}
              >
                EN
              </Link>
              <Link
                href={switchTo('da')}
                className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${
                  locale === 'da' ? 'bg-accent-500 text-white' : 'text-gray-200 hover:text-white'
                }`}
              >
                DA
              </Link>
            </div>
            <Link href={navHref('/privacy')} className="hover:text-white transition-colors">
              {da ? 'Privatlivspolitik' : 'Privacy Policy'}
            </Link>
            <Link href={navHref('/terms')} className="hover:text-white transition-colors">
              {da ? 'Servicevilkår' : 'Terms of Service'}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
