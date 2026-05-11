// ============================================================
// index-calc.js — Stat modifiers, THAC0, saves, AC, HP, encumbrance
// Depends on: index-data.js, index-char.js
// ============================================================

// General stat modifier (2e CON/standard table)
function getModifier(score) {
    if (score >= 18) return 4;
    if (score >= 17) return 3;
    if (score >= 16) return 2;
    if (score >= 15) return 1;
    if (score >= 7)  return 0;
    if (score >= 4)  return -1;
    return -2;
}

// DEX defensive adjustment for AC (negative lowers AC = good)
function getDexDefensiveAdj(dex) {
    if (dex >= 18) return -4;
    if (dex >= 17) return -3;
    if (dex >= 16) return -2;
    if (dex >= 15) return -1;
    if (dex >= 7)  return 0;
    if (dex >= 6)  return 1;
    if (dex >= 5)  return 2;
    if (dex >= 4)  return 3;
    return 4;
}

// DEX reaction adjustment for missile / initiative
function getDexReactionAdj(dex) {
    if (dex >= 19) return 3;
    if (dex >= 17) return 2;
    if (dex >= 16) return 1;
    if (dex >= 6)  return 0;
    if (dex >= 5)  return -1;
    if (dex >= 4)  return -2;
    return -3;
}

// STR to-hit bonus (PHB Table 1)
function getStrToHit(str, strPct) {
    if (str > 18) return 3;
    if (str === 18) {
        if (strPct >= 100) return 3;
        if (strPct >= 51)  return 2;
        return 1;
    }
    if (str === 17) return 1;
    if (str >= 8)   return 0;
    if (str >= 6)   return -1;
    if (str >= 4)   return -2;
    return -3;
}

// STR damage bonus (PHB Table 1)
function getStrDamage(str, strPct) {
    if (str > 18) return 7;
    if (str === 18) {
        if (strPct >= 100) return 6;
        if (strPct >= 91)  return 5;
        if (strPct >= 76)  return 4;
        if (strPct >= 51)  return 3;
        if (strPct >= 1)   return 3;
        return 2;
    }
    if (str === 17 || str === 16) return 1;
    if (str >= 6)  return 0;
    return -1;
}

// WIS bonus spell slots for divine casters: index = WIS, value = [+1st … +7th]
const WIS_BONUS_SPELLS = [
    [],[],[],[],[],[],[],[],[],[],[],[],[],
    [1,0,0,0,0,0,0],
    [2,0,0,0,0,0,0],
    [2,1,0,0,0,0,0],
    [2,2,0,0,0,0,0],
    [2,2,1,0,0,0,0],
    [2,2,2,0,0,0,0],
    [3,2,2,1,0,0,0],
    [3,2,3,2,0,0,0],
    [3,2,3,3,0,0,0],
    [3,2,3,3,1,0,0],
    [3,2,3,3,2,0,0],
    [3,2,3,3,2,1,0],
    [3,2,3,3,2,2,0],
];

function getBaseMovement(race) {
    return ["Dwarf", "Gnome", "Halfling"].includes(race) ? 6 : 12;
}

function enforceClassRestrictions() {
    const cls = charData.class;
    const classWarnings = [];
    const adjSTR = getAdjustedStat('STR');
    const adjWIS = getAdjustedStat('WIS');
    const adjCHA = getAdjustedStat('CHA');

    const autoUnequipMessages = reevaluatePrimaryCharacterEquipment();

    if (cls === "Paladin") {
        const align = document.getElementById('char-align').value;
        if (align !== "LG" || adjSTR < 12 || adjWIS < 13 || adjCHA < 17) {
            classWarnings.push("Paladin requires LG alignment and STR 12 / WIS 13 / CHA 17.");
        }
    }
    if (cls === "Druid") {
        const align = document.getElementById('char-align').value;
        if (align !== "N") classWarnings.push("Druid requires True Neutral alignment.");
    }

    if (autoUnequipMessages.length > 0) {
        showRulesBanner(autoUnequipMessages.join(' '));
        renderWearSlots();
    } else if (classWarnings.length > 0) {
        showRulesBanner(classWarnings.join(" "));
    }
}

function updateCalculations() {
    // Sync DOM → charData
    charData.name      = document.getElementById('char-name').value;
    charData.race      = document.getElementById('char-race').value;
    charData.class     = document.getElementById('char-class').value;
    charData.kit       = document.getElementById('char-kit').value;
    charData.level     = parseInt(document.getElementById('char-level').value) || 1;
    charData.encumMode = document.getElementById('encum-mode').value;

    syncLegacyEquipmentFields();

    enforceClassRestrictions();

    const adjSTR = getAdjustedStat('STR');
    const adjDEX = getAdjustedStat('DEX');
    const adjCON = getAdjustedStat('CON');
    const conMod      = getModifier(adjCON);
    const dexDefAdj   = getDexDefensiveAdj(adjDEX);
    const dexReaction = getDexReactionAdj(adjDEX);
    const strHit = getStrToHit(adjSTR, charData.stats.STR_Pct || 0);
    const strDmg = getStrDamage(adjSTR, charData.stats.STR_Pct || 0);

    // Ability modifier display
    document.querySelectorAll('.ability-mod-display').forEach(el => {
        const stat = el.dataset.stat;
        const mod = getModifier(getAdjustedStat(stat));
        el.innerText = (mod >= 0 ? "+" : "") + mod;
    });

    // THAC0
    let group = "Wizard";
    if (["Fighter", "Paladin", "Ranger"].includes(charData.class)) group = "Warrior";
    else if (["Cleric", "Druid"].includes(charData.class))         group = "Priest";
    else if (["Thief", "Bard"].includes(charData.class))           group = "Rogue";

    const thac0Row = THAC0_TABLE[group];
    const thac0 = thac0Row[Math.min(charData.level - 1, thac0Row.length - 1)];
    document.getElementById('val-thac0').innerText = thac0;
    document.getElementById('attack-matrix').innerHTML =
        `THAC0: ${thac0}<br>STR To-Hit: ${strHit >= 0 ? '+' : ''}${strHit}<br>` +
        `STR Damage: ${strDmg >= 0 ? '+' : ''}${strDmg}<br>DEX Reaction: ${dexReaction >= 0 ? '+' : ''}${dexReaction}`;

    renderSaves(group);

    // AC
    const armorObj  = armorTypes.find(a => a.name === charData.equipment.armor)  || armorTypes[0];
    const shieldObj = shieldTypes.find(s => s.name === charData.equipment.shield) || shieldTypes[0];
    const magic = parseInt(charData.equipment.magicBonus) || 0;
    document.getElementById('final-ac').value = armorObj.base + dexDefAdj - shieldObj.bonus - magic;

    // HP
    const hitDieMap = {
        Fighter: 10, Paladin: 10, Ranger: 10,
        Cleric: 8, Druid: 8,
        Thief: 6, Bard: 6,
        Mage: 4
    };
    const hitDie = hitDieMap[charData.class] || 8;
    let hpPerLevel = Math.max(1, hitDie / 2 + 0.5 + conMod);
    const maxHP = Math.floor(hpPerLevel * charData.level);
    document.getElementById('hp-max').value = maxHP;
    if (charData.hp.cur > maxHP) {
        charData.hp.cur = maxHP;
        document.getElementById('hp-cur').value = maxHP;
    }

    calculateEncumbrance();
    updateClassFeatures(thac0, group);
    updateRacialStatWarning();
    renderInventory();
}

function renderSaves(group) {
    const saves = [...SAVE_TABLE[group][Math.min(charData.level - 1, 14)]];
    const race = getCurrentRaceRecord();
    const bonuses = (race && race.savingThrowBonuses) ? race.savingThrowBonuses : {};
    const adjusted = [
        Math.max(0, saves[0] - (bonuses.poison        || 0)),
        Math.max(0, saves[1] - (bonuses.rodStaffWand  || 0)),
        Math.max(0, saves[2] - (bonuses.petrification || 0)),
        Math.max(0, saves[3] - (bonuses.breath        || 0)),
        Math.max(0, saves[4] - (bonuses.spell         || 0)),
    ];
    const labels = ["Par/Poison", "Rod/Staff", "Petrify", "Breath", "Spell"];
    document.getElementById('saving-throws-table').innerHTML =
        labels.map((l, i) => `<tr><td>${l}</td><td style="text-align:right; font-weight:bold;">${adjusted[i]}</td></tr>`).join('');
}

function calculateEncumbrance() {
    if (charData.encumMode === "off") {
        document.getElementById('encum-text').innerText = "Tracking Off";
        document.getElementById('encum-fill').style.width = "0%";
        return;
    }

    ensureEquipmentInventoryModel();

    let totalWeight = 0;
    getEquipmentContainers().forEach(container => {
        if (charData.encumMode !== "full" && container.kind === 'equip') return;
        totalWeight += getContainerWeight(container);
    });

    const str = getAdjustedStat('STR');
    let maxLoad = 30;
    if (str >= 18)      maxLoad = 130;
    else if (str >= 16) maxLoad = 100;
    else if (str >= 14) maxLoad = 70;
    else if (str >= 12) maxLoad = 50;
    if (["Dwarf", "Gnome"].includes(charData.race)) maxLoad *= 1.1;

    const pct = (totalWeight / maxLoad) * 100;
    document.getElementById('encum-fill').style.width = Math.min(pct, 100) + "%";

    const baseMv = getBaseMovement(charData.race);
    let mv = baseMv;
    let status = "Unencumbered";
    if (pct > 33)  { status = "Encumbered"; mv = Math.max(1, baseMv - 3); }
    if (pct > 66)  { status = "Severe";     mv = Math.max(1, baseMv - 6); }
    if (pct > 100) { status = "Overloaded"; mv = Math.max(1, baseMv - 9); }

    document.getElementById('encum-text').innerText = `${totalWeight.toFixed(1)} / ${maxLoad} lbs (${status}, MV:${mv})`;
    document.getElementById('val-mv').innerText = mv;
}
