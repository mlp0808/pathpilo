'use client'

import type { Metadata } from 'next'
import { useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import CTASection from '../components/CTASection'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  const toggleQuestion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  const faqs = [
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
      answer: 'Yes! We offer a free trial so you can explore all features risk-free. No credit card required. Set up your company, add services and clients, create jobs, and see how PathPilo works for your business. If you have questions during your trial, our support team is here to help.',
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
            Frequently Asked Questions
          </h1>
          <p className="text-xl text-gray-600">
            Everything you need to know about PathPilo and how it can help your service business.
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
                    className={`w-6 h-6 text-gray-400 flex-shrink-0 transition-transform ${
                      openIndex === index ? 'transform rotate-180' : ''
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
            Still Have Questions?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Our team is here to help. Contact us and we'll get back to you within 24 hours.
          </p>
          <a href="/contact" className="btn-primary text-lg px-8 py-4 inline-block">
            Contact Us
          </a>
        </div>
      </section>

      {/* CTA Section */}
      <CTASection 
        title="Ready to Get Started?"
        subtitle="Join hundreds of service businesses using PathPilo to streamline their operations."
        primaryCTA="Start Free Trial"
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA="Contact Sales"
        secondaryLink="/contact"
      />

      <Footer />
    </>
  )
}
