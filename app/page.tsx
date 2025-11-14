import Link from 'next/link'
import { StarIcon } from '@heroicons/react/24/outline'

export default function HomePage() {
  return (
    <div className="min-h-screen gradient-bg">
      {/* Navigation */}
      <nav className="relative px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">V</span>
            </div>
            <span className="text-xl font-bold text-gray-900">Vevago</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/admin" className="text-gray-600 hover:text-gray-900 font-medium">
              Admin
            </Link>
            <Link href="/login" className="text-gray-600 hover:text-gray-900 font-medium">
              Sign In
            </Link>
            <Link href="/register" className="btn-primary">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative px-6 py-16 md:py-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Manage Your Service Business
              <span className="block text-blue-600">Like a Pro</span>
            </h1>
            <p className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed">
              Vevago helps service companies like window cleaners, landscapers, and maintenance teams 
              streamline client management, job scheduling, and recurring tasks.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
              <Link href="/register" className="btn-primary text-lg px-8 py-4 rounded-lg">
                Start for free
              </Link>
              <Link href="/pricing" className="btn-secondary text-lg px-8 py-4 rounded-lg">
                Prices
              </Link>
            </div>

            {/* Video Section */}
            <div className="mb-20 -mx-6 md:-mx-12">
              <div className="relative w-full h-[400px] md:h-[500px] bg-gray-300 rounded-2xl overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-20 h-20 mx-auto text-gray-500 mb-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                    <p className="text-gray-600">Video placeholder</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Social Proof */}
            <div className="flex items-center justify-center space-x-8 text-sm text-gray-500 mb-20">
              <div className="flex items-center space-x-1">
                {[...Array(5)].map((_, i) => (
                  <StarIcon key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                ))}
                <span className="ml-2">4.9/5 from 500+ companies</span>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto mb-24">
            <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-full h-56 bg-gray-300 rounded-t-2xl">
                {/* Image placeholder - replace with actual image */}
              </div>
              <div className="p-8">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Client Management</h3>
                <p className="text-gray-600 leading-relaxed">Keep all your client information organized in one place. Track contact details, service history, and preferences.</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-full h-56 bg-gray-300 rounded-t-2xl">
                {/* Image placeholder - replace with actual image */}
              </div>
              <div className="p-8">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Job Scheduling</h3>
                <p className="text-gray-600 leading-relaxed">Schedule and track jobs efficiently. Set up recurring tasks and never miss an appointment again.</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-full h-56 bg-gray-300 rounded-t-2xl">
                {/* Image placeholder - replace with actual image */}
              </div>
              <div className="p-8">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Analytics & Reports</h3>
                <p className="text-gray-600 leading-relaxed">Get insights into your business performance with detailed reports and analytics dashboard.</p>
              </div>
            </div>
          </div>

          {/* Additional Section 1 */}
          <div className="mb-24">
            <div className="max-w-7xl mx-auto text-center px-6">
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">Why Choose Vevago?</h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                Join hundreds of service companies that trust Vevago to manage their business operations efficiently.
              </p>
            </div>
          </div>

          {/* Additional Section 2 */}
          <div className="mb-24">
            <div className="max-w-7xl mx-auto px-6">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">Streamline Your Operations</h2>
                  <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                    Save time and reduce errors with our comprehensive business management platform designed specifically for service companies.
                  </p>
                  <Link href="/register" className="btn-primary inline-block rounded-lg px-6 py-3">
                    Get Started Today
                  </Link>
                </div>
                <div className="bg-gray-300 h-80 rounded-2xl overflow-hidden">
                  {/* Image placeholder */}
                </div>
              </div>
            </div>
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
              <span className="text-lg font-semibold text-gray-900">Vevago</span>
            </div>
            <div className="text-sm text-gray-500">
              © 2024 Vevago. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
