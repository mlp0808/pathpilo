import type { Metadata } from 'next'
import Header from './components/Header'
import Footer from './components/Footer'
import CTASection from './components/CTASection'
import HeroSection from './components/HeroSection'
import FeaturesShowcase from './components/FeaturesShowcase'

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

export default function HomePage({ locale = 'en' }: { locale?: string }) {
  const da = locale === 'da'
  return (
    <>
      <Header />

      <HeroSection />

      <FeaturesShowcase />

      {/* Benefits Section */}
      <section className="py-20 bg-primary-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="section-title">{da ? 'Hvorfor servicevirksomheder vælger PathPilo' : 'Why Service Businesses Choose PathPilo'}</h2>
            <p className="section-subtitle mx-auto">
              {da
                ? 'Bliv en del af hundredvis af servicevirksomheder, der har transformeret deres drift med PathPilo.'
                : 'Join hundreds of service companies that have transformed their operations with PathPilo.'}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-accent-600 mb-2">10+</div>
              <div className="text-gray-600 font-medium">{da ? 'Timer sparet pr. uge' : 'Hours Saved Per Week'}</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-accent-600 mb-2">95%</div>
              <div className="text-gray-600 font-medium">{da ? 'Færre planlægningsfejl' : 'Reduction in Scheduling Errors'}</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-accent-600 mb-2">30%</div>
              <div className="text-gray-600 font-medium">{da ? 'Flere afsluttede opgaver' : 'Increase in Completed Jobs'}</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-accent-600 mb-2">100%</div>
              <div className="text-gray-600 font-medium">{da ? 'Mobilvenlig platform' : 'Mobile-Friendly Platform'}</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <CTASection 
        title={da ? 'Klar til at transformere din servicevirksomhed?' : 'Ready to Transform Your Service Business?'}
        subtitle={da ? 'Kom i gang gratis i dag. Intet kreditkort påkrævet. Kom i gang på få minutter.' : 'Get started for free today. No credit card required. Set up in minutes.'}
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt salg' : 'Contact Sales'}
        secondaryLink="/contact"
      />

      <Footer />
    </>
  )
}
