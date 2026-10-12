import type { Story } from './types';

const AUTHORITY = 'Autoritatea pentru Administrarea Sistemului National Antigrindina si de Crestere a precipitatiilor';
const NOTE = 'Instituție CUI 34138203. Negociere fără publicare prealabilă, CPV 90721800-5. Valoarea este plafonul acordului-cadru, nu o plată. Data semnării este cea din payloadul SEAP al contractului (ora României).';

/** Local reporting preview. Working notes stay outside the public repository:
 * ../seap-research/docs/research/20261012-claude-stories/. No natural persons are named. */
export const antigrindinaStory: Story = {
  slug: 'antigrindina-unitatile-la-firme-de-paza',
  status: 'preview',
  title: 'Statul a promis că preia antigrindina. A dat-o, fără licitație, unor firme de pază',
  summary: 'În 2025, ministrul Agriculturii spunea că doar statul va mai opera sistemul antigrindină. La 2 iulie 2026, autoritatea a semnat într-o singură zi opt acorduri-cadru, fără anunț public, cu plafoane de 65,5 milioane de lei. 59,5 milioane merg la trei firme de pază, iar cea mai mare parte, la o firmă înființată în 2025, fără cifră de afaceri. După 27 de zile, Corpul de control al premierului critica exact acest mod de selecție.',
  counties: ['bucuresti', 'maramures', 'timis', 'mures', 'iasi', 'vrancea', 'prahova'],
  topic: 'Agricultură și protecție civilă',
  illustration: 'network',
  author: 'cinecâștigă · documentare din date publice',
  publishedAt: '2026-10-12',
  minutes: 8,
  period: 'Aprilie 2025 – iulie 2026',
  keyFacts: [
    { value: '65,5 mil. lei', label: 'plafoane semnate' },
    { value: '8', label: 'acorduri-cadru' },
    { value: '1 zi', label: '2 iulie 2026' },
    { value: '0', label: 'proceduri cu anunț public' }
  ],
  visual: {
    kind: 'map',
    title: 'Cine a primit unitățile',
    caption: 'Fiecare unitate antigrindină, colorată după câștigătorul acordului din 2 iulie 2026. Unitatea apare în județul din numele ei; aria acoperită poate fi mai mare. Apasă pe o unitate pentru înregistrarea SEAP.',
    groups: [
      { id: 'icewolfs', label: 'ICEWOLFS TEAM · 27,2 mil. lei' },
      { id: 'darkstone', label: 'Dark Stone Security · 22,4 mil. lei' },
      { id: 'legendary', label: 'Legendary Team Security · 9,9 mil. lei' },
      { id: 'electro', label: 'Electromecanica Ploiești · 6,0 mil. lei' }
    ],
    regions: [
      { county: 'maramures', label: 'Maramureș', group: 'icewolfs', sourceId: 'cadru-maramures' },
      { county: 'timis', label: 'Timiș', group: 'icewolfs', sourceId: 'cadru-timis' },
      { county: 'mures', label: 'Mureș', group: 'icewolfs', sourceId: 'cadru-mures' },
      { county: 'iasi', label: 'Moldova 1 Iași', group: 'darkstone', sourceId: 'cadru-iasi' },
      { county: 'vrancea', label: 'Moldova 2 Vrancea', group: 'legendary', sourceId: 'cadru-vrancea-2026' },
      { county: 'prahova', label: 'Pilot Prahova', group: 'electro', sourceId: 'cadru-prahova' }
    ],
    unlocated: [
      { label: 'Oltenia', group: 'darkstone', sourceId: 'cadru-oltenia' },
      { label: 'Pilot GC Sud', group: 'darkstone', sourceId: 'cadru-gc-sud' }
    ]
  },
  intro: [
    'La 2 iulie 2026, Autoritatea pentru Administrarea Sistemului Național Antigrindină și de Creștere a Precipitațiilor (AASNACP) a semnat opt acorduri-cadru pentru „exploatarea operațională … precum și monitorizarea și paza Punctelor de lansare” din opt unități regionale. Toate au fost atribuite prin negociere fără publicare prealabilă: fără anunț public de participare, cu un singur operator pe unitate.[[cadru-maramures]]',
    'Plafoanele însumează 65.503.241,82 lei. Trei firme de pază și securitate primesc 59.521.011,48 lei. A opta unitate, Prahova, revine Electromecanica Ploiești, operator și în anii anteriori.[[cadru-prahova]]'
  ],
  finding: {
    title: 'Acordurile-cadru din 2 iulie 2026, pe câștigători',
    sourceIds: ['cadru-maramures', 'cadru-oltenia', 'cadru-vrancea-2026', 'cadru-iasi', 'cadru-prahova', 'cadru-timis', 'cadru-mures', 'cadru-gc-sud'],
    explanation: 'Plafoane maxime ale acordurilor-cadru, nu plăți și nici contracte subsecvente. Câte servicii s-au comandat efectiv și ce s-a plătit nu reiese din SEAP.',
    after: 'Acordul din septembrie 2025 pentru Vrancea, câștigat tot de Legendary Team Security, este context și nu intră în total.[[cadru-vrancea-2025]] Nu adunăm plafoane din ani diferiți.',
    groupBySupplier: true
  },
  actors: {
    title: 'Ce arată registrele despre câștigători',
    intro: 'Date din registrul comerțului (8 iulie 2026) și din bilanțurile depuse la Ministerul Finanțelor pentru 2025, puse lângă plafoanele câștigate.',
    items: [
      { name: 'ICEWOLFS TEAM', entityId: '2161979', won: '27227467.82', wonLabel: 'plafoane pentru 3 unități', facts: [{ label: 'Înregistrată', value: '2025' }, { label: 'Sediu', value: 'București S5' }, { label: 'Salariați 2025', value: 'neraportați' }, { label: 'Venituri totale 2025', value: '0 lei' }], sourceIds: ['registre-firme', 'osim-marca', 'site-icewolfs'] },
      { name: 'Dark Stone Security', entityId: '2161980', won: '22359019.86', wonLabel: 'plafoane pentru 3 unități', facts: [{ label: 'Înregistrată', value: '2024' }, { label: 'Sediu', value: 'Otopeni, Ilfov' }, { label: 'Bilanț 2025', value: 'absent din set' }], sourceIds: ['registre-firme'] },
      { name: 'Legendary Team Security', entityId: '2162029', won: '9934523.80', wonLabel: 'plafon pentru 1 unitate (și 11,4 mil. în 2025)', facts: [{ label: 'Înregistrată', value: '2023' }, { label: 'Sediu', value: 'Focșani, Vrancea' }, { label: 'Salariați 2025', value: '171' }, { label: 'Cifră de afaceri 2025', value: '2.982.000 lei' }], sourceIds: ['registre-firme'] }
    ]
  },
  sections: [
    {
      id: 'promisiunea', title: 'Promisiunea: „doar statul”',
      quote: { text: 'nu va mai face aceste operațiuni decât statul român', attribution: 'Ministrul Agriculturii, aprilie 2025, potrivit Jurnalul', sourceId: 'jurnalul-2025' },
      paragraphs: [
        'Între 2018 și 2024, unitățile au fost exploatate aproape exclusiv de Intervenții Active în Atmosferă SA (IAA) și Electromecanica Ploiești SA, tot prin negociere fără publicare. În mai 2024, IAA semna opt acorduri-cadru cu autoritatea.',
        'La 28 aprilie 2025, Jurnalul relata declarațiile ministrului Agriculturii de atunci: operațiunile urmau să fie făcute doar de stat, iar IAA nu mai avea contracte cu statul.[[jurnalul-2025]] La 7 aprilie 2026, IAA intra în insolvență, dosarul 12280/3/2026.[[insolventa-iaa]]',
        'Promisiunea politică nu este o obligație juridică. Contrastul este însă direct: un an mai târziu, exploatarea și paza nu revin unei structuri a statului, ci unor operatori privați, aleși fără competiție publică.'
      ],
      sourceIds: []
    },
    {
      id: 'cine-a-castigat', title: 'Cine sunt firmele',
      paragraphs: [
        'ICEWOLFS TEAM SRL (CUI 52470323) este înregistrată în 2025, cu sediul în București și activitate principală de pază. Bilanțul pe 2025 nu raportează cifră de afaceri sau salariați.[[registre-firme]] Site-ul firmei afișa „coming soon” la 12 octombrie 2026.[[site-icewolfs]] Marca a fost depusă la OSIM în septembrie 2025.[[osim-marca]] În SEAP, firma apare cu o adresă din Șoimuș, județul Mureș. A primit cea mai mare parte a banilor: 27.227.467,82 lei pentru trei unități.',
        'Dark Stone Security SRL (CUI 50024197, Otopeni) nu are bilanț pe 2025 în setul Ministerului Finanțelor încărcat de noi. Legendary Team Security (CUI 48491433, Focșani) este o firmă de pază activă, cu 171 de salariați raportați pentru 2025; operase deja Vrancea din septembrie 2025.[[cadru-vrancea-2025]]',
        'Lipsa activității anterioare nu dovedește că o firmă nu poate presta serviciul. Ea face însă necesare întrebările despre personalul calificat pentru lansarea rachetelor și despre licența de operare. În registrul ONRC, cele trei firme nu au reprezentanți legali comuni între ele sau cu IAA.[[registre-firme]]'
      ],
      sourceIds: []
    },
    {
      id: 'controlul', title: 'După 27 de zile, Corpul de control',
      quote: { text: 'în afara unui cadru competitiv, fiind create premisele existenței unei situații de limitare a concurenței', attribution: 'Corpul de control al prim-ministrului, sinteza din 29 iulie 2026', sourceId: 'ccpm-sinteza' },
      paragraphs: [
        'Sinteza Corpului de control al prim-ministrului, datată 29 iulie 2026, constată că licențele și selecția operatorilor au fost făcute în afara unui cadru competitiv, iar serviciile au fost atribuite în 2022–2024 prin negociere cu un singur operator pe unitate.[[ccpm-sinteza]] Raportul mai arată că în 2025 nu s-au făcut intervenții antigrindină: până la 30 noiembrie 2025 s-au cheltuit 94.167 mii lei, din care 80.937 mii lei pentru conservare și pază prestate de operatori.',
        'Același document notează că intervențiile din Prahova sunt suspendate prin Ordinul MADR nr. 300 din 26 iulie 2024, până la un studiu de impact care nu a fost contractat. La 2 iulie 2026 a fost semnat totuși și pentru unitatea pilot Prahova un acord al cărui obiect include exploatarea operațională, monitorizarea și paza.[[cadru-prahova]] Din documentele pe care le avem nu putem spune dacă vreo lansare a fost autorizată acolo.',
        'Controlul privește anii anteriori, nu acordurile din iulie 2026. Acestea folosesc însă același mecanism: un operator pe unitate, ales prin negociere fără publicare. În mai 2026, APIX scria că autoritatea pregătea paza punctelor de lansare 24 de ore din 24, cu aproximativ 50 de milioane de lei.[[apix-paza]] Nu am găsit în SEAP o procedură competitivă corespunzătoare.'
      ],
      sourceIds: ['observatorul-ph']
    },
    {
      id: 'ce-nu-stim', title: 'Ce nu știm',
      paragraphs: [
        'Anunțurile de atribuire din arhiva noastră nu conțin justificarea legală a negocierii fără publicare, iar documentele procedurilor nu au fost descărcate. Nu am văzut licențele operatorilor. Nu știm câte rachete s-au lansat în 2026 și nici dacă serviciul prestat efectiv este exploatare sau doar pază.',
        'Presa locală din Vrancea a descris contractul de aproape 10 milioane pentru Moldova 2.[[monitorul-vrancea]] Nu am găsit o relatare care să pună cap la cap toate cele opt acorduri. O relatare locală despre un dosar penal nu este coroborată și nu o folosim.'
      ],
      sourceIds: []
    }
  ],
  timeline: [
    { id: 'istoric', date: null, title: '2018–2024: un operator pe unitate, prin negociere', text: 'IAA și Electromecanica Ploiești exploatează unitățile. Corpul de control descrie atribuirea 2022–2024 drept negociere cu un singur operator pe unitate.', sourceIds: ['ccpm-sinteza'] },
    { id: 'declaratie', date: '2025-04-28', title: 'Ministrul: „doar statul”', text: 'Jurnalul relatează că operațiunile nu vor mai fi făcute decât de stat și că IAA nu mai are contracte.', sourceIds: ['jurnalul-2025'], highlight: true },
    { id: 'vrancea-2025', date: '2025-09-15', title: 'Vrancea, către Legendary Team Security', text: 'Acord-cadru de 11.390.700 lei, prin negociere fără publicare.', sourceIds: ['cadru-vrancea-2025'] },
    { id: 'insolventa', date: '2026-04-07', title: 'IAA intră în insolvență', text: 'Publicare în Buletinul procedurilor de insolvență, dosar 12280/3/2026.', sourceIds: ['insolventa-iaa'] },
    { id: 'apix', date: null, title: 'Mai 2026: ~50 de milioane pentru pază', text: 'APIX relatează pregătirea unei paze permanente a punctelor de lansare.', sourceIds: ['apix-paza'] },
    { id: 'semnare', date: '2026-07-02', title: 'Opt acorduri-cadru în aceeași zi', text: 'Plafoane de 65.503.241,82 lei, toate prin negociere fără publicare. Anunțurile de atribuire apar în SEAP la 7–8 iulie.', sourceIds: ['cadru-maramures', 'cadru-oltenia', 'cadru-vrancea-2026', 'cadru-iasi', 'cadru-prahova', 'cadru-timis', 'cadru-mures', 'cadru-gc-sud'], highlight: true },
    { id: 'presa-vrancea', date: '2026-07-16', title: 'Presa locală descrie contractul din Vrancea', text: 'Monitorul de Vrancea: perioada 4 august–31 octombrie 2026, 20 de puncte de lansare.', sourceIds: ['monitorul-vrancea'] },
    { id: 'control', date: '2026-07-29', gapBefore: '27 de zile după semnare', title: 'Sinteza Corpului de control', text: 'Selecție „în afara unui cadru competitiv”; în 2025, conservarea și paza consumă 80.937 din 94.167 mii lei.', sourceIds: ['ccpm-sinteza', 'observatorul-ph'], highlight: true }
  ],
  questions: [
    'AASNACP: care este temeiul legal și justificarea scrisă pentru negocierea fără publicare în fiecare dintre cele opt proceduri? Câți operatori au fost invitați și câte oferte s-au primit?',
    'AASNACP: cum se justifică acordul pentru exploatarea unității Prahova, în condițiile suspendării intervențiilor prin Ordinul MADR nr. 300/2024?',
    'AASNACP: cine deține licențele de operare a sistemelor antigrindină, de când, și ce personal calificat pentru lansare au declarat câștigătorii?',
    'AASNACP: ce contracte subsecvente s-au încheiat în 2026, pentru ce servicii (exploatare sau pază) și ce plăți s-au făcut? Câte rachete s-au lansat?',
    'Ministerul Agriculturii: cum se împacă atribuirile din iulie 2026 cu declarația din aprilie 2025 și cu concluziile Corpului de control?'
  ],
  reply: {
    title: 'Solicitările nu au fost trimise',
    text: 'Nu am contactat autoritatea, ministerul sau firmele. Întrebările sunt pregătite pentru o cerere în baza Legii 544/2001. Articolul este o previzualizare locală.',
    sourceIds: []
  },
  methodology: 'Documentare la 12 octombrie 2026, din baza de producție cinecastiga.ro, citită numai în regim read-only, și din surse publice deschise în aceeași zi. Cele opt acorduri sunt identificate prin ID-ul contractului și ID-ul anunțului de atribuire. Datele de semnare provin din payloadul SEAP, în ora României. Valorile sunt plafoane de acord-cadru, nu plăți. Datele firmelor provin din fișierele ONRC open data (8 iulie 2026) și din situațiile financiare MF 2018–2025 încărcate în aplicație. Reprezentanții au fost comparați automat, fără a publica nume. Persoanele fizice nu sunt numite intenționat. Nu formulăm o concluzie juridică.',
  corrections: [],
  sources: [
    { id: 'cadru-maramures', kind: 'procurement', observedAt: '2026-10-12', title: 'UCCG Maramureș — exploatare operațională, monitorizare și pază', record: { type: 'contract', id: '107816316', awardNoticeId: '100640464' }, date: '2026-07-02', amount: '17000639.44', currency: 'RON', authority: AUTHORITY, suppliers: ['ICEWOLFS TEAM'], code: 'CAN1171067', cpv: '90721800-5', note: `Acord-cadru nr. 155. Furnizor CUI 52470323. ${NOTE}` },
    { id: 'cadru-oltenia', kind: 'procurement', observedAt: '2026-10-12', title: 'UCCG Oltenia — exploatare operațională, monitorizare și pază', record: { type: 'contract', id: '107816308', awardNoticeId: '100640459' }, date: '2026-07-02', amount: '9305892.82', currency: 'RON', authority: AUTHORITY, suppliers: ['Dark Stone Security'], code: 'CAN1171016', cpv: '90721800-5', note: `Acord-cadru nr. 151. Furnizor CUI 50024197. ${NOTE}` },
    { id: 'cadru-vrancea-2026', kind: 'procurement', observedAt: '2026-10-12', title: 'UCCG Moldova 2 Vrancea — exploatare operațională, monitorizare și pază', record: { type: 'contract', id: '107816307', awardNoticeId: '100640457' }, date: '2026-07-02', amount: '9934523.80', currency: 'RON', authority: AUTHORITY, suppliers: ['LEGENDARY TEAM SECURITY'], code: 'CAN1171002', cpv: '90721800-5', note: `Acord-cadru nr. 156. Furnizor CUI 48491433. ${NOTE}` },
    { id: 'cadru-iasi', kind: 'procurement', observedAt: '2026-10-12', title: 'UCCG Moldova 1 Iași — exploatare operațională, monitorizare și pază', record: { type: 'contract', id: '107816306', awardNoticeId: '100640456' }, date: '2026-07-02', amount: '8214018.69', currency: 'RON', authority: AUTHORITY, suppliers: ['Dark Stone Security'], code: 'CAN1170983', cpv: '90721800-5', note: `Acord-cadru nr. 158. Furnizor CUI 50024197. ${NOTE}` },
    { id: 'cadru-prahova', kind: 'procurement', observedAt: '2026-10-12', title: 'Unitatea pilot Prahova — exploatare operațională, monitorizare și pază', record: { type: 'contract', id: '107816304', awardNoticeId: '100640455' }, date: '2026-07-02', amount: '5982230.34', currency: 'RON', authority: AUTHORITY, suppliers: ['ELECTROMECANICA PLOIESTI S.A.'], code: 'CAN1170965', cpv: '90721800-5', note: `Acord-cadru nr. 157. Furnizor CUI 14361269. ${NOTE}` },
    { id: 'cadru-timis', kind: 'procurement', observedAt: '2026-10-12', title: 'UCCG Timiș — exploatare operațională, monitorizare și pază', record: { type: 'contract', id: '107816312', awardNoticeId: '100640460' }, date: '2026-07-02', amount: '5194815.64', currency: 'RON', authority: AUTHORITY, suppliers: ['ICEWOLFS TEAM'], code: 'CAN1171023', cpv: '90721800-5', note: `Acord-cadru nr. 153. Furnizor CUI 52470323. ${NOTE}` },
    { id: 'cadru-mures', kind: 'procurement', observedAt: '2026-10-12', title: 'UCCG Mureș — exploatare operațională, monitorizare și pază', record: { type: 'contract', id: '107816313', awardNoticeId: '100640462' }, date: '2026-07-02', amount: '5032012.74', currency: 'RON', authority: AUTHORITY, suppliers: ['ICEWOLFS TEAM'], code: 'CAN1171029', cpv: '90721800-5', note: `Acord-cadru nr. 154. Furnizor CUI 52470323. ${NOTE}` },
    { id: 'cadru-gc-sud', kind: 'procurement', observedAt: '2026-10-12', title: 'Unitatea pilot GC Sud — exploatare operațională, monitorizare și pază', record: { type: 'contract', id: '107816315', awardNoticeId: '100640463' }, date: '2026-07-02', amount: '4839108.35', currency: 'RON', authority: AUTHORITY, suppliers: ['Dark Stone Security'], code: 'CAN1171056', cpv: '90721800-5', note: `Acord-cadru nr. 152. Furnizor CUI 50024197. ${NOTE}` },
    { id: 'cadru-vrancea-2025', kind: 'procurement', observedAt: '2026-10-12', title: 'UCCG Moldova 2 Vrancea — acordul din septembrie 2025', record: { type: 'contract', id: '106787907', awardNoticeId: '100576044' }, date: '2025-09-15', amount: '11390700', currency: 'RON', authority: AUTHORITY, suppliers: ['LEGENDARY TEAM SECURITY'], code: 'CAN1155051', cpv: '90721800-5', note: 'Acord-cadru nr. 182, context, în afara totalului. Furnizor CUI 48491433. Negociere fără publicare prealabilă. Payloadul contractului lipsește din arhivă: data este data normalizată convertită în ora României. Plafon, nu plată.' },
    { id: 'jurnalul-2025', kind: 'external', observedAt: '2026-10-12', title: 'Ministrul Agriculturii despre operarea sistemului de către stat', url: 'https://jurnalul.ro/special-jurnalul/ministrul-agriculturii-firma-privata-interventii-atmosfera-statul-roman-ploi-artificiale-antigrindina-996384.html', publisher: 'Jurnalul · 28 aprilie 2025', summary: 'Relatează declarația că operațiunile nu vor mai fi făcute decât de statul român și că IAA nu mai are contracte cu statul. Declarație politică, nu act normativ.' },
    { id: 'insolventa-iaa', kind: 'external', observedAt: '2026-10-12', title: 'Intervenții Active în Atmosferă SA, dosar 12280/3/2026', url: 'https://lege5.ro/Gratuit/ge4diobyg44te/interventii-active-in-atmosfera-sa-cui-6637100-dosar-nr-12280-3-2026', publisher: 'Lege5 · preluare din Buletinul procedurilor de insolvență', summary: 'Publicarea din 7 aprilie 2026 privind procedura de insolvență pentru CUI 6637100.' },
    { id: 'ccpm-sinteza', kind: 'external', observedAt: '2026-10-12', title: 'Sinteza controlului la AASNACP', url: 'https://control.gov.ro/ro/wp-content/uploads/2026/07/3_SINTEZA_AASNACP.pdf', publisher: 'Corpul de control al prim-ministrului · 29 iulie 2026', summary: 'Document datat 29 iulie 2026 (metadatele PDF). Selecția operatorilor în afara unui cadru competitiv, negociere cu un singur operator pe unitate în 2022–2024; în 2025 (până la 30 noiembrie) nicio intervenție, 80.937 din 94.167 mii lei pentru conservare și pază; intervențiile din Prahova suspendate prin Ordinul MADR 300/2024; licența limitată la persoane juridice române; lipsa monitorizării independente.' },
    { id: 'observatorul-ph', kind: 'external', observedAt: '2026-10-12', title: 'Raportul Guvernului privind sistemul antigrindină', url: 'https://www.observatorulph.ro/eveniment/2795308-raportul-guvernului-privind-sistemul-antigrindina-licente-fara-competitie-rachete-expirate-si-zero-monitorizare-independenta', publisher: 'Observatorul Prahovean', summary: 'Relatare despre sinteza Corpului de control: licențe fără competiție, rachete expirate, lipsa monitorizării independente.' },
    { id: 'apix-paza', kind: 'external', observedAt: '2026-10-12', title: 'Rachetele nu mai sunt lansate, dar statul plătește pentru paza lor', url: 'https://apix.ro/rachetele-nu-mai-sunt-lansate-dar-statul-plateste-milioane-de-euro-pentru-paza-lor/', publisher: 'APIX · mai 2026', summary: 'Relatează pregătirea unei paze 24/7, cu doi agenți pe punct, de aproximativ 50 de milioane de lei, pentru 1 august 2026–15 aprilie 2027.' },
    { id: 'monitorul-vrancea', kind: 'external', observedAt: '2026-10-12', title: 'Contract de aproape 10 milioane pentru Moldova 2 Vrancea', url: 'https://www.monitoruldevrancea.ro/2026/07/16/controversele-privind-sistemul-antigrindina-continua-contract-de-aproape-10-milioane-lei-pentru-reluarea-activitatii-unitatii-moldova-2-vrancea/', publisher: 'Monitorul de Vrancea · 16 iulie 2026', summary: 'Perioada 4 august–31 octombrie 2026, 20 de puncte de lansare. Singura relatare găsită despre acordurile din iulie; privește doar Vrancea.' },
    { id: 'osim-marca', kind: 'external', observedAt: '2026-10-12', title: 'Cererea de marcă ICEWOLFS, BOPI 19 septembrie 2025', url: 'https://www.osim.ro/images/Publicatii/Marci/2025/bopi19092025.pdf', publisher: 'OSIM · Buletinul Oficial de Proprietate Industrială', summary: 'Marcă depusă la 12 septembrie 2025. Confirmă existența firmei înaintea atribuirii, nu activitatea ei.' },
    { id: 'registre-firme', kind: 'note', observedAt: '2026-10-12', title: 'Firmele câștigătoare în ONRC și în bilanțurile MF', text: 'ONRC open data, 8 iulie 2026: ICEWOLFS TEAM SRL, CUI 52470323, J2025067789000, București Sectorul 5; Dark Stone Security SRL, CUI 50024197, J2024003263231; Legendary Team Security, CUI 48491433, J2023013112403. Situații financiare MF 2025: ICEWOLFS — CAEN 8001, fără cifră de afaceri și fără salariați raportați, cheltuieli 5.091 lei; Legendary — CAEN 8001, 171 de salariați, cifră de afaceri 2.982.000 lei; Dark Stone — fără bilanț 2025 în setul încărcat. Comparația reprezentanților legali s-a făcut automat, fără publicarea numelor: nu există reprezentanți comuni între cele trei firme sau cu IAA. Registrul arată roluri, nu proprietari.' },
    { id: 'site-icewolfs', kind: 'note', observedAt: '2026-10-12', title: 'Site-ul firmei ICEWOLFS TEAM', text: 'La 12 octombrie 2026, site-ul firmei afișa doar o pagină „coming soon”. Observație punctuală; nu dovedește lipsa activității.' }
  ]
};
