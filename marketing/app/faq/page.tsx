'use client'

import { useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import CTASection from '../components/CTASection'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { getLocaleFromPathname, withLocalePath } from '../lib/i18n'

type FAQPageProps = {
  locale: 'en' | 'da'
}

export default function FAQPage({ locale }: FAQPageProps) {
  const da = locale === 'da'
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  const toggleQuestion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  const faqs = da ? [
    {
      question: 'Hvilke typer servicevirksomheder er PathPilo bygget til?',
      answer: 'PathPilo er ideel til mobile servicevirksomheder med planlægning, aftaler og flere medarbejdere. Det gælder fx rengøring, anlæg, vedligehold, VVS, el, ejendomsservice m.fl.',
    },
    {
      question: 'Hvordan fungerer gentagne opgaver?',
      answer: 'Du kan oprette abonnementer med ugentlige eller månedlige intervaller, vælge faste dage og lade PathPilo oprette opgaver automatisk.',
    },
    {
      question: 'Kan jeg administrere flere medarbejdere og deres tider?',
      answer: 'Ja. Du kan tilføje medarbejdere, sætte arbejdstider, tildele opgaver og bruge roller (owner/manager/employee) for adgangsstyring.',
    },
    {
      question: 'Hvordan fungerer fakturering?',
      answer: 'Vælg afsluttede opgaver, vælg fakturatype, tilføj rabat/moms og send faktura på få minutter. Du kan også eksportere PDF.',
    },
    {
      question: 'Kan jeg få leads fra min hjemmeside?',
      answer: 'Ja. Du kan oprette lead-formularer, dele dem via link, få notifikationer og konvertere leads direkte til kunder og opgaver.',
    },
    {
      question: 'Er PathPilo mobilvenlig?',
      answer: 'Ja, hele platformen er responsiv og optimeret til mobil og tablet - uden app-download.',
    },
    {
      question: 'Hvordan fungerer kundekommunikation?',
      answer: 'PathPilo kan sende automatiske e-mails om bekræftelser, ændringer, aflysninger og fakturaer med skabeloner, du selv tilpasser.',
    },
    {
      question: 'Hvilke analyser og rapporter får jeg?',
      answer: 'Du får indsigt i omsætning, opgavestatus, teamperformance og kundeadfærd med filtre på dato og mulighed for eksport.',
    },
    {
      question: 'Hvor sikker er mine data?',
      answer: 'Vi bruger moderne sikkerhedsstandarder, adgangsstyring og backup i cloud. Dine data deles ikke med tredjeparter.',
    },
    {
      question: 'Kan jeg prøve PathPilo gratis først?',
      answer: 'Ja. Du kan komme i gang gratis uden kreditkort og bruge alle kernefunktioner med det samme.',
    },
    {
      question: 'Hvad hvis jeg har brug for hjælp til opstart?',
      answer: 'Vi tilbyder onboarding, vejledninger og support, så de fleste kommer hurtigt i gang.',
    },
    {
      question: 'Kan jeg eksportere mine data?',
      answer: 'Ja, du kan eksportere kunder, opgaver, fakturaer og rapporter, når du vil.',
    },
  ] : [
    {
      question: 'What types of service businesses is PathPilo designed for?',
      answer: 'PathPilo is perfect for any mobile service business that schedules appointments and manages multiple employees. This includes cleaning companies, landscaping services, home maintenance and repair, property management companies, HVAC services, plumbing, electrical services, and more. If you have recurring jobs, multiple team members, and need to coordinate schedules, PathPilo is built for you.',
    },
    {
      question: 'How does recurring job scheduling work?',
      answer: 'PathPilo makes recurring jobs simple. You can set up subscriptions with weekly or monthly schedules, choose specific days (like every Monday or the 15th of each month), and set custom intervals (every 2 weeks, every 3 months, etc.). Once configured, PathPilo automatically creates jobs based on your schedule. You can pause, skip dates, or modify subscriptions anytime without affecting past jobs.',
    },
    {
      question: 'Can I manage multiple employees and their schedules?',
      answer: 'Absolutely! PathPilo is built for teams. You can add unlimited employees, set individual work hours for each team member, assign jobs to specific employees, and track performance. The system automatically checks employee availability when scheduling to prevent conflicts. Role-based access control lets you set permissions (owner, manager, employee) so everyone sees what they need.',
    },
    {
      question: 'How does invoicing work?',
      answer: 'PathPilo makes invoicing fast and professional. Select completed jobs, choose your invoice style (by job, by task, or detailed breakdown), apply discounts if needed, add tax rates, and generate professional invoices in minutes. You can email invoices directly to clients or export as PDFs. All invoices are stored in your account for easy reference and payment tracking.',
    },
    {
      question: 'Can I capture leads from my website?',
      answer: 'Yes! PathPilo includes a powerful lead capture system. Create custom lead forms with our drag-and-drop builder, embed them on your website or share via social media. Leads can select services, provide preferred dates/times, and fill out custom fields. You\'ll receive instant email notifications when leads are submitted, and you can convert them directly into clients and jobs.',
    },
    {
      question: 'Is PathPilo mobile-friendly?',
      answer: 'PathPilo is fully responsive and mobile-optimized. Your team can access everything from smartphones and tablets—view schedules, create jobs, check client information, and more. The interface is touch-optimized and works great on any device. No app download required; it works in any modern web browser.',
    },
    {
      question: 'How does client communication work?',
      answer: 'PathPilo automates client communication to save you time. Clients automatically receive professional emails for job confirmations, schedule changes, cancellations, and invoices. You can customize all email templates to match your brand voice. The system uses placeholders to personalize each message with client names, dates, times, and job details.',
    },
    {
      question: 'What kind of analytics and reporting do you provide?',
      answer: 'PathPilo provides comprehensive business intelligence. View real-time revenue (completed and projected), job completion statistics, team performance metrics, client activity, and more. You can analyze any date range and export reports for accounting. Interactive charts help you visualize trends and make data-driven decisions.',
    },
    {
      question: 'How secure is my business data?',
      answer: 'Security is a top priority. PathPilo uses industry-standard encryption, secure token-based authentication, and role-based access control. Your data is stored securely in the cloud with regular backups. We never share your information with third parties, and you maintain full control over who can access your account.',
    },
    {
      question: 'Can I try PathPilo before committing?',
      answer: 'Yes! PathPilo is free to get started, so you can explore all features risk-free. No credit card required. Set up your company, add services and clients, create jobs, and see how PathPilo works for your business.',
    },
    {
      question: 'What if I need help getting started?',
      answer: 'We provide comprehensive onboarding support. Our step-by-step setup wizard guides you through initial configuration. We also offer documentation, best practices guides, and customer support. Most businesses are up and running within an hour. If you need additional help, contact our support team.',
    },
    {
      question: 'Can I export my data if I need to?',
      answer: 'Yes, you maintain full control of your data. You can export client information, job history, invoices, and reports at any time. We believe in data portability, so you\'re never locked in. Export formats include CSV and PDF for easy integration with other tools.',
    },
  ]

  return (
    <>
      <Header />
      {/* Hero Section */}
      <section className="gradient-bg pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-800 mb-6">
            {da ? 'Ofte stillede spørgsmål' : 'Frequently Asked Questions'}
          </h1>
          <p className="text-xl text-gray-600">
            {da ? 'Alt du skal vide om PathPilo, og hvordan platformen kan hjælpe din servicevirksomhed.' : 'Everything you need to know about PathPilo and how it can help your service business.'}
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-white rounded-xl border border-primary-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                <button
                  onClick={() => toggleQuestion(index)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-primary-50 transition-colors"
                >
                  <h3 className="text-lg font-semibold text-primary-800 pr-8">
                    {faq.question}
                  </h3>
                  <ChevronDownIcon
                    className={`w-6 h-6 text-gray-400 flex-shrink-0 transition-transform ${openIndex === index ? 'transform rotate-180' : ''
                      }`}
                  />
                </button>
                {openIndex === index && (
                  <div className="px-6 pb-5 pt-0">
                    <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Still Have Questions */}
      <section className="py-20 bg-primary-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-primary-800 mb-4">
            {da ? 'Har du stadig spørgsmål?' : 'Still Have Questions?'}
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            {da ? 'Vores team er klar til at hjælpe. Kontakt os, så vender vi tilbage inden for 24 timer.' : "Our team is here to help. Contact us and we'll get back to you within 24 hours."}
          </p>
          <a href={withLocalePath(locale, '/contact')} className="btn-primary text-lg px-8 py-4 inline-block">
            {da ? 'Kontakt os' : 'Contact Us'}
          </a>
        </div>
      </section>

      {/* CTA Section */}
      <CTASection
        title={da ? 'Klar til at komme i gang?' : 'Ready to Get Started?'}
        subtitle={da ? 'Bliv en del af hundredvis af servicevirksomheder, der bruger PathPilo til at effektivisere driften.' : 'Join hundreds of service businesses using PathPilo to streamline their operations.'}
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt salg' : 'Contact Sales'}
        secondaryLink="/contact"
      />

      <Footer />
    </>
  )
}