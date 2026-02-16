import Link from 'next/link'

interface CTASectionProps {
  title?: string
  subtitle?: string
  primaryCTA?: string
  primaryLink?: string
  secondaryCTA?: string
  secondaryLink?: string
  variant?: 'default' | 'accent'
}

export default function CTASection({
  title = "Ready to Transform Your Service Business?",
  subtitle = "Join hundreds of service companies that trust PathPilo to manage their operations efficiently.",
  primaryCTA = "Get Started Today",
  primaryLink = "https://app.pathpilo.com/register",
  secondaryCTA,
  secondaryLink,
  variant = 'default'
}: CTASectionProps) {
  const bgClass = variant === 'accent' 
    ? 'bg-gradient-to-br from-accent-500 to-accent-600' 
    : 'bg-gradient-to-br from-primary-50 to-white'
  
  const textColor = variant === 'accent' ? 'text-white' : 'text-primary-800'
  const subtitleColor = variant === 'accent' ? 'text-white/90' : 'text-gray-600'

  return (
    <section className={`${bgClass} py-16 md:py-24`}>
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className={`text-3xl md:text-4xl font-bold mb-4 ${textColor}`}>
          {title}
        </h2>
        <p className={`text-lg md:text-xl mb-8 ${subtitleColor}`}>
          {subtitle}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link href={primaryLink} className="btn-primary text-lg px-8 py-4">
            {primaryCTA}
          </Link>
          {secondaryCTA && secondaryLink && (
            <Link href={secondaryLink} className={`${variant === 'accent' ? 'btn-outline border-white text-white hover:bg-white hover:text-accent-600' : 'btn-secondary'} text-lg px-8 py-4`}>
              {secondaryCTA}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
