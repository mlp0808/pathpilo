import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '../components/Header'
import Footer from '../components/Footer'
import CTASection from '../components/CTASection'
import {
  ClockIcon,
  ChartBarIcon,
  UserGroupIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

export const metadata: Metadata = {
  title: 'About PathPilo - Why We Built the Best Service Management Platform',
  description: 'Learn why PathPilo was created specifically for mobile service businesses. Built by service industry experts who understand your challenges and needs.',
  keywords: 'about PathPilo, service management platform, why PathPilo, service business software',
}

export default function AboutPage() {
  return (
    <>
      <Header />
      
      {/* Hero Section */}
      <section className="gradient-bg pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-800 mb-6">
            Built for Service Businesses, by Service Industry Experts
          </h1>
          <p className="text-xl text-gray-600">
            We understand the unique challenges of running a mobile service business. 
            That's why we built PathPilo.
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="prose prose-lg max-w-none">
            <h2 className="text-3xl font-bold text-primary-800 mb-6">Our Mission</h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              PathPilo was born from a simple observation: service businesses were struggling 
              with outdated tools that weren't designed for their specific needs. Spreadsheets 
              for scheduling, paper forms for client information, manual invoicing—these tools 
              were holding businesses back.
            </p>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              We set out to create a platform that understands the unique challenges of mobile 
              service businesses: managing multiple employees, coordinating schedules, handling 
              recurring jobs, and maintaining strong client relationships—all while being on the go.
            </p>
            <p className="text-lg text-gray-600 leading-relaxed">
              Today, PathPilo helps hundreds of service companies save time, reduce errors, 
              increase revenue, and provide better service to their clients. We're proud to be 
              part of their success stories.
            </p>
          </div>
        </div>
      </section>

      {/* Why PathPilo Section */}
      <section className="py-20 bg-primary-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="section-title">Why PathPilo?</h2>
            <p className="section-subtitle mx-auto">
              We've built PathPilo with service businesses in mind. Here's what makes us different.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl p-8 shadow-md border border-primary-100">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <UserGroupIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4">
                Built for Your Industry
              </h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                Unlike generic business software, PathPilo is designed specifically for mobile 
                service businesses. We understand recurring jobs, team coordination, and the 
                challenges of managing work on the go.
              </p>
              <ul className="space-y-2">
                {[
                  'Recurring job automation',
                  'Multi-employee scheduling',
                  'Mobile-first design',
                  'Service-specific features',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-accent-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-md border border-primary-100">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <ClockIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4">
                Save Time, Increase Revenue
              </h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                PathPilo automates the tasks that eat up your time, so you can focus on 
                growing your business and serving your clients better.
              </p>
              <ul className="space-y-2">
                {[
                  '10+ hours saved per week',
                  '95% reduction in scheduling errors',
                  '30% increase in completed jobs',
                  'Faster invoice generation',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-accent-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-md border border-primary-100">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <ChartBarIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4">
                Data-Driven Decisions
              </h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                Make informed decisions with comprehensive analytics. Understand your business 
                performance, identify opportunities, and track growth.
              </p>
              <ul className="space-y-2">
                {[
                  'Real-time revenue tracking',
                  'Team performance metrics',
                  'Client activity insights',
                  'Custom date range analysis',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-accent-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-md border border-primary-100">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <CheckCircleIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4">
                Easy to Use, Powerful Features
              </h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                PathPilo balances powerful features with intuitive design. Your team will be 
                productive from day one, without extensive training.
              </p>
              <ul className="space-y-2">
                {[
                  'Intuitive drag-and-drop scheduling',
                  'Mobile-responsive design',
                  'Quick setup in minutes',
                  'Comprehensive help resources',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-accent-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-primary-800 mb-8 text-center">Our Values</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-primary-800 mb-2">Customer-First</h3>
              <p className="text-gray-600 leading-relaxed">
                Your success is our success. We listen to feedback, continuously improve, 
                and build features that solve real problems for service businesses.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary-800 mb-2">Simplicity</h3>
              <p className="text-gray-600 leading-relaxed">
                Powerful doesn't have to mean complicated. We design PathPilo to be intuitive 
                and easy to use, so you spend less time learning and more time growing your business.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary-800 mb-2">Reliability</h3>
              <p className="text-gray-600 leading-relaxed">
                Your business depends on PathPilo, so reliability is non-negotiable. We invest 
                in infrastructure, security, and support to ensure PathPilo is always available when you need it.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary-800 mb-2">Innovation</h3>
              <p className="text-gray-600 leading-relaxed">
                We're constantly improving PathPilo with new features and enhancements. 
                As your business evolves, PathPilo evolves with you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <CTASection 
        title="Join the PathPilo Community"
        subtitle="Hundreds of service businesses trust PathPilo to manage their operations. See why they chose us."
        primaryCTA="Start Free Trial"
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA="Contact Us"
        secondaryLink="/contact"
      />

      <Footer />
    </>
  )
}
