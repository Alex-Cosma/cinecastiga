# Continuare operațiune autorizată — 30 septembrie 2026

**Checkpoint istoric, depășit:** procesarea, indexarea și redeschiderea au reușit; pachetul local este complet, verificat și sigilat. Nu relansa comenzile/pașii de mai jos. Vezi [raportul final](../implementation/release-20260930.md) și [starea transferului](TRANSFER-STATUS.md).

Acesta este un checkpoint de lucru, NU instrucțiune de relansare. Raportul final `../implementation/release-20260930.md` și `TRANSFER-STATUS.md` au prioritate după completare.

## Obiective active

1. Utilizatorul a cerut commit/push/deploy pentru toate loturile, inclusiv tranziția calendarului rf-2026.6 necesară publicării.
2. În timpul procesării a cerut un dump public complet LOCAL în același loc și actualizarea handoverului. Întrebarea dacă poate șterge pachetul vechi nu autorizează ștergerea: am recomandat păstrarea până când noul pachet este complet/verificat.

## Producție

- SSH `cinecastiga`, checkout `/srv/seap/src`, compose `infra/prod`.
- Cod43c0d4a697149b25b981c6f6b9a44ccff574db7d, CI/deploy36745471938success,46migrări. Nu confunda deployul cu redeschiderea: mentenanța este încă activă.
- One-off `/srv/seap/src/scripts/operations/calendar-release-20260930.sh publish <SHA>` rulează deja, PID launcher 499609, container `cinecastiga-calendar-release-20260930`, lock comun deploy ținut. NU porni încă un publish și nu împinge un nou main până nu eliberează lockul.
- Raport atomic `/srv/seap/backups/calendar-release-20260930/report.json`; jurnal `publish.log`; marker `validated` numai după pipeline+search+calendar. La eroare există `failed`; menține mentenanța și investighează, nu reporni full automat.
- Control rev21,paused/maintenance true; înainte era rev20,pausedfalse. Bugetul observat40–60sec și programul daily05:00/riscduminică se păstrează. Boundaryraw17359467/request4936. Backup privat de 5,1 GiB validat, în același director, niciodată în pachetul public.
- Pipeline început16:41:47UTC: normalize/reconcile/TED/marts trecute; flags început17:00:26UTC. Queryul da_round (aproape de plafon) a terminat după circa29minute; la ultima verificare rulează da_split. Heartbeatul este actualizat, queryul activ fără lockwait; niciun eșec raportat.
- După markerulvalidated: inspectează report.json (checkpointready,search,cele trei date calendaristice), verifică validation.checks în app.monitoring_refreshes, apoi rulează o singură dată `bash scripts/operations/calendar-release-20260930.sh reopen 43c0d4a697149b25b981c6f6b9a44ccff574db7d` pe server. Scriptul repornește cache-urile/workerii și deschide numai controlul/checkpointul exact. Verifică apoi site-ul, browserul și o cerere normală.
- Harness browser public `/tmp/seap-release-20260930-browser.mjs`, fără mutații sau traficSEAP. Admin anonim 403,health 200 și 2FA bypass false în production verificate deja sub mentenanță.

## Corecție proxy suplimentară

Caddy păstrase fișierul montat vechi după Git; headerul feedbackului lipsea din configurația activă. Corectat live: validat fișierul nou, recreat numai Caddy cu volumele persistente; ambele headere active confirmate, health 200 și mentenanță 503. Pipeline-ul DB nu a fost afectat.

Fix permanent în commitul LOCAL `f474c3e` pe main, încă neîmpins: deploy.sh copiază configurația checkoutului în container pentru validare, compară fișierul montat și recreează Caddy numai dacă diferă, apoi face reload. 20 teste host trecute. După publicarea/reopen pentru 43c și eliberarea lockului, push main pentru acest fix și verifică al doilea CI/deploy. Nu necesită încă un full: baseline-ul va fi deja RF2026.6. Documentația curentă necomisă este intenționată.

## Export local

- Baza locală `seap`, container `seap-postgres-1`, export public în `infra/prod/dumps/handover-local-20260930`.
- Export încheiat: 9,411,824,015 bytes, SHA256 `ace1825d9428197d0678b46bc4dd1ba3705ae07b3152b36d85feb2ce3ea26bef`. Manifest final, catalog și excluderi private reușite. DB 68,780,874,775 bytes înainte, 46 migrări, baseline v1 ready din 19 septembrie. Nu are tranziția recalculată în producție.
- Verificarea activă: `python3 /tmp/seap-verify-transfer-20260930.py`, exec session74754, log `/tmp/seap-transfer-verification-20260930.log`. Face citire integrală/decompresie, restore de structură în baza NOUĂ `seap_test_transfer_20260930`, restore selectiv Drizzle/CPV, verifică46/9454 și tabele private goale, apoi elimină fixture-ul. Nu este restore integral de64GiB. La succes creează `docs/handover/transfer-artifact-verification-20260930.json`.
- După verificare actualizează TRANSFER-STATUS, HANDOFF, README și raportul lansării cu probe reale. Împachetează o dată codul și documentele finale: `python3 scripts/handover/package-stick.py --bundle infra/prod/dumps/handover-local-20260930`. Creează source.tar.gz, CITESTE-MA.md, copiile docs/toolset și PACKAGE-SHA256SUMS. Verifică checksumurile și absența mediilor/private/dumpului din arhiva de cod.
- Pachetul vechi din20260928 se păstrează; spune proprietarului când poate fi șters, fără a-l șterge automat. Nu copia pe USB și nu formata dispozitive fără cerere.
- Dumpurile, mediile, secretele și artefactele locale NU intră în Git. Documentația și rezultatele publice ale verificării intră. Păstrează dev3000 pornit și excepția2FA exclusiv locală.

## Export: verificare încheiată ulterior

Citirea integrală, restaurarea structurii și datele selective46/9454 au trecut; fixture-ul a fost eliminat. Raportul este în transfer-artifact-verification-20260930.json. Pachetul va reprezenta starea codului/documentației la împachetare, în timp ce procesarea live continuă. Starea finală a producției se verifică în cel mai recent raport din repository; nu relansa procedurile datate.
