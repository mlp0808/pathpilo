import type { Metadata } from 'next'
import Link from 'next/link'
import Header from './components/Header'
import Footer from './components/Footer'
import CTASection from './components/CTASection'
import {
  CalendarDaysIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  BellIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'

export const metadata: Metadata = {
  title: 'PathPilo - Complete Service Management Platform for Mobile Service Businesses',
  description: 'Streamline your service business operations with PathPilo. Manage scheduling, clients, jobs, invoicing, and team coordination all in one powerful platform. Perfect for cleaning companies, landscapers, and home maintenance services.',
  keywords: 'service management software, field service management, job scheduling software, client management, service business software, mobile service management',
  openGraph: {
    title: 'PathPilo - Complete Service Management Platform',
    description: 'The all-in-one platform for managing your mobile service business',
    type: 'website',
  },
}

export default function HomePage() {
  return (
    <>
      <Header />
      
      {/* Hero Section */}
      <section className="gradient-bg pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-primary-800 mb-6 leading-tight">
              Manage Your Service Business
              <span className="block text-accent-600 mt-2">Like a Pro</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-10 leading-relaxed">
              PathPilo helps mobile service businesses streamline scheduling, client management, 
              team coordination, and invoicing—all in one powerful platform. 
              <span className="block mt-2 font-medium text-primary-800">
                Stop juggling spreadsheets. Start growing your business.
              </span>
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
              <Link href="https://app.pathpilo.com/register" className="btn-primary text-lg px-8 py-4">
                Start Free Trial
              </Link>
              <Link href="/pricing" className="btn-secondary text-lg px-8 py-4">
                View Pricing
              </Link>
            </div>

            {/* Hero Image/Dashboard Preview */}
            <div className="relative -mx-6 md:-mx-12 mb-16">
              <div className="relative w-full h-[400px] md:h-[500px] bg-white rounded-2xl shadow-2xl border border-primary-100 overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-50 to-white">
                  <div className="text-center p-8">
                    <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-accent-400 to-accent-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <CalendarDaysIcon className="w-12 h-12 text-white" />
                    </div>
                    <p className="text-gray-600 text-lg font-medium">Interactive Dashboard Preview</p>
                    <p className="text-gray-500 text-sm mt-2">See your business at a glance</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Social Proof */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-sm text-gray-600">
              <div className="flex items-center space-x-1">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
                <span className="ml-2 font-semibold text-primary-800">4.9/5</span>
                <span className="ml-1">from 500+ service companies</span>
              </div>
              <div className="hidden sm:block w-px h-6 bg-gray-300"></div>
              <div>
                <span className="font-semibold text-primary-800">Trusted by</span> cleaning companies, landscapers, and maintenance teams
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features Grid */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="section-title">Everything You Need to Run Your Service Business</h2>
            <p className="section-subtitle mx-auto">
              Powerful features designed specifically for mobile service businesses with multiple employees and recurring jobs.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1: Scheduling */}
            <div className="feature-card group">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-md group-hover:shadow-lg transition-shadow">
                <CalendarDaysIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary-800 mb-3">Smart Scheduling</h3>
              <p className="text-gray-600 leading-relaxed">
                Drag-and-drop calendar scheduling with conflict detection. View by day, week, or month. Never double-book again.
              </p>
            </div>

            {/* Feature 2: Client Management */}
            <div className="feature-card group">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-md group-hover:shadow-lg transition-shadow">
                <UserGroupIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary-800 mb-3">Client Management</h3>
              <p className="text-gray-600 leading-relaxed">
                Complete client profiles with contact info, service history, and preferences. Support for both individuals and businesses.
              </p>
            </div>

            {/* Feature 3: Recurring Jobs */}
            <div className="feature-card group">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-md group-hover:shadow-lg transition-shadow">
                <ArrowPathIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary-800 mb-3">Recurring Jobs</h3>
              <p className="text-gray-600 leading-relaxed">
                Set up weekly or monthly subscriptions. Automatic job creation saves hours every week.
              </p>
            </div>

            {/* Feature 4: Invoicing */}
            <div className="feature-card group">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-md group-hover:shadow-lg transition-shadow">
                <CurrencyDollarIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary-800 mb-3">Professional Invoicing</h3>
              <p className="text-gray-600 leading-relaxed">
                Generate professional invoices in minutes. Apply discounts, calculate taxes, and send via email.
              </p>
            </div>

            {/* Feature 5: Analytics */}
            <div className="feature-card group">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-md group-hover:shadow-lg transition-shadow">
                <ChartBarIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary-800 mb-3">Business Analytics</h3>
              <p className="text-gray-600 leading-relaxed">
                Real-time dashboards show revenue, completed jobs, team performance, and more. Make data-driven decisions.
              </p>
            </div>

            {/* Feature 6: Team Management */}
            <div className="feature-card group">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-md group-hover:shadow-lg transition-shadow">
                <UsersIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary-800 mb-3">Team Coordination</h3>
              <p className="text-gray-600 leading-relaxed">
                Manage employees, set work hours, track performance, and assign jobs. Role-based access control included.
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link href="/features" className="text-accent-600 hover:text-accent-700 font-semibold text-lg">
              Explore All Features →
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-primary-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="section-title">Why Service Businesses Choose PathPilo</h2>
            <p className="section-subtitle mx-auto">
              Join hundreds of service companies that have transformed their operations with PathPilo.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-accent-600 mb-2">10+</div>
              <div className="text-gray-600 font-medium">Hours Saved Per Week</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-accent-600 mb-2">95%</div>
              <div className="text-gray-600 font-medium">Reduction in Scheduling Errors</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-accent-600 mb-2">30%</div>
              <div className="text-gray-600 font-medium">Increase in Completed Jobs</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-accent-600 mb-2">100%</div>
              <div className="text-gray-600 font-medium">Mobile-Friendly Platform</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <CTASection 
        title="Ready to Transform Your Service Business?"
        subtitle="Start your free trial today. No credit card required. Set up in minutes."
        primaryCTA="Start Free Trial"
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA="Contact Sales"
        secondaryLink="/contact"
      />

      <Footer />
    </>
  )
}
