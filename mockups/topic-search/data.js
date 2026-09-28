// Fictional examples only. County names are geographic filters, not allegations.
export const contracts = [
  {id:'DEMO-001', title:'Amenajare locuri de joacă în cartierele Tei și Stadion', authority:'Primăria Valea Teiului', supplier:'Atelierul de Joacă Demo SRL', county:'Buzău', date:'2026-06-18', cents:124850000, type:'procedure', cpv:'37535200-9', category:'Echipament pentru terenuri de joacă'},
  {id:'DEMO-002', title:'Întreținere locuri de joacă și verificarea echipamentelor', authority:'Primăria Valea Teiului', supplier:'Parc Service Demo SRL', county:'Buzău', date:'2026-04-09', cents:18640000, type:'direct', cpv:'50870000-4', category:'Servicii de reparare a echipamentului pentru terenuri de joacă'},
  {id:'DEMO-003', title:'Suprafețe de protecție pentru locuri de joacă', authority:'Primăria Lunca Mică', supplier:'Suprafețe Sigure Demo SRL', county:'Buzău', date:'2025-11-12', cents:27380000, type:'direct', cpv:'45432111-5', category:'Lucrări de instalare de îmbrăcăminți de pardosea flexibile'},
  {id:'DEMO-004', title:'Reparații la locuri de joacă din parcurile publice', authority:'Primăria Valea Teiului', supplier:'Parc Service Demo SRL', county:'Buzău', date:'2025-08-22', cents:9850000, type:'direct', cpv:'50870000-4', category:'Servicii de reparare a echipamentului pentru terenuri de joacă'},
  {id:'DEMO-005', title:'Modernizarea zonei de agrement de pe strada Livezii', authority:'Primăria Lunca Mică', supplier:'Grădini Deschise Demo SRL', county:'Buzău', date:'2026-02-16', cents:215000000, type:'procedure', cpv:'45112723-9', category:'Lucrări de arhitectură peisagistică a terenurilor de joacă'},
  {id:'DEMO-006', title:'Inspecție anuală pentru locuri de joacă', authority:'Primăria Lunca Mică', supplier:'Verificări Tehnice Demo SRL', county:'Buzău', date:'2024-09-10', cents:2460000, type:'direct', cpv:'71631000-0', category:'Servicii de inspecție tehnică'},
  {id:'DEMO-007', title:'Modernizarea sistemului de iluminat public', authority:'Primăria Valea Teiului', supplier:'Lumina Urbană Demo SRL', county:'Buzău', date:'2026-03-18', cents:314500000, type:'procedure', cpv:'45316110-9', category:'Instalare de echipament de iluminare stradală'},
  {id:'DEMO-008', title:'Întreținere spații verzi și plantări de arbori', authority:'Primăria Lunca Mică', supplier:'Grădini Deschise Demo SRL', county:'Buzău', date:'2025-03-24', cents:19850000, type:'direct', cpv:'77310000-6', category:'Amenajare și întreținere de spații verzi'},
  {id:'DEMO-009', title:'Amenajare locuri de joacă în parcul central', authority:'Primăria Dealul Nou', supplier:'Atelierul de Joacă Demo SRL', county:'Cluj', date:'2026-05-07', cents:97500000, type:'procedure', cpv:'37535200-9', category:'Echipament pentru terenuri de joacă'},
  {id:'DEMO-010', title:'Servicii de întreținere pentru iluminat public', authority:'Primăria Dealul Nou', supplier:'Lumina Urbană Demo SRL', county:'Cluj', date:'2025-06-12', cents:11750000, type:'direct', cpv:'50232100-1', category:'Servicii de întreținere a iluminatului public'},
  {id:'DEMO-011', title:'Echipamente pentru locuri de joacă în curtea școlii', authority:'Școala Gimnazială Teișor — demo', supplier:'Atelierul de Joacă Demo SRL', county:'Buzău', date:'2023-05-12', cents:7645000, type:'direct', cpv:'37535200-9', category:'Echipament pentru terenuri de joacă'},
  {id:'DEMO-012', title:'Reabilitare locuri de joacă și montaj de echipamente', authority:'Primăria Valea Teiului', supplier:'Parc Service Demo SRL', county:'Buzău', date:'2022-10-21', cents:15420000, type:'direct', cpv:'50870000-4', category:'Servicii de reparare a echipamentului pentru terenuri de joacă'},
];

// Real county/municipality labels from the existing INS catalogue; procurement
// associations and the other localities below are explicitly fictional fixtures.
export const locations = [
  {id:'all',name:'Toată țara',kind:'country'},
  {id:'county-buzau',name:'Buzău',kind:'county'},
  {id:'county-cluj',name:'Cluj',kind:'county'},
  {id:'city-buzau',name:'Buzău',kind:'municipality',county:'Buzău'},
  {id:'city-ramnicu',name:'Râmnicu Sărat',kind:'municipality',county:'Buzău'},
  {id:'city-cluj',name:'Cluj-Napoca',kind:'municipality',county:'Cluj'},
  {id:'town-valea',name:'Valea Teiului',kind:'town',county:'Buzău',demo:true},
  {id:'commune-lunca',name:'Lunca Mică',kind:'commune',county:'Buzău',demo:true},
  {id:'village-teisor',name:'Teișor',kind:'village',county:'Buzău',parent:'commune-lunca',parentName:'Lunca Mică',demo:true},
  {id:'village-lunca',name:'Lunca Mică',kind:'village',county:'Cluj',parentName:'Dealul Nou',demo:true},
];
const demoLocality = {
  'DEMO-001':'city-buzau','DEMO-002':'city-buzau','DEMO-003':'commune-lunca',
  'DEMO-004':'town-valea','DEMO-005':'commune-lunca','DEMO-006':'commune-lunca',
  'DEMO-007':'city-buzau','DEMO-008':'commune-lunca','DEMO-009':'city-cluj',
  'DEMO-010':'city-cluj','DEMO-011':'village-teisor','DEMO-012':'city-buzau',
};
for (const contract of contracts) contract.locality=demoLocality[contract.id];

export const documents = [
  {id:'cs-amenajare', contract:'DEMO-001', title:'Caiet de sarcini — amenajare și echipamente', filename:'caiet-de-sarcini-demo.pdf', state:'ready', method:'Text extras din PDF', pages:[
    {title:'Obiectul achiziției', paragraphs:[
      'Prezentul caiet de sarcini descrie amenajarea a două locuri de joacă în cartierele Tei și Stadion. Documentul este un exemplu fictiv, creat exclusiv pentru prezentarea interfeței.',
      'Lucrările includ pregătirea terenului, montarea echipamentelor și amenajarea căilor de acces. Amplasamentele și cantitățile se verifică înainte de formularea ofertei.',
      'Valoarea contractului din exemplu este de 1.248.500,00 lei. Această valoare nu reprezintă dovada unei plăți sau a executării lucrărilor.'
    ]},
    {title:'Accesibilitate și siguranță', paragraphs:[
      'Pentru fiecare dintre cele două locuri de joacă se va asigura cel puțin un echipament accesibil copiilor cu mobilitate redusă. Traseul de acces va fi continuu, fără trepte.',
      'Ofertantul va descrie suprafața de protecție propusă, grosimea acesteia și modul de întreținere. Caracteristicile trebuie să corespundă echipamentelor efectiv instalate.',
      'La recepție se vor prezenta documentele de conformitate și instrucțiunile de utilizare. Existența acestei cerințe în caietul de sarcini nu dovedește îndeplinirea ei.'
    ]},
    {title:'Termene și garanții', paragraphs:[
      'Durata prevăzută pentru amenajare este de 90 de zile de la ordinul de începere. Termenul este ilustrativ și nu descrie un proiect real.',
      'Garanția echipamentelor va fi de minimum 36 de luni. Oferta va preciza intervalele recomandate pentru inspecție și întreținere.',
      'Orice modificare a soluției tehnice va fi documentată și aprobată înainte de executare.'
    ]}
  ]},
  {id:'clarificare', contract:'DEMO-001', title:'Clarificare — acces și suprafețe de protecție', filename:'clarificare-demo.pdf', state:'ready', method:'OCR demonstrativ · de verificat în original', pages:[
    {title:'Răspuns la solicitarea de clarificări', paragraphs:[
      'Întrebare: este necesară o suprafață continuă pe întreaga arie a celor două locuri de joacă sau numai în zonele de impact?',
      'Răspuns: suprafețele se dimensionează în funcție de echipamente și zonele de impact. Traseele accesibile trebuie păstrate continue.',
      'Exemplu fictiv. Într-o investigație reală, acest răspuns trebuie confruntat cu planșele și versiunea finală a documentației.'
    ]}
  ]},
  {id:'cs-intretinere', contract:'DEMO-002', title:'Caiet de sarcini — inspecție și întreținere', filename:'intretinere-demo.pdf', state:'ready', method:'Text extras din PDF', pages:[
    {title:'Activități și frecvență', paragraphs:[
      'Serviciile pentru locuri de joacă includ inspecții vizuale săptămânale, verificări funcționale lunare și consemnarea intervențiilor într-un registru.',
      'Prestatorul va transmite lunar situația echipamentelor verificate și fotografii ale defecțiunilor identificate.',
      'Acesta este un document demonstrativ. Registrul de intervenții și rapoartele lunare ar fi documente distincte de cerut pentru verificarea prestării.'
    ]}
  ]},
  {id:'cs-suprafete', contract:'DEMO-003', title:'Specificații — suprafețe de protecție', filename:'suprafete-demo.pdf', state:'not-downloaded', pages:[]},
  {id:'cs-agrement', contract:'DEMO-005', title:'Memoriu tehnic — zona de agrement', filename:'memoriu-tehnic-demo.pdf', state:'ready', method:'Text extras din PDF', pages:[
    {title:'Amenajarea propusă', paragraphs:[
      'Zona de agrement va cuprinde alei pietonale, locuri de joacă pentru două grupe de vârstă și o zonă de odihnă. Accesul se realizează de pe strada Livezii.',
      'Pentru spații verzi se prevăd lucrări de pregătire a solului și plantări. Sistemul de iluminat public este descris într-un capitol separat.',
      'Acest document fictiv demonstrează un rezultat găsit în conținutul unui fișier, deși subiectul căutat nu apare în titlul achiziției.'
    ]}
  ]},
  {id:'raport-inspectie', contract:'DEMO-006', title:'Raport de inspecție anuală', filename:'inspectie-demo.pdf', state:'no-text', pages:[]},
  {id:'cs-iluminat', contract:'DEMO-007', title:'Caiet de sarcini — iluminat public', filename:'iluminat-demo.pdf', state:'not-downloaded', pages:[]},
  {id:'cs-verde', contract:'DEMO-008', title:'Specificații pentru întreținerea zonelor plantate', filename:'spatii-verzi-demo.pdf', state:'ready', method:'Text extras din PDF', pages:[
    {title:'Lucrări sezoniere', paragraphs:[
      'Serviciile pentru spații verzi includ cosirea, irigarea și colectarea resturilor vegetale. Programul se adaptează condițiilor meteorologice.',
      'Exemplu fictiv. Cantitățile efectiv executate se verifică în situațiile de lucrări și în procesele-verbale de recepție.'
    ]}
  ]},
  {id:'cs-parc', contract:'DEMO-009', title:'Caiet de sarcini — parcul central', filename:'parc-central-demo.pdf', state:'ready', method:'Text extras din PDF', pages:[
    {title:'Echipamente și acces', paragraphs:[
      'Amenajarea de locuri de joacă include echipamente adaptate mai multor grupe de vârstă și un traseu accesibil.',
      'Exemplul fictiv este situat în județul Cluj pentru a demonstra păstrarea filtrului geografic în toate tipurile de rezultate.'
    ]}
  ]},
];
