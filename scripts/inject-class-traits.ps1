[CmdletBinding()]
param(
    [string]$ClassesPath = 'data/classes.json',
    [string]$BooksPath = 'books/FullTextSearch.txt',
    [string]$ReportPath = 'data/classTraitTrace.json',
    [switch]$DryRun,
    [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'

function Assert-PathExists {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing required path: $Path"
    }
}

function Read-JsonFile {
    param([string]$Path)
    $raw = Get-Content -LiteralPath $Path -Raw
    return $raw | ConvertFrom-Json
}

function Write-JsonFile {
    param(
        [string]$Path,
        [object]$Value
    )
    $json = $Value | ConvertTo-Json -Depth 20
    Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
}

function Get-StringList {
    param([object]$Value)
    if ($null -eq $Value) { return @() }
    if ($Value -is [System.Array]) {
        return @($Value | ForEach-Object { "$_" } | Where-Object { $_.Trim() -ne '' })
    }
    return @("$Value")
}

function Get-Trait {
    param([object]$Trait)
    if ($null -eq $Trait) { return $null }
    $tag = "$(($Trait.tag))".Trim()
    $text = "$(($Trait.text))".Trim()
    $sourceBook = "$(($Trait.sourceBook))".Trim()
    $sourcePage = "$(($Trait.sourcePage))".Trim()
    $sourceSnippet = "$(($Trait.sourceSnippet))".Trim()

    if (-not $tag -and -not $text -and -not $sourceBook -and -not $sourcePage -and -not $sourceSnippet) {
        return $null
    }

    [pscustomobject]@{
        tag = $tag
        text = $text
        sourceBook = $sourceBook
        sourcePage = $sourcePage
        sourceSnippet = $sourceSnippet
    }
}

function Get-TraitList {
    param([object]$List)
    if ($null -eq $List) { return @() }
    $out = @()
    foreach ($item in @($List)) {
        $normalized = Get-Trait $item
        if ($null -ne $normalized) { $out += $normalized }
    }
    return @($out)
}

function Get-Kit {
    param(
        [object]$Kit,
        [string]$ParentClass
    )

    $name = "$(($Kit.name))".Trim()
    if (-not $name) { throw "Kit is missing a name in class '$ParentClass'." }

    [pscustomobject]@{
        name = $name
        parentClass = if ("$(($Kit.parentClass))".Trim()) { "$(($Kit.parentClass))".Trim() } else { $ParentClass }
        benefits = "$(($Kit.benefits))".Trim()
        restrictions = "$(($Kit.restrictions))".Trim()
        specialAbilities = "$(($Kit.specialAbilities))".Trim()
        note = "$(($Kit.note))".Trim()
        kitTraits = Get-TraitList $Kit.kitTraits
    }
}

function Get-ClassRecord {
    param([object]$ClassRecord)

    $name = "$(($ClassRecord.name))".Trim()
    if (-not $name) { throw 'A class record is missing a name.' }

    $saves = $ClassRecord.saves
    if ($null -eq $saves -or $saves -isnot [psobject] -or $saves -is [System.Collections.IEnumerable] -and $saves -is [string]) {
        $saves = [pscustomobject]@{}
    }

    $kits = @()
    if ($ClassRecord.kits) {
        foreach ($kit in @($ClassRecord.kits)) {
            $kits += Get-Kit -Kit $kit -ParentClass $name
        }
    }

    $kits = @($kits | Where-Object { $_.name })
    if (-not ($kits | Where-Object { $_.name -eq 'Kit 0' })) {
        $kits = @([pscustomobject]@{
            name = 'Kit 0'
            parentClass = $name
            benefits = 'No effect.'
            restrictions = 'None.'
            specialAbilities = 'None.'
            note = 'Default fallback kit; no mechanical effects.'
            kitTraits = @()
        }) + $kits
    }

    [pscustomobject]@{
        name = $name
        startingGold = "$(($ClassRecord.startingGold))".Trim()
        allowedArmour = "$(($ClassRecord.allowedArmour))".Trim()
        weaponGroups = @(Get-StringList $ClassRecord.weaponGroups)
        thac0 = @($ClassRecord.thac0)
        saves = $saves
        weaponProficiencies = @($ClassRecord.weaponProficiencies)
        nonweaponProficiencies = @($ClassRecord.nonweaponProficiencies)
        spellSlots = @($ClassRecord.spellSlots)
        turnTable = if ($null -eq $ClassRecord.turnTable) { $null } else { @($ClassRecord.turnTable) }
        thiefBase = if ($null -eq $ClassRecord.thiefBase) { $null } else { $ClassRecord.thiefBase }
        classTraits = Get-TraitList $ClassRecord.classTraits
        kits = @($kits)
    }
}

function Get-CorpusTrace {
    param(
        [string]$Term,
        [string]$Text
    )

    if (-not $Term) {
        return [pscustomobject]@{ sourceHintCount = 0; sourceSample = '' }
    }

    $pattern = [regex]::Escape($Term)
    $hitList = [regex]::Matches($Text, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($hitList.Count -eq 0) {
        return [pscustomobject]@{ sourceHintCount = 0; sourceSample = '' }
    }

    $idx = $hitList[0].Index
    $start = [Math]::Max(0, $idx - 60)
    $length = [Math]::Min(160, $Text.Length - $start)
    $sample = $Text.Substring($start, $length).Replace("`r", ' ').Replace("`n", ' ')

    [pscustomobject]@{ sourceHintCount = $hitList.Count; sourceSample = $sample }
}

function New-ClassTrait {
    param(
        [object]$ClassRecord,
        [string]$BooksText
    )

    $trace = Get-CorpusTrace -Term $ClassRecord.name -Text $BooksText
    $traits = @()

    $traits += [pscustomobject]@{
        tag = 'identity'
        text = "$($ClassRecord.name) core class identity and advancement profile."
        sourceBook = 'books/FullTextSearch.txt'
        sourcePage = ''
        sourceSnippet = $trace.sourceSample
    }

    if ($ClassRecord.allowedArmour) {
        $traits += [pscustomobject]@{
            tag = 'armour'
            text = "Allowed armour: $($ClassRecord.allowedArmour)."
            sourceBook = 'data/classes.json'
            sourcePage = ''
            sourceSnippet = "Allowed armour record for $($ClassRecord.name)."
        }
    }

    if ($ClassRecord.startingGold) {
        $traits += [pscustomobject]@{
            tag = 'starting-gold'
            text = "Starting gold: $($ClassRecord.startingGold)."
            sourceBook = 'data/classes.json'
            sourcePage = ''
            sourceSnippet = "Starting gold record for $($ClassRecord.name)."
        }
    }

    if (($ClassRecord.weaponGroups | Measure-Object).Count -gt 0) {
        $traits += [pscustomobject]@{
            tag = 'weapon-groups'
            text = "Weapon groups: $(@($ClassRecord.weaponGroups) -join ', ')."
            sourceBook = 'data/classes.json'
            sourcePage = ''
            sourceSnippet = "Weapon group record for $($ClassRecord.name)."
        }
    }

    if (($ClassRecord.thac0 | Measure-Object).Count -gt 0) {
        $traits += [pscustomobject]@{
            tag = 'thac0'
            text = "THAC0 advancement table present with $(@($ClassRecord.thac0).Count) entries."
            sourceBook = 'data/classes.json'
            sourcePage = ''
            sourceSnippet = "THAC0 table for $($ClassRecord.name)."
        }
    }

    if (($ClassRecord.spellSlots | Measure-Object).Count -gt 0) {
        $traits += [pscustomobject]@{
            tag = 'spell-progression'
            text = "Spell-slot progression table present with $(@($ClassRecord.spellSlots).Count) rows."
            sourceBook = 'data/classes.json'
            sourcePage = ''
            sourceSnippet = "Spell-slot table for $($ClassRecord.name)."
        }
    }

    if ($ClassRecord.turnTable) {
        $traits += [pscustomobject]@{
            tag = 'turn-undead'
            text = 'Turn undead progression is available for this class.'
            sourceBook = 'data/classes.json'
            sourcePage = ''
            sourceSnippet = "Turn table for $($ClassRecord.name)."
        }
    }

    if ($ClassRecord.thiefBase) {
        $traits += [pscustomobject]@{
            tag = 'thief-skills'
            text = 'Thief base skill table is available for this class.'
            sourceBook = 'data/classes.json'
            sourcePage = ''
            sourceSnippet = "Thief base table for $($ClassRecord.name)."
        }
    }

    return [pscustomobject]@{
        trace = $trace
        traits = @(Get-TraitList $traits)
    }
}

function New-KitTraits {
    param(
        [object]$Kit,
        [string]$BooksText
    )

    $trace = Get-CorpusTrace -Term $Kit.name -Text $BooksText
    $traits = @()

    if ($Kit.name -eq 'Kit 0') {
        $traits += [pscustomobject]@{
            tag = 'default'
            text = 'Default no-effect kit kept on all classes.'
            sourceBook = 'data/classes.json'
            sourcePage = ''
            sourceSnippet = 'Neutral default kit.'
        }
    } else {
        if ($Kit.benefits) {
            $traits += [pscustomobject]@{
                tag = 'benefit'
                text = $Kit.benefits
                sourceBook = 'books/FullTextSearch.txt'
                sourcePage = ''
                sourceSnippet = $trace.sourceSample
            }
        }
        if ($Kit.restrictions) {
            $traits += [pscustomobject]@{
                tag = 'restriction'
                text = $Kit.restrictions
                sourceBook = 'books/FullTextSearch.txt'
                sourcePage = ''
                sourceSnippet = $trace.sourceSample
            }
        }
        if ($Kit.specialAbilities) {
            $traits += [pscustomobject]@{
                tag = 'ability'
                text = $Kit.specialAbilities
                sourceBook = 'books/FullTextSearch.txt'
                sourcePage = ''
                sourceSnippet = $trace.sourceSample
            }
        }
    }

    return [pscustomobject]@{
        trace = $trace
        traits = @(Get-TraitList $traits)
    }
}

function Merge-Traits {
    param(
        [object]$ClassRecord,
        [object]$BooksText,
        [switch]$Rebuild
    )

    $classResult = New-ClassTrait -ClassRecord $ClassRecord -BooksText $BooksText
    $newClassTraits = if ($Rebuild) { @($classResult.traits) } else { @($ClassRecord.classTraits) + @($classResult.traits) }
    $ClassRecord.classTraits = @(Get-TraitList $newClassTraits | Select-Object -Unique -Property tag, text, sourceBook, sourcePage, sourceSnippet)

    $kitTraceReport = @()
    for ($i = 0; $i -lt @($ClassRecord.kits).Count; $i++) {
        $kit = $ClassRecord.kits[$i]
        $kitResult = New-KitTraits -Kit $kit -BooksText $BooksText
        $kitTraceReport += [pscustomobject]@{
            class = $ClassRecord.name
            kit = $kit.name
            sourceHintCount = $kitResult.trace.sourceHintCount
            sourceSample = $kitResult.trace.sourceSample
        }

        if ($Rebuild) {
            $kit.kitTraits = @($kitResult.traits)
        } else {
            $kit.kitTraits = @(Get-TraitList (@($kit.kitTraits) + @($kitResult.traits)))
        }
    }

    return $kitTraceReport
}

Assert-PathExists $ClassesPath
Assert-PathExists $BooksPath

$classes = Read-JsonFile $ClassesPath
if (-not ($classes -is [System.Collections.IEnumerable])) {
    throw 'classes.json must contain an array of class records.'
}

$booksText = Get-Content -LiteralPath $BooksPath -Raw
$normalized = @()
$report = @()

foreach ($record in @($classes)) {
    $classRecord = Get-ClassRecord $record
    $report += Merge-Traits -ClassRecord $classRecord -BooksText $booksText -Rebuild:$Rebuild
    $normalized += $classRecord
}

if (-not $DryRun) {
    Write-JsonFile -Path $ClassesPath -Value $normalized
    Write-JsonFile -Path $ReportPath -Value $report
}

Write-Output "Validated classes=$(@($normalized).Count) dryRun=$($DryRun.IsPresent) rebuild=$($Rebuild.IsPresent)"
Write-Output "Trace report entries=$(@($report).Count)"
