'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Header from '../components/Header'
import Footer from '../components/Footer'
import {
  getLocaleFromPathname,
  isMarketingLocale,
  withAppLanguageParam,
} from '../lib/i18n'
import type { MarketingLocale } from '../lib/i18n'
import { pushCtaClick } from '../lib/dataLayer'
import {
  CheckCircleIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ChartBarIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline'

export default function PricingPage({ locale: localeProp }: { locale?: string }) {
  const pathname = usePathname()
  const locale: MarketingLocale =
    localeProp && isMarketingLocale(localeProp)
      ? localeProp
      : getLocaleFromPathname(pathname || '/')
  const da = locale === 'da'
  const registerUrl = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    // Simulate form submission
    setTimeout(() => {
      setIsSubmitting(false)
      setSubmitted(true)
      setFormData({ name: '', email: '', company: '', phone: '', message: '' })
    }, 1000)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  return (
    <>
      <Header />
      
      {/* Hero Section */}
      <section className="gradient-bg pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-800 mb-6">
            {da ? 'Enkel og gennemsigtig prissætning' : 'Simple, Transparent Pricing'}
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            {da
              ? 'PathPilo er skabt til at vokse med din virksomhed. Kontakt os for at finde den rette plan til dine behov.'
              : 'PathPilo is designed to grow with your business. Contact us to discuss the perfect plan for your needs.'}
          </p>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-accent-400 to-accent-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <CurrencyDollarIcon className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary-800 mb-2">{da ? 'Fleksibel prissætning' : 'Flexible Pricing'}</h3>
              <p className="text-gray-600">
                {da ? 'Planer der skalerer med din virksomhed. Betal kun for det, du har brug for.' : 'Plans that scale with your business. Pay only for what you need.'}
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-accent-400 to-accent-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <UserGroupIcon className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary-800 mb-2">{da ? 'God til teams' : 'Team-Friendly'}</h3>
              <p className="text-gray-600">
                {da ? 'Tilføj medarbejdere uden at sprænge budgettet. Overkommelig pris pr. bruger.' : 'Add team members without breaking the bank. Affordable per-user pricing.'}
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-accent-400 to-accent-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <ChartBarIcon className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary-800 mb-2">{da ? 'Fokus på afkast' : 'ROI-Focused'}</h3>
              <p className="text-gray-600">
                {da ? 'Spar tid og øg omsætningen. De fleste ser afkast inden for den første måned.' : 'Save time and increase revenue. Most businesses see ROI within the first month.'}
              </p>
            </div>
          </div>

          {/* What's Included */}
          <div className="bg-primary-50 rounded-2xl p-8 md:p-12 mb-16">
            <h2 className="text-3xl font-bold text-primary-800 mb-8 text-center">
              {da ? 'Hvad der er inkluderet i alle planer' : "What's Included in Every Plan"}
            </h2>
            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {(da
                ? [
                    'Ubegrænsede opgaver og kunder',
                    'Gentagne opgaver og abonnementer',
                    'Professionel fakturering',
                    'Teamstyring og roller',
                    'Lead-formularer',
                    'E-mailnotifikationer',
                    'Mobilvenligt design',
                    'Business analytics og rapporter',
                    'Tilpassede e-mailskabeloner',
                    'Kundesupport',
                    'Dataeksport',
                    'Sikker cloud-lagring',
                  ]
                : [
                    'Unlimited jobs and clients',
                    'Recurring jobs & subscriptions',
                    'Professional invoicing',
                    'Team management & roles',
                    'Lead capture forms',
                    'Email notifications',
                    'Mobile-responsive design',
                    'Business analytics & reports',
                    'Custom email templates',
                    'Customer support',
                    'Data export',
                    'Secure cloud storage',
                  ]).map((feature, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-accent-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Contact Form CTA */}
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-xl border border-primary-100 p-8 md:p-12">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-primary-800 mb-4">
                  {da ? 'Få en skræddersyet pris til din virksomhed' : 'Get Custom Pricing for Your Business'}
                </h2>
                <p className="text-lg text-gray-600">
                  {da
                    ? 'Alle servicevirksomheder er forskellige. Lad os finde den perfekte plan til dig. Vi giver et tilbud baseret på teamstørrelse og behov.'
                    : "Every service business is unique. Let's discuss the perfect plan for your needs. We'll provide a custom quote based on your team size and requirements."}
                </p>
              </div>

              {submitted ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircleIcon className="w-10 h-10 text-accent-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-primary-800 mb-2">{da ? 'Tak!' : 'Thank You!'}</h3>
                  <p className="text-gray-600 mb-6">
                    {da ? 'Vi har modtaget din forespørgsel og kontakter dig inden for 24 timer.' : "We've received your request and will contact you within 24 hours."}
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="btn-secondary"
                  >
                    {da ? 'Send en ny forespørgsel' : 'Submit Another Request'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-semibold text-primary-800 mb-2">
                      {da ? 'Fulde navn' : 'Full Name'} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="input-field"
                      placeholder={da ? 'Hans Hansen' : 'John Smith'}
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-primary-800 mb-2">
                      {da ? 'E-mailadresse' : 'Email Address'} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="input-field"
                      placeholder="john@company.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="company" className="block text-sm font-semibold text-primary-800 mb-2">
                      {da ? 'Firmanavn' : 'Company Name'}
                    </label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      value={formData.company}
                      onChange={handleChange}
                      className="input-field"
                      placeholder={da ? 'ABC Rengøring' : 'ABC Cleaning Services'}
                    />
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-semibold text-primary-800 mb-2">
                      {da ? 'Telefonnummer' : 'Phone Number'}
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="input-field"
                      placeholder="+45 12 34 56 78"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-semibold text-primary-800 mb-2">
                      {da ? 'Fortæl os om din virksomhed' : 'Tell Us About Your Business'}
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={4}
                      value={formData.message}
                      onChange={handleChange}
                      className="input-field"
                      placeholder={da ? 'Hvor mange medarbejdere har I? Hvilke services tilbyder I? Særlige behov?' : 'How many employees do you have? What type of services do you provide? Any specific requirements?'}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full btn-primary text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        {da ? 'Sender...' : 'Sending...'}
                      </span>
                    ) : (
                      da ? 'Anmod om skræddersyet pris' : 'Request Custom Pricing'
                    )}
                  </button>

                  <p className="text-sm text-gray-500 text-center">
                    {da
                      ? 'Ved at indsende formularen accepterer du, at PathPilo kontakter dig. Vi respekterer dit privatliv og deler aldrig dine oplysninger.'
                      : 'By submitting this form, you agree to be contacted by PathPilo. We respect your privacy and will never share your information.'}
                  </p>
                </form>
              )}
            </div>
          </div>

          {/* Free plan CTA */}
          <div className="text-center mt-16">
            <p className="text-lg text-gray-600 mb-6">
              {da ? 'Ikke klar til at binde dig endnu? Kom i gang gratis - intet kreditkort påkrævet.' : 'Not ready to commit? Get started for free—no credit card required.'}
            </p>
            <a
              href={registerUrl}
              className="btn-outline text-lg px-8 py-4 inline-block"
              onClick={() =>
                pushCtaClick({
                  ctaType: 'register',
                  ctaLabel: da ? 'Kom i gang gratis' : 'Get Started Free',
                  linkUrl: registerUrl,
                  location: 'pricing_bottom',
                })
              }
            >
              {da ? 'Kom i gang gratis' : 'Get Started Free'}
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
