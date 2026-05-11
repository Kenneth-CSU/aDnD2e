$ErrorActionPreference = 'Stop'

$itemsPath = 'data/items.json'
$weaponsPath = 'data/weapons.json'
$armourPath = 'data/armour.json'
$classPath = 'data/itemClassifications.json'
$booksPath = 'books/FullTextSearch.txt'
$reportPath = 'data/bookCorpusTrace.json'

$items = Get-Content $itemsPath -Raw | ConvertFrom-Json
$weapons = Get-Content $weaponsPath -Raw | ConvertFrom-Json
$armour = Get-Content $armourPath -Raw | ConvertFrom-Json
$classifications = Get-Content $classPath -Raw | ConvertFrom-Json
$bookText = Get-Content $booksPath -Raw

function UniqueList {
    param([object[]]$Values)
    if (-not $Values) { return @() }
    return @($Values | Where-Object { $_ -ne $null -and "$_".Trim() -ne '' } | Select-Object -Unique)
}

function DamageTypesFromText {
    param([string]$Text)
    $t = "$Text".ToLowerInvariant()
    $out = @()
    if ($t -match 'bludgeon') { $out += 'bludgeoning' }
    if ($t -match 'pierc') { $out += 'piercing' }
    if ($t -match 'slash') { $out += 'slashing' }
    if ($t -match 'special' -or $t -match 'ammunition') { $out += 'special' }
    return @(UniqueList $out)
}

function WeaponCategory {
    param($Weapon)
    $name = "$($Weapon.name)".ToLowerInvariant()
    if ($name -match 'arrow|bolt|bullet|needle') { return 'ammunition' }
    if ($name -match 'bow|crossbow|sling|blowgun') { return 'ranged' }
    if ($name -match 'dart|javelin|spear|trident') { return 'thrown' }
    return 'melee'
}

function WeaponRoles {
    param($Weapon)
    $name = "$($Weapon.name)".ToLowerInvariant()
    $roles = @('offense')
    if ($name -match 'bow|crossbow|sling|dart|javelin|needle|arrow|bolt|bullet') { $roles += 'support' }
    if ($name -match 'dagger|knife|main-gauche|wakizashi|stiletto|truncheon') { $roles += 'utility' }
    if ($name -match 'two-handed|great axe|halberd|bill|lance') { $roles += 'defense' }
    if ($name -match 'arrow|bolt|bullet|needle') { $roles += 'survival' }
    return @(UniqueList $roles)
}

function ArmourType {
    param($Armor)
    if ($Armor.isShield) { return 'shield' }
    $cat = "$($Armor.category)".ToLowerInvariant()
    if ($cat -match 'leather') { return 'light' }
    if ($cat -match 'chain') { return 'medium' }
    if ($cat -match 'plate') { return 'heavy' }
    return 'armor'
}

function ArmourRoles {
    param($Armor)
    $roles = @('defense')
    $category = "$($Armor.category)".ToLowerInvariant()
    $name = "$($Armor.name)".ToLowerInvariant()
    if ($Armor.isShield) { $roles += 'support' }
    if ($category -match 'leather' -or $name -match 'elven') { $roles += 'mobility' }
    if ($category -match 'plate') { $roles += 'survival' }
    return @(UniqueList $roles)
}

function ItemRoles {
    param($Item)
    $type = "$($Item.type)".ToLowerInvariant()
    $name = "$($Item.name)".ToLowerInvariant()
    $roles = @('utility')

    if ($type -eq 'weapon') { $roles += 'offense' }
    if ($type -eq 'armor' -or $type -eq 'shield') { $roles += 'defense' }
    if ($type -eq 'consumable') { $roles += 'survival' }
    if ($type -eq 'component') { $roles += 'arcane' }
    if ($type -eq 'tool') { $roles += 'crafting' }
    if ($type -eq 'treasure') { $roles += 'economy' }

    if ($name -match 'holy|wolfbane|garlic') { $roles += 'divine' }
    if ($name -match 'healing|antitoxin|potion') { $roles += 'healing' }
    if ($name -match 'rope|hook|torch|lantern|chalk|mirror|crowbar|hammer|tent|flint') { $roles += 'exploration' }
    if ($name -match 'book|spellbook|component|scroll|wand') { $roles += 'support' }

    return @(UniqueList $roles)
}

function CorpusTrace {
    param([string]$Name)
    if (-not $Name) { return @{ sourceHintCount = 0; sourceSample = '' } }
    $pattern = [regex]::Escape($Name)
    $matches = [regex]::Matches($bookText, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($matches.Count -eq 0) { return @{ sourceHintCount = 0; sourceSample = '' } }

    $idx = $matches[0].Index
    $start = [Math]::Max(0, $idx - 55)
    $len = [Math]::Min(140, $bookText.Length - $start)
    $sample = $bookText.Substring($start, $len).Replace("`r", ' ').Replace("`n", ' ')

    return @{ sourceHintCount = $matches.Count; sourceSample = $sample }
}

$classMap = @{}
foreach ($c in $classifications) {
    if ($c -and $c.name) { $classMap[$c.name.ToLowerInvariant()] = $c }
}

$report = @()

foreach ($w in $weapons) {
    if (-not $w -or -not $w.name) { continue }
    $damageTypes = DamageTypesFromText "$($w.type)"
    if ($damageTypes.Count -eq 0) { $damageTypes = @('special') }

    $weaponCategory = WeaponCategory $w
    $weaponRoles = WeaponRoles $w
    $reachFt = if ("$($w.name)" -match 'Halberd|Bill|Partisan|Fauchard|Lance|Spear|Trident') { 10 } else { 5 }
    $handedness = if ("$($w.name)" -match 'Two-Handed|Great Axe|Halberd|Bill|Lance') { 'two-handed' } else { 'one-handed' }

    $w | Add-Member -NotePropertyName weaponCategory -NotePropertyValue $weaponCategory -Force
    $w | Add-Member -NotePropertyName weaponRoles -NotePropertyValue $weaponRoles -Force
    $w | Add-Member -NotePropertyName damageTypes -NotePropertyValue $damageTypes -Force
    $w | Add-Member -NotePropertyName handedness -NotePropertyValue $handedness -Force
    $w | Add-Member -NotePropertyName reachFt -NotePropertyValue $reachFt -Force
    $w | Add-Member -NotePropertyName usageRole -NotePropertyValue 'combat' -Force
    $w | Add-Member -NotePropertyName modifierProfiles -NotePropertyValue @() -Force

    $trace = CorpusTrace "$($w.name)"
    $report += [pscustomobject]@{ source = 'weapon'; name = $w.name; sourceHintCount = $trace.sourceHintCount; sourceSample = $trace.sourceSample }

    $key = $w.name.ToLowerInvariant()
    $c = if ($classMap.ContainsKey($key)) { $classMap[$key] } else { [pscustomobject]@{ name = $w.name } }
    $c | Add-Member -NotePropertyName type -NotePropertyValue 'weapon' -Force
    $c | Add-Member -NotePropertyName itemCategory -NotePropertyValue $weaponCategory -Force
    $c | Add-Member -NotePropertyName itemSubcategory -NotePropertyValue "$($w.proficiencyGroup)" -Force
    $c | Add-Member -NotePropertyName roles -NotePropertyValue $weaponRoles -Force
    $c | Add-Member -NotePropertyName damageTypes -NotePropertyValue $damageTypes -Force
    $c | Add-Member -NotePropertyName modifierTypes -NotePropertyValue @('other') -Force
    $c | Add-Member -NotePropertyName modifierTargets -NotePropertyValue @('self') -Force
    $c | Add-Member -NotePropertyName modifierProfiles -NotePropertyValue @() -Force
    $c | Add-Member -NotePropertyName sourceHintCount -NotePropertyValue $trace.sourceHintCount -Force
    $classMap[$key] = $c
}

foreach ($a in $armour) {
    if (-not $a -or -not $a.name) { continue }

    $armourType = ArmourType $a
    $roles = ArmourRoles $a
    $modValue = [Math]::Max(1, 11 - [int]$a.baseAC)
    $modProfile = [pscustomobject]@{
        id = "mod-ac-$($a.name.ToLowerInvariant().Replace(' ','-').Replace('(','').Replace(')',''))"
        value = $modValue
        note = 'AC adjustment'
        modifierType = 'armorClass'
        target = 'self'
        role = 'defense'
        stackingRule = 'best-only'
        condition = 'while equipped'
        source = 'Armour profile'
    }

    $a | Add-Member -NotePropertyName armourType -NotePropertyValue $armourType -Force
    $a | Add-Member -NotePropertyName equipSlot -NotePropertyValue ($(if ($a.isShield) { 'shield' } else { 'body' })) -Force
    $a | Add-Member -NotePropertyName armourRoles -NotePropertyValue $roles -Force
    $a | Add-Member -NotePropertyName damageTypes -NotePropertyValue @('special') -Force
    $a | Add-Member -NotePropertyName modifierProfiles -NotePropertyValue @($modProfile) -Force

    $trace = CorpusTrace "$($a.name)"
    $report += [pscustomobject]@{ source = 'armour'; name = $a.name; sourceHintCount = $trace.sourceHintCount; sourceSample = $trace.sourceSample }

    $key = $a.name.ToLowerInvariant()
    $c = if ($classMap.ContainsKey($key)) { $classMap[$key] } else { [pscustomobject]@{ name = $a.name } }
    $c | Add-Member -NotePropertyName type -NotePropertyValue ($(if ($a.isShield) { 'shield' } else { 'armor' })) -Force
    $c | Add-Member -NotePropertyName itemCategory -NotePropertyValue $armourType -Force
    $c | Add-Member -NotePropertyName itemSubcategory -NotePropertyValue "$($a.category)" -Force
    $c | Add-Member -NotePropertyName roles -NotePropertyValue $roles -Force
    $c | Add-Member -NotePropertyName damageTypes -NotePropertyValue @('special') -Force
    $c | Add-Member -NotePropertyName modifierTypes -NotePropertyValue @('armorClass') -Force
    $c | Add-Member -NotePropertyName modifierTargets -NotePropertyValue @('self') -Force
    $c | Add-Member -NotePropertyName modifierProfiles -NotePropertyValue @($modProfile) -Force
    $c | Add-Member -NotePropertyName sourceHintCount -NotePropertyValue $trace.sourceHintCount -Force
    $classMap[$key] = $c
}

foreach ($it in $items) {
    if (-not $it -or -not $it.name) { continue }
    if (-not $it.type) { $it | Add-Member -NotePropertyName type -NotePropertyValue 'equipment' -Force }

    $itemType = "$($it.type)".ToLowerInvariant()
    $roles = ItemRoles $it
    $damageTypes = if ($itemType -eq 'weapon') { @('piercing') } else { @() }
    $usage = [pscustomobject]@{
        activation = 'action'
        duration = ''
        charges = 0
        recharge = ''
        consumableKind = $(if ($itemType -eq 'consumable') { 'single-use' } else { '' })
    }

    $modifierProfiles = @()
    if ("$($it.name)" -match 'Healing Potion') {
        $modifierProfiles = @([pscustomobject]@{
            id = 'mod-heal-potion'
            value = 1
            note = '2d4+1 HP restored'
            modifierType = 'hitPoints'
            target = 'self'
            role = 'healing'
            stackingRule = 'stack'
            condition = 'on consume'
            source = 'Items table'
        })
    } elseif ("$($it.name)" -match 'Holy Water') {
        $modifierProfiles = @([pscustomobject]@{
            id = 'mod-holy-water'
            value = 1
            note = 'Effective vs undead'
            modifierType = 'damage'
            target = 'vsUndead'
            role = 'divine'
            stackingRule = 'stack'
            condition = 'on hit'
            source = 'Items table'
        })
    }

    $it | Add-Member -NotePropertyName itemCategory -NotePropertyValue $itemType -Force
    $it | Add-Member -NotePropertyName itemSubcategory -NotePropertyValue '' -Force
    $it | Add-Member -NotePropertyName roles -NotePropertyValue $roles -Force
    $it | Add-Member -NotePropertyName damageTypes -NotePropertyValue $damageTypes -Force
    $it | Add-Member -NotePropertyName usage -NotePropertyValue $usage -Force
    $it | Add-Member -NotePropertyName modifierProfiles -NotePropertyValue $modifierProfiles -Force

    $trace = CorpusTrace "$($it.name)"
    $report += [pscustomobject]@{ source = 'item'; name = $it.name; sourceHintCount = $trace.sourceHintCount; sourceSample = $trace.sourceSample }

    $modifierTypes = @($modifierProfiles | ForEach-Object { "$($_.modifierType)" } | Where-Object { $_ })
    $modifierTargets = @($modifierProfiles | ForEach-Object { "$($_.target)" } | Where-Object { $_ })

    $key = $it.name.ToLowerInvariant()
    $c = if ($classMap.ContainsKey($key)) { $classMap[$key] } else { [pscustomobject]@{ name = $it.name } }
    $c | Add-Member -NotePropertyName type -NotePropertyValue "$itemType" -Force
    $c | Add-Member -NotePropertyName itemCategory -NotePropertyValue "$itemType" -Force
    $c | Add-Member -NotePropertyName itemSubcategory -NotePropertyValue '' -Force
    $c | Add-Member -NotePropertyName roles -NotePropertyValue $roles -Force
    $c | Add-Member -NotePropertyName damageTypes -NotePropertyValue $damageTypes -Force
    $c | Add-Member -NotePropertyName modifierTypes -NotePropertyValue (UniqueList $modifierTypes) -Force
    $c | Add-Member -NotePropertyName modifierTargets -NotePropertyValue (UniqueList $modifierTargets) -Force
    $c | Add-Member -NotePropertyName modifierProfiles -NotePropertyValue $modifierProfiles -Force
    $c | Add-Member -NotePropertyName sourceHintCount -NotePropertyValue $trace.sourceHintCount -Force
    $classMap[$key] = $c
}

$newClassifications = @($classMap.GetEnumerator() | ForEach-Object { $_.Value } | Sort-Object name)

$items | ConvertTo-Json -Depth 12 | Set-Content $itemsPath -Encoding UTF8
$weapons | ConvertTo-Json -Depth 12 | Set-Content $weaponsPath -Encoding UTF8
$armour | ConvertTo-Json -Depth 12 | Set-Content $armourPath -Encoding UTF8
$newClassifications | ConvertTo-Json -Depth 12 | Set-Content $classPath -Encoding UTF8
$report | Sort-Object source, name | ConvertTo-Json -Depth 8 | Set-Content $reportPath -Encoding UTF8

Write-Output "Updated: items=$($items.Count), weapons=$($weapons.Count), armour=$($armour.Count), classifications=$($newClassifications.Count), trace=$($report.Count)"
