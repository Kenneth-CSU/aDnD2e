[CmdletBinding()]
param(
    [string]$WeaponsPath = 'data/weapons.json',
    [string]$BooksPath = 'books/FullTextSearch.txt',
    [string]$ReportPath = 'data/weaponsTraitTrace.json',
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

function Get-WeaponRecord {
    param([object]$WeaponRecord)

    $name = "$(($WeaponRecord.name))".Trim()
    if (-not $name) { throw 'A weapon record is missing a name.' }

    [pscustomobject]@{
        name = $name
        damageSM = "$(($WeaponRecord.damageSM))".Trim()
        damageL = "$(($WeaponRecord.damageL))".Trim()
        speedFactor = $WeaponRecord.speedFactor
        size = "$(($WeaponRecord.size))".Trim()
        type = "$(($WeaponRecord.type))".Trim()
        weight = $WeaponRecord.weight
        costGP = $WeaponRecord.costGP
        proficiencyGroup = "$(($WeaponRecord.proficiencyGroup))".Trim()
        weaponCategory = "$(($WeaponRecord.weaponCategory))".Trim()
        weaponRoles = @($WeaponRecord.weaponRoles)
        damageTypes = @($WeaponRecord.damageTypes)
        handedness = "$(($WeaponRecord.handedness))".Trim()
        reachFt = $WeaponRecord.reachFt
        usageRole = "$(($WeaponRecord.usageRole))".Trim()
        modifierProfiles = @($WeaponRecord.modifierProfiles)
        weaponTraits = Get-TraitList $WeaponRecord.weaponTraits
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

function New-WeaponTrait {
    param(
        [object]$WeaponRecord,
        [string]$BooksText
    )

    $trace = Get-CorpusTrace -Term $WeaponRecord.name -Text $BooksText
    $traits = @()

    $traits += [pscustomobject]@{
        tag = 'identity'
        text = "$($WeaponRecord.name) weapon with damage profile and proficiency group."
        sourceBook = 'books/FullTextSearch.txt'
        sourcePage = ''
        sourceSnippet = $trace.sourceSample
    }

    if ($WeaponRecord.damageSM) {
        $traits += [pscustomobject]@{
            tag = 'damage-small'
            text = "Damage (small creature): $($WeaponRecord.damageSM)."
            sourceBook = 'data/weapons.json'
            sourcePage = ''
            sourceSnippet = "Small damage record for $($WeaponRecord.name)."
        }
    }

    if ($WeaponRecord.damageL) {
        $traits += [pscustomobject]@{
            tag = 'damage-large'
            text = "Damage (large creature): $($WeaponRecord.damageL)."
            sourceBook = 'data/weapons.json'
            sourcePage = ''
            sourceSnippet = "Large damage record for $($WeaponRecord.name)."
        }
    }

    if ($WeaponRecord.speedFactor) {
        $traits += [pscustomobject]@{
            tag = 'speed-factor'
            text = "Speed factor: $($WeaponRecord.speedFactor)."
            sourceBook = 'data/weapons.json'
            sourcePage = ''
            sourceSnippet = "Speed record for $($WeaponRecord.name)."
        }
    }

    if ($WeaponRecord.weight) {
        $traits += [pscustomobject]@{
            tag = 'weight'
            text = "Weight: $($WeaponRecord.weight) lbs."
            sourceBook = 'data/weapons.json'
            sourcePage = ''
            sourceSnippet = "Weight record for $($WeaponRecord.name)."
        }
    }

    if ($WeaponRecord.costGP) {
        $traits += [pscustomobject]@{
            tag = 'cost'
            text = "Cost: $($WeaponRecord.costGP) GP."
            sourceBook = 'data/weapons.json'
            sourcePage = ''
            sourceSnippet = "Cost record for $($WeaponRecord.name)."
        }
    }

    if ($WeaponRecord.handedness) {
        $traits += [pscustomobject]@{
            tag = 'handedness'
            text = "Handedness: $($WeaponRecord.handedness)."
            sourceBook = 'data/weapons.json'
            sourcePage = ''
            sourceSnippet = "Handedness record for $($WeaponRecord.name)."
        }
    }

    if ($WeaponRecord.reachFt) {
        $traits += [pscustomobject]@{
            tag = 'reach'
            text = "Reach: $($WeaponRecord.reachFt) ft."
            sourceBook = 'data/weapons.json'
            sourcePage = ''
            sourceSnippet = "Reach record for $($WeaponRecord.name)."
        }
    }

    if (($WeaponRecord.damageTypes | Measure-Object).Count -gt 0) {
        $traits += [pscustomobject]@{
            tag = 'damage-types'
            text = "Damage types: $(@($WeaponRecord.damageTypes) -join ', ')."
            sourceBook = 'data/weapons.json'
            sourcePage = ''
            sourceSnippet = "Damage type record for $($WeaponRecord.name)."
        }
    }

    return [pscustomobject]@{
        trace = $trace
        traits = @(Get-TraitList $traits)
    }
}

function Merge-WeaponTraits {
    param(
        [object]$WeaponRecord,
        [string]$BooksText,
        [switch]$Rebuild
    )

    $weaponResult = New-WeaponTrait -WeaponRecord $WeaponRecord -BooksText $BooksText
    $newWeaponTraits = if ($Rebuild) { @($weaponResult.traits) } else { @($WeaponRecord.weaponTraits) + @($weaponResult.traits) }
    $WeaponRecord.weaponTraits = @(Get-TraitList $newWeaponTraits | Select-Object -Unique -Property tag, text, sourceBook, sourcePage, sourceSnippet)

    return [pscustomobject]@{
        weapon = $WeaponRecord.name
        sourceHintCount = $weaponResult.trace.sourceHintCount
        sourceSample = $weaponResult.trace.sourceSample
    }
}

Assert-PathExists $WeaponsPath
Assert-PathExists $BooksPath

$weapons = Read-JsonFile $WeaponsPath
if (-not ($weapons -is [System.Collections.IEnumerable])) {
    throw 'weapons.json must contain an array of weapon records.'
}

$booksText = Get-Content -LiteralPath $BooksPath -Raw
$normalized = @()
$report = @()

foreach ($record in @($weapons)) {
    $weaponRecord = Get-WeaponRecord $record
    $report += Merge-WeaponTraits -WeaponRecord $weaponRecord -BooksText $booksText -Rebuild:$Rebuild
    $normalized += $weaponRecord
}

if (-not $DryRun) {
    Write-JsonFile -Path $WeaponsPath -Value $normalized
    Write-JsonFile -Path $ReportPath -Value $report
}

Write-Output "Validated weapons=$(@($normalized).Count) dryRun=$($DryRun.IsPresent) rebuild=$($Rebuild.IsPresent)"
Write-Output "Trace report entries=$(@($report).Count)"
