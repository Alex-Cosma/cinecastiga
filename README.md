# cinecâștigă?

Aplicație de explorare și investigare a achizițiilor publice din România, disponibilă la <https://cinecastiga.ro>. Rezultatele trebuie să poată fi urmărite până la înregistrările și sursele SEAP/TED care le compun. Semnalele sunt piste de verificare; valorile contractelor nu reprezintă plăți dovedite.

## Începe aici

- **Dezvoltator nou:** [handover](docs/handover/README.md), apoi [pornire locală](docs/handover/03-development.md).
- **Asistent LLM:** citește [AGENTS.md](AGENTS.md) și folosește [promptul de inițializare](docs/handover/MODEL-START.md). Nu toate instrumentele încarcă automat AGENTS.md.
- **Date locale:** [restaurarea pachetului public](docs/handover/04-database-transfer.md) și [starea pachetului verificat](docs/handover/TRANSFER-STATUS.md).
- **Arhitectură și produs:** [harta codului](docs/handover/02-architecture.md), [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md).
- **Operațiuni și priorități:** [producție](docs/handover/05-operations.md), [stare și backlog](docs/handover/06-status-and-roadmap.md).

## Ce primești prin clone

Codul, migrațiile, testele, instrucțiunile și scripturile de restaurare sunt în Git. **Baza cu date publice se transferă separat**, momentan prin pachetul `handover-local-20260930` de pe stick. Conturile și secretele se creează local. Clone-ul singur nu oferă datele necesare unei explorări reale; instalarea verificată folosește dump-ul cu istoricul migrațiilor, nu o bază goală.

Stack: Node 22, pnpm 9.4.0, Next.js, PostgreSQL 16 și Meilisearch 1.16. Ghidul local include comenzile pentru servicii, restore într-o bază nouă, configurare, indexare, cont și pornirea web. Dezvoltarea obișnuită nu necesită SSH la producție sau cereri către SEAP.

Lucrează pe un branch propriu: push-ul pe `main` poate declanșa deploy. Scripturile datate de reparare/publicare sunt istoric operațional, nu pași de instalare.

## Actualitatea documentației

Documentație consolidată la **1 octombrie 2026**; ultima verificare de producție consemnată este din **30 septembrie, seara**. [Raportul lansării](docs/implementation/release-20260930.md) confirmă publicarea încheiată; [checkpointul](docs/handover/continuation-20261001.md) păstrează contextul de reluare. Aceste documente nu sunt un monitor live. Copia locală pentru coleg are un baseline mai vechi decât producția, explicat în manifest și handover.
