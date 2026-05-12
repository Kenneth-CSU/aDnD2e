[CmdletBinding()]
param(
    [string]$ItemsPath = 'data/items.json',
    [string]$BooksPath = 'books/FullTextSearch.txt',
    [string]$ReportPath = 'data/itemsTraitTrace.json',
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

function Get-ItemRecord {
    param([object]$ItemRecord)

    $name = "$(($ItemRecord.name))".Trim()
    if (-not $name) { throw 'An item record is missing a name.' }

    [pscustomobject]@{
        name = $name
        weight = $ItemRecord.weight
        costGP = $ItemRecord.costGP
        description = "$(($ItemRecord.description))".Trim()
        type = "$(($ItemRecord.type))".Trim()
        itemCategory = "$(($ItemRecord.itemCategory))".Trim()
        itemSubcategory = "$(($ItemRecord.itemSubcategory))".Trim()
        roles = @($ItemRecord.roles)
        damageTypes = @($ItemRecord.damageTypes)
        usage = if ($null -eq $ItemRecord.usage) { @{} } else { $ItemRecord.usage }
        modifierProfiles = @($ItemRecord.modifierProfiles)
        itemTraits = Get-TraitList $ItemRecord.itemTraits
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

function New-ItemTrait {
    param(
        [object]$ItemRecord,
        [string]$BooksText
    )

    $trace = Get-CorpusTrace -Term $ItemRecord.name -Text $BooksText
    $traits = @()

    $traits += [pscustomobject]@{
        tag = 'identity'
        text = "$($ItemRecord.name) equipment record with cost and properties."
        sourceBook = 'books/FullTextSearch.txt'
        sourcePage = ''
        sourceSnippet = $trace.sourceSample
    }

    if ($ItemRecord.weight) {
        $traits += [pscustomobject]@{
            tag = 'weight'
            text = "Weight: $($ItemRecord.weight) lbs."
            sourceBook = 'data/items.json'
            sourcePage = ''
            sourceSnippet = "Weight record for $($ItemRecord.name)."
        }
    }

    if ($ItemRecord.costGP) {
        $traits += [pscustomobject]@{
            tag = 'cost'
            text = "Cost: $($ItemRecord.costGP) GP."
            sourceBook = 'data/items.json'
            sourcePage = ''
            sourceSnippet = "Cost record for $($ItemRecord.name)."
        }
    }

    if ($ItemRecord.description) {
        $traits += [pscustomobject]@{
            tag = 'description'
            text = $ItemRecord.description
            sourceBook = 'data/items.json'
            sourcePage = ''
            sourceSnippet = "Description for $($ItemRecord.name)."
        }
    }

    if (($ItemRecord.roles | Measure-Object).Count -gt 0) {
        $traits += [pscustomobject]@{
            tag = 'roles'
            text = "Roles: $(@($ItemRecord.roles) -join ', ')."
            sourceBook = 'data/items.json'
            sourcePage = ''
            sourceSnippet = "Role classifications for $($ItemRecord.name)."
        }
    }

    if (($ItemRecord.damageTypes | Measure-Object).Count -gt 0) {
        $traits += [pscustomobject]@{
            tag = 'damage-types'
            text = "Damage types: $(@($ItemRecord.damageTypes) -join ', ')."
            sourceBook = 'data/items.json'
            sourcePage = ''
            sourceSnippet = "Damage type record for $($ItemRecord.name)."
        }
    }

    return [pscustomobject]@{
        trace = $trace
        traits = @(Get-TraitList $traits)
    }
}

function Merge-ItemTraits {
    param(
        [object]$ItemRecord,
        [string]$BooksText,
        [switch]$Rebuild
    )

    $itemResult = New-ItemTrait -ItemRecord $ItemRecord -BooksText $BooksText
    $newItemTraits = if ($Rebuild) { @($itemResult.traits) } else { @($ItemRecord.itemTraits) + @($itemResult.traits) }
    $ItemRecord.itemTraits = @(Get-TraitList $newItemTraits | Select-Object -Unique -Property tag, text, sourceBook, sourcePage, sourceSnippet)

    return [pscustomobject]@{
        item = $ItemRecord.name
        sourceHintCount = $itemResult.trace.sourceHintCount
        sourceSample = $itemResult.trace.sourceSample
    }
}

Assert-PathExists $ItemsPath
Assert-PathExists $BooksPath

$items = Read-JsonFile $ItemsPath
if (-not ($items -is [System.Collections.IEnumerable])) {
    throw 'items.json must contain an array of item records.'
}

$booksText = Get-Content -LiteralPath $BooksPath -Raw
$normalized = @()
$report = @()

foreach ($record in @($items)) {
    $itemRecord = Get-ItemRecord $record
    $report += Merge-ItemTraits -ItemRecord $itemRecord -BooksText $booksText -Rebuild:$Rebuild
    $normalized += $itemRecord
}

if (-not $DryRun) {
    Write-JsonFile -Path $ItemsPath -Value $normalized
    Write-JsonFile -Path $ReportPath -Value $report
}

Write-Output "Validated items=$(@($normalized).Count) dryRun=$($DryRun.IsPresent) rebuild=$($Rebuild.IsPresent)"
Write-Output "Trace report entries=$(@($report).Count)"
