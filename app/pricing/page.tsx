import Link from 'next/link'
import { CheckIcon } from '@heroicons/react/24/outline'

export default function PricingPage() {
  return (
    <div className="min-h-screen gradient-bg">
      {/* Navigation */}
      <nav className="relative px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">V</span>
            </div>
            <span className="text-xl font-bold text-gray-900">PathPilo</span>
          </Link>
          <div className="flex items-center space-x-4">
            <Link href="/login" className="text-gray-600 hover:text-gray-900 font-medium">
              Sign In
            </Link>
            <Link href="/register" className="btn-primary">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Pricing Section */}
      <main className="relative p-[40px]">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Start free and scale as you grow. Perfect for solo operators and growing teams.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-16">
            {/* Personal Company - Free */}
            <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 p-8">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Personal Company</h2>
                <div className="flex items-baseline mb-4">
                  <span className="text-5xl font-bold text-gray-900">Free</span>
                </div>
                <p className="text-gray-600">Perfect for solo operators and small teams</p>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <CheckIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Client management system</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Recurring jobs</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Time tracking</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Weekly planner</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Invoice tracker</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Up to 100 jobs per month</span>
                </li>
              </ul>

              <Link 
                href="/register" 
                className="block w-full text-center btn-secondary rounded-lg py-3 px-6 font-semibold"
              >
                Get Started Free
              </Link>
            </div>

            {/* Professional - Paid */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-600 p-8 relative">
              {/* Popular Badge */}
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                  Most Popular
                </span>
              </div>

              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Professional</h2>
                <div className="flex items-baseline mb-2">
                  <span className="text-5xl font-bold text-gray-900">£35</span>
                  <span className="text-gray-600 ml-2">/month</span>
                </div>
                <div className="mb-4">
                  <p className="text-sm text-gray-600 line-through">£420/year</p>
                  <p className="text-lg font-semibold text-green-600">
                    £210/year <span className="text-sm text-gray-600">(50% off)</span>
                  </p>
                </div>
                <p className="text-gray-600">For growing teams and larger operations</p>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <CheckIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">All from Personal Company plan</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Unlimited employee users</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Unlimited jobs per month</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Automated client emails</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Lead form generator</span>
                </li>
              </ul>

              <Link 
                href="/register" 
                className="block w-full text-center btn-primary rounded-lg py-3 px-6 font-semibold"
              >
                Start Professional Plan
              </Link>
            </div>
          </div>

          {/* FAQ or Additional Info */}
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-gray-600 mb-4">
              All plans include a 14-day free trial. No credit card required.
            </p>
            <p className="text-sm text-gray-500">
              Cancel anytime. Upgrade or downgrade your plan at any time.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-24">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">V</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">PathPilo</span>
            </div>
            <div className="text-sm text-gray-500">
              © 2024 PathPilo. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}


