"""Import a medicine CSV with brand name, composition, and use columns."""

import argparse
import csv
import json
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.medicine_lookup import clean_name


def _normalized_headers(fieldnames):
    return {
        re.sub(r"[^a-z]", "", (name or "").casefold()): name
        for name in fieldnames or []
    }


def _find_column(headers, candidates):
    return next((headers[name] for name in candidates if name in headers), None)


def read_medicine_csv(csv_path):
    """Read compatible CSV rows, grouping brands by normalized composition."""
    with open(csv_path, newline="", encoding="utf-8-sig") as csv_file:
        reader = csv.DictReader(csv_file)
        headers = _normalized_headers(reader.fieldnames)
        brand_column = _find_column(
            headers, ("brandname", "brand", "medicinename", "name")
        )
        composition_column = _find_column(
            headers, ("composition", "genericname", "activeingredient")
        )
        use_column = _find_column(headers, ("use", "uses", "indication", "indications"))
        missing = [
            label
            for label, column in (
                ("brand name", brand_column),
                ("composition", composition_column),
                ("use", use_column),
            )
            if column is None
        ]
        if missing:
            raise ValueError(f"CSV is missing required columns: {', '.join(missing)}")

        medicines = {}
        for row in reader:
            brand = (row.get(brand_column) or "").strip()
            composition = (row.get(composition_column) or "").strip()
            use = (row.get(use_column) or "").strip()
            generic_name = clean_name(composition)
            if not brand or not generic_name or not use:
                continue

            entry = medicines.setdefault(
                generic_name,
                {"class": "medicine (class not categorized)", "use": use, "brands": []},
            )
            if brand.casefold() not in {item.casefold() for item in entry["brands"]}:
                entry["brands"].append(brand)
        return medicines


def _merge_catalog(existing, incoming):
    for generic_name, new_entry in incoming.items():
        entry = existing.setdefault(generic_name, new_entry)
        if entry is new_entry:
            continue
        if not entry.get("use") and new_entry.get("use"):
            entry["use"] = new_entry["use"]
        brands = entry.setdefault("brands", [])
        known_brands = {brand.casefold() for brand in brands}
        brands.extend(brand for brand in new_entry["brands"] if brand.casefold() not in known_brands)
    return existing


def _write_json(output_path, incoming):
    path = Path(output_path)
    catalog = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    catalog = _merge_catalog(catalog, incoming)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _write_sqlite(database_path, incoming):
    connection = sqlite3.connect(database_path)
    try:
        with connection:
            connection.execute(
                """CREATE TABLE IF NOT EXISTS medicines (
                    generic_name TEXT PRIMARY KEY,
                    drug_class TEXT NOT NULL,
                    use TEXT NOT NULL,
                    brands TEXT NOT NULL
                )"""
            )
            connection.executemany(
                """INSERT INTO medicines (generic_name, drug_class, use, brands)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(generic_name) DO UPDATE SET
                    use = excluded.use,
                    brands = excluded.brands""",
                [
                    (
                        generic_name,
                        details["class"],
                        details["use"],
                        json.dumps(details["brands"], ensure_ascii=False),
                    )
                    for generic_name, details in incoming.items()
                ],
            )
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_file", help="Kaggle medicine CSV file")
    destination = parser.add_mutually_exclusive_group()
    destination.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parents[1] / "data" / "medicines.json"),
        help="JSON catalog to merge into (default: data/medicines.json)",
    )
    destination.add_argument(
        "--sqlite",
        help="SQLite database file to import into its medicines table",
    )
    args = parser.parse_args()

    medicines = read_medicine_csv(args.csv_file)
    if args.sqlite:
        _write_sqlite(args.sqlite, medicines)
    else:
        _write_json(args.output, medicines)
    print(f"Imported {len(medicines)} medicine compositions.")


if __name__ == "__main__":
    main()
