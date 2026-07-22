'use client'

import { useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import Breadcrumbs, { BREADCRUMB_ON_LIGHT } from '../components/Breadcrumbs'
import { breadcrumbsForRoute } from '../lib/breadcrumbs'
import CTASection from '../components/CTASection'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { withLocalePath } from '../lib/i18n'
import type { MarketingLocale } from '../lib/i18n'
import { getSiteFaqs } from '../lib/faqData'

export default function FAQContent({ locale }: { locale: MarketingLocale }) {
  const da = locale === 'da'
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const faqs = getSiteFaqs(locale)

  const toggleQuestion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <>
      <Header />
      <section className="gradient-bg pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Breadcrumbs
            items={breadcrumbsForRoute(locale, 'faq')}
            className={`${BREADCRUMB_ON_LIGHT} justify-center`}
          />
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-800 mb-6">
            {da ? 'Ofte stillede spørgsmål' : 'Frequently Asked Questions'}
          </h1>
          <p className="text-xl text-gray-600">
            {da
              ? 'Alt du skal vide om PathPilo, og hvordan platformen kan hjælpe din servicevirksomhed.'
              : 'Everything you need to know about PathPilo and how it can help your service business.'}
          </p>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={faq.q}
                className="bg-white rounded-xl border border-primary-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleQuestion(index)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-primary-50 transition-colors"
                >
                  <h3 className="text-lg font-semibold text-primary-800 pr-8">{faq.q}</h3>
                  <ChevronDownIcon
                    className={`w-6 h-6 text-gray-400 flex-shrink-0 transition-transform ${
                      openIndex === index ? 'transform rotate-180' : ''
                    }`}
                  />
                </button>
                {openIndex === index && (
                  <div className="px-6 pb-5 pt-0">
                    <p className="text-gray-600 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-primary-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-primary-800 mb-4">
            {da ? 'Har du stadig spørgsmål?' : 'Still Have Questions?'}
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            {da
              ? 'Vores team er klar til at hjælpe. Kontakt os, så vender vi tilbage inden for 24 timer.'
              : "Our team is here to help. Contact us and we'll get back to you within 24 hours."}
          </p>
          <a href={withLocalePath(locale, '/contact')} className="btn-primary text-lg px-8 py-4 inline-block">
            {da ? 'Kontakt os' : 'Contact Us'}
          </a>
        </div>
      </section>

      <CTASection
        title={da ? 'Klar til at komme i gang?' : 'Ready to Get Started?'}
        subtitle={
          da
            ? 'Bliv en del af hundredvis af servicevirksomheder, der bruger PathPilo til at effektivisere driften.'
            : 'Join hundreds of service businesses using PathPilo to streamline their operations.'
        }
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt salg' : 'Contact Sales'}
        secondaryLink="/contact"
      />

      <Footer />
    </>
  )
}
