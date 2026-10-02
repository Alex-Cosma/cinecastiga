# Producție → local: încheiat, 2 octombrie 2026

La cererea explicită a proprietarului, baza locală `seap` a fost înlocuită integral cu un snapshot privat de producție. Această operațiune este încheiată; nu relansa scripturile de DROP/restore.

## Deploy

- Etichetele CPV lizibile din Explorează: `1d72085`, comis și publicat.
- GitHub Actions `36963225623`: CI și deploy reușite; hash server confirmat.
- Health live și `/api/cpv/label?code=45` verificate, containere sănătoase.

## Copia locală

- Export început la **07:11:55 RO**, încheiat la **07:21:17 RO**, 2 octombrie; un snapshot PostgreSQL consistent, nu sincronizare continuă cu colectarea ulterioară.
- Dump complet: **6.872.816.466 bytes**, toate schemele, inclusiv conturi, anchete private, arhive originale, istoricul migrărilor și cozile ca snapshot. Acesta este transferul privat către proprietar, diferit de pachetul public pentru coleg.
- `pg_dump` prin SSH, lock comun cu deploy/publicarea; colectarea live a continuat. Niciun dump PostgreSQL suplimentar lăsat pe server.
- Baza locală anterioară a fost ștearsă numai după încheierea exportului; restore cu PostgreSQL 16, fără ownership/ACL de producție, două joburi. Contul local de serviciu `seap_web` există fără LOGIN pentru compatibilitate de schemă.
- Baza restaurată are aproximativ **42 GB**, **47 migrări**, **14.264 redirecturi** și **checkpoint 12 ready**. Reparația identităților și calendarul din producție sunt acum prezente și local.
- Statisticile, Radiografia, flag-urile de risc și tabelul căutării în contracte au fost copiate deja calculate. Nu s-a rulat pipeline, `index-search`, `index-topics` sau recalcularea riscului. Restore-ul logic PostgreSQL creează indexurile tehnice și reîmprospătează vederile materializate din datele copiate; ANALYZE pregătește statisticile planificatorului.
- Meilisearch **1.16.0**: snapshot exact copiat, SHA-256 verificat, restaurat și verificat cu **180.998 documente**; fără reindexare din PostgreSQL. Cheia locală rămâne locală. Snapshotul temporar de pe server și vechiul index local temporar au fost eliminate după verificare.

## Control local și verificări

- Exclusiv în copia locală: `paused=true`, `processing_enabled=false`, `maintenance=false`. Restul datelor operaționale rămân istoric copiat; nu porni workerii pe aceste cozi fără o decizie separată.
- `.env.local`: URL DB local explicit, `DOCUMENTS_ENABLED=false`, `SMTP_HOST` gol; secretele locale păstrate, nu copiate din producție. Excepția locală de 2FA deja existentă este păstrată.
- Workerul de monitorizare și vechile servere locale de preview 3100/3110 au fost oprite. Aplicația web este repornită la `http://localhost:3000`, legată de loopback. Nu rulează collector, worker documente, monitorizare sau scheduler local.
- Șapte verificări HTTP locale trecute: health, etichetă CPV, căutare Cluj canonică fără fragmentul vechi, redirect relativ cu parametri, profil, Radiografie, Explorează. Datele private din auth și documentele au fost comparate prin număr cu sursa, fără afișarea conținutului.
- Producția rămâne activă, fără mentenanță; setările colectării nu au fost schimbate.

## Artefacte

Director privat ignorat de Git: `infra/prod/dumps/prod-local-20261002/`, mod 700. Conține dumpul, snapshotul Meili, manifest/checksum, logurile, `restored.json`, `search-restored.json` și `web-checks.json`. Nu distribui colegului: include date private și autentificare. Copia temporară a dumpului din containerul PostgreSQL a fost eliminată.

Pachetul public `handover-local-20260930` nu a fost rescris și rămâne snapshotul vechi. Documentele din 1 octombrie care spun că baza locală nu are reparația sunt acum istorice; prezenta notă are prioritate. Modificările necomise de audit/handover mai vechi au fost păstrate.
