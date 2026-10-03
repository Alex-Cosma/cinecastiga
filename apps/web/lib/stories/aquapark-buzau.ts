import type { Story } from './types';

/** Local reporting preview. Reproducible evidence: docs/research/20261002-aquapark-buzau/. */
export const aquaparkBuzauStory: Story = {
  slug: 'aquapark-buzau-banii-si-vara-ratata',
  status: 'preview',
  title: 'Aquapark-ul din Buzău: banii înaintea lucrărilor, racordurile după vară',
  summary: 'În martie, Constantin Toma anunța finalizarea până la 1 iunie. În septembrie, primăria cumpăra lucrări exterioare de apă și canalizare. Între aceste două momente stau un contract verificat de Curtea de Conturi și o recuperare de bani care trebuie urmărită până la capăt.',
  counties: ['buzau'],
  topic: 'Investiții și agrement',
  illustration: 'network',
  author: 'cinecâștigă · documentare din date publice',
  publishedAt: '2026-10-02',
  minutes: 7,
  period: 'Noiembrie 2024 – septembrie 2026',
  intro: [
    'La 11 septembrie 2026, Primăria Buzău a acceptat o ofertă de 882.174,93 lei pentru utilitățile exterioare de apă și canalizare ale aquapark-ului. Furnizorul este WMC Best Divers Construct. Titlul achiziției identifică explicit obiectivul; data și suma se găsesc în înregistrarea SEAP DA41151373.',
    'Achiziția vine la 102 zile după 1 iunie, termenul de finalizare avansat public în primăvară. Ceea ce se poate verifica este decalajul dintre anunț și cumpărarea acestor lucrări. Pentru a stabili cât au întârziat ele deschiderea, trebuie văzute proiectul tehnic și graficul de execuție.'
  ],
  finding: {
    title: 'Achiziția din septembrie 2026',
    sourceIds: ['da41151373'],
    explanation: 'Valoarea ofertei acceptate pentru apă și canalizare. Nu este o plată verificată și nici costul întregului aquapark.',
    after: 'Contractul principal, cu Aqua Azur, este în dosar separat. Nu adunăm valoarea lui cu facturile, dobânzile sau creditele: sunt categorii diferite, care se pot suprapune.'
  },
  sections: [
    {
      id: 'calendarul-public', title: 'De la 1 iunie la anul următor',
      paragraphs: [
        'În reportajul Observator din 12 martie 2026, primarul Constantin Toma prezenta investiția drept realizată în proporție de 75% și spunea că speră să o finalizeze până la 1 iunie. Era un angajament public despre stadiul lucrărilor, nu dovada termenului din contract.',
        'La 5 iunie, Campus TV relata că accesul rutier și utilitățile nu erau rezolvate: strada Dr. Dorin Pavel se afla încă în proiectare, iar Aleea Parcul Tineretului nu avea proiectul definitivat și autorizația de construire. La 28 august, Șansa News consemna amânarea folosirii aquapark-ului pentru 2027. Toma invoca ploaia și probleme de organizare; spera la recepția tehnică până la sfârșitul lui 2026.',
        'Înregistrarea din septembrie adaugă un reper precis acestui calendar relatat de presa locală. Nu dovedește că WMC a provocat întârzierea: firma apare ca furnizor al lucrărilor cumpărate ulterior.'
      ],
      sourceIds: ['observator-martie', 'campus-iunie', 'sansa-august', 'da41151373']
    },
    {
      id: 'plata', title: 'Ce s-a schimbat între licitație și semnătură',
      paragraphs: [
        'Raportul de conformitate nr. 16122/25.02.2026 al Camerei de Conturi Buzău documentează modificarea condițiilor de plată față de modelul oferit la licitație. Clauzele 46.1 și 50.2 au permis avansuri și plata echipamentelor neîncorporate în lucrări. Auditorii constată un avantaj financiar pentru câștigător, care putea atrage și alți ofertanți dacă era anunțat de la început.',
        'Factura din 18 decembrie 2024 era de 6.676.941,17 lei, cu TVA. Echipamentele rămâneau în custodia constructorului. Plata a fost finanțată din credit; până la 24 martie 2025, dobânzile ajunseseră la 138.707,89 lei. Acestea sunt constatări ale auditului, nu estimări produse de aplicație.',
        'Documentul consemnează și remedierea: clauze corectate, o factură storno de 6.355.760,18 lei în septembrie 2025 și o convenție de rambursare a echipamentelor și dobânzilor. Stornarea și promisiunea de restituire nu arată, singure, câți bani au reintrat efectiv în buget. Nu prezentăm factura întreagă drept prejudiciu definitiv.'
      ],
      sourceIds: ['audit-conformitate', 'audit-oficial']
    },
    {
      id: 'oamenii', title: 'Toma, Marișcu și schimbarea proprietarului',
      paragraphs: [
        'La semnarea din 5 noiembrie 2024, Constantin Toma reprezenta municipalitatea, iar Daniela Marișcu era prezentată drept reprezentanta Aqua Azur, din grupul Aquatica Experience. Evenimentul a fost documentat atunci de Opinia Buzău. Aceasta este legătura lor concretă cu proiectul. Nu am identificat o relație personală sau un interes economic comun care să explice atribuirea.',
        'Proprietatea trebuie citită cu data lângă ea. TeraPlast a anunțat încheierea achiziției a 51% din Aquatica Experience Group la 23 aprilie 2025 și numirea lui Ovidiu Gurău drept coadministrator al grupului preluat. Organigrama din raportul anual pentru 2025 arată lanțul: TeraPlast — 51% din Aquatica Experience — 100% din Aqua Azur. Vorbim despre control indirect, nu despre o participație personală a primarului.',
        'În fișierul ONRC din 8 iulie 2026, administratorii Aqua Azur sunt Daniela-Adriana Marișcu și Aurelia-Alina Szekely-Kiraly-Pop. Pentru WMC Best Divers Construct apare Alberta Ioițescu. Setul identifică reprezentanți legali la acea dată, nu proprietarii și nici persoana care a semnat fiecare act.',
        'Cronologia contează: preluarea de către TeraPlast este ulterioară contractului și facturii din 2024. Nu îi atribuim noului acționar deciziile anterioare. În schimb, documentele de după preluare și stadiul actual al proiectului trebuie clarificate și cu conducerea de atunci și cu cea actuală.'
      ],
      sourceIds: ['semnare-2024', 'preluare-2025', 'structura-grupului', 'onrc-2026']
    },
    {
      id: 'doua-firme', title: 'Constructorul parcului și firma racordurilor',
      paragraphs: [
        'Aqua Azur, CUI 24031012, este câștigătorul contractului nr. 196764 pentru proiectare, execuție și asistență tehnică. În copia SEAP disponibilă, acesta figurează la 47.907.266 lei. WMC, CUI 36486492, este o altă societate, aleasă pentru utilitățile exterioare în septembrie 2026. Cele două înregistrări au fișe separate, cu link către aplicație și SEAP.',
        'Nu avem devizele care să delimiteze racordurile față de lucrările din contractul principal. Prin urmare, achiziția separată nu demonstrează o plată dublă. Întrebarea precisă pentru primărie este când a fost stabilită această delimitare și cum fusese prevăzută funcționarea aquapark-ului la termenul anunțat.',
        'Arhiva brută a contractului din 2024 lipsește din copia locală; păstrăm această limită în fișa sursei. Data anunțului de atribuire din baza noastră, 2 aprilie 2025, nu trebuie confundată cu data semnării. Nu folosim această diferență pentru a susține că s-a semnat înainte să existe un câștigător.'
      ],
      sourceIds: ['contract-principal', 'da41151373']
    },
    {
      id: 'recuperarea', title: 'Cât din bani s-a întors?',
      paragraphs: [
        'Presa locală a documentat neregulile înaintea acestei analize. Șansa News publica la 23 aprilie 2026 și poziția lui Toma: primarul susținea că avansul și dobânzile fuseseră recuperate și descria situația drept o eroare umană. Această afirmație trebuie verificată prin documentele încasărilor și prin controlul de urmărire, nu ignorată.',
        'Aceeași publicație relata atunci o cercetare penală privind faptele. Nu avem confirmarea stadiului ei la 2 octombrie și nu atribuim vreunei persoane calitatea de suspect, inculpat sau vinovat.',
        'Contribuția acestei documentări este punerea împreună a achiziției recente, calendarului public, raportului de control și structurii firmei. Rămân două verificări decisive: recuperarea efectivă a sumelor și cine a coordonat calendarul construcției cu cel al racordării.'
      ],
      sourceIds: ['sansa-aprilie', 'da41151373']
    }
  ],
  timeline: [
    {id:'semnare',date:'2024-11-05',title:'Contractul principal',text:'Municipalitatea și Aqua Azur semnează contractul nr. 196764. Relatarea de la semnare îi identifică pe Constantin Toma și Daniela Marișcu.',sourceIds:['contract-principal','semnare-2024']},
    {id:'factura',date:'2024-12-18',title:'Factura pentru echipamente',text:'Momentul facturării analizat ulterior de Camera de Conturi.',sourceIds:['audit-conformitate']},
    {id:'preluare',date:'2025-04-23',title:'TeraPlast încheie preluarea',text:'Compania anunță achiziția participației de control în Aquatica Experience Group.',sourceIds:['preluare-2025']},
    {id:'audit',date:'2026-02-25',title:'Constatări și măsuri de remediere',text:'Raportul de conformitate cuprinde atât abaterile, cât și corecțiile întreprinse în timpul verificării.',sourceIds:['audit-conformitate']},
    {id:'promisiune',date:'2026-03-12',title:'Ținta publică: 1 iunie',text:'Observator relatează anunțul primarului privind stadiul de 75% și termenul sperat pentru finalizare.',sourceIds:['observator-martie']},
    {id:'recuperare',date:'2026-04-23',title:'Primarul susține că banii au fost recuperați',text:'Poziție publicată de Șansa News; nu este un răspuns dat acestei documentări.',sourceIds:['sansa-aprilie']},
    {id:'amanare',date:'2026-08-28',title:'Folosirea parcului, amânată pentru 2027',text:'Șansa News consemnează noul calendar și explicațiile privind vremea și organizarea șantierului.',sourceIds:['sansa-august']},
    {id:'racorduri',date:'2026-09-11',title:'Primăria acceptă oferta pentru apă și canalizare',text:'WMC Best Divers Construct, achiziția directă DA41151373. Este cel mai recent reper SEAP din această selecție.',sourceIds:['da41151373']}
  ],
  questions: [
    'Primăriei: cine a propus, avizat și aprobat schimbarea condițiilor de plată? Solicităm modelul din licitație, contractul semnat și actele adiționale, cu funcțiile semnatarilor.',
    'Primăriei și Aqua Azur: ce sume au fost efectiv restituite, la ce date și prin ce documente? Ce arată verificarea ulterioară a Curții de Conturi?',
    'Primăriei și ambilor constructori: care este delimitarea lucrărilor, când trebuiau realizate racordurile și ce prevedea graficul în momentul anunțului pentru 1 iunie?',
    'Primăriei și Aqua Azur/Aquatica Experience: care sunt termenul contractual actual, prelungirile aprobate, eventualele penalități și condițiile rămase pentru deschidere?'
  ],
  reply: {
    title:'Poziții publice existente; solicitările noastre nu au fost trimise',
    text:'Am inclus explicațiile lui Constantin Toma relatate în aprilie și august 2026. Nu sunt interviuri realizate de noi. Nu am contactat primăria, firmele sau Curtea de Conturi; întrebările sunt pregătite în dosarul de documentare. Articolul rămâne o previzualizare locală.',
    sourceIds:['sansa-aprilie','sansa-august']
  },
  methodology:'Documentare la 2 octombrie 2026, pornită din copia locală a producției, checkpoint 12. Export read-only din tabelele publice; zero cereri către SEAP. Selecția include o achiziție directă acceptată și un contract de context, nu toate costurile investiției. Arhiva recentă este parțială. Sumele SEAP nu sunt plăți; plata și dobânda descrise în articol provin din audit. PDF-ul de pe site-ul Opinia Buzău este o compilație: folosim raportul de conformitate nr. 16122/25.02.2026, paginile 7–10, nu raportul financiar nr. 18279 aflat ulterior în același fișier. Pagina de catalog a Curții confirmă existența raportului; fișierul de pe domeniul instituției nu a putut fi preluat pentru compararea copiilor. OCR-ul paginilor 9–10 a fost verificat vizual. Proprietatea provine din raportări TeraPlast, reprezentanții din fișierele ONRC originale. Relatările de presă sunt atribuite; nu am observat șantierul și nu certificăm un stadiu fizic actual. Lipsesc răspunsurile părților, contractul semnat și documentele recuperării. Nu formulăm o concluzie penală.',
  corrections: [],
  sources: [
    {
      id:'da41151373',kind:'procurement',observedAt:'2026-10-02',
      title:'Utilitati exterioare de alimentare cu apa si canalizare pentru CENTRU DE RECREERE AQUA PARK OUTDOOR',
      record:{type:'direct',id:'122972715'},date:'2026-09-11',amount:'882174.93',currency:'RON',
      authority:'MUNICIPIUL BUZAU',suppliers:['WMC BEST DIVERS CONSTRUCT SRL'],code:'DA41151373',cpv:'45232150-8',
      publishedAt:'2026-09-10T09:53:33+03:00',finalizedAt:'2026-09-11T08:04:34+03:00',
      note:'Ofertă acceptată. Instituție CUI 4233874; furnizor CUI 36486492. Payload SEAP de listă, colectat la 26 septembrie 2026. Valoare de închidere, nu dovada plății. Fișa nu conține devizul sau termenul de execuție.'
    },
    {
      id:'contract-principal',kind:'procurement',observedAt:'2026-10-02',
      title:',,Proiect tehnic, execuție lucrări și asistență tehnică din partea proiectantului pentru obiectivul de investiții – Centru de recreere Aqua Park – Etapa 1 - Outdoor”.',
      record:{type:'contract',id:'106187822',awardNoticeId:'100539297'},date:'2024-11-05',amount:'47907266',currency:'RON',
      authority:'MUNICIPIUL BUZAU',suppliers:['AQUA AZUR SRL'],code:'196764',
      note:'Contract de context, exclus din total. CUI furnizor 24031012; anunț CAN1136768. Înregistrare normalizată; payloadurile contractului și anunțului lipsesc din copia locală. Valoarea stocată nu este valoarea inițială din audit și nu certifică valoarea actualizată la zi. Diferența față de oferta de 48.142.422 lei din audit este 235.156 lei; la TVA 19%, aceasta corespunde aritmetic reducerii de 279.835,64 lei descrise la p. 7. Este o concordanță, nu verificarea actului adițional original. Data publicării anunțului, 2 aprilie 2025, este distinctă de semnarea din 5 noiembrie 2024.'
    },
    {id:'audit-conformitate',kind:'external',observedAt:'2026-10-02',title:'Raportul de conformitate · paginile 7–10',url:'https://opiniabuzau.ro/wp-content/uploads/2026/03/Audit-Primarie.pdf#page=9',publisher:'Camera de Conturi Buzău · copie publicată de Opinia Buzău',summary:'Raport nr. 16122/25.02.2026, prima parte a compilației. Modificarea clauzelor, plata, dobânzile și măsurile de remediere sunt la punctele 5.1–5.3. Fișier preluat integral; paginile-cheie citite și verificate vizual. Nu avem comparația cu fișierul de pe domeniul Curții.'},
    {id:'audit-oficial',kind:'external',observedAt:'2026-10-02',title:'Înregistrarea raportului pe site-ul Curții de Conturi',url:'https://www.curteadeconturi.ro/rapoarte-audit/raport-audit-de-conformitate-nr-16122-25-02-2026-uatm-buzau/',publisher:'Curtea de Conturi a României',summary:'Catalogul identifică raportul de conformitate nr. 16122/25.02.2026 pentru UATM Buzău. Accesul direct automat a fost blocat; textul a fost citit din copia publicată de Opinia.'},
    {id:'observator-martie',kind:'external',observedAt:'2026-10-02',title:'Anunțul privind 1 iunie · 12 martie 2026',url:'https://observatornews.ro/eveniment/orasul-din-romania-care-va-avea-un-aquapark-de-10-milioane-cu-bazin-cu-apa-sarata-de-la-sarata-monteoru-648448.html',publisher:'Observator',summary:'Reportajul redă declarația lui Constantin Toma: 75% realizare și speranța finalizării până la 1 iunie. Nu înlocuiește graficul contractual.'},
    {id:'campus-iunie',kind:'external',observedAt:'2026-10-02',title:'Accesul rutier și utilitățile · 5 iunie 2026',url:'https://www.campusbuzau.ro/al-doilea-pronostic-cand-se-va-deschide-aquapark-ul/',publisher:'Campus TV · Corneliu Floriceanu',summary:'Relatare despre stadiul proiectării străzilor de acces și necesitatea realizării aducțiunii și canalizării. Nu este o constatare tehnică a autorului acestui articol.'},
    {id:'sansa-august',kind:'external',observedAt:'2026-10-02',title:'Amânarea și explicațiile primarului · 28 august 2026',url:'https://sansanews.ro/aquapark-ul-o-noua-amanare-printre-cauze-si-ritmul-lent-de-lucru-ce-masuri-s-au-luat-pe-santier/',publisher:'Șansa News · Marilena Dinu',summary:'Relatare despre utilizarea amânată pentru 2027 și declarațiile lui Toma privind vremea, organizarea și întâlnirea cu conducerea TeraPlast. Nu preluăm drept fapt informația din surse anonime despre schimbarea managerului.'},
    {id:'semnare-2024',kind:'external',observedAt:'2026-10-02',title:'Constantin Toma și Daniela Marișcu la semnarea contractului',url:'https://opiniabuzau.ro/foto-video-aqua-park-ul-de-la-buzau-singurul-din-tara-cu-amprenta-de-carbon-zero/',publisher:'Opinia Buzău · Valentina Bucur · 6 noiembrie 2024',summary:'Relatare de la semnarea din 5 noiembrie, cu fotografii și video. Identifică municipalitatea, Aqua Azur și reprezentanții de la eveniment. Nu identifică toate persoanele care au avizat plata.'},
    {id:'preluare-2025',kind:'external',observedAt:'2026-10-02',title:'TeraPlast: preluarea a fost încheiată la 23 aprilie 2025',url:'https://investors.teraplast.ro/wp-content/uploads/2025/04/Closing-of-the-acquisition-of-Aquatica-Experience-Group-AEG.pdf',publisher:'TeraPlast · raportare către investitori',summary:'Confirmă achiziția a 51% din Aquatica Experience Group și numirea lui Ovidiu Gurău drept coadministrator. Anunțul de finalizare este distinct de intenția anunțată în februarie.'},
    {id:'structura-grupului',kind:'external',observedAt:'2026-10-02',title:'Lanțul de proprietate · raportul anual TeraPlast 2025',url:'https://bvb.ro/infocont/infocont26/TRP_20260327164913_RO-Raport-Anual-2025-TRP.pdf#page=3',publisher:'TeraPlast · raport publicat la Bursa de Valori București',summary:'Organigrama de la pagina PDF 3, pagina tipărită 2: TeraPlast deține 51% din Aquatica Experience, care deține 100% din Aqua Azur. Situație raportată pentru 2025, nu extras ONRC curent.'},
    {id:'onrc-2026',kind:'external',observedAt:'2026-10-02',title:'Administratorii Aqua Azur și WMC · ONRC, 8 iulie 2026',url:'https://data.gov.ro/dataset/firme-08-07-2026',publisher:'Oficiul Național al Registrului Comerțului',summary:'Fișierele originale OD_FIRME și OD_REPREZENTANTI_LEGALI, legate prin numărul de înregistrare. CUI 24031012 și 36486492. Arată roluri de administrare, nu cotele de proprietate sau autorii actelor achiziției.'},
    {id:'sansa-aprilie',kind:'external',observedAt:'2026-10-02',title:'Relatarea din aprilie și poziția lui Constantin Toma',url:'https://sansanews.ro/https-sansanews-ro-exclusiv-avem-confirmarea-parchetul-ancheteaza-erorile-umane-din-primaria-buzau-curtea-de-conturi-a-sesizat-organele-penale-pentru-harababura-de-la-aquapark/',publisher:'Șansa News · Cătălina Jingoiu · 23 aprilie 2026',summary:'Documentare jurnalistică anterioară, creditată explicit. Redă afirmația primarului privind recuperarea sumelor și relatează o cercetare a faptelor. Nu avem o confirmare independentă a stadiului penal actual sau extrasele recuperării.'}
  ]
};
