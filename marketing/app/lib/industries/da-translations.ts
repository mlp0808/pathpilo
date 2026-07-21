/**
 * Danish locale overrides for all industry landing pages.
 * These are merged on top of the English base data at render time when
 * `locale === 'da'`. Fields not listed here fall back to English.
 */
import type { IndustryTranslation } from './types'

export const DA_INDUSTRY_TRANSLATIONS: Record<string, IndustryTranslation> = {
  // ─────────────────────────────────────────────────────────────────────────
  // Vinduespolering
  // ─────────────────────────────────────────────────────────────────────────
  'window-cleaning-software': {
    menuLabel: 'Vinduespolerere',
    trade: 'vinduespolering',
    menuBlurb: 'Ruteplanlægning, fakturering og påmindelser. Helt gratis.',

    seoTitle: 'Software til vinduespolering: Gratis ruteplanlægning, planlægning og fakturering | PathPilo',
    seoDescription:
      'Gratis software til vinduespolering med automatisk ruteplanlægning, kundepåmindelser og fakturering samme dag. Pres flere jobs ind og brug mindre tid på kontorarbejde.',

    hero: {
      eyebrow: 'Software til vinduespolering',
      h1: 'Software til vinduespolering der planlægger dine ruter og sikrer betaling samme dag',
      sub: 'PathPilo sorterer automatisk dine stop efter område, sender SMS til kunder inden du ankommer og sender fakturaer i det øjeblik du er færdig. Pas flere jobs ind uden at arbejde mere.',
      trustLine: 'Gratis at starte · Intet kort nødvendigt · Klar på en eftermiddag',
    },

    trustBar: {
      label: 'Bygget til vinduespolerere — fra enkeltmandsfirmaer til voksende hold',
      points: ['Gratis at komme i gang', 'Virker på din telefon', 'Ingen kontrakt, opsig når som helst', 'Sat op på en eftermiddag'],
    },

    pain: {
      title: 'Lyder det bekendt?',
      sub: 'De fleste vinduespolerere mister timer hver uge på de samme problemer. PathPilo er bygget til at fjerne dem fra dit bord.',
      items: [
        'Din plan lever i dit hoved eller i et gammelt hæfte, og én fejl smider hele ugen ud af kurs.',
        'Du kører på kryds og tværs af byen fordi dagen aldrig var planlagt efter område.',
        'Kunden er ude, lågen er låst, og turen er spildt.',
        'Du jager stadig betalinger for jobs du afsluttede for tre uger siden.',
        'Henvendelser køles af fordi du ikke kan svare til om aftenen.',
        'Du bruger dine aftener på kontorarbejde i stedet for at være med din familie.',
      ],
    },

    outcomes: [
      {
        eyebrow: 'Flere timer i din dag',
        title: 'Pas flere jobs ind i de samme timer',
        body: 'I stedet for at cik-cak rundt i byen, sorterer PathPilo dine stop så de nærmeste jobs kommer næst. Du bruger mindre tid på at køre og mere tid på at pudse vinduer. Det betyder flere besøg om dagen uden at arbejde længere.',
        bullets: [
          'Dine jobs sorteres automatisk efter område, ikke tilfældigt',
          'Se hele ugen på én gang og fordel dagene jævnt',
          'Squeeze ekstra jobs ind uden at forlænge din dag',
        ],
        visual: 'route',
        video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
        videoPoster: '/images/features/scheduling.png',
      },
      {
        eyebrow: 'Færre spildte ture',
        title: 'Stop med at tabe ture til låste låger og tomme huse',
        body: 'PathPilo sender SMS til dine kunder dagen før, så de ved du kommer, og kan sende en automatisk "jeg er på vej"-besked. Færre overraskelser, færre låste låger og langt færre forgæves ture.',
        bullets: [
          'Automatisk påmindelse dagen inden hvert besøg',
          'Valgfri "jeg er på vej"-SMS når du tager afsted',
          'Reducer forgæves ture der koster dig tid og brændstof',
        ],
        visual: 'sms',
        video: '/images/features/routeplanning-automations.mp4',
        videoPoster: '/images/features/routes.png',
      },
      {
        eyebrow: 'Bliv betalt hurtigere',
        title: 'Bliv betalt den dag du er færdig — uden at jagte',
        body: 'Markér et job færdigt og fakturaen sendes af sig selv. Høflige påmindelser jager sene betalere for dig, og kunder kan betale med kort, bankoverførsel eller online-link med et par tryk. Pengene lander dage hurtigere.',
        bullets: [
          'Fakturaer oprettes automatisk når et job er afsluttet',
          'Venlige påmindelser der jager sene betalere for dig',
          'Kort-, bank- og online-betalingsmuligheder indbygget',
        ],
        visual: 'invoice',
        image: '/images/features/invoicing.png',
        imageAlt: 'PathPilo faktureringsskærm der viser et afsluttet vinduespolerings-job med betalingsmuligheder',
        imagePlain: true,
      },
      {
        eyebrow: 'Vind flere kunder',
        title: 'Gør henvendelser til bookede jobs',
        body: 'En simpel bookingformular på din hjemmeside fanger nye kunder med deres adresse og hvad de har brug for, direkte ind i din liste. Ingen mere frem-og-tilbage-SMS. Bare tilbud, bekræft og book dem ind.',
        bullets: [
          'Online bookingformular der fanger alle detaljer',
          'Nye henvendelser lander direkte i din pipeline',
          'Tilbyd og book på minutter, ikke dage',
        ],
        visual: 'booking',
        image: '/images/industries/window-cleaning-person-van.png',
        imageAlt: 'En vinduespolerer stående ved sin varevogn der bruger PathPilo til at styre nye kundehenvendelser',
        imagePlain: true,
      },
    ],

    stats: [
      { value: 8, suffix: ' timer', label: 'Administration sparet hver uge i gennemsnit' },
      { value: 30, suffix: '%', label: 'Færre forgæves aftaler og no-access-ture' },
      { value: 5, suffix: ' dage', label: 'Hurtigere betaling med automatisk fakturering' },
      { value: 0, display: '0 kr.', label: 'Gratis forever-plan tilgængelig' },
    ],

    featureGrid: {
      eyebrow: 'Én simpel app',
      title: 'Alt din vinduespoleringsvirksomhed behøver, ét sted',
      sub: 'Ikke mere jonglering med hæfte, kalender, regneark og bankapp. PathPilo samler det hele og holder det simpelt.',
      items: [
        { icon: 'route', title: 'Ruteplanlægning', text: 'Dine jobs sorteret efter område automatisk, så du kører mindre og pudser mere.' },
        { icon: 'calendar', title: 'Planlægning', text: 'Se hele ugen, flyt jobs rundt, og undgå aldrig dobbeltbookinger.' },
        { icon: 'bell', title: 'Automatiske påmindelser', text: 'Send SMS til kunder inden hvert besøg så de forventer dig.' },
        { icon: 'invoice', title: 'Fakturering', text: 'Fakturaer der sender sig selv i det øjeblik et job er færdigt.' },
        { icon: 'card', title: 'Nem betaling', text: 'Kort-, bank- og online-betalingslinks dine kunder kan trykke på.' },
        { icon: 'users', title: 'Kundeliste', text: 'Enhver adresse, låge-kode og note ét pænt sted.' },
        { icon: 'form', title: 'Bookingformular', text: 'Fang nye henvendelser fra din hjemmeside automatisk.' },
        { icon: 'phone', title: 'Virker på din telefon', text: 'Styr hele din dag fra bilen — ingen laptop nødvendig.' },
      ],
    },

    testimonials: {
      title: 'Vinduespolerere der fik deres aftener tilbage',
      sub: 'Reelle resultater fra vinduespolerere der skiftede til PathPilo.',
      items: [
        {
          quote: 'Jeg plejede at bruge søndagsaftnerne på at planlægge ugen. Nu planlægger skemaet sig selv og jeg pudser bare vinduer. Jeg har taget seks ekstra jobs om ugen uden at arbejde mere.',
          name: 'Lars M.',
          role: 'Vinduespolerer',
          location: 'Aarhus',
        },
        {
          quote: 'Tekst-påmindelserne alene har tjent sig selv hjem. Jeg oplever næsten aldrig en låst låge mere, og kunderne elsker at vide hvornår jeg kommer.',
          name: 'Daniel R.',
          role: 'Enkeltmands vinduespolerer',
          location: 'Odense',
        },
        {
          quote: 'Fakturaer sender sig i det sekund jeg er færdig og påmindelserne jager de langsomme betalere for mig. Jeg gik fra at vente tre uger til at blive betalt på få dage.',
          name: 'Sofie T.',
          role: 'Vindue & tagrendensrensning',
          location: 'København',
        },
        {
          quote: 'Jeg er ikke god til computere og havde det kørende på en eftermiddag. Mit hele skema er på min telefon nu og det bare virker.',
          name: 'Michael P.',
          role: 'To-vogn vinduespolerings-team',
          location: 'Aalborg',
        },
      ],
    },

    freePlan: {
      title: 'Start helt gratis',
      sub: 'Alt en vinduespolerer behøver til at drive sin virksomhed effektivt, uden omkostninger. Opgrader kun når du vokser til et større team.',
      includes: [
        'Ruteplanlægning og planlægning',
        'Din fulde kundeliste med noter og låge-koder',
        'Automatisk fakturering og betalingslinks',
        'Kundepåmindelser',
        'Online bookingformular',
        'Mobilappen til bilen',
      ],
      note: 'Intet kreditkort. Ingen kontrakt. Brug gratisplanen så længe det passer dig.',
    },

    faq: {
      title: 'Spørgsmål om vinduespolerings-software besvaret',
      sub: 'Alt du måske vil vide inden du starter.',
      items: [
        {
          q: 'Er PathPilo virkelig gratis for vinduespolerere?',
          a: 'Ja. Gratisplanen dækker ruteplanlægning, planlægning, din kundeliste, fakturering, betalingslinks, kundepåmindelser og mobilappen. Der kræves intet kort og ingen tidsbegrænsning. Du betaler kun hvis du vokser til et større team og ønsker de ekstra team-styringsfunktioner.',
        },
        {
          q: 'Skal jeg være god til teknologi?',
          a: 'Nej. PathPilo er bygget til at være simpelt nok til at bruge fra din telefon i bilen. De fleste vinduespolerere er i gang på en eftermiddag. Kan du bruge en kortapp og sende en SMS, kan du bruge PathPilo.',
        },
        {
          q: 'Kan det håndtere tilbagevendende jobs med forskellige frekvenser, som hver 4. eller 8. uge?',
          a: 'Ja. Sæt en kunde til at gentage sig hver par uger og PathPilo tilføjer automatisk deres besøg til dit skema i den rigtige rækkefølge på din rute. Du sætter det op én gang og det kører.',
        },
        {
          q: 'Sender det SMS-påmindelser til mine kunder?',
          a: 'Ja. PathPilo kan sende SMS til kunder dagen inden deres rengøring så de forventer dig, og kan sende en valgfri "jeg er på vej"-besked når du tager afsted. Dette er en af de største måder vinduespolerere reducerer forgæves ture til låste låger.',
        },
        {
          q: 'Hvordan betaler mine kunder?',
          a: 'Fakturaer inkluderer et betalingslink så kunder kan betale med kort eller bankoverførsel med et par tryk. Du kan også registrere kontantbetalinger. Automatiske påmindelser jager dem der glemmer, så det er ikke dig der skal have de ubehagelige samtaler.',
        },
        {
          q: 'Kan jeg bruge det på min telefon mens jeg arbejder?',
          a: 'Absolut. Alt kører fra mobilappen — se dit næste job, få vejledning, markér det færdigt og send fakturaen, alt fra bilen. Alt synkroniserer så dine optegnelser altid er opdaterede.',
        },
        {
          q: 'Kan jeg tage min eksisterende kundeliste med over?',
          a: 'Ja. Du kan hurtigt tilføje dine kunder, herunder deres adresse, låge-koder og eventuelle noter. De fleste vinduespolerere får alt sat op inden for en eftermiddag og udfylder resten efterhånden.',
        },
        {
          q: 'Virker det for en enkeltmandsbedrift og et team?',
          a: 'Begge dele. En solooperatør får en enklere og hurtigere måde at styre sin dag på, og efterhånden som du tilføjer medarbejdere kan du tildele jobs, fordele alles arbejdsbyrde på kortet og holde hele teamet på det samme opdaterede skema.',
        },
      ],
    },

    finalCta: {
      title: 'Klar til at drive en mere organiseret og mere profitabel vinduespoleringsvirksomhed?',
      sub: 'Slut dig til vinduespolererne der planlægger mindre, kører mindre og bliver betalt hurtigere med PathPilo. Gratis at starte, sat op på en eftermiddag.',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Privat rengøring
  // ─────────────────────────────────────────────────────────────────────────
  'domestic-cleaning-software': {
    menuLabel: 'Privat rengøring',
    trade: 'privat rengøring',
    menuBlurb: 'Styr faste kunder, reducer udeblivelser og bliv betalt til tiden.',

    seoTitle: 'Software til rengøringsvirksomheder (gratis) — planlægning, påmindelser og fakturering | PathPilo',
    seoDescription:
      'Gratis software til privat rengøring der planlægger dine faste kunder, sender automatiske påmindelser og fakturerer i det øjeblik et job er færdigt. Brug mindre tid på administration og mere tid på at rengøre.',

    hero: {
      eyebrow: 'Software til privat rengøring',
      h1: 'Software til rengøring der planlægger dine kunder og klarer administrationen for dig',
      sub: 'PathPilo organiserer din ugentlige kundeliste efter område, minder kunder om hvert besøg og sender fakturaer i sekundet du er færdig. Intet falder igennem sprækkerne.',
      trustLine: 'Gratis at starte · Intet kort nødvendigt · Virker på din telefon',
    },

    trustBar: {
      label: 'Bygget til rengøringsvirksomheder — fra enkeltmands-rengørere til voksende bureauer',
      points: ['Gratis at komme i gang', 'Styring af faste kunder', 'Automatiske påmindelser', 'Sat op på en eftermiddag'],
    },

    pain: {
      title: 'Lyder det bekendt?',
      sub: 'De fleste private rengøringsvirksomheder mister tid og penge på de samme undgåelige problemer hver uge.',
      items: [
        'Du har 20 faste kunder og at holde styr på hvem der er hvornår er et fuldtidsjob i sig selv.',
        'En kunde er ikke hjemme, døren er låst og turen er fuldstændig spildt.',
        'Du kører hele vejen på tværs af byen for at gøre et job, når du havde tre i samme gade i går.',
        'Fakturaer hober sig op ved månedens slutning og det at jagte betaling tager hele din weekend.',
        'En ny henvendelse kommer ind mens du rengør og om aftenen er de gået videre.',
        'Du kan ikke nemt holde fri fordi alt lever i dit hoved.',
      ],
    },

    outcomes: [
      {
        eyebrow: 'Mere effektive dage',
        title: 'Stop med at køre på tværs af byen for én kunde',
        body: 'PathPilo grupperer dit daglige skema efter område så du bevæger dig logisk fra én kunde til den næste. Mindre brændstof, mindre tid bag rattet og flere rengøringer i de samme timer.',
        bullets: [
          'Dagligt skema automatisk sorteret efter lokation',
          'Fordel dine faste kunder effektivt hen over ugen',
          'Pres ekstra jobs ind uden at øge din køretid',
        ],
        visual: 'route',
        video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
        videoPoster: '/images/features/scheduling.png',
      },
      {
        eyebrow: 'Færre udeblivelser',
        title: 'Kunder der ved du kommer og er klar',
        body: 'En SMS dagen inden betyder ikke mere ankomst til et låst hus eller en kunde midt i et møde. PathPilo sender den automatisk så du aldrig selv behøver huske det.',
        bullets: [
          'Automatisk påmindelse sendt dagen inden hver rengøring',
          'Valgfri "jeg er på vej"-SMS så kunder kan lukke dig ind',
          'Langt færre spildte ture og afbud i sidste øjeblik',
        ],
        visual: 'sms',
        video: '/images/features/routeplanning-automations.mp4',
        videoPoster: '/images/features/routes.png',
      },
      {
        eyebrow: 'Bliv betalt til tiden',
        title: 'Fakturaer der sender sig selv hver eneste gang',
        body: 'Markér en rengøring færdig og fakturaen sendes straks. Betaler en kunde ikke, sender PathPilo en høflig påmindelse så du ikke selv skal have den ubehagelige samtale. De fleste kunder betaler inden for en dag eller to.',
        bullets: [
          'Faktura genereret og sendt i det øjeblik et job markeres færdigt',
          'Automatiske betalingspåmindelser til sene betalere',
          'Kort- og bankoverførsel-betalingslinks inkluderet',
        ],
        visual: 'invoice',
        image: '/images/features/invoicing.png',
        imageAlt: 'PathPilo faktureringsskærm der viser et afsluttet job med betalingsmuligheder',
        imagePlain: true,
      },
      {
        eyebrow: 'Udvid din kundeliste',
        title: 'Gå aldrig glip af en ny henvendelse',
        body: 'En online bookingformular på din hjemmeside lader nye kunder sende deres oplysninger, adresse og ønskede skema på et hvilket som helst tidspunkt. Den lander direkte i din pipeline så du kan tilbyde og bekræfte mens interessen er frisk.',
        bullets: [
          'Bookingformular der virker 24/7 selv mens du rengør',
          'Hver henvendelse inkluderer adresse og ønsket skema',
          'Tilbud og bekræft på minutter fra din telefon',
        ],
        visual: 'booking',
        image: '/images/features/domestic-cleaning-person-app.png',
        imageAlt: 'En servicemedarbejder stående ved sin varevogn der tjekker nye kundehenvendelser på PathPilo',
        imagePlain: true,
      },
    ],

    stats: [
      { value: 6, suffix: ' timer', label: 'Administration sparet hver uge i gennemsnit' },
      { value: 35, suffix: '%', label: 'Færre udeblivelser med påmindelser' },
      { value: 3, suffix: ' dage', label: 'Hurtigere betaling med automatisk fakturering' },
      { value: 0, display: '0 kr.', label: 'Gratis forever-plan tilgængelig' },
    ],

    featureGrid: {
      eyebrow: 'Én simpel app',
      title: 'Alt din rengøringsvirksomhed behøver, uden kompleksiteten',
      sub: 'Designet til rengørere der vil bruge deres tid på at rengøre, ikke foran en computer.',
      items: [
        { icon: 'calendar', title: 'Faste kunder', text: 'Opsæt ugentlige eller fjorten-dages skemaer og PathPilo klarer resten.' },
        { icon: 'route', title: 'Ruteplanlægning', text: 'Din dag sorteret efter område så du kører den korteste mulige rute.' },
        { icon: 'bell', title: 'Automatiske påmindelser', text: 'Kunder får en SMS inden hver rengøring så de altid er klar til dig.' },
        { icon: 'invoice', title: 'Automatisk fakturering', text: 'Faktura sendt automatisk i det øjeblik du markerer et job færdigt.' },
        { icon: 'card', title: 'Nem betaling', text: 'Kunder betaler med kort eller bankoverførsel fra et link på deres telefon.' },
        { icon: 'users', title: 'Kundenoter', text: 'Nøglekoder, kæledyrsnavne, særlige instruktioner — alt ét sted.' },
        { icon: 'form', title: 'Bookingformular', text: 'Nye kunder kan anmode om et tilbud direkte fra din hjemmeside.' },
        { icon: 'phone', title: 'Virker på din telefon', text: 'Styr hele din dag fra din telefon — intet kontor nødvendigt.' },
      ],
    },

    testimonials: {
      title: 'Rengørere der bruger mere tid på at rengøre og mindre tid på administration',
      sub: 'Reelle resultater fra rengøringsvirksomheder der bruger PathPilo.',
      items: [
        {
          quote: 'Jeg har 18 faste kunder og plejede at bruge timer hver søndag på at sortere ugen. Nu bruger jeg ca. 10 minutter. Det har fuldstændig ændret min balance mellem arbejde og fritid.',
          name: 'Charlotte H.',
          role: 'Enkeltmands privat rengøring',
          location: 'Aarhus',
        },
        {
          quote: 'Påmindelses-SMS\'erne har halveret mine udeblivelser. Jeg plejede at køre til mindst to lukkede huse om ugen. Nu er det måske én om måneden.',
          name: 'Trine W.',
          role: 'Privat rengøring',
          location: 'Odense',
        },
        {
          quote: 'At blive betalt plejede at være den værste del af jobbet. Nu sender fakturaer bare og de fleste kunder betaler inden for en dag. Jeg behøver ikke jagte nogen mere.',
          name: 'Nathalie B.',
          role: 'Ejef af rengøringsbureau',
          location: 'København',
        },
        {
          quote: 'Jeg har tre rengørere nu og at give dem alle adgang til deres egne skemaer på appen har sparet mig en time i telefonopkald hver eneste morgen.',
          name: 'Karen M.',
          role: 'Privat rengørings-team',
          location: 'Aalborg',
        },
      ],
    },

    freePlan: {
      title: 'Start gratis — intet kort, ingen udløbsdato',
      sub: 'Alt en privat rengører behøver til at drive en professionel og organiseret virksomhed. Opgrader kun hvis du bygger et større team.',
      includes: [
        'Ubegrænset planlægning af faste kunder',
        'Automatiske påmindelser inden hvert besøg',
        'Automatisk fakturering og betalingslinks',
        'Kundenoter (nøglekoder, kæledyr, instruktioner)',
        'Online bookingformular til din hjemmeside',
        'Mobilapp — din hele dag på din telefon',
      ],
      note: 'Intet kreditkort. Ingen tidsbegrænsning. Gratisplanen dækker alt en solo-rengører behøver.',
    },

    faq: {
      title: 'Software til privat rengøring — dine spørgsmål besvaret',
      sub: 'Almindelige spørgsmål fra rengøringsvirksomheder inden de kommer i gang.',
      items: [
        {
          q: 'Jeg har mange faste ugentlige kunder. Kan PathPilo håndtere det?',
          a: 'Ja. PathPilo er bygget specifikt til virksomheder med faste kunder. Sæt hver kunde til at gentage sig ugentligt, hver fjortende dag eller et hvilket som helst brugerdefineret skema og PathPilo opretter automatisk deres kommende besøg. Ubegrænsede kunder, ubegrænsede tilbagevendende jobs — alt inkluderet gratis.',
        },
        {
          q: 'Kan jeg gemme nøglekoder og adgangsnoter for hver kunde?',
          a: 'Ja. Hvert kundeøjeblik har et notefelt hvor du kan gemme nøgle-safe-koder, alarmkoder, kæledyrsinstruktioner, parkeringsnoter eller hvad som helst andet. Disse er altid synlige når du er på vej til det job.',
        },
        {
          q: 'Virker det for et rengøringsbureau med flere ansatte?',
          a: 'Ja. Virksomhedsplanen lader dig tilføje ubegrænsede rengørere, tildele jobs til specifikke teammedlemmer og give hver rengører deres eget app-login så de kun ser deres eget skema. Du styrer alt fra én visning.',
        },
        {
          q: 'Hvad hvis en kunde aflyser eller springer en uge over?',
          a: 'Nemt. Du kan springe et enkelt besøg over uden at påvirke resten af deres tilbagevendende skema, eller sætte dem helt på pause og genoptage når de er klar. Skemaet tilpasser sig automatisk.',
        },
        {
          q: 'Kan kunder betale med bankoverførsel?',
          a: 'Kunder kan betale ved hjælp af et betalingslink der er inkluderet på enhver faktura — kort eller bankoverførsel. Kontantbetalinger kan også registreres. Automatiske påmindelser følger op på alle der ikke har betalt endnu.',
        },
        {
          q: 'Vil det hjælpe mig med at få flere kunder?',
          a: 'Online bookingformularen betyder at nye kunder kan anmode om et tilbud fra din hjemmeside på alle tider af døgnet. Du får deres adresse, ønskede skema og kontaktoplysninger direkte ind i PathPilo så du kan svare og booke dem hurtigt.',
        },
        {
          q: 'Hvor lang tid tager det at opsætte?',
          a: 'De fleste rengøringsvirksomheder er i gang inden for en eftermiddag. Tilføj dine kunder, sæt deres skemaer og din uge er klar. Appen guider dig igennem hvert trin.',
        },
        {
          q: 'Jeg bruger allerede et regneark. Hvorfor skifte?',
          a: 'Et regneark sender ikke påmindelser, genererer ikke fakturaer, jager ikke betalinger eller viser dine kunder på et kort. PathPilo gør alt det automatisk, hvilket er forskellen på at afslutte arbejdet kl. 18 og kl. 21.',
        },
      ],
    },

    finalCta: {
      title: 'Klar til at drive din rengøringsvirksomhed uden søndagsaftnens administration?',
      sub: 'Slut dig til private rengørere der planlægger smartere, bliver betalt hurtigere og spilder færre ture. Gratis at starte, sat op på en eftermiddag.',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Haveservice
  // ─────────────────────────────────────────────────────────────────────────
  'lawn-care-software': {
    menuLabel: 'Haveservice og plæneklipning',
    trade: 'haveservice og plæneklipning',
    menuBlurb: 'Ugentlige ruter, faste kunder og fakturaer der klarer sig selv.',

    seoTitle: 'Software til haveservice (gratis) — ruteplanlægning, planlægning og fakturering | PathPilo',
    seoDescription:
      'Gratis software til haveservice og plæneklipning med ugentlig ruteplanlægning, automatiske kundepåmindelser og fakturering samme dag. Klare flere jobs uden administrations-overhead.',

    hero: {
      eyebrow: 'Software til haveservice og plæneklipning',
      h1: 'Software til haveservice der planlægger dine ugentlige ruter og klarer administrationen',
      sub: 'PathPilo sorterer dine daglige stop efter område, sender SMS til kunder inden du ankommer og genererer fakturaer i det øjeblik du er færdig. Fokus på arbejdet, ikke papirarbejdet.',
      trustLine: 'Gratis at starte · Intet kort nødvendigt · Sat op på en eftermiddag',
    },

    trustBar: {
      label: 'Bygget til haveservicevirksomheder — fra solo-gartnere til fulde teams',
      points: ['Gratis at komme i gang', 'Ugentlig ruteplanlægning', 'Styring af faste kunder', 'Mobilvenlig'],
    },

    pain: {
      title: 'Lyder det bekendt?',
      sub: 'At drive en haveservicevirksomhed er hårdt fysisk arbejde — administrationen burde ikke være lige så udmattende.',
      items: [
        'Du kører frem og tilbage ad de samme veje fordi dagen aldrig var planlagt efter område.',
        'Faste kunder glipper dig af syne eller glemmes når sæsonen bliver travl.',
        'Du dukker op på en ejendom og ingen er hjemme til at lukke dig ind ad lågen.',
        'Fakturaer sidder usente i dage efter jobbet fordi du glemte det eller løb tør for tid.',
        'Du mister overblikket over hvilke kunder der skal have besøg denne uge og hvilke der blev sprunget over sidst.',
        'At tage en ny hjælper til medfører flere telefonopkald, mere forvirring og flere fejl.',
      ],
    },

    outcomes: [
      {
        eyebrow: 'Flere jobs om dagen',
        title: 'Reducer køretiden og pas flere kunder ind',
        body: 'PathPilo klynger dagens jobs efter beliggenhed så du arbejder gade for gade i stedet for at krydse byen. Typiske gartnere tager en til to ekstra jobs om dagen bare ved at skære den spildte køretid.',
        bullets: [
          'Dagens jobs automatisk sorteret efter geografisk område',
          'Kortvisning viser din rute og estimeret køretid',
          'Fordel kunder hen over ugen for at holde dagene jævne',
        ],
        visual: 'route',
        video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
        videoPoster: '/images/features/scheduling.png',
      },
      {
        eyebrow: 'Ikke mere lukkede låger',
        title: 'Kunder der er klar til dig når du ankommer',
        body: 'En automatisk SMS dagen inden hvert besøg betyder at låger er ulåste, kæledyr er indenfor og kunder ved at deres have passes. Færre spildte ture, gladere kunder.',
        bullets: [
          'Dagen-inden-påmindelse sendt til hver kunde automatisk',
          'Reducer spildte ture til lukkede eller utilgængelige ejendomme',
          'Kunder føler sig godt behandlet uden ekstra indsats fra dig',
        ],
        visual: 'sms',
        video: '/images/features/routeplanning-automations.mp4',
        videoPoster: '/images/features/routes.png',
      },
      {
        eyebrow: 'Bliv betalt samme dag',
        title: 'Fakturaer sendes i det øjeblik jobbet er færdigt',
        body: 'Markér en have færdig og fakturaen lander i kundens indbakke med det samme. Ikke mere glemsel, ikke mere månedsluts-fakturerings-maratoner og ikke mere ugers ventetid på betaling.',
        bullets: [
          'Faktura automatisk oprettet og sendt når et job er afsluttet',
          'Betalingspåmindelser jager sene betalere for dig',
          'Kort, bankoverførsel og online-betalinger understøttes',
        ],
        visual: 'invoice',
        image: '/images/features/invoicing.png',
        imageAlt: 'PathPilo faktureringsskærm der viser et afsluttet job med betalingsmuligheder',
        imagePlain: true,
      },
      {
        eyebrow: 'Vokse din virksomhed',
        title: 'Gå aldrig glip af en ny henvendelse',
        body: 'En online bookingformular på din hjemmeside lader potentielle kunder sende deres oplysninger på alle tider af døgnet. Du kan svare og tilbyde mens interessen er frisk, og konvertere henvendelser til faste kunder hurtigere.',
        bullets: [
          'Bookingformular fanger henvendelser 24/7',
          'Henvendelser lander direkte i din pipeline med adresse og behov',
          'Tilbyd og book nye kunder på minutter',
        ],
        visual: 'booking',
        image: '/images/features/lawn-care-person-app.png',
        imageAlt: 'En gartner ved sin varevogn der styrer nye kundehenvendelser på PathPilo',
        imagePlain: true,
      },
    ],

    stats: [
      { value: 7, suffix: ' timer', label: 'Administration sparet per uge i gennemsnit' },
      { value: 25, suffix: '%', label: 'Færre forgæves ture til lukkede ejendomme' },
      { value: 4, suffix: ' dage', label: 'Hurtigere betaling med automatisk fakturering' },
      { value: 0, display: '0 kr.', label: 'Gratis forever-plan tilgængelig' },
    ],

    featureGrid: {
      eyebrow: 'Én simpel app',
      title: 'Alt din haveservicevirksomhed behøver for at holde styr',
      sub: 'Bygget til gartnere der vil bruge deres tid i haven, ikke bag en skærm.',
      items: [
        { icon: 'route', title: 'Ruteplanlægning', text: 'Dine daglige jobs sorteret efter lokation automatisk, så du kører mindre og arbejder mere.' },
        { icon: 'calendar', title: 'Faste kunder', text: 'Ugentlige og fjorten-dages kunder sat op én gang og styret automatisk.' },
        { icon: 'bell', title: 'Automatiske påmindelser', text: 'Kunder adviseres dagen inden så låger er åbne og kæledyr er indenfor.' },
        { icon: 'invoice', title: 'Automatisk fakturering', text: 'Faktura sendt automatisk i det øjeblik et job er markeret færdigt.' },
        { icon: 'card', title: 'Online betalinger', text: 'Kunder betaler med kort eller bankoverførsel fra et link på fakturaen.' },
        { icon: 'users', title: 'Kundenoter', text: 'Adgangskoder, særlige instruktioner og ejendomsoplysninger altid ved hånden.' },
        { icon: 'form', title: 'Bookingformular', text: 'Fang nye kundehenvendelser direkte fra din hjemmeside.' },
        { icon: 'phone', title: 'Virker på din telefon', text: 'Styr hele din dag fra haven — ingen laptop nødvendig.' },
      ],
    },

    testimonials: {
      title: 'Gartnere der planlægger klogere og tjener mere',
      sub: 'Reelle resultater fra haveservicevirksomheder der bruger PathPilo.',
      items: [
        {
          quote: 'Jeg plejede at bruge halvanden time om morgenen på at planlægge min dag. Nu åbner jeg bare PathPilo og starter. Jeg er kommet tidligere hjem hver dag siden.',
          name: 'Andreas K.',
          role: 'Solo haveserviceoperatør',
          location: 'Randers',
        },
        {
          quote: 'Påmindelserne har elimineret næsten alle forgæves ture. Kunder er altid klar og det sparer mig mindst en time om dagen.',
          name: 'Jakob T.',
          role: 'Haveservice og plæneklipning',
          location: 'Esbjerg',
        },
        {
          quote: 'Jeg plejede at fakturere fredag aften. Nu sender fakturaer sig selv og kunder betaler hurtigere. Det er ren tidsbesparelse.',
          name: 'Mette L.',
          role: 'Haveserviceteam',
          location: 'Kolding',
        },
        {
          quote: 'Tre ansatte og alle ved præcis hvad der sker. Ingen telefonforsinkelser, ingen forvirring. PathPilo holder os alle synkroniserede.',
          name: 'Rasmus P.',
          role: 'Haveservicevirksomhed',
          location: 'Vejle',
        },
      ],
    },

    freePlan: {
      title: 'Start gratis — klar på en eftermiddag',
      sub: 'Alt du behøver til at drive en organiseret haveservicevirksomhed, gratis. Opgrader kun når du vokser til et team.',
      includes: [
        'Ruteplanlægning og daglig jobsortering',
        'Faste kunder med ugentlige og fjorten-dages skemaer',
        'Automatiske kundepåmindelser',
        'Automatisk fakturering og betalingslinks',
        'Kundenoter og adgangsoplysninger',
        'Mobilapp til brug ude i marken',
      ],
      note: 'Intet kreditkort. Ingen kontrakt. Brug gratisplanen så længe det passer dig.',
    },

    faq: {
      title: 'Spørgsmål om haveservice-software besvaret',
      sub: 'Alt du måske vil vide inden du starter.',
      items: [
        {
          q: 'Kan PathPilo styre mine faste ugentlige kunder?',
          a: 'Ja. Sæt hver kunde til at gentage sig ugentligt, hver fjortende dag eller et hvilket som helst brugerdefineret interval og PathPilo opretter automatisk deres kommende besøg. Ubegrænsede kunder, ubegrænsede tilbagevendende jobs — inkluderet gratis.',
        },
        {
          q: 'Hvad sker der hvis en ejendom er utilgængelig?',
          a: 'PathPilo sender en automatisk SMS til kunden dagen inden så de ved du kommer og kan sikre adgang. Hvis du alligevel ikke kan komme ind, kan du hurtigt springe det job over og ombooke — uden at forstyrre resten af dit skema.',
        },
        {
          q: 'Virker det for sæsonbetonede jobs?',
          a: 'Ja. Du kan sætte kunder til at starte og stoppe på bestemte datoer, styre sæsonpauseperioder og planlægge engangsjobs ved siden af dine faste kunder. Alt er synligt i det samme skema.',
        },
        {
          q: 'Kan jeg se alle mine jobs på et kort?',
          a: 'Ja. Kortvisningen viser alle dine dagens jobs med estimeret køretid og rækkefølge. Du kan trække og slippe for at omarrangere, og PathPilo opdaterer ruten og tidspunkterne automatisk.',
        },
        {
          q: 'Sender det automatisk fakturaer?',
          a: 'Ja. Markér et job færdigt i appen og fakturaen genereres og sendes til kunden med det samme. Inkluderer et betalingslink til kort eller bankoverførsel. Automatiske påmindelser følger op på ubetalte fakturaer.',
        },
        {
          q: 'Kan jeg tilføje en assistent til mit team?',
          a: 'Ja. Virksomhedsplanen lader dig tilføje teammedlemmer, tildele dem jobs og give dem adgang til mobilappen med kun deres eget skema synligt. Du styrer alt fra din admin-visning.',
        },
        {
          q: 'Hvad med kunder der ikke er hjemme?',
          a: 'PathPilo sender dem en påminding dagen inden. Og hvis de stadig ikke er hjemme når du ankommer, kan du tage et foto, tilføje noter til jobbet og stadig sende fakturaen — alt fra mobilappen.',
        },
      ],
    },

    finalCta: {
      title: 'Klar til at drive din haveservicevirksomhed med mindre besvær?',
      sub: 'Slut dig til gartnere der kører klogere ruter, glemmer færre kunder og bliver betalt hurtigere med PathPilo. Gratis at starte.',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Tagrende-rensning
  // ─────────────────────────────────────────────────────────────────────────
  'gutter-cleaning-software': {
    menuLabel: 'Tagrenserensning',
    trade: 'tagrenserensning',
    menuBlurb: 'Årsruter, fakturering og faste kunder der booker sig selv.',

    seoTitle: 'Software til tagrenserensning (gratis) — planlægning, kunderuter og fakturering | PathPilo',
    seoDescription:
      'Gratis software til tagrenserensning der styrer dine årsrunder, sender påmindelser og fakturerer automatisk. Stop med at miste faste kunder og forgæves ture til lukkede låger.',

    hero: {
      eyebrow: 'Software til tagrenserensning',
      h1: 'Software til tagrenserensning der styrer dine årsrunder og sikrer du aldrig mister en kunde',
      sub: 'PathPilo tilføjer automatisk tilbagevendende kunder til dit skema, sender påmindelser inden hvert besøg og sender fakturaen i det sekund du er færdig. Aldrig mere glemte kunder eller forgæves ture.',
      trustLine: 'Gratis at starte · Intet kort nødvendigt · Sat op på en eftermiddag',
    },

    trustBar: {
      label: 'Bygget til tagrenserensere — fra enkeltmandsbedrifter til voksende teams',
      points: ['Gratis at komme i gang', 'Styring af årsrunder', 'Automatiske kundepåmindelser', 'Fakturering fra stigen'],
    },

    pain: {
      title: 'Lyder det bekendt?',
      sub: 'Tagrenserensning er en sæsonbetonet forretning med unikke udfordringer. PathPilo løser dem alle.',
      items: [
        'Efterårsrunden er kaotisk — hundredvis af kunder og ingen god måde at holde styr på hvem du allerede har besøgt.',
        'Du glemmer at ringe til faste kunder der forventede at høre fra dig, og de tager en anden.',
        'Du kører til en ejendom men lågen er låst og ingen er hjemme til at give dig adgang.',
        'Fakturaer sendes dage efter jobbet, eller slet ikke, og pengene flyder langsomt.',
        'Det er svært at vide præcis hvilke kunder der er forfaldne hvert halve år.',
        'At skalere til to hold i travle perioder føles som en logistisk mareridt.',
      ],
    },

    outcomes: [
      {
        eyebrow: 'Organiser din årsrunde',
        title: 'Kunder der genbookes automatisk',
        body: 'Sæt hver kunde til at gentage sig hvert år eller hvert halve år og PathPilo planlægger deres næste besøg automatisk. Du mister aldrig en fast kunde og behøver aldrig huske at ringe til dem.',
        bullets: [
          'Års- og halvårskunder automatisk tilføjet til dit skema',
          'SMS- eller e-mailpåminding sendt til kunden når de er forfaldne',
          'Dine tilbagevendende indtægter bliver virkelig forudsigelige',
        ],
        visual: 'route',
        video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
        videoPoster: '/images/features/scheduling.png',
      },
      {
        eyebrow: 'Færre spildte ture',
        title: 'Fjern ture til lukkede låger og fraværende kunder',
        body: 'Tagrenserensning kræver ofte adgang. PathPilo sender en automatisk påminding til hver kunde dagen inden så de ved du kommer, kan låse lågen op og ikke har bestilt en VVS-mand til samme morgen.',
        bullets: [
          'Automatisk tekstpåminding inden hvert booket besøg',
          'Kunder kan bekræfte adgang eller advare dig på forhånd',
          'Færre spildte ture betyder flere afsluttede jobs om dagen',
        ],
        visual: 'sms',
        video: '/images/features/routeplanning-automations.mp4',
        videoPoster: '/images/features/routes.png',
      },
      {
        eyebrow: 'Bliv betalt med det samme',
        title: 'Fakturer inden du putter stigen tilbage i bilen',
        body: 'I det øjeblik du markerer et job færdigt i appen sendes en faktura automatisk til kunden. Tilføj fotos af de rensede tagrende som dokumentation hvis du vil. Betaling lander typisk inden for en dag.',
        bullets: [
          'Øjeblikkelig faktura sendt når jobbet markeres afsluttet',
          'Vedhæft fotos direkte til fakturaen fra din telefon',
          'Automatiske påmindelser jager ubetalte fakturaer for dig',
        ],
        visual: 'invoice',
        image: '/images/features/invoicing.png',
        imageAlt: 'PathPilo faktureringsskærm der viser et afsluttet job med betalingsmuligheder',
        imagePlain: true,
      },
      {
        eyebrow: 'Tab aldrig en kunde',
        title: 'Faste kunder der genbookes af sig selv',
        body: 'Sæt hver kunde til at gentage sig årligt eller hvert halve år og PathPilo tilføjer automatisk det næste besøg til dit skema. Du mister aldrig overblikket over hvem der er forfaldne og du behøver ikke huske at ringe til nogen.',
        bullets: [
          'Års- og halvårskunder automatisk tilføjet til dit skema',
          'SMS- eller e-mailpåminding sendt til kunden når de er forfaldne',
          'Dine tilbagevendende indtægter bliver virkelig forudsigelige',
        ],
        visual: 'booking',
        image: '/images/features/gutter-cleaning-person-app.png',
        imageAlt: 'En servicemedarbejder ved sin varevogn der styrer tilbagevendende kundebookinger på PathPilo',
        imagePlain: true,
      },
    ],

    stats: [
      { value: 5, suffix: ' timer', label: 'Administration sparet per uge i gennemsnit' },
      { value: 40, suffix: '%', label: 'Færre forgæves besøg uden adgang' },
      { value: 2, suffix: ' dage', label: 'Hurtigere betaling med øjeblikkelig fakturering' },
      { value: 0, display: '0 kr.', label: 'Gratis forever-plan tilgængelig' },
    ],

    featureGrid: {
      eyebrow: 'Én simpel app',
      title: 'Alt en tagrenserensningsvirksomhed behøver for at holde styr',
      sub: 'Fra styring af din årskundeliste til at sende fakturaen fra taget — alt fra din telefon.',
      items: [
        { icon: 'calendar', title: 'Tilbagevendende kundeplanlægning', text: 'Års- og halvårskunder styret automatisk — gå aldrig glip af en genbooking.' },
        { icon: 'route', title: 'Ruteplanlægning', text: 'Dine daglige jobs sorteret efter område så du bruger mindre tid på at køre.' },
        { icon: 'bell', title: 'Kundepåmindelser', text: 'Automatisk SMS inden hvert besøg så kunder er klar og adgang er arrangeret.' },
        { icon: 'invoice', title: 'Øjeblikkelig fakturering', text: 'Faktura sendt i sekundet et job markeres færdigt — fra bilen, på taget, overalt.' },
        { icon: 'card', title: 'Online betalinger', text: 'Kunder betaler med kort eller bankoverførsel fra et link i fakturaen.' },
        { icon: 'users', title: 'Kundenoter', text: 'Nøglekoder, låge-kombinationer, adgangsinstruktioner — synlige inden hvert job.' },
        { icon: 'form', title: 'Bookingformular', text: 'Nye henvendelser kommer ind via en formular på din hjemmeside, klar til tilbud.' },
        { icon: 'phone', title: 'Virker på din telefon', text: 'Alt kører fra din telefon — intet kontor, ingen laptop nødvendig.' },
      ],
    },

    testimonials: {
      title: 'Tagrenserensere der holder styr på deres skema hele året',
      sub: 'Reelle resultater fra tagrenserensningsvirksomheder der bruger PathPilo.',
      items: [
        {
          quote: 'Efteråret plejede at betyde tre ugers kaos. Nu indlæser jeg mine årskunders data i PathPilo, sorterer dem efter område og arbejder mig igennem dem i orden. Det er så meget roligere.',
          name: 'David K.',
          role: 'Tagrende og tagfladerensning',
          location: 'Silkeborg',
        },
        {
          quote: 'Jeg plejede at miste mindst to jobs om dagen til lukkede låger. Siden jeg startede med at sende påmindelser dagen inden kan jeg tælle på én hånd hvornår det sker nu.',
          name: 'Thomas F.',
          role: 'Enkeltmands tagrenserenser',
          location: 'Randers',
        },
        {
          quote: 'Jeg tager et før- og efter-foto og vedhæfter det til fakturaen på sekunder. Kunder elsker det og tvister er næsten forsvundet.',
          name: 'Mads B.',
          role: 'Tagrenserensning og reparation',
          location: 'Horsens',
        },
        {
          quote: 'Mine årskunders data dukker bare op når de er forfaldne. Jeg sender dem en besked, de booker ind og det sker. Jeg har ikke mistet en fast kunde siden jeg begyndte at bruge PathPilo.',
          name: 'Jonas H.',
          role: 'Ejendomsvedligeholdelse',
          location: 'Herning',
        },
      ],
    },

    freePlan: {
      title: 'Start gratis — intet kort, ingen tidsbegrænsning',
      sub: 'Alt en tagrenserensningsvirksomhed behøver til at styre årsrunder, forhindre forgæves ture og blive betalt hurtigt.',
      includes: [
        'Tilbagevendende kundeplanlægning (årsvis og halvårlig)',
        'Automatiske kundepåmindelser',
        'Ruteplanlægning og jobsortering',
        'Øjeblikkelig fakturering med fotovedhæftning',
        'Online betalingslinks',
        'Mobilapp til brug på arbejdspladsen',
      ],
      note: 'Intet kreditkort. Ingen kontrakt. Gratis at starte og bruge så længe det passer dig.',
    },

    faq: {
      title: 'Spørgsmål om tagrenserensnings-software besvaret',
      sub: 'Alt du måske vil vide inden du starter.',
      items: [
        {
          q: 'Kan PathPilo styre kunder der kun besøges én eller to gange om året?',
          a: 'Ja. PathPilo er bygget til at håndtere tilbagevendende kunder på alle frekvenser — ugentlig, månedlig, halvårlig, årlig eller et brugerdefineret interval. Sæt en kunde til at gentage sig hvert år og PathPilo tilføjer automatisk deres næste besøg til dit skema og minder dem om det når de er forfaldne.',
        },
        {
          q: 'Hvad sker der hvis en kunder ikke er hjemme eller lågen er låst?',
          a: 'PathPilo sender en automatisk SMS til kunden dagen inden hvert besøg. Hvis du alligevel ikke kan få adgang kan du hurtigt registrere problemet, tage et foto og ombooke — alt fra mobilappen. De fleste brugere rapporterer et betydeligt fald i forgæves ture efter at have sat påmindelser op.',
        },
        {
          q: 'Kan jeg vedhæfte fotos til fakturaer?',
          a: 'Ja. Du kan tage fotos direkte i appen og vedhæfte dem til job-optegnelsen eller fakturaen. Det bruges hyppigt som bevis for at rensningsarbejdet er fuldført, hvilket reducerer tvister og forsinket betaling.',
        },
        {
          q: 'Virker det i den travle efterårssæson?',
          a: 'Ja. Du kan indlæse alle dine årskunders data, sortere dem efter geografisk område og arbejde dig igennem dem systematisk. Kortvisningen gør det nemt at planlægge dine ruter effektivt, selv med hundredvis af kunder der alle er forfaldne i den samme periode.',
        },
        {
          q: 'Kan jeg styre to hold i travle perioder?',
          a: 'Ja. Virksomhedsplanen lader dig tilføje teammedlemmer, tildele dem specifikke jobs eller ruter og give dem adgang til mobilappen med kun deres eget skema. Du kan se begge hold og deres fremskridt i realtid fra din telefon.',
        },
        {
          q: 'Er det gratis?',
          a: 'Gratisplanen er fri for enkeltmandsbedrifter og dækker alt — tilbagevendende kundeplanlægning, ruter, påmindelser, fakturering og online betalinger. Du betaler kun hvis du vokser til et team med adskillige hold.',
        },
      ],
    },

    finalCta: {
      title: 'Klar til at drive en mere strømlinet og mere profitabel tagrenserensningsvirksomhed?',
      sub: 'Slut dig til tagrenserensere der organiserer årsrunder klogere, forhindrer forgæves ture og aldrig mister en fast kunde. Gratis at starte.',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Højtryksrensning
  // ─────────────────────────────────────────────────────────────────────────
  'pressure-washing-software': {
    menuLabel: 'Højtryksrensning',
    trade: 'højtryksrensning',
    menuBlurb: 'Ruteplanlægning, øjeblikkelig fakturering og kunder der booker dig online.',

    seoTitle: 'Software til højtryksrensning (gratis) — ruter, planlægning og fakturering | PathPilo',
    seoDescription:
      'Gratis software til højtryksrensning med automatisk ruteplanlægning, kundepåmindelser og fakturering fra telefonen. Pas flere jobs ind og stop med at jagte betalinger.',

    hero: {
      eyebrow: 'Software til højtryksrensning',
      h1: 'Software til højtryksrensning der organiserer din dag og betaler dig hurtigt',
      sub: 'PathPilo sorterer dine daglige stop efter område, sender påmindelser inden hvert job og genererer fakturaen i det sekund du pakker udstyr ned. Mindre administrations-tid, mere rensearbejde.',
      trustLine: 'Gratis at starte · Intet kort nødvendigt · Mobilvenlig',
    },

    trustBar: {
      label: 'Bygget til højtryksrensere — fra solo-operatører til hold med flere biler',
      points: ['Gratis at komme i gang', 'Daglig ruteplanlægning', 'Automatisk fakturering', 'Virker på din telefon'],
    },

    pain: {
      title: 'Lyder det bekendt?',
      sub: 'Højtryksrensning er hårdt arbejde — din administration burde ikke gøre det endnu hårdere.',
      items: [
        'Du kører fra en indkørsel i den ene ende af byen til en terrasse i den anden, og der gik halvanden time på transport.',
        'En kunde er ikke hjemme og du har spildt 45 minutters kørsel på et job du ikke kan gøre.',
        'Fakturaer sidder usente fordi du er udmattet når du kommer hjem og glemmer det.',
        'Kundernes betalinger er langsomme og du sidder og jager dem i stedet for at tage nye jobs.',
        'Du er god til rensningsarbejde, men at styre en voksende kundeliste er ved at løbe løbsk.',
        'At tilbyde nye kunder er tidskrævende og henvendelser køles af inden du kan svare.',
      ],
    },

    outcomes: [
      {
        eyebrow: 'Kortere køredistancer',
        title: 'Planlæg din dag efter område, ikke tilfældigt',
        body: 'PathPilo sorterer dine daglige jobs geogafisk så du bevæger dig logisk fra én lokation til den næste. Typiske højtryksrensere rapporterer en besparelse på en til to timers kørsel om dagen efter at have skiftet til områdebaseret planlægning.',
        bullets: [
          'Dagens jobs automatisk sorteret efter geografisk nærhed',
          'Kortvisning med estimeret køretid og optimal rækkefølge',
          'Pas et til to ekstra jobs ind om dagen bare ved at reducere kørsel',
        ],
        visual: 'route',
        video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
        videoPoster: '/images/features/scheduling.png',
      },
      {
        eyebrow: 'Ingen forgæves ture',
        title: 'Kunder der altid er hjemme og klar',
        body: 'En automatisk SMS dagen inden betyder at kunder rydder adgang, fjerner møbler fra terrassen og er forberedte på dit besøg. Du ankommer og kan begynde med det samme — ingen ventetid, ingen forgæves ture.',
        bullets: [
          'Automatisk tekstpåminding sendt dagen inden hvert job',
          'Kunder kan nemt bekræfte adgang eller lave om',
          'Markant færre forgæves ture og mistet tid',
        ],
        visual: 'sms',
        video: '/images/features/routeplanning-automations.mp4',
        videoPoster: '/images/features/routes.png',
      },
      {
        eyebrow: 'Bliv betalt samme dag',
        title: 'Send fakturaen mens du stadig pakker udstyret ned',
        body: 'Markér et job færdigt i appen og fakturaen sendes automatisk til kunden med et betalingslink. De fleste kunder betaler inden for timer. Du behøver aldrig huske at fakturere eller jagte betalinger.',
        bullets: [
          'Øjeblikkelig automatisk faktura i det øjeblik et job afsluttes',
          'Betalingslink til kort og bankoverførsel inkluderet',
          'Automatiske påmindelser jager ubetalte fakturaer for dig',
        ],
        visual: 'invoice',
        image: '/images/features/invoicing.png',
        imageAlt: 'PathPilo faktureringsskærm der viser et afsluttet højtryksrensnings-job med betalingsmuligheder',
        imagePlain: true,
      },
      {
        eyebrow: 'Vind nye kunder',
        title: 'Online bookingformular der aldrig sover',
        body: 'En bookingformular på din hjemmeside fanger nye henvendelser med adresse og jobdetaljer — klar til tilbud og booking mens du sover. Ingen mere afkølede leads eller mistede jobs fordi du ikke svarede hurtigt nok.',
        bullets: [
          'Bookingformular fanger henvendelser 24/7',
          'Alle detaljer inkluderet — adresse, jobtype, ønsket dato',
          'Svar og book på minutter fra din telefon',
        ],
        visual: 'booking',
        image: '/images/features/pressure-washing-person-app.png',
        imageAlt: 'En højtryksrenser ved sin varevogn der styrer nye bookinger på PathPilo',
        imagePlain: true,
      },
    ],

    stats: [
      { value: 6, suffix: ' timer', label: 'Administration sparet per uge i gennemsnit' },
      { value: 30, suffix: '%', label: 'Færre forgæves besøg og mistet kørselstid' },
      { value: 3, suffix: ' dage', label: 'Hurtigere betaling med automatisk fakturering' },
      { value: 0, display: '0 kr.', label: 'Gratis forever-plan tilgængelig' },
    ],

    featureGrid: {
      eyebrow: 'Én simpel app',
      title: 'Alt din højtryksrensningsvirksomhed behøver for at vokse',
      sub: 'Bygget til at køre fra telefonen — ingen laptop, intet kontor, intet besvær.',
      items: [
        { icon: 'route', title: 'Ruteplanlægning', text: 'Dine jobs sorteret efter lokation automatisk, så du kører kortere og renser mere.' },
        { icon: 'bell', title: 'Kundepåmindelser', text: 'Automatisk SMS inden hvert besøg så kunder er klar og adgang er sikret.' },
        { icon: 'invoice', title: 'Øjeblikkelig fakturering', text: 'Faktura genereret og sendt i sekundet et job markeres færdigt.' },
        { icon: 'card', title: 'Online betalinger', text: 'Kunder betaler med kort eller bankoverførsel fra et link i fakturaen.' },
        { icon: 'calendar', title: 'Planlægning', text: 'Se ugen, træk jobs rundt og undgå aldrig overbooking.' },
        { icon: 'users', title: 'Kundenoter', text: 'Adressedetaljer, adgangsoplysninger og jobnoter altid ved hånden.' },
        { icon: 'form', title: 'Bookingformular', text: 'Fang nye leads direkte fra din hjemmeside, klar til tilbud.' },
        { icon: 'phone', title: 'Virker på din telefon', text: 'Alt fra telefonen — styr din dag fra hjemmekontoret eller bilen.' },
      ],
    },

    testimonials: {
      title: 'Højtryksrensere der kører klogere og tjener mere',
      sub: 'Reelle resultater fra højtryksrensningsvirksomheder der bruger PathPilo.',
      items: [
        {
          quote: 'Ruteplanlægningen alene har sparet mig mindst halvanden time kørsel om dagen. Det svarer til to ekstra jobs. Det er som at få en lønstigning uden at arbejde mere.',
          name: 'Peter M.',
          role: 'Solo højtryksrenser',
          location: 'Fredericia',
        },
        {
          quote: 'Ingen forgæves ture mere. Påmindelserne sikrer at kunder altid er klar. Det er gjort en kæmpe forskel for min dag.',
          name: 'Simon K.',
          role: 'Højtryksrensning og overfladebehandling',
          location: 'Vejle',
        },
        {
          quote: 'Fakturaer sender sig selv og kunder betaler lynhurtigt. Det er revolutioneret min pengestrøm.',
          name: 'Emma N.',
          role: 'Højtryksrensning indkørsler og terrasser',
          location: 'Kolding',
        },
        {
          quote: 'Bookingformularen på min hjemmeside fanger henvendelser mens jeg sover. Jeg har fået tre nye kunder bare den seneste uge.',
          name: 'Marcus L.',
          role: 'Højtryksrensningshold',
          location: 'Esbjerg',
        },
      ],
    },

    freePlan: {
      title: 'Start gratis — ingen forpligtelse',
      sub: 'Alt en højtryksrensningsvirksomhed behøver til at planlægge klogere, forhindre forgæves ture og blive betalt hurtigt.',
      includes: [
        'Ruteplanlægning og daglig jobsortering',
        'Automatiske kundepåmindelser',
        'Øjeblikkelig fakturering med betalingslinks',
        'Online bookingformular',
        'Kundenoter og jobhistorik',
        'Mobilapp til hele din dag',
      ],
      note: 'Intet kreditkort. Ingen kontrakt. Gratis at bruge for enkeltmandsbedrifter.',
    },

    faq: {
      title: 'Spørgsmål om højtryksrensnings-software besvaret',
      sub: 'Alt du måske vil vide inden du starter.',
      items: [
        {
          q: 'Er PathPilo gratis for højtryksrensningsvirksomheder?',
          a: 'Ja. Gratisplanen dækker ruteplanlægning, kundeplanlægning, påmindelser, fakturering og online betalinger. Intet kreditkort, ingen tidsbegrænsning. Du betaler kun hvis du vokser til et team med adskillige hold der arbejder på samme tid.',
        },
        {
          q: 'Hvad sker der hvis en kunde ikke er hjemme?',
          a: 'PathPilo sender automatisk en SMS til kunden dagen inden. Hvis de stadig ikke er hjemme kan du registrere problemet, tage et foto og ombooke direkte fra mobilappen — uden at forstyrre resten af din dag.',
        },
        {
          q: 'Kan det håndtere engangsjobs og faste kunder?',
          a: 'Ja. PathPilo håndterer begge dele. Du kan opsætte tilbagevendende kunder med automatiske besøg og styre engangsjobs ved siden af — alt i det samme skema og på det samme kort.',
        },
        {
          q: 'Virker det til tilbud og prissætning?',
          a: 'Du kan vedhæfte noter, fotos og serviceoplysninger til hvert job. Tilbud kan sendes som en simpel e-mail eller besked fra systemet. Mange brugere sender hurtigt overslag direkte fra mobilappen mens de er på stedet.',
        },
        {
          q: 'Kan jeg tilføje teammedlemmer?',
          a: 'Ja. Virksomhedsplanen lader dig tilføje teammedlemmer, tildele dem specifikke jobs og give dem adgang til mobilappen med kun deres eget skema. Du styrer alt fra din admin-visning.',
        },
        {
          q: 'Hvad med sæsonbetonede perioder?',
          a: 'Du kan nemt skalere op og ned. Tilføj midlertidige teammedlemmer i travle perioder og tildel dem jobs. Planlæg fremtidige jobs på forhånd og PathPilo holder det hele organiseret.',
        },
      ],
    },

    finalCta: {
      title: 'Klar til at køre kortere ruter og tjene mere med højtryksrensning?',
      sub: 'Slut dig til højtryksrensere der planlægger klogere, sparer kørselstid og bliver betalt hurtigere med PathPilo. Gratis at starte.',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Skraldesspandsrensning
  // ─────────────────────────────────────────────────────────────────────────
  'bin-cleaning-software': {
    menuLabel: 'Skraldesspandsrensning',
    trade: 'skraldesspandsrensning',
    menuBlurb: 'Ugeruter, faste kunder og automatisk fakturering. Gratis.',

    seoTitle: 'Software til skraldesspandsrensning (gratis) — ruter, abonnementer og fakturering | PathPilo',
    seoDescription:
      'Gratis software til skraldesspandsrensning med ugentlig ruteplanlægning, abonnementsstyring og automatisk fakturering. Pas flere hjem ind og reducer spildt kørsel.',

    hero: {
      eyebrow: 'Software til skraldesspandsrensning',
      h1: 'Software til skraldesspandsrensning der planlægger dine ugentlige ruter og håndterer abonnementerne',
      sub: 'PathPilo organiserer dine daglige stop efter område, styrer faste abonnenter og sender fakturaer automatisk. Pas flere hjem ind og brug mindre tid på kontorarbejde.',
      trustLine: 'Gratis at starte · Intet kort nødvendigt · Mobilvenlig',
    },

    trustBar: {
      label: 'Bygget til skraldesspandsrensere — fra enkeltmandsbedrifter til hold med flere biler',
      points: ['Gratis at komme i gang', 'Ugentlig rutestyring', 'Abonnementsfakturering', 'Virker på din telefon'],
    },

    pain: {
      title: 'Lyder det bekendt?',
      sub: 'Skraldesspandsrensning handler om effektivitet — men de fleste operatører bruger for meget tid på administration frem for rensning.',
      items: [
        'Din daglige rute er ikke optimeret og du kører frem og tilbage over det samme område.',
        'Du er nødt til at huske at fakturere hundredvis af abonnenter manuelt — og det glimter nogle gange.',
        'En kunde er ikke hjemme og skraldespanden er indenfor — en spildt tur.',
        'At styre en ekspanderende abonnentliste i et regneark er ved at blive ukontrollerbart.',
        'Du ved ikke præcis hvem der er forfalden til betaling eller hvornår de sidst fik renset.',
        'At tilføje et andet hold i travle perioder er logistisk kaotisk.',
      ],
    },

    outcomes: [
      {
        eyebrow: 'Optimer dine ruter',
        title: 'Pas flere hjem ind på færre kilometers kørsel',
        body: 'PathPilo sorterer din daglige liste efter geografisk nærhed så du arbejder gade for gade i stedet for at hoppe rundt i hele distriktet. Typiske operatører rapporterer en besparelse på tyve til tredive procent af kørselstid.',
        bullets: [
          'Dagens hjem automatisk sorteret efter geografisk nærhed',
          'Kortvisning viser optimal rækkefølge og estimeret tid',
          'Tilføj ekstra kunder til eksisterende ruter uden besvær',
        ],
        visual: 'route',
        video: '/images/features/routeplanning-weekplanner-placeholder.mp4',
        videoPoster: '/images/features/scheduling.png',
      },
      {
        eyebrow: 'Ingen forgæves ture',
        title: 'Kunder der altid er klar til dit besøg',
        body: 'En automatisk besked aftenen inden til abonnenter betyder at skraldespande er trukket frem og tilgængelige. Færre forgæves ture, gladere kunder og en mere forudsigelig dag.',
        bullets: [
          'Automatisk aftens-påminding til alle kunder der er skema den næste dag',
          'Kunder kan hurtigt rapportere adgangsproblemer',
          'Markant færre forgæves ture og mistet tid',
        ],
        visual: 'sms',
        video: '/images/features/routeplanning-automations.mp4',
        videoPoster: '/images/features/routes.png',
      },
      {
        eyebrow: 'Automatisk fakturering',
        title: 'Abonnementsfakturaer der sender sig selv',
        body: 'Sæt fakturering til at køre automatisk — ugentlig, månedlig eller hvilken frekvens der passer til dit prismodel. PathPilo genererer og sender fakturaen og rykker for ubetalte. Du behøver aldrig huske at fakturere nogen.',
        bullets: [
          'Automatisk faktura sendt på din foretrukne frekvens',
          'Betalingspåmindelser jager sene betalere for dig',
          'Kort og bankoverførsels-betalingslinks inkluderet',
        ],
        visual: 'invoice',
        image: '/images/features/invoicing.png',
        imageAlt: 'PathPilo faktureringsskærm der viser automatisk fakturering for abonnementer',
        imagePlain: true,
      },
      {
        eyebrow: 'Vokse din abonnentliste',
        title: 'Online tilmelding der fylder din rute',
        body: 'En tilmeldingsformular på din hjemmeside lader nye kunder tilmelde sig dit service og få tilknyttet den nærmeste rute. Du ser nye abonnenter i PathPilo og kan tilføje dem til den rigtige rute med det samme.',
        bullets: [
          'Online tilmeldingsformular til din hjemmeside',
          'Nye abonnenter automatisk tilføjet til den nærmeste rute',
          'Håndter ekspansion uden mere administration',
        ],
        visual: 'booking',
        image: '/images/features/bin-cleaning-person-app.png',
        imageAlt: 'En skraldesspandsrenser ved sin varevogn der styrer ruter og abonnementer på PathPilo',
        imagePlain: true,
      },
    ],

    stats: [
      { value: 8, suffix: ' timer', label: 'Administration sparet per uge i gennemsnit' },
      { value: 25, suffix: '%', label: 'Reduktion i kørselstid med ruteoptimering' },
      { value: 3, suffix: ' dage', label: 'Hurtigere betaling med automatisk fakturering' },
      { value: 0, display: '0 kr.', label: 'Gratis forever-plan tilgængelig' },
    ],

    featureGrid: {
      eyebrow: 'Én simpel app',
      title: 'Alt en skraldesspandsrensningsvirksomhed behøver for at skalere',
      sub: 'Fra ugentlige ruter til automatisk abonnementsfakturering — alt fra din telefon.',
      items: [
        { icon: 'route', title: 'Ugentlig ruteplanlægning', text: 'Dine daglige hjem sorteret efter lokation automatisk for optimal kørsel.' },
        { icon: 'bell', title: 'Aftens-påmindelser', text: 'Automatisk besked til abonnenter aftenen inden så de er klar til dit besøg.' },
        { icon: 'invoice', title: 'Automatisk abonnementsfakturering', text: 'Fakturaer genereret og sendt på din foretrukne frekvens — ugentlig eller månedlig.' },
        { icon: 'card', title: 'Online betalinger', text: 'Kunder betaler med kort eller bankoverførsel fra et link i fakturaen.' },
        { icon: 'calendar', title: 'Abonnementsstyring', text: 'Administrer ubegrænsede abonnenter med ugentlige og månedlige skemaer.' },
        { icon: 'users', title: 'Kundenoter', text: 'Adgangsoplysninger, specielle instruktioner og adressedetaljer altid synlige.' },
        { icon: 'form', title: 'Online tilmelding', text: 'Nye kunder kan tilmelde sig og blive tilknyttet den nærmeste rute.' },
        { icon: 'phone', title: 'Virker på din telefon', text: 'Alt kører fra din telefon — ingen laptop, intet kontor nødvendigt.' },
      ],
    },

    testimonials: {
      title: 'Skraldesspandsrensere der kører klogere og vokser hurtigere',
      sub: 'Reelle resultater fra skraldesspandsrensningsvirksomheder der bruger PathPilo.',
      items: [
        {
          quote: 'Jeg sparer næsten to timer kørsel om dagen bare fra ruteoptimeringen. Det giver mig tid til at tilføje tredive ekstra hjem om ugen.',
          name: 'Casper B.',
          role: 'Enkeltmands skraldesspandsrenser',
          location: 'Viborg',
        },
        {
          quote: 'Automatisk fakturering har ændret alt. Jeg plejede at bruge fredagene på at fakturere. Nu genererer PathPilo dem og sender dem. Jeg er aldrig bagud med betalinger.',
          name: 'Louise T.',
          role: 'Skraldesspandsrensning — to biler',
          location: 'Holstebro',
        },
        {
          quote: 'Aftens-påmindelserne har reduceret forgæves ture næsten til nul. Kunder sætter bare spandene frem og vi kører igennem — rent og effektivt.',
          name: 'Henrik N.',
          role: 'Skraldesspandsrensningshold',
          location: 'Skive',
        },
        {
          quote: 'Online tilmeldingsformularen fylder min rute mens jeg sover. Jeg er gået fra 80 til 220 abonnenter på seks måneder.',
          name: 'Mathias O.',
          role: 'Skraldesspandsrensningsvirksomhed',
          location: 'Ikast',
        },
      ],
    },

    freePlan: {
      title: 'Start gratis — intet kreditkort krævet',
      sub: 'Alt en skraldesspandsrensningsvirksomhed behøver til at styre ruter, abonnenter og fakturering, gratis.',
      includes: [
        'Ugentlig ruteplanlægning og ruteoptimering',
        'Ubegrænset abonnentstyring',
        'Automatiske aftens-påmindelser',
        'Automatisk fakturering og betalingslinks',
        'Online tilmeldingsformular',
        'Mobilapp til brug på ruten',
      ],
      note: 'Intet kreditkort. Ingen kontrakt. Gratis for enkeltmandsbedrifter.',
    },

    faq: {
      title: 'Spørgsmål om skraldesspandsrensnings-software besvaret',
      sub: 'Alt du måske vil vide inden du starter.',
      items: [
        {
          q: 'Er PathPilo gratis for skraldesspandsrensere?',
          a: 'Ja. Gratisplanen dækker ruteplanlægning, abonnentstyring, påmindelser, fakturering og online betalinger — gratis for enkeltmandsbedrifter. Du betaler kun hvis du vokser til et team med adskillige hold der arbejder på samme tid.',
        },
        {
          q: 'Kan det styre hundredvis af ugentlige abonnenter?',
          a: 'Ja. PathPilo er designet til at håndtere store abonnentlister. Tilføj kunder, tildel dem til ruter og PathPilo planlægger automatisk din ugentlige kørsel og fakturering. Ingen begrænsning på antal kunder.',
        },
        {
          q: 'Hvordan fungerer abonnementsfaktureringen?',
          a: 'Opsæt din foretrukne faktureringsfrekvens (ugentlig, månedlig osv.) og PathPilo genererer og sender fakturaerne automatisk. Betalingslinks er inkluderet og automatiske påmindelser jager ubetalte fakturaer. Du behøver aldrig huske at fakturere nogen manuelt.',
        },
        {
          q: 'Kan jeg styre to biler med separate ruter?',
          a: 'Ja. Virksomhedsplanen lader dig tilføje teammedlemmer og tildele dem specifikke ruter. Du kan se begge chauffører og deres fremskridt i realtid fra din telefon.',
        },
        {
          q: 'Virker online tilmeldingsformularen med min hjemmeside?',
          a: 'Ja. PathPilo genererer en indlejrbar formular som du kan tilføje til en hvilken som helst hjemmeside. Nye kunder udfylder deres adresse og oplysninger og de vises i din PathPilo-konto klar til at blive tilføjet til den rette rute.',
        },
        {
          q: 'Hvordan fungerer aftens-påmindelsen?',
          a: 'PathPilo sender automatisk en tekstbesked til hvert hjem der er planlagt til den næste dag. Du kan tilpasse beskeden og tidspunktet. Det kører automatisk — du behøver ikke gøre noget efter det er sat op.',
        },
        {
          q: 'Hvor lang tid tager det at opsætte?',
          a: 'De fleste skraldesspandsrensningsvirksomheder får deres kundeliste importeret og første rute sat op inden for et par timer. Ruteplanlægning og tilbagevendende skemaer er ligetil at konfigurere og appen guider dig igennem det.',
        },
      ],
    },

    finalCta: {
      title: 'Klar til at drive en mere strømlinet og profitabel skraldesspandsrensningsvirksomhed?',
      sub: 'Slut dig til skraldesspandsrensere der kører klogere ruter, opkræver automatisk og skalerer uden kaos. Gratis at starte i dag.',
    },
  },
}
