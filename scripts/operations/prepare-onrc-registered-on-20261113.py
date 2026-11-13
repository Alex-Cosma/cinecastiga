#!/usr/bin/env python3
"""The two input files of the registration-day backfill of 13 November 2026 (backfill-onrc-registered-on-*.sql).

Reads the public ONRC file OD_FIRME.CSV (data.gov.ro, organization ONRC; caret-separated) exactly as the import
does: the first row of a registration number wins, the day comes in two formats ("13/02/1991" and, for registrations
from mid-2024 on, "14/08/2026 09:23:04").

  onrc-reg-days.csv.gz   j_number, registered_on                 the first pass, by the registration number
  onrc-reg-keys.csv.gz   cui, kind, y, seq, registered_on        the second pass, for numbers re-issued in the new
                                                                 format (J22/205/1999 became J1999000205223)

Usage: python3 -I prepare-onrc-registered-on-20261113.py <od_firme.csv> <output directory>
"""
import csv
import gzip
import re
import sys
from datetime import date

OLD = re.compile(r"([JFC])\d{1,2}/(\d+)/(\d{4})$")
NEW = re.compile(r"([JFC])(\d{4})(\d{6})\d{3}$")
DAY = re.compile(r"(\d{2})/(\d{2})/(\d{4})(?: \d{2}:\d{2}:\d{2})?$")


def main(source: str, out_dir: str) -> None:
    # The first row of a number wins, as in the import; for the second file, the first row that has a company code.
    seen: set[str] = set()
    seen_with_code: set[str] = set()
    days = keys = unreadable = 0
    with open(source, encoding="utf-8-sig", errors="replace", newline="") as f, \
            gzip.open(f"{out_dir}/onrc-reg-days.csv.gz", "wt", newline="", encoding="utf-8") as by_number, \
            gzip.open(f"{out_dir}/onrc-reg-keys.csv.gz", "wt", newline="", encoding="utf-8") as by_key:
        header = f.readline().rstrip("\r\n").split("^")
        if header[:4] != ["DENUMIRE", "CUI", "COD_INMATRICULARE", "DATA_INMATRICULARE"]:
            raise SystemExit(f"unexpected header: {header[:4]}")
        numbers, codes = csv.writer(by_number), csv.writer(by_key)
        numbers.writerow(["j_number", "registered_on"])
        codes.writerow(["cui", "kind", "y", "seq", "registered_on"])
        for line in f:
            c = line.rstrip("\r\n").split("^")
            if len(c) != len(header):
                continue
            number, cui = c[2].strip(), c[1].strip()
            if not number:
                continue
            m = DAY.match(c[3].strip())
            try:
                day = date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat() if m else None
            except ValueError:
                day = None
            if number not in seen:
                seen.add(number)
                if day is None:
                    unreadable += 1
                else:
                    numbers.writerow([number, day])
                    days += 1
            if not re.fullmatch(r"\d{2,10}", cui) or cui == "0" or number in seen_with_code:
                continue
            seen_with_code.add(number)
            parsed = OLD.match(number)
            key = (parsed.group(1), int(parsed.group(3)), int(parsed.group(2))) if parsed else None
            if key is None:
                parsed = NEW.match(number)
                key = (parsed.group(1), int(parsed.group(2)), int(parsed.group(3))) if parsed else None
            if key and day is not None:
                codes.writerow([cui, *key, day])
                keys += 1
    print(f"registrations with a day: {days}; keyed by company code: {keys}; unreadable day: {unreadable}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
