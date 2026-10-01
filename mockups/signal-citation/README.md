# Mockup — referință publică pentru citare

Prototip interactiv separat de aplicație,1octombrie2026. Direcția este acceptată; implementarea reală așteaptă feedbackul asupra mockupului. Nicio schimbare în API, DB, migrări sau producție. Nicio cerere SEAP.

## Deschidere

Serverul static existent servește directorul `mockups` pe4185:

- [Semnalul](http://127.0.0.1:4185/signal-citation/)
- [Referința păstrată](http://127.0.0.1:4185/signal-citation/#referinta)
- [Situația actualizată](http://127.0.0.1:4185/signal-citation/#actual)

Dacă serverul nu rulează, din rădăcina repo:

```sh
python3 -m http.server 4185 --bind 127.0.0.1 --directory mockups
```

Nu porni încă un server dacă portul este deja ocupat. Navigarea principală trimite către aplicația locală3000; fluxul citării rămâne în prototip.

## Parcurs

1. Pe semnal, apasă „Păstrează pentru citare”. Confirmarea spune explicit că referința este publică și nu include numele creatorului sau anchetele private.
2. „Creează referința” simulează salvarea, cu indicator de încărcare. Pagina rezultată păstrează data,12 achiziții și480.000,00lei.
3. „Copiază citarea” copiază un text marcat EXEMPLU FICTIV și URL-ul local. „Descarcă sursele” produce CSV-ul celor12 rânduri, indiferent de pagina tabelului.
4. „Vezi situația actuală” arată14 achiziții /520.000,00lei. Revenirea păstrează cifrele citate inițial.
5. Tabelul are10 rânduri/pagină; click pe titlu dezvăluie datele demonstrative. Nu există linkuri SEAP fictive.
6. „Opțiuni pentru testarea mockupului” permite vizitator fără cont, eroare la creare și reluare. Vizitatorul fără cont poate citi/copia/exporta referința, dar nu o poate crea.

Toate instituțiile, firmele, sursele și valorile sunt fictive. Referința este disponibilă prin hash pentru testare, nu reprezintă o salvare durabilă sau o verificare de autentificare. Backendul va trebui să asigure identitatea stabilă, capturarea atomică a datelor/metodei/surselor, permisiuni și citire publică fără acces la anchete private.

## Verificare

20 verificări browser au trecut: confirmare/anulare/progres, data și totalul păstrat, clipboard, CSV complet și reconciliere, paginare, surse fictive, separarea situației actuale, acces fără cont, eroare/reîncercare, lipsa overflowului la390/320px, fără erori JS sau trafic extern în parcursul testat. `node --check app.js` a trecut. Capturile desktop1440, mobil390/320 și tema întunecată au fost inspectate.

Dovezi locale necomise: `.impeccable/review/signal-citation-mockup/`; harness temporar `/tmp/seap-citation-mock.mjs`. Detectorul a rulat o dată. Verdict `ship` strict pentru mockup, prin review local substituit: limita de fire a blocat subagentul independent. Documentarea a fost finalizată local din același motiv.

## Sistem vizual

DESIGN.md și `.impeccable/design.json` rămân neschimbate. Au fost comparate PRODUCT.md, DESIGN.md, HTML/CSS/JS și fonturile locale din `mockups/src/fonts.css`.

- Paletă forest/ivory și varianta întunecată existente.
- Bricolage Grotesque pentru titluri, IBM Plex Sans pentru citire.
- Surse prezentate într-un tabel plat cu separatoare subțiri și valori exacte aliniate dreapta.
- Controale de minimum44px; confirmare inline, detalii pliate, focus vizibil.
- Un singur accent principal; stare păstrată indicată și prin text/dată, nu doar culoare.

Drift necanonizat: muted#626c60 moștenit din mockupul Semnale și dimensiuni responsive locale diferă de rampa documentată. Avertismentul detectorului despre „grotesque”/„plex sans” fragmentează familiile cu mai multe cuvinte; declarațiile fonturilor sunt corecte. Nicio resursă raster nouă.
