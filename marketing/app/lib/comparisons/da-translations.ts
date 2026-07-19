/**
 * Danish locale overrides for comparison pages.
 * Merged on top of the English base data when locale === 'da'.
 */
import type { ComparisonPageTranslation } from './types'

export const DA_COMPARISON_TRANSLATIONS: Record<string, ComparisonPageTranslation> = {
  // ─────────────────────────────────────────────────────────────────────────
  // PathPilo vs Jobber (vinduespolering)
  // ─────────────────────────────────────────────────────────────────────────
  'pathpilo-vs-jobber-window-cleaning': {
    seoTitle: 'PathPilo vs Jobber til vinduespolerere (2026): Ærlig sammenligning',
    seoDescription:
      'PathPilo vs Jobber til vinduespoleringsvirksomheder i 2026. Side-om-side priser, ruteplanlægning, påmindelser og fakturering. Find ud af hvad der er bedst for en enkeltmandsbedrift eller et lille hold.',
    headline: 'PathPilo vs Jobber til vinduespolerere',
    sub: 'Jobber er et af de mest udbredte field service-værktøjer. PathPilo er bygget til mindre, mobil-første teams. Her er en ærlig sammenligning af de to til en vinduespoleringsvirksomhed.',
    verdict:
      'Jobber er en moden, funktionsrig platform der passer bedst til virksomheder med mange fag eller større operationer der har brug for avanceret rapportering og integrationer. For en solo vinduespolerer eller et lille hold tilbyder PathPilo den samme kernearbejdsproces uden omkostninger og uden den kompleksitet der følger med en platform bygget til større operationer.',
    sections: [
      {
        id: 'what-each-is-built-for',
        title: 'Hvad er hver platform bygget til?',
        body: 'Jobber blev grundlagt i 2011 og har udviklet sig til en omfattende field service-platform der betjener snesevis af fag. Det har et dybt funktionssæt der dækker alt fra tilbudsopfølgning til jobomkostningsberegning til en marketingplatform. Den bredde er dens styrke og dens kompromis: det er et virkelig kraftfuldt værktøj, men det er bygget til behovene i en virksomhed med 3 til 15 teknikere på tværs af flere fag — ikke en solo vinduespolerer der styrer 30 tilbagevendende kunder.\n\nPathPilo er bygget til mobile serviceteams der driver deres virksomhed fra en telefon. Fokus er på de tre ting vinduespolerere har brug for hver uge: stop sorteret efter område, kunder der ved du kommer og at blive betalt uden at jagte. Det er enklere af design.',
      },
      {
        id: 'pricing',
        title: 'Priser: hvad du faktisk betaler',
        body: 'Jobbens publicerede priser starter ved $39/måned for Core-planen ($25/måned ved årsafregning). Det lyder rimeligt indtil du ser på hvad Core inkluderer til en vinduespolerer: planlægning, fakturering, et basalt CRM og online booking. Hvad det ikke inkluderer er automatiske aftalereminders eller ruteoptimering. Begge er låst bag Connect-planen til $83/måned ved årsafregning.\n\nFor en solo vinduespolerer der vil sende SMS til kunder dagen inden og have systemet sortere stop effektivt er Jobber Connect realistisk set det minimum nyttige niveau — til mere end tre gange prisen af PathPilos teamplan.\n\nPathPilos gratis plan inkluderer ruteplanlægning, automatiske påmindelser, fakturering med betalingslinks og en online bookingformular. Ingen minimumsudgift. Ingen prøveperiodeudløb.',
      },
      {
        id: 'route-planning',
        title: 'Ruteplanlægning og planlægning',
        body: 'Jobbens ruteoptimering er tilgængelig på Connect og derover. Det sorterer stop efter geografi og integrerer med ugeplanlæggeren. For større operationer med flere teknikere er dens kortvisning og træk-og-slip-balanceringsværktøjer virkelig nyttige.\n\nFor en vinduespoleringsvirksomhed er kernekravet enklere: dagens jobs sorteret efter område så du kører mindre. PathPilo håndterer dette automatisk med tilbagevendende jobstyring der holder faste kunder opdateret i den rigtige rækkefølge uge efter uge. Begge platforme betjener dette use case. Forskellen er at Jobber kræver at du betaler for Connect for at få det.',
      },
      {
        id: 'reminders',
        title: 'Kundepåmindelser og kommunikation',
        body: 'Automatiske aftalereminders er en af de mest værdifulde funktioner for vinduespolerere. Færre lukkede låger, færre spildte ture, gladere kunder. I Jobber er automatiske påmindelser en Connect-niveau-funktion til $119/måned eller $83/måned ved årsafregning. På Core kan du sende påmindelser manuelt, men der er ingen automatisering.\n\nPathPilo inkluderer automatiske påmindelser i den gratis plan: en SMS til kunden dagen inden og en valgfri "jeg er på vej"-besked når du tager afsted. Begge sendes automatisk uden manuelle trin.',
      },
      {
        id: 'team-pricing',
        title: 'Teampriser: den omkostning der vokser hurtigst',
        body: 'Her ændrer sammenligningen sig markant. Jobbens priser skalerer med brugere. Core er $39/måned for én bruger ($25/måned ved årsafregning). Tilføj en anden person og du betaler en ekstra $29/måned. Et 5-personers team på Jobber Connect koster $124/måned ved årsafregning. Et 10-personers team på Grow koster $249/måned ved årsafregning.\n\nPathPilos Virksomhedsplan afregnes til £299 per år, ca. £25/måned, og dækker et ubegrænset antal teammedlemmer. Uanset om du har 2 rengørere eller 20 forbliver månedsprisen den samme.\n\nFor et 5-personers vinduespoleringshold: Jobber er $124/måned ved årsafregning. PathPilo er £25/måned ved årsafregning. For et 10-personers hold: Jobber er $249/måned. PathPilo er stadig £25/måned. Kløften vokser hver gang du ansætter.',
      },
    ],
    prosCons: {
      pathpilo: {
        pros: [
          'Gratis plan med ruteplanlægning, påmindelser og fakturering inkluderet',
          'Ubegrænset teammedlemmer til en fast månedspris',
          'Enkelt og hurtigt at opsætte — klar på en eftermiddag',
          'Mobilvenlig og designet til servicearbejde i marken',
        ],
        cons: [
          'Nyere platform med færre tredjeparts integrationer',
          'Avanceret rapportering og jobomkostningsberegning endnu ikke tilgængeligt',
          'Færre muligheder for flertrads virksomheder',
        ],
      },
      jobber: {
        pros: [
          'Modet platform med bredt funktionssæt og integrationer',
          'Stærk rapportering og jobomkostningsanalyse',
          'Passer til flertrads virksomheder med komplekse behov',
          'Stor brugercommunity og veletableret support',
        ],
        cons: [
          'Ruteplanlægning og automatiske påmindelser kræver Connect-planen ($83/måned)',
          'Prisen stiger med hvert teammedlem',
          'Mere kompleks opsætning end nødvendigt for enkle vinduespoleringsforretninger',
          'Ingen gratis plan — kun 14-dages prøveperiode',
        ],
      },
    },
    whoShouldChoose: {
      pathpilo:
        'Vælg PathPilo hvis du er en solo vinduespolerer eller et lille hold der vil have ruteplanlægning, automatiske påmindelser og fakturering gratis — uden at betale månedsvis for funktioner der passer bedre til større virksomheder.',
      jobber:
        'Vælg Jobber hvis du driver en flertradsbedrift med 5+ teknikere, har brug for avanceret rapportering eller jobomkostningsberegning og er villig til at betale for et mere funktionsrigt system.',
    },
    faq: [
      {
        q: 'Er PathPilo virkelig gratis?',
        a: 'Ja. PathPilos gratis plan inkluderer ruteplanlægning, tilbagevendende jobstyring, automatiske kundepåmindelser, fakturering og betalingslinks. Der er intet kreditkort og ingen tidsbegrænsning. Du betaler kun hvis du vokser til et team og har brug for de ekstra teamfunktioner.',
      },
      {
        q: 'Hvad er den største forskel mellem PathPilo og Jobber?',
        a: 'Den største forskel er pris og kompleksitet. Jobber er et kraftfuldt multi-trade-system med mange funktioner — men du betaler for det, og for funktioner som ruteplanlægning og automatiske påmindelser skal du opgradere til $83/måned. PathPilo inkluderer dem gratis og er designet til at være enklere at bruge.',
      },
      {
        q: 'Kan jeg flytte mine kunder fra Jobber til PathPilo?',
        a: 'Ja. Du kan eksportere dine kundedata fra Jobber og importere dem i PathPilo. Kontakt PathPilo-support for hjælp til migrering.',
      },
      {
        q: 'Hvad sker der med mine data hvis jeg stopper med at bruge PathPilo?',
        a: 'Du kan eksportere alle dine data til enhver tid. PathPilo ejer ikke dine kundedata — det gør du.',
      },
      {
        q: 'Hvad koster det for et team på 5 vinduespolerere?',
        a: 'PathPilo-virksomhedsplanen koster £25/måned (faktureret årligt) for ubegrænsede teammedlemmer. Jobbets Connect-plan til 5 brugere koster ca. $124/måned (faktureret årligt). Besparelsen stiger med hvert teammedlem.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PathPilo vs Squeegee (vinduespolering)
  // ─────────────────────────────────────────────────────────────────────────
  'pathpilo-vs-squeegee-window-cleaning': {
    seoTitle: 'PathPilo vs Squeegee til vinduespolerere (2026): Ærlig sammenligning',
    seoDescription:
      'PathPilo vs Squeegee til vinduespoleringsvirksomheder. Sammenligning af priser, ruteplanlægning og funktioner. Find ud af hvad der er bedst for en solo operatør eller et lille hold.',
    headline: 'PathPilo vs Squeegee til vinduespolerere',
    sub: 'Squeegee er en af de få apps bygget specifikt til vinduespolerere. PathPilo er en bredere serviceplatform med gratis plan. Her er hvad du bør overveje.',
    verdict:
      'Squeegee er et solidt valg for vinduespolerere der allerede bruger det og er tilfredse. Men det er ikke gratis, prisen stiger med hvert teammedlem og det er begrænset til vinduespolering som fag. PathPilo dækker den samme kernearbejdsproces gratis, fungerer for flere servicetyper og vokser med dit team uden at koste mere per person.',
    sections: [
      {
        id: 'what-each-is-built-for',
        title: 'Hvad er hver platform bygget til?',
        body: 'Squeegee er bygget specifikt til vinduespolerere. Det afspejler branchens terminologi, har en intuitiv rute-kortvisning og kunder i primært UK og Australien. Det er en purpose-built app der forstår den specifikke arbejdsgang for vinduespolering.\n\nPathPilo er en bredere serviceplatform der dækker vinduespolering, rengøring, haveservice, tagrenserensning og mere. For en vinduespolerer er kerneoperationerne de samme: rutesortering, kundepåmindelser og fakturering. PathPilo leverer disse gratis med den ekstra fleksibilitet til at udvide til andre servicetyper.',
      },
      {
        id: 'pricing',
        title: 'Priser: hvad du faktisk betaler',
        body: 'Squeegees startpris er £19 per bruger per måned. For en solo operatør er det £19/måned. For et 5-personers hold er det £95/måned. For et 10-personers hold er det £190/måned. Der er ingen gratis plan — kun en prøveperiode.\n\nPathPilos gratis plan dækker ruteplanlægning, automatiske påmindelser, fakturering og betalingslinks for en enkelt operatør. Teamplanen er £25/måned (faktureret årligt) for ubegrænsede teammedlemmer. For et 5-personers hold sparer du £70/måned med PathPilo sammenlignet med Squeegee. For et 10-personers hold sparer du £165/måned.',
      },
      {
        id: 'route-planning',
        title: 'Ruteplanlægning og planlægning',
        body: 'Begge platforme tilbyder rutesortering efter geografisk nærhed og en visuel kortvisning. Squeegees rutehåndtering er velkendt og veldokumenteret i den engelske vinduespoleringsbranche.\n\nPathPilos ruteplanlægning inkluderer automatisk sortering af stop, draggable dagsoversigt, ugeplanlæggerfunktion og integration med jobstyring. For en vinduespolerer er funktionerne i praksis sammenlignelige. Den vigtigste forskel er at PathPilo inkluderer det i sin gratis plan.',
      },
      {
        id: 'reminders',
        title: 'Kundepåmindelser',
        body: 'Begge platforme inkluderer automatiske kundepåmindelser. Squeegee sender tekstpåmindelser til kunder inden besøg. PathPilo sender automatisk en SMS dagen inden og understøtter en valgfri "jeg er på vej"-besked.\n\nFunktionelt er påmindelsessystemerne sammenlignelige. Begge reducerer forgæves ture markant for vinduespolerere.',
      },
      {
        id: 'team-pricing',
        title: 'Skalering med dit team',
        body: 'Squeegees per-bruger-prismodel betyder at din månedlige regning stiger lineært med hvert teammedlem. Et 3-personers hold koster £57/måned. Et 5-personers hold koster £95/måned.\n\nPathPilos virksomhedsplan er £25/måned uanset hvor mange teammedlemmer du tilføjer. Hvis du planlægger at vokse giver PathPilos faste teamplan en markant lavere langsigtet omkostning.',
      },
    ],
    prosCons: {
      pathpilo: {
        pros: [
          'Gratis plan for solo operatører med fulde funktioner',
          'Fast teamplan til £25/måned uanset antal medarbejdere',
          'Fungerer til vinduespolering og andre servicetyper',
          'Mobilvenlig og enkel at opsætte',
        ],
        cons: [
          'Nyere platform med mindre branchespecifik terminologi',
          'Mindre community specifikt for vinduespolerere',
        ],
      },
      squeegee: {
        pros: [
          'Bygget specifikt til vinduespolerere med branchespecifik terminologi',
          'Velkendt og betroet i den britiske vinduespolererbranche',
          'Intuitiv kortvisning optimeret til ruter',
        ],
        cons: [
          'Ingen gratis plan — starter ved £19/bruger/måned',
          'Prisen vokser med hvert teammedlem',
          'Begrænset til vinduespolering — fungerer ikke godt til andre servicetyper',
        ],
      },
    },
    whoShouldChoose: {
      pathpilo:
        'Vælg PathPilo hvis du vil have ruteplanlægning, påmindelser og fakturering gratis, planlægger at vokse et team eller driver mere end én servicetype.',
      squeegee:
        'Vælg Squeegee hvis du allerede bruger det og er tilfreds, foretrækker en app bygget specifikt til vinduespolering og er komfortabel med per-bruger-prisen.',
    },
    faq: [
      {
        q: 'Er PathPilo virkelig gratis hvor Squeegee ikke er?',
        a: 'Ja. PathPilos gratis plan dækker ruteplanlægning, automatiske påmindelser, fakturering og betalingslinks for solo operatører. Squeegee starter ved £19/bruger/måned.',
      },
      {
        q: 'Hvad er den største forskel?',
        a: 'Squeegee er et branchespecifikt vinduespolerings-værktøj med per-bruger-priser. PathPilo er en bredere serviceplatform med en fast teamplan og en gratis enkeltmands-tier. For solo operatører er PathPilo gratis. For teams på 2+ er PathPilos faste pris lavere end Squeegees per-bruger-model.',
      },
      {
        q: 'Kan jeg flytte mine Squeegee-kunder til PathPilo?',
        a: 'Ja. Du kan eksportere dine kundedata fra Squeegee og importere dem i PathPilo. Kontakt PathPilo-support for hjælp til migrering.',
      },
      {
        q: 'Har PathPilo de samme rutehåndteringsfunktioner som Squeegee?',
        a: 'PathPilo inkluderer automatisk rutesortering efter geografisk nærhed, kortvisning, ugeplanlæggerfunktion og træk-og-slip-jobstyring. For de fleste vinduespolerere dækker det de samme kernebehov som Squeegees rutefunktioner.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PathPilo vs Housecall Pro
  // ─────────────────────────────────────────────────────────────────────────
  'pathpilo-vs-housecall-pro-window-cleaning': {
    seoTitle: 'PathPilo vs Housecall Pro til vinduespolerere (2026): Sammenligning',
    seoDescription:
      'PathPilo vs Housecall Pro til vinduespoleringsvirksomheder. Sammenligning af priser, funktioner og hvem der passer bedst. Housecall Pro er primært US-fokuseret — læs hvad det betyder for dig.',
    headline: 'PathPilo vs Housecall Pro til vinduespolerere',
    sub: 'Housecall Pro er en populær US-baseret field service-platform. PathPilo er en enklere, gratis alternativ for solo operatører og små teams. Her er sammenligningen.',
    verdict:
      'Housecall Pro er en kraftfuld platform men den er primært bygget til og prissat til det amerikanske marked. For europæiske vinduespolerere er startprisen på $59/måned høj for hvad du får på basisniveauet. PathPilo tilbyder ruteplanlægning, påmindelser og fakturering gratis — en markant bedre startpunkt for en enkeltmandsbedrift eller et lille hold.',
    sections: [
      {
        id: 'what-each-is-built-for',
        title: 'Hvad er hver platform bygget til?',
        body: 'Housecall Pro er en US-baseret field service-platform der primært betjener hjemmeservice-brancher som VVS, HVAC og elektriker. Det har en bred funktionalitet inklusiv marketingværktøjer og forbrugerlånsmuligheder rettet mod det amerikanske marked.\n\nPathPilo er designet til mobile servicevirksomheder der primært driver fra en telefon. Det er enkelt, hurtigt at opsætte og inkluderer de kernefunktioner de fleste vinduespolerere faktisk bruger: ruter, påmindelser og fakturering.',
      },
      {
        id: 'pricing',
        title: 'Priser',
        body: 'Housecall Pros startpris er $59/måned for Basic-planen. Routeoptimering og automatiske påmindelser kræver Essentials-planen til $149/måned.\n\nPathPilos gratis plan inkluderer ruteplanlægning, automatiske påmindelser og fakturering uden omkostninger. Teamplanen er £25/måned for ubegrænsede teammedlemmer.',
      },
      {
        id: 'route-planning',
        title: 'Ruteplanlægning',
        body: 'Housecall Pros ruteoptimering er tilgængelig på Essentials og derover ($149/måned). Det inkluderer kortvisning og GPS-sporing af teknikere.\n\nPathPilo inkluderer ruteplanlægning gratis, med automatisk sortering af stop efter geografisk nærhed og ugeplanlæggerfunktion.',
      },
    ],
    prosCons: {
      pathpilo: {
        pros: [
          'Gratis plan med ruteplanlægning, påmindelser og fakturering',
          'Enkel opsætning uden salgsopkald',
          'Fast teamplan uanset antal medarbejdere',
        ],
        cons: [
          'Færre avancerede funktioner end Housecall Pro',
          'Ikke specialiseret til HVAC/VVS som Housecall Pro',
        ],
      },
      housecallpro: {
        pros: [
          'Bredt funktionssæt for komplekse servicevirksomheder',
          'Stærk på det amerikanske marked med lokal support',
          'Avancerede marketingværktøjer inkluderet',
        ],
        cons: [
          'Primært US-fokuseret — begrænset relevans for europæiske brugere',
          'Ruteplanlægning og påmindelser kræver $149/måned-planen',
          'Høj startpris for hvad du faktisk får som vinduespolerer',
          'Ingen gratis plan',
        ],
      },
    },
    whoShouldChoose: {
      pathpilo:
        'Vælg PathPilo hvis du er en europæisk vinduespolerer der vil have ruteplanlægning, påmindelser og fakturering gratis eller til lav månedspris.',
      housecallpro:
        'Vælg Housecall Pro hvis du driver en US-baseret virksomhed med komplekse behov på tværs af multiple homeservice-fag.',
    },
    faq: [
      {
        q: 'Er Housecall Pro relevant for europæiske vinduespolerere?',
        a: 'Housecall Pro er primært bygget til og markedsføres mod det amerikanske marked. Mange af dets avancerede funktioner (forbrugerlån, US-specifikke integrationer) er ikke relevante for europæiske brugere. PathPilo er et bedre udgangspunkt for en europæisk vinduespolerer.',
      },
      {
        q: 'Hvad koster Housecall Pro vs PathPilo for en solo vinduespolerer?',
        a: 'Housecall Pro starter ved $59/måned. For ruteplanlægning og automatiske påmindelser har du brug for Essentials til $149/måned. PathPilos gratis plan inkluderer begge funktioner uden omkostning.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PathPilo vs ServiceM8
  // ─────────────────────────────────────────────────────────────────────────
  'pathpilo-vs-servicem8-window-cleaning': {
    seoTitle: 'PathPilo vs ServiceM8 til vinduespolerere (2026): Sammenligning',
    seoDescription:
      'PathPilo vs ServiceM8 til vinduespoleringsvirksomheder. Sammenligning af priser og funktioner. ServiceM8 er primært australsk — se hvad der passer bedst til din virksomhed.',
    headline: 'PathPilo vs ServiceM8 til vinduespolerere',
    sub: 'ServiceM8 er en australsk-fokuseret field service-app med job-volumen-baseret prissætning. PathPilo er en enklere, gratis alternativ for europæiske vinduespolerere. Her er sammenligningen.',
    verdict:
      'ServiceM8 er en iOS-first app primært rettet mod det australske og newzealandske marked. Dens job-volumen-baserede prissætning kan hurtigt stige for aktive virksomheder. PathPilo er et enklere og billigere alternativ for europæiske vinduespolerere med en gratis plan der inkluderer ruteplanlægning, påmindelser og fakturering.',
    sections: [
      {
        id: 'what-each-is-built-for',
        title: 'Hvad er hver platform bygget til?',
        body: 'ServiceM8 er en iOS-first field service-app der primært er populær i Australien og New Zealand. Den bruger en job-volumen-baseret prismodel — du betaler baseret på hvor mange jobs du håndterer per måned, ikke baseret på antal brugere.\n\nPathPilo er en mobilvenlig serviceplatform designet til vinduespolerere og andre mobile servicevirksomheder i Europa.',
      },
      {
        id: 'pricing',
        title: 'Priser',
        body: 'ServiceM8 tilbyder en gratis plan med op til 30 jobs per måned. Over det starter prisen ved $29/måned for 50 jobs/måned og stiger til $349/måned for ubegrænsede jobs.\n\nPathPilo har ingen job-begrænsning — hverken på den gratis plan eller teamplanen. Du kan håndtere ubegrænsede jobs og kunder gratis som solo operatør. Teamplanen er £25/måned for ubegrænsede teammedlemmer og ubegrænsede jobs.',
      },
      {
        id: 'platform',
        title: 'Platform og tilgængelighed',
        body: 'ServiceM8 er primært en iOS-app og har mere begrænsede Android-funktioner. Det er et vigtigt forbehold hvis dit team bruger Android-enheder.\n\nPathPilo er fuldt mobilvenlig på både iOS og Android, plus tilgængelig via webbrowser.',
      },
    ],
    prosCons: {
      pathpilo: {
        pros: [
          'Gratis plan med ingen job-begrænsning',
          'Fungerer på iOS, Android og web',
          'Fast teamplan til £25/måned for ubegrænsede jobs og brugere',
          'Designet til europæiske servicevirksomheder',
        ],
        cons: [
          'Nyere platform med færre integrationer',
          'Mindre populær i Australien/New Zealand',
        ],
      },
      servicem8: {
        pros: [
          'Gratis plan med op til 30 jobs/måned',
          'Velkendt i Australien og New Zealand',
          'Stærk iOS-app med god UX',
        ],
        cons: [
          'Primært australsk-fokuseret — begrænset relevans for europæiske brugere',
          'iOS-first med begrænsede Android-funktioner',
          'Job-volumen-priser stiger hurtigt for aktive virksomheder',
          'Begrænsede muligheder for ruteplanlægning',
        ],
      },
    },
    whoShouldChoose: {
      pathpilo:
        'Vælg PathPilo hvis du er en europæisk vinduespolerer der vil have ruteplanlægning, påmindelser og ubegrænsede jobs gratis — eller til en lav fast månedspris for dit team.',
      servicem8:
        'Vælg ServiceM8 hvis du primært driver på iOS i Australien eller New Zealand og er komfortabel med job-volumen-baseret prissætning.',
    },
    faq: [
      {
        q: 'Er ServiceM8 relevant for europæiske vinduespolerere?',
        a: 'ServiceM8 er primært bygget til og populær i det australske/newzealandske marked. For europæiske vinduespolerere er PathPilo generelt et bedre udgangspunkt med en gratis plan der inkluderer ruteplanlægning og påmindelser.',
      },
      {
        q: 'Hvad sker der med ServiceM8s pris hvis min virksomhed vokser?',
        a: 'ServiceM8s job-volumen-model betyder at prisen stiger med din jobmængde. For en aktiv vinduespolerer med 100+ jobs om måneden kan prisen hurtigt overstige $50-100/måned. PathPilo har ingen job-begrænsning — du betaler kun mere hvis du tilføjer teammedlemmer.',
      },
      {
        q: 'Virker ServiceM8 på Android?',
        a: 'ServiceM8 er primært iOS-first med begrænsede Android-funktioner. Hvis dit team bruger Android-enheder er PathPilo et bedre valg da det er fuldt funktionelt på begge platforme.',
      },
    ],
  },
}
