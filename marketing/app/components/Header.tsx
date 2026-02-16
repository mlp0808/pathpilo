'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="bg-white border-b border-primary-100 sticky top-0 z-50 shadow-sm">
      <nav className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="w-10 h-10 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
              <span className="text-white font-bold text-xl">P</span>
            </div>
            <span className="text-2xl font-bold text-primary-800">PathPilo</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link href="/features" className="text-gray-600 hover:text-primary-800 font-medium transition-colors">
              Features
            </Link>
            <Link href="/pricing" className="text-gray-600 hover:text-primary-800 font-medium transition-colors">
              Pricing
            </Link>
            <Link href="/about" className="text-gray-600 hover:text-primary-800 font-medium transition-colors">
              About
            </Link>
            <Link href="/faq" className="text-gray-600 hover:text-primary-800 font-medium transition-colors">
              FAQ
            </Link>
            <Link href="/contact" className="text-gray-600 hover:text-primary-800 font-medium transition-colors">
              Contact
            </Link>
            <Link href="https://app.pathpilo.com/login" className="text-gray-600 hover:text-primary-800 font-medium transition-colors">
              Sign In
            </Link>
            <Link href="https://app.pathpilo.com/register" className="btn-primary">
              Get Started
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-gray-600 hover:text-primary-800"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <XMarkIcon className="w-6 h-6" />
            ) : (
              <Bars3Icon className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 space-y-3 border-t border-primary-100 pt-4">
            <Link href="/features" className="block py-2 text-gray-600 hover:text-primary-800 font-medium">
              Features
            </Link>
            <Link href="/pricing" className="block py-2 text-gray-600 hover:text-primary-800 font-medium">
              Pricing
            </Link>
            <Link href="/about" className="block py-2 text-gray-600 hover:text-primary-800 font-medium">
              About
            </Link>
            <Link href="/faq" className="block py-2 text-gray-600 hover:text-primary-800 font-medium">
              FAQ
            </Link>
            <Link href="/contact" className="block py-2 text-gray-600 hover:text-primary-800 font-medium">
              Contact
            </Link>
            <Link href="https://app.pathpilo.com/login" className="block py-2 text-gray-600 hover:text-primary-800 font-medium">
              Sign In
            </Link>
            <Link href="https://app.pathpilo.com/register" className="block btn-primary text-center mt-4">
              Get Started
            </Link>
          </div>
        )}
      </nav>
    </header>
  )
}
