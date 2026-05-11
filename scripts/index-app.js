function populateDropdowns() {
    const raceSel = document.getElementById('char-race');
    raceSel.innerHTML = '';
    raceList.forEach(r => raceSel.add(new Option(r, r)));

    if (!raceList.includes(charData.race)) {
        charData.race = raceList[0] || "Human";
    }
    raceSel.value = charData.race;

    enforceRaceClassRules(false);
    renderWearSlots();
}

function normalizeArmorName(name) {
    const key = String(name || "None").trim().toLowerCase();
    return ARMOR_NAME_MAP[key] || "None";
}

function normalizeShieldName(name) {
    const key = String(name || "None").trim().toLowerCase();
    return SHIELD_NAME_MAP[key] || "None";
}

function showRulesBanner(message) {
    const banner = document.getElementById('rules-banner');
    if (!banner) return;
    if (message) {
        banner.textContent = message;
        banner.classList.add('show');
    } else {
        banner.textContent = '';
        banner.classList.remove('show');
    }
}

function getAllowedClassesForRace(race) {
    const allowed = raceClassRules[race];
    // An empty or missing allowed list means the race can be any class.
    // This is also the correct post-load filter point: classList is guaranteed
    // to be populated by the time populateDropdowns() calls this.
    if (!allowed || allowed.length === 0) return [...classList];
    return classList.filter(cls => allowed.includes(cls));
}

function getCurrentRaceRecord() {
    return raceData[charData.race] || null;
}

function getRaceStatAdj(stat) {
    const race = getCurrentRaceRecord();
    if (!race) return 0;
    const map = {
        STR: 'strAdj',
        DEX: 'dexAdj',
        CON: 'conAdj',
        INT: 'intAdj',
        WIS: 'wisAdj',
        CHA: 'chaAdj'
    };
    const key = map[stat];
    return key ? (race[key] || 0) : 0;
}

function getAdjustedStat(stat) {
    const base = parseInt(charData.stats[stat], 10) || 0;
    const adjusted = base + getRaceStatAdj(stat);
    return Math.max(1, Math.min(25, adjusted));
}

function getRacialStatBounds(stat) {
    const race = getCurrentRaceRecord();
    if (!race) return { min: 3, max: 25 };

    const map = {
        STR: ['minStr', 'maxStr'],
        DEX: ['minDex', 'maxDex'],
        CON: ['minCon', 'maxCon'],
        INT: ['minInt', 'maxInt'],
        WIS: ['minWis', 'maxWis'],
        CHA: ['minCha', 'maxCha']
    };

    const keys = map[stat];
    if (!keys) return { min: 3, max: 25 };

    const min = typeof race[keys[0]] === 'number' ? race[keys[0]] : 3;
    const max = typeof race[keys[1]] === 'number' ? race[keys[1]] : 25;
    return { min, max };
}

function getRacialStatViolations() {
    const stats = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
    const violations = [];

    stats.forEach(stat => {
        const adjusted = getAdjustedStat(stat);
        const bounds = getRacialStatBounds(stat);
        if (adjusted < bounds.min || adjusted > bounds.max) {
            violations.push(`${stat} ${adjusted} (allowed ${bounds.min}-${bounds.max})`);
        }
    });

    return violations;
}

function updateRacialStatWarning() {
    const violations = getRacialStatViolations();
    const raceName = charData.race || 'Current race';
    const statMsg = violations.length > 0
        ? `Stat bounds: ${raceName} requires ${violations.join('; ')}`
        : '';

    const banner = document.getElementById('rules-banner');
    const current = banner && banner.classList.contains('show') ? (banner.textContent || '').trim() : '';
    const marker = ' | Stat bounds:';

    if (statMsg) {
        if (!current) {
            showRulesBanner(statMsg);
            return;
        }

        if (current.startsWith('Stat bounds:')) {
            showRulesBanner(statMsg);
            return;
        }

        const markerIdx = current.indexOf(marker);
        if (markerIdx >= 0) {
            showRulesBanner(`${current.slice(0, markerIdx)}${marker}${statMsg.slice('Stat bounds:'.length)}`);
            return;
        }

        showRulesBanner(`${current}${marker}${statMsg.slice('Stat bounds:'.length)}`);
        return;
    }

    if (!current) return;
    if (current.startsWith('Stat bounds:')) {
        showRulesBanner('');
        return;
    }

    const markerIdx = current.indexOf(marker);
    if (markerIdx >= 0) {
        showRulesBanner(current.slice(0, markerIdx));
    }
}

function enforceRaceClassRules(showNotice) {
    const classSel = document.getElementById('char-class');
    const race = document.getElementById('char-race').value;
    const allowedClasses = getAllowedClassesForRace(race);
    const previousClass = classSel.value || charData.class;

    classSel.innerHTML = '';
    allowedClasses.forEach(cls => classSel.add(new Option(cls, cls)));

    const nextClass = allowedClasses.includes(previousClass) ? previousClass : (allowedClasses[0] || "");
    classSel.value = nextClass;
    charData.class = nextClass;

    if (showNotice && previousClass && previousClass !== nextClass) {
        showRulesBanner(`${race} cannot be ${previousClass}. Class changed to ${nextClass}.`);
    } else if (!showNotice || previousClass === nextClass) {
        showRulesBanner('');
    }
}

function handleRaceChange() {
    enforceRaceClassRules(true);
    handleClassChange();
}

function handleClassChange() {
    enforceRaceClassRules(false);
    const cls = document.getElementById('char-class').value;
    const kitSel = document.getElementById('char-kit');
    kitSel.innerHTML = '<option value="">None</option>';
    
    if (kitsByClass[cls]) {
        kitsByClass[cls].forEach(k => kitSel.add(new Option(k, k)));
    }
    
    // Auto-equip starter kit if level 1 and empty
    if (charData.level === 1 && charData.equipment.loose.length === 0 && Object.keys(charData.equipment.worn).length === 0) {
        applyStarterKit(cls);
    }
    
    renderAbilities();
    updateCalculations();
}

function applyStarterKit(cls) {
    const kit = STARTING_KITS[cls];
    if (!kit) return;
    
    kit.forEach(item => {
        const armor = normalizeArmorName(item.name);
        const shield = normalizeShieldName(item.name);
        if (armor !== "None" || item.name === "Robes") {
            charData.equipment.armor = armor;
        } else if (shield !== "None") {
            charData.equipment.shield = shield;
        } else {
            charData.equipment.loose.push({...item, id: Date.now()+Math.random()});
        }
    });
}

// --- CALCULATIONS ---

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

// DEX defensive adj for AC (negative = good/lowers AC, positive = bad/raises AC)
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

// DEX reaction adj for missile attacks / initiative bonus
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
        if (strPct >= 100) return 3; // 18/00
        if (strPct >= 51)  return 2; // 18/51-99
        return 1;                    // 18/01-50 and plain 18
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
        if (strPct >= 100) return 6; // 18/00
        if (strPct >= 91)  return 5; // 18/91-99
        if (strPct >= 76)  return 4; // 18/76-90
        if (strPct >= 51)  return 3; // 18/51-75
        if (strPct >= 1)   return 3; // 18/01-50
        return 2;                    // plain 18
    }
    if (str === 17 || str === 16) return 1;
    if (str >= 6)  return 0;
    return -1;
}

// WIS bonus spell slots for divine casters: index = WIS score, value = [+1st,+2nd,+3rd,+4th,+5th,+6th,+7th]
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
    let changed = false;
    let classWarnings = [];
    const adjSTR = getAdjustedStat('STR');
    const adjWIS = getAdjustedStat('WIS');
    const adjCHA = getAdjustedStat('CHA');

    const armor = charData.equipment.armor;
    const shield = charData.equipment.shield;

    if (cls === "Mage" && armor !== "None") {
        charData.equipment.armor = "None";
        changed = true;
    }
    if (cls === "Thief" && !["None", "Leather Armor", "Studded Leather", "Padded Armor"].includes(armor)) {
        charData.equipment.armor = "None";
        changed = true;
    }
    if (cls === "Ranger" && !["None", "Leather Armor", "Studded Leather", "Padded Armor", "Hide Armor", "Chainmail"].includes(armor)) {
        charData.equipment.armor = "None";
        changed = true;
    }
    if (cls === "Druid" && !["None", "Leather Armor", "Studded Leather", "Padded Armor", "Hide Armor"].includes(armor)) {
        charData.equipment.armor = "None";
        changed = true;
    }
    if (cls === "Druid" && !["None", "Small Shield"].includes(shield)) {
        charData.equipment.shield = "None";
        changed = true;
    }

    if (cls === "Paladin") {
        const align = document.getElementById('char-align').value;
        if (align !== "LG" || adjSTR < 12 || adjWIS < 13 || adjCHA < 17) {
            classWarnings.push("Paladin requires LG alignment and STR 12 / WIS 13 / CHA 17.");
        }
    }
    if (cls === "Druid") {
        const align = document.getElementById('char-align').value;
        if (align !== "N") {
            classWarnings.push("Druid requires True Neutral alignment.");
        }
    }

    if (changed) {
        showRulesBanner("Class restrictions adjusted equipment/class to valid AD&D 2e values.");
        renderWearSlots();
    } else if (classWarnings.length > 0) {
        showRulesBanner(classWarnings.join(" "));
    }
}

function updateCalculations() {
    // Sync DOM
    charData.name = document.getElementById('char-name').value;
    charData.race = document.getElementById('char-race').value;
    charData.class = document.getElementById('char-class').value;
    charData.kit = document.getElementById('char-kit').value;
    charData.level = parseInt(document.getElementById('char-level').value) || 1;
    charData.encumMode = document.getElementById('encum-mode').value;

    enforceClassRestrictions();

    const adjSTR = getAdjustedStat('STR');
    const adjDEX = getAdjustedStat('DEX');
    const adjCON = getAdjustedStat('CON');
    const strMod = getModifier(adjSTR);
    const dexDefAdj = getDexDefensiveAdj(adjDEX);
    const conMod = getModifier(adjCON);
    const dexReaction = getDexReactionAdj(adjDEX);
    const strHit = getStrToHit(adjSTR, charData.stats.STR_Pct || 0);
    const strDmg = getStrDamage(adjSTR, charData.stats.STR_Pct || 0);

    // Update UI Modifiers
    document.querySelectorAll('.ability-mod-display').forEach(el => {
        const stat = el.dataset.stat;
        let adjusted = getAdjustedStat(stat);
        let stdMod = getModifier(adjusted);
        el.innerText = (stdMod >= 0 ? "+" : "") + stdMod;
    });

    // THAC0
    let group = "Wizard";
    if (["Fighter", "Paladin", "Ranger"].includes(charData.class)) group = "Warrior";
    else if (["Cleric", "Druid"].includes(charData.class)) group = "Priest";
    else if (["Thief", "Bard"].includes(charData.class)) group = "Rogue";

    const thac0Row = THAC0_TABLE[group];
    const thac0 = thac0Row[Math.min(charData.level - 1, thac0Row.length - 1)];

    document.getElementById('val-thac0').innerText = thac0;
    document.getElementById('attack-matrix').innerHTML = `THAC0: ${thac0}<br>STR To-Hit: ${strHit >= 0 ? '+' : ''}${strHit}<br>STR Damage: ${strDmg >= 0 ? '+' : ''}${strDmg}<br>DEX Reaction: ${dexReaction >= 0 ? '+' : ''}${dexReaction}`;

    // Saves
    renderSaves(group);

    // AC
    const armorObj = armorTypes.find(a => a.name === charData.equipment.armor) || armorTypes[0];
    const shieldObj = shieldTypes.find(s => s.name === charData.equipment.shield) || shieldTypes[0];
    const magic = parseInt(charData.equipment.magicBonus) || 0;
    const finalAC = armorObj.base + dexDefAdj - shieldObj.bonus - magic;
    document.getElementById('final-ac').value = finalAC;

    // HP
    let hitDie = 8;
    if (["Fighter", "Paladin", "Ranger"].includes(charData.class)) hitDie = 10;
    if (["Cleric", "Druid"].includes(charData.class)) hitDie = 8;
    if (["Thief", "Bard"].includes(charData.class)) hitDie = 6;
    if (charData.class === "Mage") hitDie = 4;

    let hpPerLevel = (hitDie / 2 + 0.5) + conMod;
    if (hpPerLevel < 1) hpPerLevel = 1;
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
        Math.max(0, saves[0] - (bonuses.poison || 0)),
        Math.max(0, saves[1] - (bonuses.rodStaffWand || 0)),
        Math.max(0, saves[2] - (bonuses.petrification || 0)),
        Math.max(0, saves[3] - (bonuses.breath || 0)),
        Math.max(0, saves[4] - (bonuses.spell || 0)),
    ];
    const labels = ["Par/Poison", "Rod/Staff", "Petrify", "Breath", "Spell"];
    let html = "";
    labels.forEach((l, i) => {
        html += `<tr><td>${l}</td><td style="text-align:right; font-weight:bold;">${adjusted[i]}</td></tr>`;
    });
    document.getElementById('saving-throws-table').innerHTML = html;
}

function updateClassFeatures(thac0, group) {
    // Thief Skills
    const thiefBlock = document.getElementById('thief-skills-block');
    if (charData.class === "Thief" || charData.class === "Bard") {
        thiefBlock.classList.remove('hidden');
        const race = getCurrentRaceRecord();
        const raceMods = (race && race.thiefSkillMods) ? race.thiefSkillMods : {};
        const cls = classData[charData.class] || null;
        const thiefBase = (cls && cls.thiefBase) ? cls.thiefBase : null;
        const levelIdx = Math.max(0, Math.min(charData.level - 1, 19));
        const skills = [
            {id:"PP", name:"Pick Pockets", classKey:"pickPockets", raceKey:"pickPockets"},
            {id:"OL", name:"Open Locks", classKey:"openLocks", raceKey:"openLocks"},
            {id:"FRT", name:"Find Traps", classKey:"findTraps", raceKey:"findTraps"},
            {id:"MS", name:"Move Silent", classKey:"moveSilently", raceKey:"moveSilently"},
            {id:"HS", name:"Hide", classKey:"hideShadows", raceKey:"hideShadows"},
            {id:"DN", name:"Detect Noise", classKey:"detectNoise", raceKey:"detectNoise"},
            {id:"CW", name:"Climb Walls", classKey:"climbWalls", raceKey:"climbWalls"},
            {id:"RL", name:"Read Lang", classKey:"readLanguages", raceKey:"readLanguages"}
        ];

        let html = "";
        skills.forEach(s => {
            let val = 0;
            if (thiefBase && Array.isArray(thiefBase[s.classKey])) {
                val = thiefBase[s.classKey][Math.min(levelIdx, thiefBase[s.classKey].length - 1)] || 0;
            } else {
                val = THIEF_BASE[s.id] + ((charData.level - 1) * THIEF_INCREASE[s.id]);
            }
            val += (raceMods[s.raceKey] || 0);
            if (val > 95) val = 95;
            if (val < 0) val = 0;
            html += `<div class="item-row"><span>${s.name}</span><span>${val}%</span></div>`;
        });
        document.getElementById('thief-skills-list').innerHTML = html;
    } else {
        thiefBlock.classList.add('hidden');
    }

    // Spells from class data
    const spellBlock = document.getElementById('spell-slots-block');
    if (["Mage", "Cleric", "Druid", "Bard", "Paladin", "Ranger"].includes(charData.class)) {
        spellBlock.classList.remove('hidden');
        const rec = classData[charData.class];
        const row = rec && Array.isArray(rec.spellSlots) ? rec.spellSlots[Math.min(charData.level - 1, rec.spellSlots.length - 1)] : null;
        let slots = Array.isArray(row) ? [...row] : [];

        if (["Cleric", "Druid"].includes(charData.class)) {
            const wis = Math.max(0, Math.min(25, getAdjustedStat('WIS') || 0));
            const bonus = WIS_BONUS_SPELLS[wis] || [];
            const count = Math.max(slots.length, bonus.length);
            for (let i = 0; i < count; i++) {
                slots[i] = (slots[i] || 0) + (bonus[i] || 0);
            }
        }

        let html = "<div style='display:grid; grid-template-columns:1fr 1fr; gap:5px;'>";
        slots.forEach((n, idx) => {
            if ((n || 0) > 0) {
                html += `<label>Lvl ${idx + 1}: <input type="number" value="${n}" style="width:40px;"></label>`;
            }
        });
        if (html === "<div style='display:grid; grid-template-columns:1fr 1fr; gap:5px;'>") {
            html += "<span style='grid-column:1/-1; font-size:0.75rem;'>No spells at this level.</span>";
        }
        html += "</div>";
        document.getElementById('spell-slots-list').innerHTML = html;
    } else {
        spellBlock.classList.add('hidden');
    }

    // Backstab
    if (charData.class === "Thief") {
        let mult = 2;
        if (charData.level >= 5) mult = 3;
        if (charData.level >= 9) mult = 4;
        if (charData.level >= 13) mult = 5;
        document.getElementById('val-backstab').innerText = "x" + mult;
    } else {
        document.getElementById('val-backstab').innerText = "-";
    }

    // Turn Undead
    if (["Cleric", "Paladin"].includes(charData.class)) {
        const rec = classData[charData.class];
        const turnRow = rec && Array.isArray(rec.turnTable) ? rec.turnTable : null;
        if (turnRow && turnRow.length > 0) {
            document.getElementById('val-turn').innerText = turnRow[Math.min(charData.level - 1, turnRow.length - 1)] || "-";
        } else {
            document.getElementById('val-turn').innerText = "-";
        }
    } else {
        document.getElementById('val-turn').innerText = "-";
    }

    renderProficiencies();
}

function calculateEncumbrance() {
    if (charData.encumMode === "off") {
        document.getElementById('encum-text').innerText = "Tracking Off";
        document.getElementById('encum-fill').style.width = "0%";
        return;
    }

    let totalWeight = 0;
    if (charData.encumMode === "full") {
        Object.values(charData.equipment.worn).forEach(i => totalWeight += (i.weight||0));
        charData.equipment.loose.forEach(i => totalWeight += (i.weight||0));
        charData.equipment.containers.forEach(c => {
            c.items.forEach(i => totalWeight += (i.weight||0));
            totalWeight += (c.baseWeight||0);
        });
    } else {
        charData.equipment.loose.forEach(i => totalWeight += (i.weight||0));
        charData.equipment.containers.forEach(c => {
            c.items.forEach(i => totalWeight += (i.weight||0));
            totalWeight += (c.baseWeight||0);
        });
    }

    const str = getAdjustedStat('STR');
    let maxLoad = 30;
    if (str >= 18) maxLoad = 130;
    else if (str >= 16) maxLoad = 100;
    else if (str >= 14) maxLoad = 70;
    else if (str >= 12) maxLoad = 50;
    
    if (["Dwarf", "Gnome"].includes(charData.race)) maxLoad *= 1.1;

    const pct = (totalWeight / maxLoad) * 100;
    const fill = document.getElementById('encum-fill');
    const text = document.getElementById('encum-text');
    
    fill.style.width = Math.min(pct, 100) + "%";
    
    let status = "Unencumbered";
    const baseMv = getBaseMovement(charData.race);
    let mv = baseMv;
    if (pct > 33) { status = "Encumbered"; mv = Math.max(1, baseMv - 3); }
    if (pct > 66) { status = "Severe"; mv = Math.max(1, baseMv - 6); }
    if (pct > 100) { status = "Overloaded"; mv = Math.max(1, baseMv - 9); }
    
    text.innerText = `${totalWeight.toFixed(1)} / ${maxLoad} lbs (${status}, MV:${mv})`;
    document.getElementById('val-mv').innerText = mv;
}

// --- RENDER HELPERS ---

function renderAbilities() {
    const container = document.getElementById('abilities-container');
    const stats = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
    let html = "";
    
    stats.forEach(stat => {
        let subInput = "";
        if (stat === "STR" && ["Fighter", "Paladin", "Ranger"].includes(charData.class)) {
            subInput = `<input type="number" class="ability-sub" value="${charData.stats.STR_Pct}" min="0" max="100" onchange="updateStat('${stat}_Pct', this.value)" style="width:30px; text-align:center;">`;
        }
        
        html += `
        <div class="ability-card">
            <div class="ability-title">${stat}</div>
            <input type="number" class="ability-score" value="${getAdjustedStat(stat)}" min="3" max="25" onchange="updateStat('${stat}', this.value)">
            <div class="ability-mod-display" data-stat="${stat}">+0</div>
            <div>${subInput}</div>
        </div>`;
    });
    container.innerHTML = html;
}

function updateStat(stat, val) {
    if (stat === "STR_Pct") {
        charData.stats.STR_Pct = parseInt(val, 10) || 0;
    } else {
        const entered = parseInt(val, 10);
        if (Number.isFinite(entered)) {
            // Inputs show race-adjusted scores; store base score so race changes are reversible.
            const base = entered - getRaceStatAdj(stat);
            charData.stats[stat] = Math.max(1, Math.min(25, base));
        }
    }
    updateCalculations();
}

function renderWearSlots() {
    const slots = [
        {id: "head", label: "Head"},
        {id: "body", label: "Body (Armor)"},
        {id: "shield", label: "Shield"},
        {id: "hands", label: "Hands"},
        {id: "belt", label: "Belt"}
    ];
    
    let html = "";
    slots.forEach(slot => {
        const item = charData.equipment.worn[slot.id];
        
        let content = "";
        if (slot.id === "body") {
            content = `<select onchange="changeArmor(this.value)" style="width:100%; font-size:0.75rem;">
                ${armorTypes.map(a => `<option value="${a.name}" ${charData.equipment.armor === a.name ? 'selected':''}>${a.name}</option>`).join('')}
            </select>`;
        } else if (slot.id === "shield") {
            content = `<select onchange="changeShield(this.value)" style="width:100%; font-size:0.75rem;">
                ${shieldTypes.map(s => `<option value="${s.name}" ${charData.equipment.shield === s.name ? 'selected':''}>${s.name}</option>`).join('')}
            </select>`;
        } else {
            content = item ? item.name : "Empty";
        }

        const btn = (slot.id !== 'body' && slot.id !== 'shield' && item) 
            ? `<button style="padding:2px 5px; font-size:0.6rem;" onclick="unequipItem('${slot.id}')">Unequip</button>` 
            : "";

        html += `
        <div class="wear-slot">
            <span style="font-size:0.7rem; font-weight:bold;">${slot.label}</span>
            <div style="flex:1; margin:0 5px; overflow:hidden; text-overflow:ellipsis;">${content}</div>
            ${btn}
        </div>`;
    });
    document.getElementById('wear-slots').innerHTML = html;
}

function changeArmor(val) { charData.equipment.armor = val; updateCalculations(); }
function changeShield(val) { charData.equipment.shield = val; updateCalculations(); }

function renderInventory() {
    const looseDiv = document.getElementById('loose-inventory');
    looseDiv.innerHTML = charData.equipment.loose.map((item, idx) => `
        <div class="item-row">
            <span>${item.name} (${item.weight}lb)</span>
            <button style="padding:0 4px; font-size:0.7rem;" onclick="removeItem('loose', ${idx})">X</button>
        </div>
    `).join('');

    const contDiv = document.getElementById('containers-list');
    contDiv.innerHTML = charData.equipment.containers.map((c, cIdx) => `
        <div style="border:1px solid #ccc; padding:5px; background:#fff;">
            <div style="display:flex; justify-content:space-between;">
                <strong style="font-size:0.75rem;">${c.name}</strong>
                <button style="padding:0 4px; font-size:0.7rem;" onclick="removeContainer(${cIdx})">X</button>
            </div>
            <div style="font-size:0.7rem; max-height:60px; overflow-y:auto;">
                ${c.items.map((i, iIdx) => `
                    <div class="item-row">
                        <span>${i.name}</span>
                        <button style="padding:0 2px;" onclick="removeContainerItem(${cIdx}, ${iIdx})">x</button>
                    </div>
                `).join('')}
            </div>
            <button class="add-btn" onclick="addContainerItem(${cIdx})">+ Item</button>
        </div>
    `).join('');
}

// --- ACTIONS ---

function addItemTo(location) {
    // Simple prompt for demo, could be a modal with DB search
    const name = prompt("Item Name (must match DB exactly or create new):");
    if (!name) return;
    
    const dbItem = itemDb.find(i => i.name.toLowerCase() === name.toLowerCase());
    let item = dbItem ? {...dbItem} : {name: name, weight: parseFloat(prompt("Weight?", "1")) || 0};
    
    if (location === 'loose') charData.equipment.loose.push(item);
    updateCalculations();
}

function removeItem(location, index) {
    if (location === 'loose') charData.equipment.loose.splice(index, 1);
    updateCalculations();
}

function addContainer() {
    const name = prompt("Container Name:", "Bag");
    if (!name) return;
    charData.equipment.containers.push({ name: name, baseWeight: 1, items: [] });
    updateCalculations();
}

function removeContainer(index) {
    charData.equipment.containers.splice(index, 1);
    updateCalculations();
}

function addContainerItem(cIdx) {
    const name = prompt("Item Name:");
    if (!name) return;
    const dbItem = itemDb.find(i => i.name.toLowerCase() === name.toLowerCase());
    const weight = dbItem ? dbItem.weight : parseFloat(prompt("Weight?", "0.5")) || 0;
    
    charData.equipment.containers[cIdx].items.push({name, weight});
    updateCalculations();
}

function removeContainerItem(cIdx, iIdx) {
    charData.equipment.containers[cIdx].items.splice(iIdx, 1);
    updateCalculations();
}

function unequipItem(slot) {
    delete charData.equipment.worn[slot];
    renderWearSlots();
    updateCalculations();
}

function normalizeToken(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeProficienciesShape() {
    if (!charData.proficiencies || typeof charData.proficiencies !== 'object') {
        charData.proficiencies = { weapons: [], nwps: [] };
    }
    if (!Array.isArray(charData.proficiencies.weapons)) charData.proficiencies.weapons = [];
    if (!Array.isArray(charData.proficiencies.nwps)) charData.proficiencies.nwps = [];

    charData.proficiencies.weapons = charData.proficiencies.weapons.map(entry => {
        if (typeof entry === 'string') return { name: entry, slots: 1 };
        return {
            name: entry && entry.name ? entry.name : 'Unknown Weapon',
            slots: Math.max(1, parseInt(entry && entry.slots, 10) || 1)
        };
    });

    charData.proficiencies.nwps = charData.proficiencies.nwps.map(entry => {
        if (typeof entry === 'string') return { name: entry, slots: 1, ability: 'INT', checkMod: 0, category: 'General' };
        return {
            name: entry && entry.name ? entry.name : 'Unknown Proficiency',
            slots: Math.max(1, parseInt(entry && entry.slots, 10) || 1),
            ability: (entry && entry.ability) || 'INT',
            checkMod: parseInt(entry && entry.checkMod, 10) || 0,
            category: (entry && entry.category) || 'General'
        };
    });
}

function getClassRecord() {
    return classData[charData.class] || null;
}

function getClassCategory() {
    const map = (proficiencyData && proficiencyData.classCategory) ? proficiencyData.classCategory : {};
    return map[charData.class] || 'General';
}

function getSlotCap(row, level) {
    if (!Array.isArray(row) || row.length === 0) return 0;
    const idx = Math.max(0, Math.min(level - 1, row.length - 1));
    return parseInt(row[idx], 10) || 0;
}

function getUsedSlots(list) {
    return (Array.isArray(list) ? list : []).reduce((sum, p) => sum + (Math.max(1, parseInt(p.slots, 10) || 1)), 0);
}

function weaponMatchesClassGroups(weapon, groups) {
    if (!weapon || !Array.isArray(groups) || groups.length === 0) return false;
    if (groups.includes('all')) return true;

    const typeToken = normalizeToken(weapon.type);
    const nameToken = normalizeToken(weapon.name);
    const profToken = normalizeToken(weapon.proficiencyGroup);
    const size = String(weapon.size || '').toUpperCase();

    for (const groupRaw of groups) {
        const group = normalizeToken(groupRaw);

        if (group === 'bludgeoning' && typeToken.includes('bludgeoning')) return true;
        if (group === 'smalltomedium' && (size === 'S' || size === 'M')) return true;

        if (group === 'smallweapons') {
            const smallWhitelist = ['dagger', 'dart', 'knife', 'club', 'sling', 'shortsword', 'handcrossbow', 'staff'];
            if (size === 'S') return true;
            if (smallWhitelist.some(t => nameToken.includes(t) || profToken.includes(t))) return true;
            continue;
        }

        if (nameToken.includes(group) || profToken.includes(group)) return true;
    }

    return false;
}

function weaponProficiencyMatchesClassGroups(profName, classGroups) {
    if (!profName) return false;
    if (!Array.isArray(classGroups) || classGroups.length === 0 || classGroups.includes('all')) return true;

    const profToken = normalizeToken(profName);
    const mappedWeapons = (Array.isArray(weaponDb) ? weaponDb : []).filter(w => {
        const groupName = (w && (w.proficiencyGroup || w.name)) || '';
        return normalizeToken(groupName) === profToken;
    });

    if (mappedWeapons.length > 0) {
        return mappedWeapons.some(w => weaponMatchesClassGroups(w, classGroups));
    }

    return classGroups.some(groupRaw => {
        const groupToken = normalizeToken(groupRaw);
        return profToken === groupToken || profToken.includes(groupToken) || groupToken.includes(profToken);
    });
}

function getAllowedWeaponProficiencies() {
    const rec = getClassRecord();
    const classGroups = (rec && Array.isArray(rec.weaponGroups) && rec.weaponGroups.length > 0) ? rec.weaponGroups : ['all'];
    const source = Array.isArray(weaponProficienciesData) ? weaponProficienciesData : [];
    if (source.length === 0) return [];

    return source
        .filter(name => weaponProficiencyMatchesClassGroups(name, classGroups))
        .sort((a, b) => a.localeCompare(b));
}

function getAllowedNWProficiencies() {
    const ownCategory = getClassCategory();
    const all = (proficiencyData && Array.isArray(proficiencyData.nonWeapon)) ? proficiencyData.nonWeapon : [];
    return all.filter(p => p && typeof p.name === 'string' && (p.category === 'General' || p.category === ownCategory));
}

function renderProficiencies() {
    normalizeProficienciesShape();

    const rec = getClassRecord();
    const weaponCap = getSlotCap(rec && rec.weaponProficiencies, charData.level);
    const nwpCap = getSlotCap(rec && rec.nonweaponProficiencies, charData.level);
    const usedWeapon = getUsedSlots(charData.proficiencies.weapons);
    const usedNwp = getUsedSlots(charData.proficiencies.nwps);

    const wpCount = document.getElementById('wp-slots-count');
    const nwpCount = document.getElementById('nwp-slots-count');
    if (wpCount) wpCount.textContent = `${usedWeapon}/${weaponCap}`;
    if (nwpCount) nwpCount.textContent = `${usedNwp}/${nwpCap}`;

    const allowedWeapons = new Set(getAllowedWeaponProficiencies().map(w => w.toLowerCase()));
    const availableWeapons = getAllowedWeaponProficiencies().filter(w =>
        !charData.proficiencies.weapons.some(p => String(p.name || '').toLowerCase() === w.toLowerCase())
    );
    const wpList = document.getElementById('wp-list');
    if (wpList) {
        if (charData.proficiencies.weapons.length === 0) {
            wpList.innerHTML = '<div style="font-size:0.72rem; color:#444;">No weapon proficiencies selected.</div>';
        } else {
            wpList.innerHTML = charData.proficiencies.weapons.map((p, idx) => {
                const allowed = allowedWeapons.has(String(p.name || '').toLowerCase());
                const marker = allowed ? '' : ' <em style="color:#8b0000;">(class restricted)</em>';
                return `<div class="item-row"><span>${p.name} [${p.slots}]${marker}</span><button style="padding:0 2px;" onclick="removeWeaponProficiency(${idx})">x</button></div>`;
            }).join('');
        }
    }

    const wpChoice = document.getElementById('wp-choice');
    if (wpChoice) {
        if (availableWeapons.length === 0) {
            wpChoice.innerHTML = '<option value="">No weapon options available</option>';
            wpChoice.disabled = true;
        } else {
            wpChoice.disabled = false;
            wpChoice.innerHTML = ['<option value="">Select weapon proficiency...</option>']
                .concat(availableWeapons.map(w => `<option value="${w}">${w}</option>`))
                .join('');
        }
    }

    const wpSlotInput = document.getElementById('wp-slot-invest');
    if (wpSlotInput) {
        const remaining = Math.max(0, weaponCap - usedWeapon);
        const cur = Math.max(1, parseInt(wpSlotInput.value, 10) || 1);
        wpSlotInput.max = String(Math.max(1, remaining));
        wpSlotInput.value = String(Math.min(cur, Math.max(1, remaining)));
        wpSlotInput.disabled = remaining <= 0;
    }

    const allowedNwp = new Set(getAllowedNWProficiencies().map(p => p.name.toLowerCase()));
    const availableNwp = getAllowedNWProficiencies().filter(p =>
        !charData.proficiencies.nwps.some(n => String(n.name || '').toLowerCase() === p.name.toLowerCase())
    );
    const nwpList = document.getElementById('nwp-list');
    if (nwpList) {
        if (charData.proficiencies.nwps.length === 0) {
            nwpList.innerHTML = '<div style="font-size:0.72rem; color:#444;">No non-weapon proficiencies selected.</div>';
        } else {
            nwpList.innerHTML = charData.proficiencies.nwps.map((p, idx) => {
                const allowed = allowedNwp.has(String(p.name || '').toLowerCase());
                const marker = allowed ? '' : ' <em style="color:#8b0000;">(class restricted)</em>';
                const sign = p.checkMod >= 0 ? '+' : '';
                return `<div class="item-row"><span>${p.name} [${p.slots}] (${p.ability}${sign}${p.checkMod})${marker}</span><span><button style="padding:0 2px; margin-right:2px;" onclick="rollNWPCheck(${idx})">chk</button><button style="padding:0 2px;" onclick="removeNWP(${idx})">x</button></span></div>`;
            }).join('');
        }
    }

    const nwpChoice = document.getElementById('nwp-choice');
    if (nwpChoice) {
        if (availableNwp.length === 0) {
            nwpChoice.innerHTML = '<option value="">No non-weapon options available</option>';
            nwpChoice.disabled = true;
        } else {
            nwpChoice.disabled = false;
            nwpChoice.innerHTML = ['<option value="">Select non-weapon proficiency...</option>']
                .concat(availableNwp.map(p => {
                    const sign = (p.checkMod || 0) >= 0 ? '+' : '';
                    return `<option value="${p.name}">${p.name} [${p.slots}] (${p.ability}${sign}${p.checkMod || 0})</option>`;
                }))
                .join('');
        }
    }
}

function rollNWPCheck(index) {
    normalizeProficienciesShape();
    const prof = charData.proficiencies.nwps[index];
    if (!prof) return;

    const ability = String(prof.ability || 'INT').toUpperCase();
    const abilityScore = getAdjustedStat(ability);
    const checkMod = parseInt(prof.checkMod, 10) || 0;
    const target = Math.max(1, Math.min(20, abilityScore + checkMod));
    const roll = Math.floor(Math.random() * 20) + 1;
    const ok = roll <= target;
    displayRollResult(`${prof.name} check (${ability}${checkMod >= 0 ? '+' : ''}${checkMod} => ${target}): d20=${roll} ${ok ? 'SUCCESS' : 'FAIL'}`);
}

function addWeaponProficiency() {
    normalizeProficienciesShape();
    const rec = getClassRecord();
    const cap = getSlotCap(rec && rec.weaponProficiencies, charData.level);
    const used = getUsedSlots(charData.proficiencies.weapons);
    if (used >= cap) {
        alert(`No weapon slots available (${used}/${cap}).`);
        return;
    }

    const options = getAllowedWeaponProficiencies().filter(w =>
        !charData.proficiencies.weapons.some(p => String(p.name || '').toLowerCase() === w.toLowerCase())
    );
    if (options.length === 0) {
        alert('No allowed weapons found for current class rules.');
        return;
    }

    const wpChoice = document.getElementById('wp-choice');
    const chosen = wpChoice ? wpChoice.value : '';
    if (!chosen) {
        alert('Select a weapon proficiency from the list first.');
        return;
    }

    const remaining = cap - used;
    const wpSlotInput = document.getElementById('wp-slot-invest');
    const slots = Math.max(1, Math.min(remaining, parseInt(wpSlotInput && wpSlotInput.value, 10) || 1));

    charData.proficiencies.weapons.push({ name: chosen, slots });
    updateCalculations();
}

function removeWeaponProficiency(index) {
    normalizeProficienciesShape();
    if (index < 0 || index >= charData.proficiencies.weapons.length) return;
    charData.proficiencies.weapons.splice(index, 1);
    updateCalculations();
}

function addNWP() {
    normalizeProficienciesShape();
    const rec = getClassRecord();
    const cap = getSlotCap(rec && rec.nonweaponProficiencies, charData.level);
    const used = getUsedSlots(charData.proficiencies.nwps);
    if (used >= cap) {
        alert(`No non-weapon slots available (${used}/${cap}).`);
        return;
    }

    const options = getAllowedNWProficiencies().filter(p =>
        !charData.proficiencies.nwps.some(n => String(n.name || '').toLowerCase() === p.name.toLowerCase())
    );
    if (options.length === 0) {
        alert('No allowed non-weapon proficiencies found for current class.');
        return;
    }

    const nwpChoice = document.getElementById('nwp-choice');
    const selectedName = nwpChoice ? nwpChoice.value : '';
    const selected = options.find(p => p.name.toLowerCase() === selectedName.toLowerCase());
    if (!selected) {
        alert('Select a non-weapon proficiency from the list first.');
        return;
    }

    if ((used + selected.slots) > cap) {
        alert(`Not enough slots for ${selected.name} (needs ${selected.slots}, has ${cap - used}).`);
        return;
    }

    charData.proficiencies.nwps.push({
        name: selected.name,
        slots: selected.slots,
        ability: selected.ability,
        checkMod: selected.checkMod || 0,
        category: selected.category || 'General'
    });
    updateCalculations();
}

function removeNWP(index) {
    normalizeProficienciesShape();
    if (index < 0 || index >= charData.proficiencies.nwps.length) return;
    charData.proficiencies.nwps.splice(index, 1);
    updateCalculations();
}

// --- DICE ---
function toggleDiceModal() {
    const modal = document.getElementById('dice-modal');
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function rollDice(sides) {
    const result = Math.floor(Math.random() * sides) + 1;
    displayRollResult(`d${sides}: ${result}`);
}

function rollAbilityScores() {
    let results = [];
    for(let i=0; i<6; i++) {
        let rolls = [];
        for(let j=0; j<4; j++) rolls.push(Math.floor(Math.random()*6)+1);
        rolls.sort((a,b)=>a-b);
        rolls.shift();
        results.push(rolls.reduce((a,b)=>a+b, 0));
    }
    displayRollResult("Stats: " + results.join(", "));
}

function displayRollResult(text) {
    document.getElementById('dice-result').innerText = text;
    const hist = document.getElementById('dice-history');
    hist.innerText = text + " | " + hist.innerText;
}

// --- SAVE/LOAD ---
function saveCharacter() {
    charData.name = document.getElementById('char-name').value;
    charData.hp.cur = parseInt(document.getElementById('hp-cur').value) || 0;
    charData.notes = document.getElementById('char-notes').value;
    charData.gp = parseInt(document.getElementById('char-gp').value) || 0;
    
    localStorage.setItem('adnd_char_data', JSON.stringify(charData));
    alert("Saved!");
}

function loadCharacter() {
    const data = localStorage.getItem('adnd_char_data');
    if (data) {
        try {
            charData = JSON.parse(data);
        } catch (e) {
            console.error('Failed to parse saved character data:', e);
            localStorage.removeItem('adnd_char_data');
            return;
        }
        charData.equipment = charData.equipment || { armor: "None", shield: "None", magicBonus: 0, worn: {}, containers: [], loose: [] };
        normalizeProficienciesShape();
        charData.equipment.armor = normalizeArmorName(charData.equipment.armor);
        charData.equipment.shield = normalizeShieldName(charData.equipment.shield);
        document.getElementById('char-name').value = charData.name;
        document.getElementById('char-race').value = charData.race;
        document.getElementById('char-class').value = charData.class;
        document.getElementById('char-kit').value = charData.kit || "";
        document.getElementById('char-level').value = charData.level;
        document.getElementById('hp-cur').value = charData.hp.cur;
        document.getElementById('char-notes').value = charData.notes || "";
        document.getElementById('char-gp').value = charData.gp || 0;
        document.getElementById('encum-mode').value = charData.encumMode || "off";
        
        Object.keys(charData.stats).forEach(k => {
            const el = document.querySelector(`input[onchange="updateStat('${k}', this.value)"]`);
            if(el) el.value = charData.stats[k];
        });

        handleClassChange();
    }
}

function resetCharacter() {
    if(confirm("Wipe current character?")) {
        localStorage.removeItem('adnd_char_data');
        location.reload();
    }
}

init();