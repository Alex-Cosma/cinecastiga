#!/usr/bin/env python3
"""Reproduce the resident-population catalog from INS RPL 2021 table 1.22.

Uses Python's standard library only. The input is pinned by SHA256. No database
connection, entity matching, current-population estimate, or aggregate overwrite.
Run with --input /path/to/Tabel-1.22.xlsx, or omit --input to fetch INS directly.
--check verifies that the checked-in catalog is byte-for-byte reproducible.
"""

import argparse
import collections
import hashlib
import io
import json
from pathlib import Path
import re
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

URL = "https://www.recensamantromania.ro/wp-content/uploads/2023/05/Tabel-1.22.xlsx"
SHA256 = "3f866efe829107bc42f804889197e884c394b8a1e8d4ee58d67c522e5379f983"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
DEFAULT_OUTPUT = Path(__file__).resolve().parents[3] / "apps/web/lib/reference/population-rpl2021.json"


def county_key(name):
    if name == "MUNICIPIUL BUCUREȘTI":
        return "bucuresti"
    folded = "".join(c for c in unicodedata.normalize("NFD", name.lower()) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", folded).strip("-")


def extract(raw):
    actual_hash = hashlib.sha256(raw).hexdigest()
    if actual_hash != SHA256:
        raise ValueError(f"Source changed: expected {SHA256}, got {actual_hash}; review before changing the pin")
    archive = zipfile.ZipFile(io.BytesIO(raw))
    strings = ["".join(t.itertext()) for t in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS)]
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheet_names = [s.attrib["name"] for s in workbook.findall("m:sheets/m:sheet", NS)]
    if len(sheet_names) != 1:
        raise ValueError("Unexpected workbook sheet count")
    units, counties = [], []
    national = None
    for row in ET.fromstring(archive.read("xl/worksheets/sheet1.xml")).findall("m:sheetData/m:row", NS):
        cells = {}
        for cell in row.findall("m:c", NS):
            value = cell.find("m:v", NS)
            text = value.text if value is not None else ""
            if cell.attrib.get("t") == "s":
                text = strings[int(text)]
            cells[re.sub(r"\d", "", cell.attrib["r"])] = text
        a, b, c, d = (cells.get(key, "") for key in ("A", "B", "C", "D"))
        source_row = int(row.attrib["r"])
        if a == "ROMÂNIA":
            national = int(d)
        # County totals are explicit rows, never sums of entity mappings.
        elif not a and c and d.isdigit():
            counties.append({"key": county_key(c), "name": c,
                             "kind": "bucharest" if c == "MUNICIPIUL BUCUREȘTI" else "county",
                             "population": int(d), "sourceRow": source_row})
        elif b.isdigit() and c:
            sector = bool(re.fullmatch(r"  BUCUREȘTI SECTORUL [1-6]", c))
            # Leading spaces distinguish constituent settlements from UAT totals.
            # Bucharest sectors are retained separately and excluded from UAT sums.
            if c[0].isspace() and not sector:
                continue
            if not d.isdigit() or int(d) <= 0:
                raise ValueError(f"Missing/nonpositive UAT or sector population at row {source_row}")
            kind = "sector" if sector else "municipality" if c.startswith("MUNICIPIUL ") else "city" if c.startswith("ORAȘ ") else "commune"
            units.append({"siruta": int(b), "name": c.strip(), "county": a,
                          "countyKey": county_key(a), "kind": kind,
                          "population": int(d), "sourceRow": source_row})
    counts = collections.Counter(u["kind"] for u in units)
    if counts != {"municipality": 103, "city": 216, "commune": 2862, "sector": 6}:
        raise ValueError(f"Unexpected unit counts: {counts}")
    if len(counties) != 42 or len({u["siruta"] for u in units}) != len(units):
        raise ValueError("Unexpected county count or duplicate SIRUTA")
    if national != 19053815 or sum(u["population"] for u in units if u["kind"] != "sector") != national or sum(c["population"] for c in counties) != national:
        raise ValueError("National population reconciliation failed")
    for county in counties:
        total = sum(u["population"] for u in units if u["countyKey"] == county["key"] and u["kind"] != "sector")
        if total != county["population"]:
            raise ValueError(f"County reconciliation failed for {county['key']}")
    bucharest = next(u for u in units if u["siruta"] == 179132)
    if sum(u["population"] for u in units if u["kind"] == "sector") != bucharest["population"]:
        raise ValueError("Bucharest sector reconciliation failed")
    return {"version": "ins-rpl-2021-table-1.22-v1", "referenceDate": "2021-12-01",
            "measure": "resident_population", "nationalPopulation": national,
            "source": {"url": URL, "sha256": SHA256, "sheet": sheet_names[0], "table": "1.22",
                       "title": "INS — Recensământul populației și locuințelor 2021, rezultate definitive",
                       "totalColumn": "D"},
            "units": units, "counties": counties}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.input:
        raw = args.input.read_bytes()
    else:
        with urllib.request.urlopen(URL, timeout=30) as response:
            raw = response.read()
    catalog = extract(raw)
    encoded = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if args.output.read_text() != encoded:
            raise ValueError("Checked-in catalog differs from the pinned official source")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    print(f"{'Verified' if args.check else 'Wrote'} {len(catalog['units'])} units and {len(catalog['counties'])} county/equivalent totals; all geographic totals reconcile to {catalog['nationalPopulation']:,}")


if __name__ == "__main__":
    main()
