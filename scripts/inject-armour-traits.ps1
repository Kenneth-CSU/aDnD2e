[CmdletBinding()]
param(
    [string]$ArmourPath = 'data/armour.json',
    [string]$BooksPath = 'books/FullTextSearch.txt',
    [string]$ReportPath = 'data/armourTraitTrace.json',
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

function Get-ArmourRecord {
    param([object]$ArmourRecord)

    $name = "$(($ArmourRecord.name))".Trim()
    if (-not $name) { throw 'An armour record is missing a name.' }

    [pscustomobject]@{
        name = $name
        baseAC = $ArmourRecord.baseAC
        maxDexBonus = $ArmourRecord.maxDexBonus
        weight = $ArmourRecord.weight
        costGP = $ArmourRecord.costGP
        category = "$(($ArmourRecord.category))".Trim()
        isShield = $ArmourRecord.isShield
        armourType = "$(($ArmourRecord.armourType))".Trim()
        equipSlot = "$(($ArmourRecord.equipSlot))".Trim()
        armourRoles = @($ArmourRecord.armourRoles)
        damageTypes = @($ArmourRecord.damageTypes)
        modifierProfiles = @($ArmourRecord.modifierProfiles)
        armourTraits = Get-TraitList $ArmourRecord.armourTraits
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

function New-ArmourTrait {
    param(
        [object]$ArmourRecord,
        [string]$BooksText
    )

    $trace = Get-CorpusTrace -Term $ArmourRecord.name -Text $BooksText
    $traits = @()

    $traits += [pscustomobject]@{
        tag = 'identity'
        text = "$($ArmourRecord.name) armour or shield with AC and encumbrance properties."
        sourceBook = 'books/FullTextSearch.txt'
        sourcePage = ''
        sourceSnippet = $trace.sourceSample
    }

    if ($null -ne $ArmourRecord.baseAC) {
        $traits += [pscustomobject]@{
            tag = 'armor-class'
            text = "Base AC: $($ArmourRecord.baseAC)."
            sourceBook = 'data/armour.json'
            sourcePage = ''
            sourceSnippet = "AC record for $($ArmourRecord.name)."
        }
    }

    if ($null -ne $ArmourRecord.maxDexBonus) {
        $traits += [pscustomobject]@{
            tag = 'dex-bonus'
            text = "Maximum DEX bonus applies: $($ArmourRecord.maxDexBonus)."
            sourceBook = 'data/armour.json'
            sourcePage = ''
            sourceSnippet = "DEX bonus record for $($ArmourRecord.name)."
        }
    }

    if ($ArmourRecord.weight) {
        $traits += [pscustomobject]@{
            tag = 'weight'
            text = "Weight: $($ArmourRecord.weight) lbs."
            sourceBook = 'data/armour.json'
            sourcePage = ''
            sourceSnippet = "Weight record for $($ArmourRecord.name)."
        }
    }

    if ($ArmourRecord.costGP) {
        $traits += [pscustomobject]@{
            tag = 'cost'
            text = "Cost: $($ArmourRecord.costGP) GP."
            sourceBook = 'data/armour.json'
            sourcePage = ''
            sourceSnippet = "Cost record for $($ArmourRecord.name)."
        }
    }

    if ($ArmourRecord.isShield) {
        $traits += [pscustomobject]@{
            tag = 'shield-flag'
            text = 'This item is equipped as a shield.'
            sourceBook = 'data/armour.json'
            sourcePage = ''
            sourceSnippet = "Shield record for $($ArmourRecord.name)."
        }
    }

    if ($ArmourRecord.armourType) {
        $traits += [pscustomobject]@{
            tag = 'armor-type'
            text = "Armour type: $($ArmourRecord.armourType)."
            sourceBook = 'data/armour.json'
            sourcePage = ''
            sourceSnippet = "Type record for $($ArmourRecord.name)."
        }
    }

    if (($ArmourRecord.armourRoles | Measure-Object).Count -gt 0) {
        $traits += [pscustomobject]@{
            tag = 'roles'
            text = "Roles: $(@($ArmourRecord.armourRoles) -join ', ')."
            sourceBook = 'data/armour.json'
            sourcePage = ''
            sourceSnippet = "Role classifications for $($ArmourRecord.name)."
        }
    }

    return [pscustomobject]@{
        trace = $trace
        traits = @(Get-TraitList $traits)
    }
}

function Merge-ArmourTraits {
    param(
        [object]$ArmourRecord,
        [string]$BooksText,
        [switch]$Rebuild
    )

    $armourResult = New-ArmourTrait -ArmourRecord $ArmourRecord -BooksText $BooksText
    $newArmourTraits = if ($Rebuild) { @($armourResult.traits) } else { @($ArmourRecord.armourTraits) + @($armourResult.traits) }
    $ArmourRecord.armourTraits = @(Get-TraitList $newArmourTraits | Select-Object -Unique -Property tag, text, sourceBook, sourcePage, sourceSnippet)

    return [pscustomobject]@{
        armour = $ArmourRecord.name
        sourceHintCount = $armourResult.trace.sourceHintCount
        sourceSample = $armourResult.trace.sourceSample
    }
}

Assert-PathExists $ArmourPath
Assert-PathExists $BooksPath

$armour = Read-JsonFile $ArmourPath
if (-not ($armour -is [System.Collections.IEnumerable])) {
    throw 'armour.json must contain an array of armour records.'
}

$booksText = Get-Content -LiteralPath $BooksPath -Raw
$normalized = @()
$report = @()

foreach ($record in @($armour)) {
    $armourRecord = Get-ArmourRecord $record
    $report += Merge-ArmourTraits -ArmourRecord $armourRecord -BooksText $booksText -Rebuild:$Rebuild
    $normalized += $armourRecord
}

if (-not $DryRun) {
    Write-JsonFile -Path $ArmourPath -Value $normalized
    Write-JsonFile -Path $ReportPath -Value $report
}

Write-Output "Validated armour=$(@($normalized).Count) dryRun=$($DryRun.IsPresent) rebuild=$($Rebuild.IsPresent)"
Write-Output "Trace report entries=$(@($report).Count)"
