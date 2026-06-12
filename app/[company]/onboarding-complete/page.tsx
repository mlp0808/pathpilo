'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  MapIcon,
  DocumentTextIcon,
  UserGroupIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  PlayCircleIcon,
  BookOpenIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'

const NEXT_STEPS = [
  {
    icon: MapIcon,
    title: 'Route planning',
    description: 'Learn how to build and optimise multi-stop routes for your team.',
    href: 'https://help.pathpilo.com',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
  },
  {
    icon: DocumentTextIcon,
    title: 'Invoicing',
    description: 'Create and send professional invoices and track payments.',
    href: 'https://help.pathpilo.com',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
  {
    icon: UserGroupIcon,
    title: 'Leads & forms',
    description: 'Capture new leads from your website with embedded forms.',
    href: 'https://help.pathpilo.com',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: ArrowPathIcon,
    title: 'Recurring jobs',
    description: 'Set up jobs that repeat weekly, bi-weekly or on any schedule.',
    href: 'https://help.pathpilo.com',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
]

export default function OnboardingCompletePage() {
  const params = useParams()
  const slug = params?.company as string | undefined

  const [firstName, setFirstName] = useState('')
  const [companyName, setCompanyName] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user')
      if (!raw) return
      const user = JSON.parse(raw)
      setFirstName(user?.firstName || '')
      setCompanyName(user?.activeCompany?.name || user?.companyName || '')
    } catch { /* ignore */ }
  }, [])

  const dashboardHref = slug ? `/${slug}/dashboard` : '/dashboard'

  return (
    <div className="min-h-screen bg-[#f8faf9]">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-[#0d2020] to-[#193434] pb-20 pt-16 text-center px-6">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#3DD57A]/20 ring-4 ring-[#3DD57A]/10">
          <CheckCircleIcon className="h-9 w-9 text-[#3DD57A]" />
        </div>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          {firstName ? `You're all set, ${firstName}!` : "You're all set!"}
        </h1>
        {companyName && (
          <p className="mt-2 text-lg font-semibold text-[#3DD57A]">{companyName}</p>
        )}
        <p className="mx-auto mt-3 max-w-lg text-base text-white/60 leading-relaxed">
          You've completed the onboarding and created your first route plan.
          Your account is ready — everything is set up and waiting for you.
        </p>
        <Link
          href={dashboardHref}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#3DD57A] px-7 py-3.5 text-sm font-semibold text-[#0d2020] shadow-lg shadow-[#3DD57A]/25 transition hover:bg-[#2ec46a]"
        >
          Go to your dashboard
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-20 -mt-6">

        {/* ── How to get help ───────────────────────────────────────── */}
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 p-6 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <SparklesIcon className="h-5 w-5 text-[#3DD57A]" />
            <h2 className="text-base font-bold text-gray-900">How to get help</h2>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            These two buttons are always available in the app — look for them in the bottom of the left sidebar.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Help Center card */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm border border-gray-100">
                  <BookOpenIcon className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Help Center</p>
                  <p className="text-xs text-gray-500">Step-by-step guides</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">
                Written articles for every feature. Search anything — setting up a route, creating an invoice, inviting a team member.
              </p>
              {/* Simulated button preview */}
              <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-xs text-gray-400 text-center">
                Look for the <span className="font-semibold text-gray-600">📖 Help Center</span> button in the sidebar
              </div>
            </div>

            {/* Video Guides card */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm border border-gray-100">
                  <PlayCircleIcon className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Video Guides</p>
                  <p className="text-xs text-gray-500">Watch &amp; follow along</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">
                Short video walkthroughs for the most common tasks. Great when you prefer to see something done rather than read about it.
              </p>
              {/* Simulated button preview */}
              <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-xs text-gray-400 text-center">
                Look for the <span className="font-semibold text-gray-600">▶ Video guides</span> button in the sidebar
              </div>
            </div>
          </div>

          {/* Live chat callout */}
          <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#3DD57A]/8 border border-[#3DD57A]/20 px-4 py-3">
            <ChatBubbleLeftRightIcon className="h-5 w-5 text-[#2aa860] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-gray-900">Stuck on something?</span> The chat bubble in the bottom-right corner connects you directly to our team. We&apos;re real people and usually reply within a few hours.
            </p>
          </div>
        </div>

        {/* ── What to explore next ──────────────────────────────────── */}
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-1">What do you want to learn next?</h2>
          <p className="text-sm text-gray-500 mb-5">Pick a topic and the Help Center will walk you through it.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {NEXT_STEPS.map((step) => (
              <a
                key={step.title}
                href={step.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3.5 rounded-xl border border-gray-100 p-4 transition hover:border-gray-200 hover:shadow-sm"
              >
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${step.bg}`}>
                  <step.icon className={`h-5 w-5 ${step.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-[#2aa860] transition-colors">
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 leading-snug">{step.description}</p>
                </div>
                <ArrowRightIcon className="h-4 w-4 flex-shrink-0 text-gray-300 mt-0.5 group-hover:text-gray-500 transition-colors" />
              </a>
            ))}
          </div>

          <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t border-gray-100">
            <p className="text-sm text-gray-500">Ready to dive in? Your dashboard has everything in one place.</p>
            <Link
              href={dashboardHref}
              className="inline-flex items-center gap-2 rounded-xl bg-[#193434] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d2020] whitespace-nowrap"
            >
              Go to dashboard
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
