import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '../components/Header'
import Footer from '../components/Footer'
import CTASection from '../components/CTASection'
import {
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  ArrowPathIcon,
  UserGroupIcon,
  EnvelopeIcon,
  CurrencyDollarIcon,
  UsersIcon,
  DevicePhoneMobileIcon,
  BellIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'

export const metadata: Metadata = {
  title: 'Features - PathPilo Service Management Platform',
  description: 'Discover all the powerful features PathPilo offers: smart scheduling, client management, recurring jobs, invoicing, team coordination, lead management, and mobile-first design. Built specifically for mobile service businesses.',
  keywords: 'service management features, job scheduling features, client management features, field service software features, mobile service management features',
}

interface Feature {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  benefits: string[]
  imageAlt: string
}

const features: Feature[] = [
  {
    icon: CalendarDaysIcon,
    title: 'Scheduling & Calendar Management',
    description: 'Intelligent scheduling system designed for mobile service businesses with multiple employees and complex job requirements.',
    benefits: [
      'Drag-and-drop calendar interface for easy rescheduling',
      'Multiple view modes: day, week, month, and year',
      'Automatic conflict detection prevents double-booking',
      'Employee availability checking based on work hours',
      'Visual status indicators (scheduled, completed, cancelled)',
      'Quick job creation with pre-filled client and service data',
      'Bulk scheduling for recurring jobs',
    ],
    imageAlt: 'PathPilo calendar scheduling interface showing weekly view with color-coded jobs',
  },
  {
    icon: ClipboardDocumentListIcon,
    title: 'Job Management',
    description: 'Complete job lifecycle management from creation to completion, with detailed tracking and customization options.',
    benefits: [
      'Create jobs in seconds with service bundling',
      'Custom pricing and duration per job',
      'Add detailed notes and special instructions',
      'Time range selection (from/to) or single time slots',
      'Job status tracking: scheduled, completed, cancelled',
      'Quick job recreation from completed jobs',
      'Complete audit trail of all changes',
      'Job history and service records',
    ],
    imageAlt: 'PathPilo job management interface showing job details and status tracking',
  },
  {
    icon: ArrowPathIcon,
    title: 'Recurring Jobs & Subscriptions',
    description: 'Automate recurring work with flexible subscription management. Set it once and let PathPilo handle the rest.',
    benefits: [
      'Weekly or monthly recurring schedules',
      'Custom intervals (every 2 weeks, every 3 months, etc.)',
      'Day of week or day of month selection',
      'Automatic job creation based on subscription rules',
      'Pause, skip, or modify subscriptions anytime',
      'Multiple services per subscription',
      'Custom pricing for subscription jobs',
      'Recurring revenue tracking and forecasting',
    ],
    imageAlt: 'PathPilo subscription management showing recurring job setup and schedule',
  },
  {
    icon: UserGroupIcon,
    title: 'Client Management',
    description: 'Comprehensive CRM for managing all your client relationships, from individual customers to large businesses.',
    benefits: [
      'Support for both individual and business clients',
      'Complete contact information and addresses',
      'Separate billing addresses and contact info',
      'Company details: CVR numbers, contact persons',
      'Complete service history per client',
      'Client notes and preferences',
      'Quick search and filtering',
      'Bulk client operations',
    ],
    imageAlt: 'PathPilo client management dashboard showing client profiles and contact information',
  },
  {
    icon: EnvelopeIcon,
    title: 'CRM / Lead Management',
    description: 'Capture, track, and convert leads into customers with custom lead forms and comprehensive lead management.',
    benefits: [
      'Custom lead capture forms for your website',
      'Public form links for social media and marketing',
      'Drag-and-drop form builder',
      'Service selection directly from forms',
      'Preferred date and time capture',
      'Lead status tracking: new, contacted, won, lost',
      'Convert leads directly to clients and jobs',
      'Email notifications for new leads',
    ],
    imageAlt: 'PathPilo lead management interface showing lead forms and conversion tracking',
  },
  {
    icon: CurrencyDollarIcon,
    title: 'Invoicing & Payments',
    description: 'Professional invoicing system that saves hours every week. Generate, customize, and send invoices in minutes.',
    benefits: [
      'Multiple invoice styles: jobs, tasks, or detailed breakdowns',
      'Flexible discount application per job or service',
      'Automatic tax calculation',
      'Multi-currency support',
      'Custom invoice titles and descriptions',
      'Email invoices directly to clients',
      'PDF export for record-keeping',
      'Invoice history and payment tracking',
    ],
    imageAlt: 'PathPilo invoicing interface showing professional invoice generation and customization',
  },
  {
    icon: UsersIcon,
    title: 'Team & Employee Management',
    description: 'Coordinate your team efficiently with role-based access, work hours management, and performance tracking.',
    benefits: [
      'Role-based access control (owner, manager, employee)',
      'Email invitations for team members',
      'Individual work hours configuration',
      'Employee availability and capacity planning',
      'Performance tracking and analytics',
      'Job assignment and workload distribution',
      'Team directory and contact management',
      'Pending invitation tracking',
    ],
    imageAlt: 'PathPilo team management dashboard showing employee profiles and work schedules',
  },
  {
    icon: DevicePhoneMobileIcon,
    title: 'Mobile-First Experience',
    description: 'Access PathPilo from any device. Our responsive design ensures your team can work efficiently on the go.',
    benefits: [
      'Fully responsive design for all screen sizes',
      'Touch-optimized interface for mobile devices',
      'Fast performance on mobile networks',
      'Offline capability for viewing schedules',
      'Mobile-friendly forms and inputs',
      'Push notifications for job updates',
      'Quick actions optimized for mobile',
      'Native app feel in the browser',
    ],
    imageAlt: 'PathPilo mobile interface showing responsive design on smartphone and tablet',
  },
  {
    icon: BellIcon,
    title: 'Automated Communication & Notifications',
    description: 'Stay connected with clients through automated, professional communication. Customize templates to match your brand.',
    benefits: [
      'Customizable email templates',
      'Automatic job confirmation emails',
      'Change notifications (date, time, employee)',
      'Cancellation emails with custom messages',
      'Invoice delivery via email',
      'Lead submission notifications',
      'Dynamic content with placeholders',
      'Professional branding across all communications',
    ],
    imageAlt: 'PathPilo email template customization interface showing notification settings',
  },
  {
    icon: ChartBarIcon,
    title: 'Dashboard & Analytics',
    description: 'Make data-driven decisions with comprehensive business intelligence and real-time performance metrics.',
    benefits: [
      'Real-time revenue tracking (completed and projected)',
      'Job completion statistics',
      'Team performance analytics',
      'Client activity metrics',
      'Custom date range analysis',
      'Interactive charts and visualizations',
      'Export reports for accounting',
      'Trend analysis and forecasting',
    ],
    imageAlt: 'PathPilo analytics dashboard showing revenue charts, job statistics, and team performance metrics',
  },
]

export default function FeaturesPage() {
  return (
    <>
      <Header />
      
      {/* Hero Section */}
      <section className="gradient-bg pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-800 mb-6">
            Powerful Features for Service Businesses
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Everything you need to manage your mobile service business efficiently. 
            Built specifically for companies with multiple employees and recurring jobs.
          </p>
        </div>
      </section>

      {/* Features List */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          {features.map((feature, index) => {
            const Icon = feature.icon
            const isEven = index % 2 === 0
            
            return (
              <div
                key={feature.title}
                className={`mb-24 last:mb-0 ${
                  isEven ? 'md:flex-row' : 'md:flex-row-reverse'
                } flex flex-col md:flex items-center gap-12`}
              >
                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-accent-400 to-accent-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold text-primary-800">
                      {feature.title}
                    </h2>
                  </div>
                  <p className="text-xl text-gray-600 mb-6 leading-relaxed">
                    {feature.description}
                  </p>
                  <ul className="space-y-3">
                    {feature.benefits.map((benefit, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-accent-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-accent-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <span className="text-gray-700">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Image Placeholder */}
                <div className="flex-1">
                  <div className="w-full h-[400px] bg-gradient-to-br from-primary-50 to-white rounded-2xl shadow-xl border border-primary-100 flex items-center justify-center">
                    <div className="text-center p-8">
                      <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-accent-400 to-accent-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <Icon className="w-12 h-12 text-white" />
                      </div>
                      <p className="text-gray-600 font-medium">{feature.imageAlt}</p>
                      <p className="text-gray-500 text-sm mt-2">Screenshot placeholder</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Benefits Summary */}
      <section className="py-20 bg-primary-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="section-title">What You Get with PathPilo</h2>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white rounded-xl p-6 shadow-md border border-primary-100">
              <h3 className="text-xl font-bold text-primary-800 mb-3">Save Time</h3>
              <p className="text-gray-600">
                Automate scheduling, invoicing, and client communication. Save 10+ hours per week.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-md border border-primary-100">
              <h3 className="text-xl font-bold text-primary-800 mb-3">Reduce Errors</h3>
              <p className="text-gray-600">
                Eliminate double-booking and scheduling conflicts. 95% reduction in scheduling errors.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-md border border-primary-100">
              <h3 className="text-xl font-bold text-primary-800 mb-3">Increase Revenue</h3>
              <p className="text-gray-600">
                Better organization leads to more completed jobs. Average 30% increase in completed work.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-md border border-primary-100">
              <h3 className="text-xl font-bold text-primary-800 mb-3">Improve Client Satisfaction</h3>
              <p className="text-gray-600">
                Professional communication and reliable scheduling build stronger client relationships.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-md border border-primary-100">
              <h3 className="text-xl font-bold text-primary-800 mb-3">Gain Insights</h3>
              <p className="text-gray-600">
                Make data-driven decisions with comprehensive analytics and performance metrics.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-md border border-primary-100">
              <h3 className="text-xl font-bold text-primary-800 mb-3">Scale Your Business</h3>
              <p className="text-gray-600">
                Tools that grow with your business. From solo operator to multi-employee teams.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <CTASection 
        title="Ready to Experience These Features?"
        subtitle="Start your free trial and see how PathPilo can transform your service business."
        primaryCTA="Start Free Trial"
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA="Contact Sales"
        secondaryLink="/contact"
      />

      <Footer />
    </>
  )
}
