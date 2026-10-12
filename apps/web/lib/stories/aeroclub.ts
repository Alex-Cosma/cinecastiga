import type { Story } from './types';

/** Local reporting preview. Working notes stay outside the public repository:
 * ../seap-research/docs/research/20261012-claude-stories/. No natural persons are named. */
export const aeroclubStory: Story = {
  slug: 'aeroclubul-romaniei-pompieri-de-doua-ori',
  status: 'preview',
  title: 'Aeroclubul României a cumpărat de două ori, în același an, aceiași pompieri pentru doi ani',
  summary: 'În aprilie și în iunie 2026, Aeroclubul României a anunțat aceeași procedură pentru serviciile de salvare și stingere a incendiilor: aceleași posturi, aceeași durată, același număr de anunț. A câștigat de ambele ori Authentic Blue, o firmă fără activitate raportată până în 2026. Împreună, cele două înregistrări SEAP valorează 29,4 milioane de lei.',
  counties: ['bucuresti'],
  topic: 'Aviație și siguranță',
  illustration: 'network',
  author: 'cinecâștigă · documentare din date publice',
  publishedAt: '2026-10-12',
  minutes: 6,
  period: 'Februarie 2025 – august 2026',
  intro: [
    'Aeroclubul României cumpără servicii de salvare și stingere a incendiilor pentru aerodromurile aerocluburilor teritoriale. Pe site-ul instituției sunt publicate două anunțuri pentru aceste servicii: unul din 22 aprilie 2026 și unul din 19 iunie 2026. Au același obiect, aceleași posturi (24/24, 8/24, 10/24 și 12/24), aceeași durată de 24 de luni și citează același număr de anunț publicitar, ADV 1525488.',
    'Ambele au fost câștigate de AUTHENTIC BLUE SRL. În SEAP există acordul-cadru nr. 90 din 30 aprilie 2026, de 14.619.654,72 lei, și contractul nr. 181 din 15 iulie 2026, de 14.783.123,50 lei. Împreună: 29.402.778,22 lei.'
  ],
  finding: {
    title: 'Cele două atribuiri pentru salvare și stingere incendii',
    sourceIds: ['cadru-90', 'contract-181'],
    explanation: 'Valori maxime înregistrate în SEAP, nu plăți. Dacă acordul nr. 90 a fost reziliat sau înlocuit, suma celor două supraestimează angajamentul real; SEAP nu arată o încetare.',
    after: 'Acordul de pază atribuit în iunie altei firme este context și nu intră în total.'
  },
  sections: [
    {
      id: 'doua-anunturi', title: 'Două anunțuri, același serviciu',
      paragraphs: [
        'Anunțul din aprilie stabilea un interval de 7.057.509,36–14.619.654,72 lei pentru 24 de luni. Cel din iunie: 7.105.187,76–14.783.123,50 lei, cu aceleași posturi. Ambele sunt proceduri pentru servicii sociale și alte servicii specifice (Anexa 2 a Legii 98/2016), cu norme proprii.',
        'Anunțul de atribuire pentru acordul din aprilie (CAN1171885) a apărut în SEAP la 23 iulie 2026, după semnarea contractului din iulie. Anunțul pentru acesta din urmă (CAN1173254) a apărut la 21 august. Datele SEAP din aplicație nu arată o încetare a acordului nr. 90.',
        'În 2025, pentru același serviciu, Aeroclubul anunțase un singur acord pe 12 luni, cu valoarea maximă de 6.551.492 lei. Plafonul anual al unui singur acord din 2026 (circa 7,3 milioane pe an) este apropiat de cel din 2025. Dacă ambele acorduri sunt active, plafonul anual se dublează la circa 14,7 milioane de lei.'
      ],
      sourceIds: ['anunt-aprilie', 'anunt-iunie', 'anunt-2025-incendii', 'pagina-achizitii', 'cadru-90', 'contract-181']
    },
    {
      id: 'firma', title: 'Firma câștigătoare',
      paragraphs: [
        'AUTHENTIC BLUE SRL (CUI 47385159, București) este înregistrată din 2022. În bilanțul pe 2025 depus la Ministerul Finanțelor declară codul CAEN 8425, activități de luptă împotriva incendiilor, nicio cifră de afaceri, niciun salariat și cheltuieli de 500 de lei.',
        'În august 2026, Cațavencii a scris despre acordul din aprilie: Authentic Blue a fost singurul ofertant, iar firma nu avusese activitate. Articolul nu menționează a doua atribuire, din iulie.',
        'O firmă nouă poate angaja personal după câștigarea contractului. Rămâne de aflat câți pompieri au fost angajați efectiv, când a obținut firma autorizațiile necesare și cum a fost evaluată capacitatea ei înainte de semnare.'
      ],
      sourceIds: ['registre-firme', 'catavencii']
    },
    {
      id: 'paza', title: 'Și paza a crescut, dar mai puțin',
      paragraphs: [
        'Tot în iunie, Aeroclubul a semnat cu TRIBORD SECURITY SRL acordul-cadru nr. 159 pentru pază și protecție: 24.225.190,60 lei pe 24 de luni. În 2025, plafonul pentru 12 luni fusese 10.160.808 lei. Pe an, creșterea este de aproximativ 19%. Tribord are activitate reală: 97 de salariați și 7,6 milioane de lei cifră de afaceri în 2025.',
        'Paza nu repetă tiparul pompierilor. O includem pentru a arăta dimensiunea serviciilor externalizate de instituție în același an.'
      ],
      sourceIds: ['cadru-paza-159', 'anunt-2025-paza']
    }
  ],
  timeline: [
    { id: 'an-2025', date: null, title: '2025: un singur acord pe 12 luni', text: 'Anunț pentru salvare și stingere incendii, maximum 6.551.492 lei; pentru pază, maximum 10.160.808 lei.', sourceIds: ['anunt-2025-incendii', 'anunt-2025-paza'] },
    { id: 'anunt-1', date: '2026-04-22', title: 'Primul anunț', text: '24 de luni, maximum 14.619.654,72 lei, ADV 1525488.', sourceIds: ['anunt-aprilie'] },
    { id: 'semnare-90', date: '2026-04-30', title: 'Acordul-cadru nr. 90', text: 'Authentic Blue câștigă, potrivit Cațavencii ca singur ofertant.', sourceIds: ['cadru-90'] },
    { id: 'anunt-2', date: '2026-06-19', title: 'Al doilea anunț, aceleași posturi', text: '24 de luni, maximum 14.783.123,50 lei, același ADV 1525488.', sourceIds: ['anunt-iunie'] },
    { id: 'paza-159', date: '2026-06-26', title: 'Acordul de pază nr. 159', text: 'Tribord Security, 24.225.190,60 lei pe 24 de luni.', sourceIds: ['cadru-paza-159'] },
    { id: 'semnare-181', date: '2026-07-15', title: 'Contractul nr. 181', text: 'Authentic Blue câștigă din nou, la plafonul maxim al celui de-al doilea anunț.', sourceIds: ['contract-181'] },
    { id: 'can-90', date: '2026-07-23', title: 'Abia acum apare în SEAP atribuirea din aprilie', text: 'Anunțul de atribuire CAN1171885, la aproape trei luni după semnare.', sourceIds: ['cadru-90'] },
    { id: 'presa', date: '2026-08-07', title: 'Cațavencii scrie despre primul acord', text: 'Articolul nu menționează a doua atribuire.', sourceIds: ['catavencii'] },
    { id: 'can-181', date: '2026-08-21', title: 'Anunțul de atribuire pentru contractul nr. 181', text: 'CAN1173254.', sourceIds: ['contract-181'] }
  ],
  questions: [
    'Aeroclubului României: ce s-a întâmplat cu acordul-cadru nr. 90? A fost reziliat, anulat sau este în vigoare în paralel cu contractul nr. 181?',
    'De ce a fost reluată procedura în iunie, cu același obiect și același număr de anunț? Câte oferte au fost depuse a doua oară?',
    'Ce contracte subsecvente s-au încheiat și ce plăți s-au făcut pe fiecare dintre cele două atribuiri?',
    'Câți pompieri a angajat Authentic Blue pentru aerodromuri și de când deține autorizațiile necesare?'
  ],
  reply: {
    title: 'Solicitările nu au fost trimise',
    text: 'Nu am contactat Aeroclubul României sau firmele. Întrebările sunt pregătite pentru o cerere în baza Legii 544/2001. Articolul este o previzualizare locală.',
    sourceIds: []
  },
  methodology: 'Documentare la 12 octombrie 2026, din baza de producție cinecastiga.ro, citită numai în regim read-only, și din anunțurile publicate pe site-ul Aeroclubului României. Datele de semnare provin din payloadul SEAP, în ora României. Valorile sunt maxime înregistrate, nu plăți. Cele două atribuiri sunt proceduri distincte în SEAP; aplicația le numără pe amândouă în totaluri, iar dacă prima a fost reziliată, acest lucru nu poate fi detectat din datele publicate. Datele firmelor provin din ONRC open data (8 iulie 2026) și din situațiile financiare MF. Persoanele fizice nu sunt numite intenționat. Nu formulăm o concluzie juridică.',
  corrections: [],
  sources: [
    { id: 'cadru-90', kind: 'procurement', observedAt: '2026-10-12', title: 'Servicii de salvare și stingere incendii — acordul-cadru nr. 90', record: { type: 'contract', id: '107798317', awardNoticeId: '100639377' }, date: '2026-04-30', amount: '14619654.72', currency: 'RON', authority: 'AEROCLUBUL ROMANIEI', suppliers: ['AUTHENTIC BLUE'], code: 'CAN1171885', cpv: '75251000-0', note: 'Instituție CUI 4266944; furnizor CUI 47385159. Norme proprii (Anexa 2). Anunț de atribuire publicat la 23 iulie 2026. Valoare maximă, nu plată.' },
    { id: 'contract-181', kind: 'procurement', observedAt: '2026-10-12', title: 'Servicii de salvare și stingere incendii — contractul nr. 181', record: { type: 'contract', id: '107891460', awardNoticeId: '100644936' }, date: '2026-07-15', amount: '14783123.50', currency: 'RON', authority: 'AEROCLUBUL ROMANIEI', suppliers: ['AUTHENTIC BLUE'], code: 'CAN1173254', cpv: '75251000-0', note: 'Instituție CUI 4266944; furnizor CUI 47385159. Norme proprii (Anexa 2). Anunț de atribuire publicat la 21 august 2026. Anunțul de participare din iunie descrie un interval minim–maxim; SEAP înregistrează documentul drept contract. Valoare maximă, nu plată.' },
    { id: 'cadru-paza-159', kind: 'procurement', observedAt: '2026-10-12', title: 'Servicii de pază și protecție — acordul-cadru nr. 159', record: { type: 'contract', id: '107797347', awardNoticeId: '100639307' }, date: '2026-06-26', amount: '24225190.60', currency: 'RON', authority: 'AEROCLUBUL ROMANIEI', suppliers: ['TRIBORD SECURITY S.R.L.'], code: 'CAN1170651', cpv: '79713000-5', note: 'Context, în afara totalului. Furnizor CUI 45394304. Norme proprii (Anexa 2). Plafon, nu plată.' },
    { id: 'pagina-achizitii', kind: 'external', observedAt: '2026-10-12', title: 'Proceduri de achiziții', url: 'https://aeroclubulromaniei.ro/page/proceduri-achizitii', publisher: 'Aeroclubul României', summary: 'Pagina cu anunțurile procedurilor desfășurate după norme proprii.' },
    { id: 'anunt-aprilie', kind: 'external', observedAt: '2026-10-12', title: 'Anunțul din 22 aprilie 2026 — salvare și stingere incendii', url: 'https://aeroclubulromaniei.ro/media/2026-04/anunt.pdf', publisher: 'Aeroclubul României', summary: '24 de luni; minimum 7.057.509,36 lei, maximum 14.619.654,72 lei; posturi 24/24: 7–13, 8/24: 7–24, 10/24: 7–24, 12/24: 1–2; ADV 1525488.' },
    { id: 'anunt-iunie', kind: 'external', observedAt: '2026-10-12', title: 'Anunțul din 19 iunie 2026 — salvare și stingere incendii', url: 'https://aeroclubulromaniei.ro/media/2026-06/anunt.pdf', publisher: 'Aeroclubul României', summary: 'Același obiect, aceleași posturi, 24 de luni; minimum 7.105.187,76 lei, maximum 14.783.123,50 lei; același ADV 1525488.' },
    { id: 'anunt-2025-incendii', kind: 'external', observedAt: '2026-10-12', title: 'Anunțul din 2025 — salvare și stingere incendii', url: 'https://aeroclubulromaniei.ro/media/2025-02/anunt_incendii.pdf', publisher: 'Aeroclubul României', summary: 'Un singur acord-cadru pe 12 luni, maximum 6.551.492 lei.' },
    { id: 'anunt-2025-paza', kind: 'external', observedAt: '2026-10-12', title: 'Anunțul din 2025 — pază', url: 'https://aeroclubulromaniei.ro/media/2025-02/anunt_paza.pdf', publisher: 'Aeroclubul României', summary: 'Pază pe 12 luni, maximum 10.160.808 lei.' },
    { id: 'catavencii', kind: 'external', observedAt: '2026-10-12', title: 'Aeroclubul României plătește milioane pe servicii de pază și ISU unei firme private', url: 'https://www.catavencii.ro/aeroclubul-romaniei-plateste-milioane-pe-servicii-de-paza-si-isu-unei-firme-private/', publisher: 'Cațavencii · 7 august 2026', summary: 'Documentare anterioară, creditată: Authentic Blue a fost singurul ofertant în aprilie; firma nu avusese activitate. Nu menționează a doua atribuire.' },
    { id: 'registre-firme', kind: 'note', observedAt: '2026-10-12', title: 'Firmele în ONRC și în bilanțurile MF', text: 'ONRC open data, 8 iulie 2026: AUTHENTIC BLUE SRL, CUI 47385159, J2022025228403, București Sectorul 4; TRIBORD SECURITY SRL, CUI 45394304, J2021022415407, București Sectorul 4. MF 2025: Authentic Blue — CAEN 8425, fără cifră de afaceri, fără salariați, cheltuieli 500 lei; Tribord — CAEN 8001, 97 de salariați, cifră de afaceri 7.593.279 lei.' }
  ]
};
