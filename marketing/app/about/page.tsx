import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '../components/Header'
import Footer from '../components/Footer'
import CTASection from '../components/CTASection'
import Breadcrumbs, { BREADCRUMB_ON_LIGHT } from '../components/Breadcrumbs'
import { breadcrumbsForRoute } from '../lib/breadcrumbs'
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

export default function AboutPage({ locale = 'en' }: { locale?: string }) {
  const da = locale === 'da'
  return (
    <>
      <Header />

      {/* Hero Section */}
      <section className="gradient-bg pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Breadcrumbs
            items={breadcrumbsForRoute(da ? 'da' : 'en', 'about')}
            className={`${BREADCRUMB_ON_LIGHT} justify-center`}
          />
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-800 mb-6">
            {da ? 'Bygget til servicevirksomheder af branchefolk' : 'Built for Service Businesses, by Service Industry Experts'}
          </h1>
          <p className="text-xl text-gray-600">
            {da
              ? 'Vi forstår de særlige udfordringer ved at drive en mobil servicevirksomhed. Derfor byggede vi PathPilo.'
              : "We understand the unique challenges of running a mobile service business. That's why we built PathPilo."}
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="prose prose-lg max-w-none">
            <h2 className="text-3xl font-bold text-primary-800 mb-6">{da ? 'Vores mission' : 'Our Mission'}</h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              {da
                ? 'PathPilo opstod ud fra en enkel observation: servicevirksomheder kæmpede med forældede værktøjer, der ikke passede til deres behov.'
                : "PathPilo was born from a simple observation: service businesses were struggling with outdated tools that weren't designed for their specific needs. Spreadsheets for scheduling, paper forms for client information, manual invoicing—these tools were holding businesses back."}
            </p>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              {da
                ? 'Vi satte os for at bygge en platform, der forstår mobile servicevirksomheder: flere medarbejdere, koordination, gentagne opgaver og stærke kunderelationer - mens arbejdet foregår på farten.'
                : 'We set out to create a platform that understands the unique challenges of mobile service businesses: managing multiple employees, coordinating schedules, handling recurring jobs, and maintaining strong client relationships—all while being on the go.'}
            </p>
            <p className="text-lg text-gray-600 leading-relaxed">
              {da
                ? 'I dag hjælper PathPilo hundredvis af servicevirksomheder med at spare tid, reducere fejl, øge omsætning og levere bedre service.'
                : "Today, PathPilo helps hundreds of service companies save time, reduce errors, increase revenue, and provide better service to their clients. We're proud to be part of their success stories."}
            </p>
          </div>
        </div>
      </section>

      {/* Why PathPilo Section */}
      <section className="py-20 bg-primary-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="section-title">{da ? 'Hvorfor PathPilo?' : 'Why PathPilo?'}</h2>
            <p className="section-subtitle mx-auto">
              {da ? 'Vi har bygget PathPilo med servicevirksomheder i centrum. Her er, hvad der gør os anderledes.' : "We've built PathPilo with service businesses in mind. Here's what makes us different."}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl p-8 shadow-md border border-primary-100">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <UserGroupIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4">
                {da ? 'Bygget til din branche' : 'Built for Your Industry'}
              </h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                {da ? 'I modsætning til generisk software er PathPilo designet specifikt til mobile servicevirksomheder.' : 'Unlike generic business software, PathPilo is designed specifically for mobile service businesses. We understand recurring jobs, team coordination, and the challenges of managing work on the go.'}
              </p>
              <ul className="space-y-2">
                {(da
                  ? ['Automatisering af gentagne opgaver', 'Planlægning af flere medarbejdere', 'Mobil-først design', 'Branchetilpassede funktioner']
                  : ['Recurring job automation', 'Multi-employee scheduling', 'Mobile-first design', 'Service-specific features']).map((item, i) => (
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
                {da ? 'Spar tid, øg omsætningen' : 'Save Time, Increase Revenue'}
              </h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                {da ? 'PathPilo automatiserer tidskrævende opgaver, så du kan fokusere på vækst og kunder.' : 'PathPilo automates the tasks that eat up your time, so you can focus on growing your business and serving your clients better.'}
              </p>
              <ul className="space-y-2">
                {(da
                  ? ['10+ timer sparet om ugen', '95% færre planlægningsfejl', '30% flere afsluttede opgaver', 'Hurtigere fakturering']
                  : ['10+ hours saved per week', '95% reduction in scheduling errors', '30% increase in completed jobs', 'Faster invoice generation']).map((item, i) => (
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
                {da ? 'Datadrevne beslutninger' : 'Data-Driven Decisions'}
              </h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                {da ? 'Træf bedre beslutninger med analyser og indsigt i performance, muligheder og vækst.' : 'Make informed decisions with comprehensive analytics. Understand your business performance, identify opportunities, and track growth.'}
              </p>
              <ul className="space-y-2">
                {(da
                  ? ['Omsætning i realtid', 'Team-performance', 'Indsigt i kundeadfærd', 'Analyse af valgte datoer']
                  : ['Real-time revenue tracking', 'Team performance metrics', 'Client activity insights', 'Custom date range analysis']).map((item, i) => (
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
                {da ? 'Nem at bruge, stærke funktioner' : 'Easy to Use, Powerful Features'}
              </h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                {da ? 'PathPilo kombinerer kraftfulde funktioner med et intuitivt design, så teamet er produktivt fra dag ét.' : 'PathPilo balances powerful features with intuitive design. Your team will be productive from day one, without extensive training.'}
              </p>
              <ul className="space-y-2">
                {(da
                  ? ['Intuitiv drag-and-drop planlægning', 'Mobilresponsivt design', 'Hurtig opsætning', 'Hjælperessourcer og support']
                  : ['Intuitive drag-and-drop scheduling', 'Mobile-responsive design', 'Quick setup in minutes', 'Comprehensive help resources']).map((item, i) => (
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
          <h2 className="text-3xl font-bold text-primary-800 mb-8 text-center">{da ? 'Vores værdier' : 'Our Values'}</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-primary-800 mb-2">{da ? 'Kunden først' : 'Customer-First'}</h3>
              <p className="text-gray-600 leading-relaxed">
                {da ? 'Din succes er vores succes. Vi lytter til feedback og bygger funktioner, der løser reelle problemer.' : 'Your success is our success. We listen to feedback, continuously improve, and build features that solve real problems for service businesses.'}
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary-800 mb-2">{da ? 'Simplicitet' : 'Simplicity'}</h3>
              <p className="text-gray-600 leading-relaxed">
                {da ? 'Kraftfuldt behøver ikke være kompliceret. Vi designer PathPilo intuitivt og enkelt.' : "Powerful doesn't have to mean complicated. We design PathPilo to be intuitive and easy to use, so you spend less time learning and more time growing your business."}
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary-800 mb-2">{da ? 'Pålidelighed' : 'Reliability'}</h3>
              <p className="text-gray-600 leading-relaxed">
                {da ? 'Din forretning afhænger af PathPilo, derfor er stabilitet afgørende. Vi investerer i drift, sikkerhed og support.' : 'Your business depends on PathPilo, so reliability is non-negotiable. We invest in infrastructure, security, and support to ensure PathPilo is always available when you need it.'}
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary-800 mb-2">{da ? 'Innovation' : 'Innovation'}</h3>
              <p className="text-gray-600 leading-relaxed">
                {da ? 'Vi forbedrer løbende PathPilo med nye funktioner. Når din forretning udvikler sig, gør PathPilo det samme.' : "We're constantly improving PathPilo with new features and enhancements. As your business evolves, PathPilo evolves with you."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <CTASection 
        title={da ? 'Bliv en del af PathPilo-fællesskabet' : 'Join the PathPilo Community'}
        subtitle={da ? 'Hundredvis af servicevirksomheder stoler på PathPilo i deres daglige drift.' : 'Hundreds of service businesses trust PathPilo to manage their operations. See why they chose us.'}
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt os' : 'Contact Us'}
        secondaryLink="/contact"
      />

      <Footer />
    </>
  )
}
