# Windows Setup and Data Enrichment Guide

## Quick Start

Run this batch file from the project root directory:

```batch
setup-injectors.bat
```

This single command will:
1. Verify required files are present
2. Check PowerShell availability (5.1+)
3. Run all four trait injectors in sequence:
   - `inject-class-traits.ps1` - Enriches class and kit data
   - `inject-weapons-traits.ps1` - Enriches weapon data
   - `inject-items-traits.ps1` - Enriches item data
   - `inject-armour-traits.ps1` - Enriches armour/shield data
4. Generate trace reports for verification

## What Gets Populated

### Classes (8 records)
- Identity, weapon groups, spell progression, turn undead, thief skills
- Kit traits for each subclass (including Kit 0 - default, no effect)
- **Result**: 43 trait entries across all classes

### Weapons (55 records)
- Damage profiles (small/large), speed factor, weight, cost
- Handedness, reach, damage types, proficiency groups
- **Result**: 55 trait entries (one per weapon)

### Items (56 records)
- Identity, weight, cost, description
- Roles (utility, equipment), damage types if applicable
- **Result**: 56 trait entries (one per item)

### Armour (17 records)
- Identity, base AC, DEX bonus, weight, cost
- Armour type, equipment slot, roles (defense, mobility)
- **Result**: 17 trait entries (one per piece/shield)

## Generated Output Files

After running `setup-injectors.bat`, verify these trace reports exist:

```
data/classTraitTrace.json       ✓ 43 entries
data/weaponsTraitTrace.json     ✓ 55 entries
data/itemsTraitTrace.json       ✓ 56 entries
data/armourTraitTrace.json      ✓ 17 entries
```

These reports contain corpus search hints and sample snippets showing where each trait originated.

## Technical Details

### Execution Policy Bypass
The batch file uses `-ExecutionPolicy Bypass` to run PowerShell scripts without requiring permanent policy changes. This is safe and temporary.

### No Admin Required
The setup works with standard user permissions. No administrator privileges needed.

### Corpus-Based Extraction
Traits are generated from:
1. **Existing data** (weight, cost, AC values, etc.)
2. **Corpus matching** (books/FullTextSearch.txt) for identity trait snippets
3. **Record deduction** (speed factor, spell slots, etc.)

### Reusable Injectors
Each injector supports flags:

```powershell
# Dry-run (no changes)
powershell -ExecutionPolicy Bypass -File scripts/inject-class-traits.ps1 -DryRun

# Rebuild (replace all traits)
powershell -ExecutionPolicy Bypass -File scripts/inject-class-traits.ps1 -Rebuild

# Normal (merge with existing)
powershell -ExecutionPolicy Bypass -File scripts/inject-class-traits.ps1
```

## Data Schema

### Trait Structure
```json
{
    "tag": "identity|weight|cost|damage|...",
    "text": "Human-readable trait description",
    "sourceBook": "books/FullTextSearch.txt OR data/*.json",
    "sourcePage": "",
    "sourceSnippet": "Context from corpus or data record"
}
```

### Item/Weapon/Armour Records
- **itemTraits[]** - New trait array added to items.json
- **weaponTraits[]** - New trait array added to weapons.json
- **armourTraits[]** - New trait array added to armour.json

### Class Records (Pre-existing)
- **classTraits[]** - Exists for 8 core classes
- **kits[].kitTraits[]** - Exists for all kits per class

## Next Steps

After running `setup-injectors.bat`:

1. Start the HTTP server:
   ```batch
   setup.bat
   ```

2. Open http://localhost:8080/index.html

3. View enriched data in:
   - Classes tab → Modal editor shows class/kit traits
   - Items/Weapons/Armour (if UI implements trait display)

## Troubleshooting

### "PowerShell not found in PATH"
- Install PowerShell 5.1 or later
- Verify PowerShell is accessible from Command Prompt: `powershell -Version`

### "Missing required path"
- Ensure you run the batch from the project root directory
- Check that `books/FullTextSearch.txt` exists (15.2 MB file)

### "ConvertFrom-Json" errors
- Verify JSON files in `data/` are valid
- Try running a dry-run first: `powershell -ExecutionPolicy Bypass -File scripts/inject-class-traits.ps1 -DryRun`

### Script takes too long
- First run may take 10-30 seconds (reading 15.2 MB corpus)
- Subsequent runs with `-Rebuild` flag are faster
- Normal append mode is slower due to deduplication

## Windows Batch vs PowerShell

### Why both?
- **setup.bat** - Starts HTTP server (Python 3 preferred, PowerShell fallback)
- **setup-injectors.bat** - Runs trait injectors (PowerShell 5.1+)

### Why wrap PowerShell in batch?
- Single-click convenience on Windows
- Automatic error handling and reporting
- Execution policy bypass (no permanent changes)
- Sequential execution with validation

### Can I run injectors manually?
Yes! Each injector is standalone:
```powershell
cd d:\0rpg\ADnd2eCS\aDnD2e
powershell -ExecutionPolicy Bypass -File .\scripts\inject-class-traits.ps1 -Rebuild
powershell -ExecutionPolicy Bypass -File .\scripts\inject-weapons-traits.ps1 -Rebuild
powershell -ExecutionPolicy Bypass -File .\scripts\inject-items-traits.ps1 -Rebuild
powershell -ExecutionPolicy Bypass -File .\scripts\inject-armour-traits.ps1 -Rebuild
```

## What's Different From Before

### Before
- PowerShell scripts required manual execution policy bypass
- No batch wrapper for Windows users
- Had to run each injector separately

### After
- Single `setup-injectors.bat` command runs everything
- Automatic error detection and reporting
- Windows-native execution model
- Parallel-ready (can extend with parallel execution)
- Self-contained on Windows with standard PowerShell

---

**Status**: ✅ All 4 injectors created and tested
**Data Populated**: ✅ 171 total trait entries across all categories
**Windows Ready**: ✅ setup-injectors.bat deployment-ready
