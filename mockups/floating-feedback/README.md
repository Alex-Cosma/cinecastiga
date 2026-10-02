# Feedback plutitor — mockup

Mockup interactiv separat de aplicație, pentru **direcție**, nu implementare. Cererea din 2 octombrie 2026: linkul „Semnalează o problemă” din subsolul paginii devine un buton plutitor „Feedback”, pe partea dreaptă. Identitatea vizuală rămâne cea din `DESIGN.md`; culorile și umbrele sunt copiate din `apps/web/app/approved.css`.

Pornire din rădăcina repo:

```sh
python3 -m http.server 4185 --bind 127.0.0.1 --directory mockups
```

Deschide <http://127.0.0.1:4185/floating-feedback/>. Nu este o rută Next.js și nu se publică prin deployul aplicației.

## Decizii deja luate

- Butonul plutitor devine **singurul punct de intrare**: dispar cele trei linkuri „Semnalează o problemă” (footer, sub rezultatele Explorează și pe paginile cu înregistrări-sursă).
- Ascuns pe paginile `/admin`.
- Pe telefon rămâne vizibil, în formă compactă (pictogramă; numele accesibil rămâne „Feedback: semnalează o problemă sau trimite o sugestie”).
- Dialogul nu se schimbă: aceleași texte, câmpuri, pagină atașată, trimitere anonimă și protecții.

## Ce se poate compara

- **A · lipit de marginea dreaptă**, centrat vertical, text vertical „Feedback”. Pe telefon coboară în treimea de jos a ecranului.
- **B · colțul din dreapta jos**, buton rotunjit cu pictogramă și text. Pe telefon devine un buton rotund de 48px.
- Stil **discret** (fundal deschis, text verde, contur) sau **accent** (fundal verde, ca acțiunile principale).
- Opțiunile se reflectă în URL, de exemplu `?pozitie=colt&stil=accent`.
- Temă luminoasă/întunecată, focus vizibil, Escape închide dialogul și focusul revine pe buton, mișcare redusă respectată, ascuns la tipărire.
- „Arată un mesaj temporar”: mesajele temporare din centrul paginii rămân deasupra butonului.
- „Pagină din /admin”: butonul dispare.
- Trimiterea este simulată (reușită sau eroare de rețea, cu textul păstrat).

## Problemă existentă observată

În aplicație, `components/feedback/feedback.css` folosește variabilele `--ink-secondary` și `--line-strong`, care nu sunt definite (variabilele reale sunt `--ink2` și `--line2`). Efect: câmpurile dialogului nu au contur, iar textele secundare au culoarea textului principal. Mockupul arată dialogul cu variabilele corecte; corecția intră în același branch, separat.

## După alegere

Varianta aleasă: **A, discret** (2 octombrie 2026). După critica de design, pe telefon butonul compact al variantei A folosește colțul din dreapta jos (ca B), ca să nu acopere marginea conținutului. Mockupul păstrează variantele inițiale, pentru comparație.

## Date și limite

Pagina de fundal, instituția și firmele sunt **fictive**. Nimic nu se trimite și nu se salvează; nu există conexiune la baza de date sau la SEAP.
