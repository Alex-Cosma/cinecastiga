"""Read cached primary public files; export business facts without personal identifiers.

Usage: python3 verify-company-sources.py /path/to/seap-heartbeat
No network, database writes, dates of birth or residential addresses in output.
"""
import csv
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

cache = Path(sys.argv[1])
firms = cache / 'onrc/2026-07-08-od_firme.csv'
reps = cache / 'onrc/2026-07-08-od_reprezentanti_legali.csv'
financials = cache / 'financials/2025-WEB_UU_AN2025.txt'
spec = cache / 'financials/2025-WEB_UU_AN2025.txt.spec.csv'

def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def folded_name(value):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower())

companies = {}
with firms.open(encoding='utf-8-sig') as f:
    for row in csv.reader(f, delimiter='^'):
        if len(row) == 20 and row[1] in {'30976819', '16617020'}:
            companies[row[2]] = {'cui': row[1], 'name': row[0], 'registration': row[2]}

selected = []
with reps.open(encoding='utf-8-sig') as f:
    for line_number, row in enumerate(csv.reader(f, delimiter='^'), 1):
        if len(row) == 10 and row[0] in companies:
            selected.append((line_number, row))

comparisons = []
for _, a in selected:
    for _, b in selected:
        if companies[a[0]]['cui'] != '30976819' or companies[b[0]]['cui'] != '16617020':
            continue
        if folded_name(a[1]) != folded_name(b[1]):
            continue
        # ONRC contains both DD/MM/YYYY and DD/MM/YYYY HH:MM:SS.
        comparisons.append({
            'name': a[1], 'sameNormalizedName': True,
            'sameBirthDateAfterRemovingTime': bool(a[3]) and a[3].split()[0] == b[3].split()[0],
            'sameBirthLocalityLiteral': a[4] == b[4],
        })

with financials.open(encoding='utf-8-sig') as f:
    finance = next(r for r in csv.DictReader(f) if r['CUI'] == '30976819')

result = {
    'observedAt': '2026-10-02', 'onrcSnapshotDate': '2026-07-08',
    'onrcDatasetUrl': 'https://data.gov.ro/dataset/firme-08-07-2026',
    'financialsDatasetUrl': 'https://data.gov.ro/dataset/situatii_financiare_2025',
    'files': [{'name': p.name, 'sha256': digest(p)} for p in [firms, reps, financials, spec]],
    'representatives': [dict(companies[r[0]], personName=r[1], role=r[2], sourceLine=n) for n, r in selected],
    'identityComparisons': comparisons,
    'financials2025': {'cui': '30976819', 'caen': finance['CAEN'], 'netTurnover': finance['I13'], 'profitNet': finance['I18'], 'averageEmployees': finance['I20']},
    'limits': 'Snapshot contains legal representatives, not shareholdings or appointment/revocation dates. Identity checks are documentary matches, not personal interviews. Birth identifiers remain in the external primary cache only.',
}
print(json.dumps(result, ensure_ascii=False, indent=2))
