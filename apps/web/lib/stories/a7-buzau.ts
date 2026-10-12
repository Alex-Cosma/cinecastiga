import type { Story } from './types';

const CNAIR = 'COMPANIA NATIONALA DE ADMINISTRARE A INFRASTRUCTURII RUTIERE S.A.';

/** Local reporting preview. Working notes stay outside the public repository:
 * ../seap-research/docs/research/20261012-claude-stories/. No natural persons are named. */
export const a7BuzauStory: Story = {
  slug: 'a7-buzau-curatenie-49-milioane',
  status: 'preview',
  title: 'A7: firma de consultanță cu un salariat care a luat curățenia autostrăzii pentru patru ani',
  summary: 'Integra Solution Safe a fost înființată la Buzău în 2025 și a raportat un singur salariat. După două achiziții directe de la CNAIR, de câte 242.699 lei, în septembrie 2026 a câștigat un acord-cadru de 49,5 milioane de lei pentru 22 de locații de pe A7. Minimul și maximul ofertelor coincid, ceea ce indică o singură ofertă. Este o pistă de verificat, mai slabă decât celelalte.',
  counties: ['buzau'],
  topic: 'Drumuri și autostrăzi',
  illustration: 'road',
  author: 'cinecâștigă · documentare din date publice',
  publishedAt: '2026-10-12',
  minutes: 5,
  period: 'Decembrie 2025 – septembrie 2026',
  keyFacts: [
    { value: '49,5 mil. lei', label: 'acord-cadru pe 4 ani' },
    { value: '1', label: 'salariat raportat în 2025' },
    { value: '22', label: 'locații pe A7' },
    { value: '88%', label: 'din valoarea estimată de 56 mil. lei' }
  ],
  visual: {
    kind: 'bars',
    title: 'De la 242 de mii la 49 de milioane',
    caption: 'Tot ce apare în SEAP pentru Integra Solution Safe, lângă cifra de afaceri raportată pentru 2025. Barele sunt la aceeași scară.',
    bars: [
      { label: 'Achiziție directă, dec. 2025', note: 'DA39582660', value: 242699, display: '242.699 lei', sourceIds: ['da-decembrie'] },
      { label: 'Achiziție directă, feb. 2026', note: 'DA39782494', value: 242699, display: '242.699 lei', sourceIds: ['da-februarie'] },
      { label: 'Cifra de afaceri 2025', note: 'bilanț MF', value: 846947, display: '846.947 lei', sourceIds: ['registre-firme'] },
      { label: 'Acord-cadru nr. 1191', note: 'plafon pe 4 ani', value: 49462662.1, display: '49.462.662,10 lei', highlight: true, sourceIds: ['cadru-a7'] }
    ]
  },
  intro: [
    'La 8 septembrie 2026, CNAIR a semnat acordul-cadru nr. 1191 pentru „servicii de ordine, curățenie și întreținere în 22 locații (16 spații de servicii, parcări și 6 CIC-uri)” de pe autostrada A7, în administrarea DRDP Buzău. Durata este de patru ani, iar plafonul este de 49.462.662,10 lei. Procedura a fost licitație deschisă, cu o valoare estimată de 56.042.214 lei.[[cadru-a7]][[anunt-participare]]',
    'Câștigătorul este INTEGRA SOLUTION SAFE SRL din Buzău. În anunțul de atribuire, cea mai mică și cea mai mare ofertă au aceeași valoare, egală cu valoarea atribuită. Acesta este de obicei semnul unei singure oferte; numărul exact de ofertanți trebuie confirmat din raportul procedurii.'
  ],
  finding: {
    title: 'Acordul-cadru pentru A7',
    sourceIds: ['cadru-a7'],
    explanation: 'Plafonul acordului-cadru pe patru ani, nu o plată. Contractele subsecvente și plățile nu reies din anunțul de atribuire.',
    after: 'Cele două achiziții directe anterioare, contractul de curățenie din aprilie și acordul pentru A2+A4 sunt context și nu intră în total.'
  },
  actors: {
    title: 'Câștigătorul, în registre',
    items: [
      { name: 'Integra Solution Safe', entityId: '2227473', won: '49462662.10', wonLabel: 'plafon pe 4 ani, 22 de locații', facts: [{ label: 'Înregistrată', value: '2025' }, { label: 'Sediu', value: 'Buzău' }, { label: 'CAEN 2025', value: '7022 · consultanță' }, { label: 'Salariați 2025', value: '1' }, { label: 'Cifră de afaceri 2025', value: '846.947 lei' }, { label: 'Cheltuieli 2025', value: '77.303 lei' }], sourceIds: ['registre-firme'] }
    ]
  },
  sections: [
    {
      id: 'firma', title: 'Firma: un salariat, consultanță',
      paragraphs: [
        'Integra Solution Safe (CUI 51476751) este înregistrată la ONRC în 2025. În bilanțul pe 2025 declară codul CAEN 7022, consultanță în afaceri și management, un salariat, cifră de afaceri de 846.947 lei, cheltuieli de 77.303 lei și profit net de 750.082 lei.[[registre-firme]]',
        'O firmă mică poate câștiga legal un contract mare dacă se bazează pe subcontractanți sau pe experiența unui terț susținător. Raportul procedurii ar arăta cum au fost îndeplinite cerințele de experiență și personal pentru 22 de locații.'
      ],
      sourceIds: []
    },
    {
      id: 'directe', title: 'Înainte: două achiziții directe identice',
      paragraphs: [
        'În SEAP, Integra apare înainte de acord cu două achiziții directe de la CNAIR, ambele cu CPV 90914000-7, servicii de curățare a parcărilor, și ambele de 242.699 lei: una finalizată la 19 decembrie 2025,[[da-decembrie]] cealaltă la 6 februarie 2026.[[da-februarie]] Fiecare este sub pragul de 270.120 lei pentru achiziția directă de servicii.',
        'Copiile complete ale celor două achiziții lipsesc din arhiva noastră, așa că nu le cunoaștem titlul exact și nici locațiile. Nu putem spune dacă privesc aceleași parcări sau dacă au fost o fragmentare.',
        'În aprilie 2026, curățenia spațiilor de servicii de pe A7, km 0–145+690, fusese atribuită altei firme, Group Velstand, printr-o procedură simplificată de 357.825,26 lei.[[contract-velstand]]'
      ],
      sourceIds: []
    },
    {
      id: 'comparatie', title: 'Cât costă în altă parte',
      paragraphs: [
        'Pentru A2 și A4, DRDP Constanța a atribuit în 2024 un acord-cadru pe patru ani pentru același tip de servicii: 31.483.826,63 lei, câștigat de Iridex Group Salubrizare.[[cadru-a2-a4]] Și acolo minimul și maximul ofertelor coincid, deci o singură ofertă nu este un caz izolat la CNAIR. Nu cunoaștem numărul de locații de pe A2+A4, așa că nu calculăm un cost pe locație.',
        'Pentru DEx12 Craiova–Pitești, presa locală a relatat în aprilie 2026 o valoare estimată de aproximativ 9,4 milioane de lei pentru 16 spații pe 24 de luni, adică circa 294.000 de lei pe locație și an.[[dex12]] Pe A7, plafonul înseamnă circa 562.000 de lei pe locație și an, de aproape două ori mai mult. Serviciile, programul și suprafețele pot diferi; comparația este orientativă.'
      ],
      sourceIds: []
    }
  ],
  timeline: [
    { id: 'infiintare', date: null, title: '2025: firma este înregistrată', text: 'Număr ONRC J2025019627008, Buzău.', sourceIds: ['registre-firme'] },
    { id: 'da-1', date: '2025-12-19', title: 'Prima achiziție directă', text: 'DA39582660, 242.699 lei, curățare parcări.', sourceIds: ['da-decembrie'] },
    { id: 'da-2', date: '2026-02-06', title: 'A doua achiziție directă, aceeași valoare', text: 'DA39782494, 242.699 lei.', sourceIds: ['da-februarie'] },
    { id: 'velstand', date: '2026-04-17', title: 'Curățenia pe A7, către altă firmă', text: 'Group Velstand, procedură simplificată, 357.825,26 lei.', sourceIds: ['contract-velstand'] },
    { id: 'cadru', date: '2026-09-08', title: 'Acordul-cadru nr. 1191', text: 'Patru ani, 22 de locații, 49.462.662,10 lei; anunț de atribuire publicat la 14 septembrie.', sourceIds: ['cadru-a7'], highlight: true }
  ],
  questions: [
    'CNAIR: câte oferte au fost depuse pentru acordul-cadru nr. 1191 și ce arată raportul procedurii? Au existat contestații?',
    'CNAIR: cum a îndeplinit câștigătorul cerințele de experiență similară și personal? Cu ce subcontractanți sau terți susținători?',
    'CNAIR: ce obiect și ce locații au avut achizițiile directe DA39582660 și DA39782494?',
    'CNAIR: cum a fost stabilită valoarea estimată și de ce este mai mare pe locație decât pentru A2+A4 sau DEx12?'
  ],
  reply: {
    title: 'Solicitările nu au fost trimise',
    text: 'Nu am contactat CNAIR sau firmele. Întrebările sunt pregătite pentru o cerere în baza Legii 544/2001. Articolul este o previzualizare locală.',
    sourceIds: []
  },
  methodology: 'Documentare la 12 octombrie 2026, din baza de producție cinecastiga.ro, citită numai în regim read-only, și din surse publice. Datele de semnare provin din payloadul SEAP, în ora României, sau din data normalizată convertită în ora României când payloadul lipsește. Valorile sunt plafoane sau valori contractuale, nu plăți. Concluzia despre o singură ofertă este o deducție din valorile minimă și maximă publicate. Datele firmei provin din ONRC open data (8 iulie 2026) și din situațiile financiare MF. Persoanele fizice nu sunt numite intenționat. Este o pistă mai slabă decât celelalte și nu formulăm o concluzie juridică.',
  corrections: [],
  sources: [
    { id: 'cadru-a7', kind: 'procurement', observedAt: '2026-10-12', title: 'Ordine, curățenie și întreținere în 22 de locații de pe A7 — acordul-cadru nr. 1191', record: { type: 'contract', id: '108065116', awardNoticeId: '100654428' }, date: '2026-09-08', amount: '49462662.10', currency: 'RON', authority: CNAIR, suppliers: ['INTEGRA SOLUTION SAFE'], code: 'CAN1174187', cpv: '90914000-7', note: 'Instituție CUI 16054368, DRDP Buzău; furnizor CUI 51476751. Licitație deschisă, patru ani. Oferta minimă și cea maximă sunt egale cu valoarea atribuită. Plafon, nu plată.' },
    { id: 'da-decembrie', kind: 'procurement', observedAt: '2026-10-12', title: 'Achiziție directă CNAIR — curățare parcări, decembrie 2025', record: { type: 'direct', id: '121289388' }, date: '2025-12-19', amount: '242699', currency: 'RON', authority: CNAIR, suppliers: ['INTEGRA SOLUTION SAFE'], code: 'DA39582660', cpv: '90914000-7', publishedAt: '2025-12-18T15:13:41+02:00', finalizedAt: '2025-12-19T07:22:16+02:00', note: 'Context, în afara totalului. Ofertă acceptată. Payloadul sursă lipsește din arhivă; titlul este descriptiv, după CPV.' },
    { id: 'da-februarie', kind: 'procurement', observedAt: '2026-10-12', title: 'Achiziție directă CNAIR — curățare parcări, februarie 2026', record: { type: 'direct', id: '121503914' }, date: '2026-02-06', amount: '242699', currency: 'RON', authority: CNAIR, suppliers: ['INTEGRA SOLUTION SAFE'], code: 'DA39782494', cpv: '90914000-7', publishedAt: '2026-02-05T13:38:46+02:00', finalizedAt: '2026-02-06T08:54:43+02:00', note: 'Context, în afara totalului. Ofertă acceptată. Payloadul sursă lipsește din arhivă; titlul este descriptiv, după CPV.' },
    { id: 'contract-velstand', kind: 'procurement', observedAt: '2026-10-12', title: 'Curățenie și întreținere în spațiile de servicii de pe A7, km 0–145+690', record: { type: 'contract', id: '107534726', awardNoticeId: '100623199' }, date: '2026-04-17', amount: '357825.26', currency: 'RON', authority: CNAIR, suppliers: ['Group Velstand'], code: 'SCNA1132300', cpv: '90914000-7', note: 'Context, în afara totalului. Contract nr. 1015, procedură simplificată. Furnizor CUI 28553116. Payloadul contractului lipsește din arhivă; data este data normalizată convertită în ora României.' },
    { id: 'cadru-a2-a4', kind: 'procurement', observedAt: '2026-10-12', title: 'Ordine, curățenie și întreținere pe A2+A4, DRDP Constanța — acord-cadru pe 4 ani', record: { type: 'contract', id: '107779497', awardNoticeId: '100638274' }, date: '2024-07-16', amount: '31483826.63', currency: 'RON', authority: CNAIR, suppliers: ['IRIDEX GROUP SALUBRIZARE SRL'], code: 'CAN1130424', cpv: '90914000-7', note: 'Reper de comparație, în afara totalului. Contract nr. 99/30187, licitație deschisă. Oferta minimă și cea maximă coincid. Numărul de locații nu este cunoscut. Data este data normalizată convertită în ora României.' },
    { id: 'anunt-participare', kind: 'note', observedAt: '2026-10-12', title: 'Anunțul de participare CN1092606', text: 'Licitație deschisă pentru acordul-cadru A7, procedura 100323166 (c-notice 100207905). Valoare estimată 56.042.214 lei, din baza normalizată; stare la 18 mai 2026. Documentația procedurii nu este descărcată în arhiva noastră.' },
    { id: 'dex12', kind: 'external', observedAt: '2026-10-12', title: 'CNAIR alocă peste 9,4 milioane de lei pentru curățenie pe DEx12', url: 'https://evenimentdeolt.ro/2026/04/15/dolj-cnair-aloca-peste-94-milioane-de-lei-pentru-servicii-de-curatenie-si-ordine-pe-dex-12-craiova-pitesti/', publisher: 'Evenimentul de Olt · 15 aprilie 2026', summary: 'Valoare estimată de aproximativ 9,41 milioane de lei pentru 16 spații, pe 24 de luni. Estimare, nu valoare atribuită.' },
    { id: 'registre-firme', kind: 'note', observedAt: '2026-10-12', title: 'Integra Solution Safe în ONRC și în bilanțurile MF', text: 'ONRC open data, 8 iulie 2026: INTEGRA SOLUTION SAFE SRL, CUI 51476751, J2025019627008, Municipiul Buzău. MF 2025: CAEN 7022, 1 salariat, cifră de afaceri 846.947 lei, cheltuieli 77.303 lei, profit net 750.082 lei. Comparația automată a reprezentanților legali nu a găsit legături cu alte firme din aceste povești.' }
  ]
};
