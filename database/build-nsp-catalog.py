"""Generate the idempotent NSP seed from the reviewed CSV."""

import csv
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from uuid import NAMESPACE_URL, uuid5

SEED = Path(__file__).resolve().parent / "seed"
CATALOG_URL = "https://scholarships.gov.in/All-Scholarships"
GUIDED_SCHEME_ID = "518d8549-a22c-45bd-8a19-1484b42b30bd"


def sql(value):
    return "'" + value.replace("'", "''") + "'"


def official_url(value):
    parts = urlsplit(value)
    if parts.scheme != "https" or parts.netloc != "scholarships.gov.in":
        raise ValueError(f"Unexpected NSP URL: {value}")
    return value


def make_seed():
    with (SEED / "nsp_catalog.csv").open(encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        raise ValueError("The NSP catalog is empty")

    entries = []
    keys = set()
    for row in rows:
        key = row["scheme_key"]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", key) or key in keys:
            raise ValueError(f"Invalid or duplicate scheme key: {key}")
        keys.add(key)
        if row["source_url"] != CATALOG_URL:
            raise ValueError(f"Unexpected source for {key}")
        if row["cycle"] not in {"student", "renewal"}:
            raise ValueError(f"Invalid application cycle for {key}")
        if not re.fullmatch(r"20\d{2}-\d{2}", row["academic_year"]):
            raise ValueError(f"Invalid academic year for {key}")
        scheme_id = GUIDED_SCHEME_ID if key == "pm-usp-csss" else str(uuid5(NAMESPACE_URL, f"{CATALOG_URL}#{key}"))
        deadline = date.fromisoformat(row["deadline"]).isoformat()
        checked = date.fromisoformat(row["checked_on"]).isoformat()
        values = [scheme_id, row["name"], row["description"], row["department"],
                  official_url(row["guidelines_url"] or row["source_url"]), row["source_url"],
                  row["academic_year"], deadline, row["cycle"], checked]
        entries.append("(" + ", ".join(map(sql, values)) + ")")

    seed = """-- Generated from nsp_catalog.csv by database/build-nsp-catalog.py.
insert into public.schemes (
  id, scheme_name, description, department, official_url, catalog_source_url,
  academic_year, application_deadline, application_cycle, catalog_checked_on
) values
""" + ",\n".join(entries) + """
on conflict (id) do update set
  scheme_name = excluded.scheme_name,
  description = excluded.description,
  department = excluded.department,
  official_url = excluded.official_url,
  catalog_source_url = excluded.catalog_source_url,
  academic_year = excluded.academic_year,
  application_deadline = excluded.application_deadline,
  application_cycle = excluded.application_cycle,
  catalog_checked_on = excluded.catalog_checked_on
where schemes.catalog_checked_on is null or schemes.catalog_checked_on <= excluded.catalog_checked_on;
"""
    (SEED / "002_seed_nsp_catalog.sql").write_text(seed, encoding="utf-8")
    print(f"Prepared {len(entries)} NSP records")


if __name__ == "__main__":
    make_seed()
