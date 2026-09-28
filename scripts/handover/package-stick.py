#!/usr/bin/env python3
"""Add a source snapshot, readable handover and checksums to a completed PUBLIC bundle."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bundle',required=True)
    a=p.parse_args()
    root=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
    out=Path(a.bundle).resolve()
    manifest=json.loads((out/'manifest.json').read_text())
    if manifest['schema_only']:
        raise SystemExit('Refusing to package a schema-only rehearsal as the real dataset')
    if (out/'database.dump.partial').exists():
        raise SystemExit('Export is still incomplete')
    # Only tracked source + the explicitly requested handover additions. Never recursive cwd.
    tracked=subprocess.check_output(['git','-C',str(root),'ls-files','-z']).decode().split('\0')
    files={f for f in tracked if f and (root/f).is_file()}
    files.add('AGENTS.md')
    for folder in ['docs/handover','scripts/handover']:
        files.update(str(f.relative_to(root)) for f in (root/folder).rglob('*')
                     if f.is_file() and '__pycache__' not in f.parts and f.suffix!='.pyc')
    for f in files:
        path=Path(f)
        if path.name.startswith('.env') and path.name!='.env.example':
            raise SystemExit('Refusing configuration file: '+f)
        if path.suffix in {'.local','.dump','.pem'} or '.git' in path.parts:
            raise SystemExit('Refusing non-source file: '+f)
    archive=out/'source.tar.gz'
    if archive.exists():
        raise SystemExit('Source archive exists; use a new bundle packaging destination or inspect it first')
    with tarfile.open(out/'source.tar.gz.partial','w:gz',compresslevel=3) as tar:
        for f in sorted(files):
            tar.add(root/f,arcname='cinecastiga-source/'+f,recursive=False)
    (out/'source.tar.gz.partial').rename(archive)
    for folder in ['docs/handover','scripts/handover']:
        shutil.copytree(root/folder,out/folder,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    (out/'CITESTE-MA.md').write_text('''# Pachet cinecâștigă? pentru coleg

1. Copiază întregul dosar de pe stick pe SSD-ul calculatorului. Nu lucra direct din stick.
2. Verifică `shasum -a 256 -c PACKAGE-SHA256SUMS` (Linux: `sha256sum -c PACKAGE-SHA256SUMS`).
3. Codul este în `source.tar.gz`: extrage-l într-un director NOU cu `tar -xzf source.tar.gz`.
   Este un snapshot fără `.git`, secrete sau dependențe instalate. Pentru colaborare normală,
   clonează repository-ul GitHub pe branch propriu și adaugă documentația/scripturile noi dacă
   nu sunt încă pe remote. Nu suprascrie un checkout cu modificări nesalvate.
4. Deschide `cinecastiga-source/docs/handover/README.md`, apoi ghidurile03/04.
   Copia rapidă din `docs/handover/` conține același text; legăturile relative către restul
   codului/documentelor funcționează în directorul sursă extras.
5. Pornește Docker/PostgreSQL local, apoi rulează scriptul de restore din checkout:
   `python3 scripts/handover/restore-local.py --bundle /cale/catre/acest-dosar --database seap_collab`.
6. Urmează ghidul pentru configurare locală, reindexare Meilisearch, cont admin nou și pornire web.
7. Dă modelului promptul din `docs/handover/MODEL-START.md` și acces la cod/documentație.

Datele sunt din baza LOCALĂ a autorului, nu ultima publicare de producție. Arhiva include toate
rândurile publice disponibile acolo, inclusiv PDF/OCR, fără conturi/anchete private/cozi active.
Colectarea și scheduler-ul sunt oprite după restore. Nu activa SEAP pentru onboarding.

`manifest.json` descrie sursa, checkpoint-ul, schema și hash-ul dump-ului.
`docs/handover/TRANSFER-STATUS.md` precizează exact verificările executate.
`source-manifest.json` descrie snapshot-ul de cod și modificările locale de documentare.

Nu s-a copiat pe stick niciun `.env`, secret de autentificare, cheie SSH sau sesiune.
Dacă stick-ul e FAT32, fișierul mare trebuie împărțit/reconstituit înainte de verificare; exFAT
acceptă direct arhiva. Nu formata un stick cu date doar pentru acest transfer.
''')
    commit=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
    status=subprocess.check_output(['git','-C',str(root),'status','--short'],text=True)
    (out/'source-manifest.json').write_text(json.dumps({'base_commit':commit,
      'snapshot':'Tracked working-tree files plus explicit handover docs/tools; no .git metadata',
      'working_tree_status_at_packaging':status,'file_count':len(files),
      'source_archive':'source.tar.gz'},indent=2)+'\n')
    sums=[]
    for f in sorted(out.rglob('*')):
        if not f.is_file() or f.name=='PACKAGE-SHA256SUMS':continue
        if '.partial' in f.name:raise SystemExit('Incomplete file in package: '+str(f))
        h=hashlib.sha256()
        with f.open('rb') as source:
            for b in iter(lambda:source.read(8*1024*1024),b''):h.update(b)
        sums.append(h.hexdigest()+'  '+str(f.relative_to(out)))
    (out/'PACKAGE-SHA256SUMS').write_text('\n'.join(sums)+'\n')
    print(json.dumps({'bundle':str(out),'source_files':len(files),'checksummed_files':len(sums)}))

if __name__=='__main__':main()
