import Link from 'next/link'
import Header from '../components/Header'
import Footer from '../components/Footer'

export function PrivacyContent({ locale }: { locale: string }) {
  const da = locale === 'da'
  const lastUpdated = da ? 'Senest opdateret: 21. maj 2026' : 'Last updated: May 21, 2026'

  return (
    <>
      <Header />

      <section className="gradient-bg pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-800 mb-6">
            {da ? 'Privatlivspolitik' : 'Privacy Policy'}
          </h1>
          <p className="text-xl text-gray-600">{lastUpdated}</p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="prose prose-lg max-w-none text-gray-700">
            <p className="lead text-lg leading-relaxed mb-8">
              {da
                ? 'Hos PathPilo tager vi dine data alvorligt. Denne politik forklarer, hvilke oplysninger vi indsamler, hvordan vi bruger dem, og hvilke rettigheder du har under GDPR.'
                : 'At PathPilo we take your data seriously. This policy explains what information we collect, how we use it, and the rights you have under the GDPR.'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              1. {da ? 'Dataansvarlig' : 'Data controller'}
            </h2>
            <p>
              {da
                ? 'PathPilo er dataansvarlig for personoplysninger om dig som bruger af vores website og tjenester. For data du tilføjer om dine egne kunder og medarbejdere er du dataansvarlig, og vi er databehandler.'
                : 'PathPilo is the data controller for personal data about you as a user of our website and services. For data you add about your own clients and employees, you are the data controller and we act as a data processor.'}
            </p>
            <p>
              {da ? 'Kontakt: ' : 'Contact: '}
              <a className="text-accent-700 hover:text-accent-800 font-semibold" href="mailto:mikkel@pathpilo.com">
                mikkel@pathpilo.com
              </a>
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              2. {da ? 'Hvilke oplysninger indsamler vi?' : 'What information do we collect?'}
            </h2>
            <p>
              {da ? 'Vi indsamler og behandler følgende kategorier af oplysninger:' : 'We collect and process the following categories of information:'}
            </p>
            <ul className="list-disc pl-6 space-y-2 my-4">
              <li>
                <strong>{da ? 'Kontooplysninger' : 'Account information'}:</strong>{' '}
                {da
                  ? 'navn, e-mail, virksomhed, rolle og adgangskode (hashet).'
                  : 'name, email, company, role and password (hashed).'}
              </li>
              <li>
                <strong>{da ? 'Brugsdata' : 'Usage data'}:</strong>{' '}
                {da
                  ? 'hvordan du bruger PathPilo, login-tidspunkter, IP-adresse, browser og enhedstype.'
                  : 'how you use PathPilo, login times, IP address, browser and device type.'}
              </li>
              <li>
                <strong>{da ? 'Indhold du tilføjer' : 'Content you add'}:</strong>{' '}
                {da
                  ? 'kunder, opgaver, ruter, fakturaer og lignende, du eller dine medarbejdere opretter i PathPilo.'
                  : 'clients, jobs, routes, invoices and similar content created in PathPilo by you or your team.'}
              </li>
              <li>
                <strong>{da ? 'Kommunikation' : 'Communication'}:</strong>{' '}
                {da
                  ? 'beskeder du sender til vores support og marketing-tilmeldinger.'
                  : 'messages you send to our support team and any marketing subscriptions.'}
              </li>
            </ul>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              3. {da ? 'Hvad bruger vi oplysningerne til?' : 'How do we use this information?'}
            </h2>
            <ul className="list-disc pl-6 space-y-2 my-4">
              <li>{da ? 'At levere og forbedre PathPilo,' : 'To provide and improve PathPilo,'}</li>
              <li>{da ? 'at autentificere dig og sikre din konto,' : 'to authenticate you and secure your account,'}</li>
              <li>{da ? 'at sende drifts- og servicebeskeder samt support,' : 'to send operational and service messages, and provide support,'}</li>
              <li>{da ? 'at sende relevant produktinformation, hvis du har samtykket,' : 'to send relevant product communications, where you have consented,'}</li>
              <li>{da ? 'at overholde lovkrav, herunder bogføring og skat.' : 'to comply with legal obligations, including bookkeeping and tax.'}</li>
            </ul>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              4. {da ? 'Retsgrundlag' : 'Legal basis'}
            </h2>
            <p>
              {da
                ? 'Vi behandler dine personoplysninger på grundlag af aftalen mellem dig og PathPilo (GDPR art. 6, stk. 1, litra b), vores legitime interesse i at drive og forbedre tjenesten (litra f), dit samtykke (litra a) og retlige forpligtelser (litra c).'
                : 'We process your personal data on the basis of the contract between you and PathPilo (GDPR art. 6(1)(b)), our legitimate interest in operating and improving the service (art. 6(1)(f)), your consent (art. 6(1)(a)) and legal obligations (art. 6(1)(c)).'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              5. {da ? 'Deling af oplysninger' : 'Sharing of information'}
            </h2>
            <p>
              {da
                ? 'Vi sælger ikke dine data. Vi deler data med:'
                : 'We do not sell your data. We share data with:'}
            </p>
            <ul className="list-disc pl-6 space-y-2 my-4">
              <li>{da ? 'Driftsleverandører (hosting, e-mail, betalingsleverandører) som vores databehandlere,' : 'Service providers (hosting, email, payment processors) acting as our data processors,'}</li>
              <li>{da ? 'andre brugere i din virksomhed, i det omfang det er nødvendigt for at bruge PathPilo,' : 'other users in your company, to the extent necessary to use PathPilo,'}</li>
              <li>{da ? 'myndigheder, hvis det kræves ved lov.' : 'authorities, where required by law.'}</li>
            </ul>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              6. {da ? 'Overførsler til tredjelande' : 'International transfers'}
            </h2>
            <p>
              {da
                ? 'Vores primære infrastruktur er i EU. Hvis vi anvender leverandører udenfor EU/EØS, sikrer vi et passende beskyttelsesniveau via EU-Kommissionens standardkontraktbestemmelser eller en tilstrækkelighedsafgørelse.'
                : "Our primary infrastructure is in the EU. If we use providers outside the EU/EEA, we ensure an adequate level of protection through the European Commission's Standard Contractual Clauses or an adequacy decision."}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              7. {da ? 'Opbevaring' : 'Retention'}
            </h2>
            <p>
              {da
                ? 'Vi opbevarer oplysninger så længe det er nødvendigt for at levere tjenesten og opfylde lovkrav. Når en konto slettes, fjernes personoplysninger inden for 90 dage, medmindre lov kræver længere opbevaring (typisk bogføringsmateriale i op til 5 år).'
                : 'We keep information for as long as necessary to provide the service and to comply with legal requirements. When an account is deleted, personal data is removed within 90 days, unless law requires longer retention (typically accounting records for up to 5 years).'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              8. {da ? 'Sikkerhed' : 'Security'}
            </h2>
            <p>
              {da
                ? 'Vi anvender passende tekniske og organisatoriske foranstaltninger til at beskytte data, herunder kryptering under transport, kryptering af adgangskoder, rollebaseret adgangskontrol og løbende overvågning.'
                : 'We use appropriate technical and organisational measures to protect data, including encryption in transit, password hashing, role-based access control and continuous monitoring.'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              9. {da ? 'Dine rettigheder' : 'Your rights'}
            </h2>
            <p>{da ? 'Du har ret til at:' : 'You have the right to:'}</p>
            <ul className="list-disc pl-6 space-y-2 my-4">
              <li>{da ? 'få indsigt i de oplysninger vi behandler om dig,' : 'access the information we process about you,'}</li>
              <li>{da ? 'få urigtige oplysninger rettet,' : 'have incorrect information corrected,'}</li>
              <li>{da ? 'få oplysninger slettet, hvor det er muligt,' : 'have information erased where possible,'}</li>
              <li>{da ? 'gøre indsigelse eller bede om begrænsning af behandlingen,' : 'object to or request restriction of processing,'}</li>
              <li>{da ? 'modtage dine oplysninger i et struktureret format (dataportabilitet),' : 'receive your information in a structured format (data portability),'}</li>
              <li>{da ? 'tilbagekalde samtykke til enhver tid,' : 'withdraw consent at any time,'}</li>
              <li>{da ? 'klage til Datatilsynet (datatilsynet.dk).' : 'lodge a complaint with the Danish Data Protection Agency (datatilsynet.dk).'}</li>
            </ul>
            <p>
              {da ? 'For at udøve dine rettigheder, kontakt ' : 'To exercise your rights, contact '}
              <a className="text-accent-700 hover:text-accent-800 font-semibold" href="mailto:mikkel@pathpilo.com">
                mikkel@pathpilo.com
              </a>
              .
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              10. {da ? 'Cookies' : 'Cookies'}
            </h2>
            <p>
              {da
                ? 'Vi bruger cookies til at få websitet og tjenesten til at fungere, til at forstå brugen, og — med dit samtykke — til marketingformål. Du kan administrere cookies i din browser. Læs mere i vores cookie-banner ved første besøg.'
                : 'We use cookies to make the website and service work, to understand usage, and — with your consent — for marketing purposes. You can manage cookies in your browser. See our cookie banner on first visit for details.'}
            </p>

            <h2 className="text-2xl font-bold text-primary-800 mt-10 mb-4">
              11. {da ? 'Ændringer' : 'Changes'}
            </h2>
            <p>
              {da
                ? 'Vi kan opdatere denne politik. Den aktuelle version vises altid her med dato. Ved væsentlige ændringer informerer vi dig direkte i PathPilo eller pr. e-mail.'
                : 'We may update this policy. The current version is always shown here with the date. For material changes we will notify you directly in PathPilo or by email.'}
            </p>

            <p className="mt-12 text-sm text-gray-500">
              {da ? 'Se også ' : 'See also '}
              <Link
                href={`/${locale}/terms`}
                className="text-accent-700 hover:text-accent-800 font-semibold"
              >
                {da ? 'Servicevilkår' : 'Terms of Service'}
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
