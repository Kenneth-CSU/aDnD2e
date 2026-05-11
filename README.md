# aDnD2e
adnd 2nd edition CS

## Item Metadata Expansion

The project now includes expanded gameplay metadata for equipment in:

- `data/items.json`
- `data/weapons.json`
- `data/armour.json`
- `data/itemClassifications.json`

Added metadata includes:

- category and subcategory fields
- damage type tagging
- role tagging
- modifier mechanics metadata (type, target, role)

## New CRUD Page

Use `itemMechanics.html` for bulk metadata editing without changing the existing base item/weapon/armour CRUD pages.

It loads and saves via browser localStorage keys:

- `itemsDB`
- `weaponsDB`
- `armourDB`
- `itemClassificationsDB`

## Books Corpus Trace

`data/bookCorpusTrace.json` stores item/weapon/armour name hit counts and sample snippets from the books corpus (`books/FullTextSearch.txt`).

## Enrichment Script

Run the enrichment script to regenerate metadata and corpus traces:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
./scripts/enrich-item-metadata.ps1
```
