'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { getLocaleFromPathname } from '../lib/i18n'
import {
  EnvelopeIcon,
  MapPinIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

export default function ContactPage({ locale: localeProp }: { locale?: string }) {
  const pathname = usePathname()
  const locale = localeProp || getLocaleFromPathname(pathname || '/')
  const da = locale === 'da'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    subject: '',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const emailBody = [
      `${da ? 'Navn' : 'Name'}: ${formData.name}`,
      `Email: ${formData.email}`,
      `${da ? 'Firma' : 'Company'}: ${formData.company || '-'}`,
      '',
      formData.message,
    ].join('\n')

    const mailtoUrl = `mailto:mikkel@pathpilo.com?subject=${encodeURIComponent(formData.subject)}&body=${encodeURIComponent(emailBody)}`
    window.location.href = mailtoUrl

    setIsSubmitting(false)
    setSubmitted(true)
    setFormData({ name: '', email: '', company: '', subject: '', message: '' })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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
            {da ? 'Kontakt os' : 'Get in Touch'}
          </h1>
          <p className="text-xl text-gray-600">
            {da ? 'Har du spørgsmål? Vi er her for at hjælpe. Skriv til os, så vender vi tilbage inden for 24 timer.' : "Have questions? We're here to help. Reach out and we'll get back to you within 24 hours."}
          </p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Contact Info */}
            <div className="md:col-span-1">
              <h2 className="text-2xl font-bold text-primary-800 mb-6">{da ? 'Kontaktinformation' : 'Contact Information'}</h2>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                    <EnvelopeIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-primary-800 mb-1">{da ? 'E-mail' : 'Email'}</h3>
                    <a href="mailto:mikkel@pathpilo.com" className="text-gray-600 hover:text-accent-600 transition-colors">
                      Mikkel@pathpilo.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                    <MapPinIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-primary-800 mb-1">{da ? 'Kontor' : 'Office'}</h3>
                    <p className="text-gray-600">
                      {da ? 'København, Danmark' : 'Copenhagen, Denmark'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-6 bg-primary-50 rounded-xl">
                <h3 className="font-semibold text-primary-800 mb-2">{da ? 'Svartid' : 'Response Time'}</h3>
                <p className="text-gray-600 text-sm">
                  {da ? 'Vi svarer typisk inden for 24 timer på hverdage.' : 'We typically respond within 24 hours during business days.'}
                </p>
              </div>
            </div>

            {/* Contact Form */}
            <div className="md:col-span-2">
              <div className="bg-white rounded-2xl shadow-xl border border-primary-100 p-8">
                <h2 className="text-2xl font-bold text-primary-800 mb-6">{da ? 'Send os en besked' : 'Send Us a Message'}</h2>

                {submitted ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircleIcon className="w-10 h-10 text-accent-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-primary-800 mb-2">{da ? 'Besked sendt!' : 'Message Sent!'}</h3>
                    <p className="text-gray-600 mb-6">
                      {da ? 'Tak for din henvendelse. Vi har modtaget din besked og vender tilbage inden for 24 timer.' : "Thank you for contacting us. We've received your message and will get back to you within 24 hours."}
                    </p>
                    <button
                      onClick={() => setSubmitted(false)}
                      className="btn-secondary"
                    >
                      {da ? 'Send en ny besked' : 'Send Another Message'}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
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
                      <label htmlFor="subject" className="block text-sm font-semibold text-primary-800 mb-2">
                        {da ? 'Emne' : 'Subject'} <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="subject"
                        name="subject"
                        required
                        value={formData.subject}
                        onChange={handleChange}
                        className="input-field"
                      >
                        <option value="">{da ? 'Vælg et emne' : 'Select a subject'}</option>
                        <option value="pricing">{da ? 'Prisforespørgsel' : 'Pricing Inquiry'}</option>
                        <option value="demo">{da ? 'Book en demo' : 'Request a Demo'}</option>
                        <option value="support">{da ? 'Teknisk support' : 'Technical Support'}</option>
                        <option value="partnership">{da ? 'Partnerskab' : 'Partnership Opportunity'}</option>
                        <option value="other">{da ? 'Andet' : 'Other'}</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="message" className="block text-sm font-semibold text-primary-800 mb-2">
                        {da ? 'Besked' : 'Message'} <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        required
                        rows={6}
                        value={formData.message}
                        onChange={handleChange}
                        className="input-field"
                        placeholder={da ? 'Fortæl os, hvordan vi kan hjælpe...' : 'Tell us how we can help...'}
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
                        da ? 'Send besked' : 'Send Message'
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
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
