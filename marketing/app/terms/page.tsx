import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '../components/Header'
import Footer from '../components/Footer'

export const metadata: Metadata = {
  title: 'Terms of Service - PathPilo',
  description:
    'PathPilo Terms of Service. The agreement between you and PathPilo when you use the PathPilo service management platform.',
}

export default function TermsPage({ locale = 'en' }: { locale?: string }) {
  const da = locale === 'da'
  const lastUpdated = da ? 'Senest opdateret: 21. maj 2026' : 'Last updated: May 21, 2026'

  return (
    <>
      <Header />

      {/* Hero */}
      <section className="gradient-bg pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-800 mb-6">
            {da ? 'Servicevilkår' : 'Terms of Service'}
          </h1>
          <p className="text-xl text-gray-600">{lastUpdated}</p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="prose prose-lg max-w-none text-gray-700">
            <p className="lead text-lg leading-relaxed mb-8">
              {da
                ? 'Disse vilkår ("Vilkår") gælder for din brug af PathPilo. Ved at oprette en konto eller bruge PathPilo accepterer du disse Vilkår. Læs dem grundigt.'
                : 'These terms ("Terms") govern your use of PathPilo. By creating an account or using PathPilo you agree to these Terms. Please read them carefully.'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              1. {da ? 'Hvem vi er' : 'Who we are'}
            </h2>
            <p>
              {da
                ? 'PathPilo leveres af PathPilo (i det følgende "vi", "os" eller "PathPilo"). Hvis du har spørgsmål kan du kontakte os på '
                : 'PathPilo is provided by PathPilo (referred to as "we", "us" or "PathPilo"). If you have any questions you can reach us at '}
              <a className="text-accent-700 hover:text-accent-800 font-semibold" href="mailto:mikkel@pathpilo.com">
                mikkel@pathpilo.com
              </a>
              .
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              2. {da ? 'Din konto' : 'Your account'}
            </h2>
            <p>
              {da
                ? 'For at bruge PathPilo skal du oprette en konto. Du er ansvarlig for at holde dine loginoplysninger fortrolige og for al aktivitet på din konto. Giv os besked med det samme, hvis du har mistanke om uautoriseret adgang.'
                : 'To use PathPilo you must create an account. You are responsible for keeping your login credentials confidential and for all activity on your account. Notify us immediately if you suspect unauthorised access.'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              3. {da ? 'Brug af tjenesten' : 'Use of the service'}
            </h2>
            <p>
              {da
                ? 'Du må bruge PathPilo til legitime forretningsformål, der overholder gældende lov. Du må ikke:'
                : 'You may use PathPilo for legitimate business purposes that comply with applicable law. You must not:'}
            </p>
            <ul className="list-disc pl-6 space-y-2 my-4">
              <li>{da ? 'forsøge at omgå sikkerhedsforanstaltninger eller adgangskontroller,' : 'attempt to circumvent security or access controls,'}</li>
              <li>{da ? 'uploade indhold der er ulovligt, krænker rettigheder eller indeholder skadelig kode,' : 'upload content that is unlawful, infringes rights, or contains harmful code,'}</li>
              <li>{da ? 'bruge tjenesten til at sende spam eller uønskede meddelelser,' : 'use the service to send spam or unsolicited messages,'}</li>
              <li>{da ? 'reverse-engineere eller kopiere PathPilos kode, design eller funktionalitet.' : 'reverse-engineer or copy the PathPilo code, design or functionality.'}</li>
            </ul>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              4. {da ? 'Dine data' : 'Your data'}
            </h2>
            <p>
              {da
                ? 'Data du tilføjer til PathPilo (kunder, opgaver, medarbejdere mv.) tilhører dig. Vi behandler data som behandler på dine vegne i overensstemmelse med vores '
                : 'Data you add to PathPilo (clients, jobs, employees, etc.) belongs to you. We process the data as a processor on your behalf in accordance with our '}
              <Link
                href={`/${locale}/privacy`}
                className="text-accent-700 hover:text-accent-800 font-semibold"
              >
                {da ? 'Privatlivspolitik' : 'Privacy Policy'}
              </Link>
              .
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              5. {da ? 'Betaling og abonnement' : 'Billing and subscription'}
            </h2>
            <p>
              {da
                ? 'Adgang til betalte funktioner kræver et aktivt abonnement. Abonnementer fornys automatisk for den valgte periode, indtil de opsiges. Du kan opsige dit abonnement når som helst. Allerede betalte beløb refunderes som udgangspunkt ikke, medmindre andet er aftalt eller krævet i lovgivningen.'
                : 'Access to paid features requires an active subscription. Subscriptions renew automatically for the chosen period until cancelled. You can cancel your subscription at any time. Amounts already paid are non-refundable unless agreed otherwise or required by law.'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              6. {da ? 'Tilgængelighed' : 'Availability'}
            </h2>
            <p>
              {da
                ? 'Vi tilstræber høj oppetid men kan ikke garantere uafbrudt drift. Vi kan udføre planlagt vedligeholdelse og opdateringer, normalt udenfor primær arbejdstid. Vi er ikke ansvarlige for afbrydelser uden for vores kontrol.'
                : 'We strive for high uptime but cannot guarantee uninterrupted service. We may perform planned maintenance and updates, typically outside primary business hours. We are not liable for interruptions outside of our control.'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              7. {da ? 'Opsigelse' : 'Termination'}
            </h2>
            <p>
              {da
                ? 'Du kan opsige din konto når som helst fra dine kontoindstillinger. Vi kan suspendere eller opsige din konto, hvis du overtræder disse Vilkår eller udgør en risiko for andre brugere eller tjenesten.'
                : 'You can cancel your account at any time from your account settings. We may suspend or terminate your account if you breach these Terms or pose a risk to other users or the service.'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              8. {da ? 'Ansvarsfraskrivelse' : 'Disclaimers'}
            </h2>
            <p>
              {da
                ? 'PathPilo leveres "som den er". Vi yder ingen garantier udover hvad der følger af gældende ret. Vi er ikke ansvarlige for indirekte tab, herunder tabt fortjeneste eller tabte data, i det omfang det er tilladt i loven.'
                : 'PathPilo is provided "as is". We make no warranties beyond those required by law. To the extent permitted by law, we are not liable for indirect losses, including lost profits or lost data.'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              9. {da ? 'Ændringer til disse vilkår' : 'Changes to these terms'}
            </h2>
            <p>
              {da
                ? 'Vi kan opdatere disse Vilkår fra tid til anden. Hvis vi foretager væsentlige ændringer, informerer vi dig via PathPilo eller e-mail. Fortsat brug efter ændringer betragtes som accept.'
                : 'We may update these Terms from time to time. If we make material changes we will notify you through PathPilo or by email. Continued use after changes constitutes acceptance.'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              10. {da ? 'Lovvalg' : 'Governing law'}
            </h2>
            <p>
              {da
                ? 'Disse Vilkår er underlagt dansk ret. Tvister skal afgøres ved de danske domstole, medmindre andet følger af ufravigelige forbrugerregler.'
                : 'These Terms are governed by Danish law. Disputes shall be resolved before the Danish courts, unless mandatory consumer rules require otherwise.'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              11. {da ? 'Kontakt' : 'Contact'}
            </h2>
            <p>
              {da ? 'Spørgsmål til Vilkårene? Skriv til ' : 'Questions about these Terms? Email '}
              <a className="text-accent-700 hover:text-accent-800 font-semibold" href="mailto:mikkel@pathpilo.com">
                mikkel@pathpilo.com
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
