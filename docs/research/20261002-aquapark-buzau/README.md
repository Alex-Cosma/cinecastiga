# Aquapark Buzău — documentare și continuare, 2 octombrie 2026

Previzualizare locală: <http://localhost:3000/ce-bate-la-ochi/poveste/aquapark-buzau-banii-si-vara-ratata>. Articolul anterior despre Școala 311 rămâne. Nicio publicare în producție, commit/push sau contactare a părților.

## Întrebarea editorială

Pornim din achizițiile cele mai recente, apoi verificăm oamenii, proprietatea, deciziile, documentele de control și explicațiile alternative. Nu căutăm o acuzație care să confirme o sumă mare. În acest caz: cum se împacă ținta publică din iunie 2026 cu achiziția utilităților exterioare în septembrie și ce s-a întâmplat cu plata constatată de auditori?

Nu prezentăm drept exclusivitate neregulile deja relatate de presa locală. Contribuția este coroborarea achiziției recente cu auditul integral, cronologia schimbării proprietății și limitele documentare. Nu este investigație încheiată: lipsesc răspunsurile, actele semnate și verificarea recuperării.

## Selecție și dovezi

Date: copia locală a producției din 2 octombrie, checkpoint 12. Citiri numai din tabele publice, cu PGOPTIONS read-only. Recuperarea august–septembrie este incompletă. **Zero cereri către SEAP**, zero operațiuni pe producție și zero scrieri în DB.

- [export.sql](export.sql) → [seap-records.json](seap-records.json): achiziția acceptată SICAP 122972715 și contractul SICAP 106187822. JSON cu zecimale ca șiruri, date, identități, proveniență.
- [verify-company-sources.py](verify-company-sources.py) → [company-evidence.json](company-evidence.json): citire din cache-ul primar ONRC, numai CUI, firmă, administrator, rol și linia sursei; fără date de naștere/adrese personale.
- [external-evidence.json](external-evidence.json): fișierele externe efectiv păstrate și hash-uri. PDF-urile mari și OCR-ul sunt în directorul ignorat Git `infra/data/research/20261002-aquapark-buzau/`, nu în repository.
- [SHA256SUMS](SHA256SUMS): verifică exporturile documentării, nu autenticitatea originalelor.

| Afirmație | Dovadă / limită |
| --- | --- |
| DA41151373, 882.174,93 lei, acceptată 11 septembrie 2026 | Payload de listă: 10 septembrie 09:53:33 publicare, 11 septembrie 08:04:34 finalizare, ora României. CUI primărie 4233874, WMC 36486492. Nu factură/plată/deviz. Colectat 26 septembrie 2026, 20:01:14 UTC. |
| 102 zile față de 1 iunie | Diferență de zile calendaristice. Nu întârziere contractuală constatată. |
| Contract nr. 196764 din 5 noiembrie 2024, Aqua Azur CUI 24031012 | Core stochează 47.907.266 lei; payloadul istoric lipsește. Anunț CAN1136768 / ca_notice_id 100539297. Data anunțului din 2025 nu este data semnării. |
| Concordanță a valorii corectate | Oferta din audit 48.142.422 − valoarea core 47.907.266 = 235.156 lei; × 1,19 = 279.835,64 lei, reducerea din audit p. 7. Calcul verificat cu zecimale exacte. Nu avem actul adițional original; prezentat numai ca o concordanță în fișa sursei. |
| Condiții schimbate și finanțarea echipamentelor | Raportul de conformitate 16122/25.02.2026, p. 9–10: clauze 46.1 și 50.2, factura 5934/18.12.2024 de 6.676.941,17 lei cu TVA, credit și dobândă 138.707,89 lei până la 24.03.2025. Nu calificăm suma ca prejudiciu definitiv. |
| Remediere | Același raport p. 10: act 10.09.2025, storno 6637/16.09.2025 de 6.355.760,18 lei, convenție de rambursare. Nu dovedește încasarea efectivă. Raportul scrie 50.3 la corecție, deși scrie 50.2 la constatare; nu corectăm tacit această inconsecvență și nu alegem un număr în articol pentru clauza remediată. |
| Primarul susține că s-au recuperat sumele | Șansa News, 23 aprilie 2026, redă declarația. Este ulterioară auditului. Nu o tratăm ca răspuns obținut de noi și nu o omitem. |
| TeraPlast preia controlul ulterior facturii | Comunicat finalizare 23 aprilie 2025; raport anual 2025, pagina PDF 3: TeraPlast 51% Aquatica Experience, aceasta 100% Aqua Azur. Nu transferăm noului acționar răspunderea pentru deciziile din 2024. |
| Cine conduce firmele | ONRC 8 iulie 2026: Marișcu Daniela-Adriana și Szekely-Kiraly-Pop Aurelia-Alina la Aqua Azur; Ioițescu Alberta la WMC. Setul nu oferă proprietatea sau istoricul mandatelor. |

**Important:** PDF-ul `Audit-Primarie.pdf` găzduit de Opinia este o compilație de 49 pagini. Primele pagini sunt raportul de **conformitate 16122/25.02.2026**; raportul financiar **18279/04.03.2026** este ulterior. Rezultatele motorului de căutare le pot amesteca. Am verificat numărul din prima pagină prin OCR și paginile 9–10 vizual; pagina oficială de catalog pentru 16122 confirmă existența lui. Accesul automat la Curte a răspuns 403; nu avem hash-ul originalului oficial pentru a certifica identitatea copiilor. Această limită este în articol.

OCR local cu PDFKit/Vision (fără upload către servicii externe). Paginile 9–10 verificate și ca imagini. Pentru proprietate am citit organigrama PDF-ului bursier, nu am dedus lanțul dintr-o tabelă de participații consolidate.

## Limite și piste respinse

Nu dovedim o relație personală/de afaceri Toma–Marișcu sau cu WMC, o plată dublă, o răspundere penală individuală, lipsa fizică a apei în septembrie ori că racordurile sunt cauza unică a amânării. Data unei oferte acceptate nu este data începerii sau recepției lucrării. Nici plata pentru echipamente nu dovedește lucrări fictive.

Nu preluăm drept fapt afirmația din surse anonime despre înlocuirea Danielei Marișcu ca manager; funcția de manager de proiect diferă de administrator. Nu atribuim stadiu penal actual pe baza relatărilor din aprilie. Nu numim lipsa răspunsurilor „refuz”, fiindcă nu am trimis întrebările.

Nu repetăm interpretarea dintr-un articol potrivit căreia publicarea ulterioară a anunțului de atribuire ar dovedi semnarea înaintea licitației. Nici auditul citit nu susține această interpretare: el descrie schimbarea clauzelor după selecție. Evităm totalul artificial contract + factură + credit + dobândă.

Pistele inițiale Creative People/GAL, MGM/Moara, Tecuci/Atria și contractele mari recente au fost verificate exploratoriu. Pentru Creative People nu am găsit suprapunerea necesară între cele șase UAT membre GAL și contractele analizate; nu am construit o acuzație pe simpla cumulare a rolurilor. Nu prezentăm mai multe proiecte distincte drept fracționare.

## Ce urmează

[Solicitările pregătite, netrimise](solicitari.md). Prioritate: documentele recuperării, model/contract/acte adiționale și grafic integrat construcție–racorduri. Verificare editorială și răspunsurile părților înaintea unei decizii de publicare. Nu este necesară schimbarea mecanismului de publicare: preview numai development, catalogul publicat rămâne gol.
