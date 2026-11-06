# Geometria hărții (`/harta`)

`ancpi-uat.topo.json` și `ancpi-uat.meta.json` sunt copiate neschimbate din proiectul spider (`ipr/spider/public/geo/uat.topo.json` și `meta.json`, generate de `scripts/build-geo.ts` acolo, 4 octombrie 2026). Surse, ambele de pe data.gov.ro, licența **CC BY 4.0** (atribuirea trebuie să se vadă pe pagina hărții):

- limitele: ANCPI, „Unități Administrativ-Teritoriale 07.03.2024”: 3.186 de UAT-uri, cu cele 6 sectoare ale Bucureștiului; Bucureștiul întreg nu are contur propriu;
- denumirile și tipul: INS, „SIRUTA s1 2026”.

Schimbări făcute în spider: reproiectare Stereo70 → WGS84, simplificare topologică la 100 m, cuantizare, județele ca unire a UAT-urilor (detalii în `ancpi-uat.meta.json`).

`node scripts/map/build-map-geo.mjs` (din `apps/web`) scrie:

- `public/geo/romania.json`: cele 42 de județe, câte o cale SVG (112 kB, 34 kB comprimat);
- `public/geo/judete/<cheie>.json`: UAT-urile unui județ, în aceleași coordonate (cel mai mare, Mureș, 114 kB, 35 kB comprimat), citite doar când se deschide județul;
- `lib/reference/uat-geo.json`: SIRUTA → nume, cheia județului, tip, pentru server.

Proiecția: echirectangulară la scara lui 46° N, lățime 1000. Arcele sunt simplificate o dată (Douglas–Peucker, 0,35 unități pentru județe, 0,05 pentru UAT-uri), deci vecinii nu se suprapun și nu lasă goluri. Ilfov are o gaură (Bucureștiul): desenează cu `fill-rule="evenodd"`.

Populația nu vine de aici: e catalogul INS RPL 2021 (`lib/reference/population-rpl2021.json`), ca la toate valorile pe locuitor.
