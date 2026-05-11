// ============================================================
// index-char.js — Race/class selection, stat helpers, dropdowns
// Depends on: index-data.js
// ============================================================

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
    // Filter at use-time: classList is guaranteed populated before populateDropdowns() runs.
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
        STR: 'strAdj', DEX: 'dexAdj', CON: 'conAdj',
        INT: 'intAdj', WIS: 'wisAdj', CHA: 'chaAdj'
    };
    const key = map[stat];
    return key ? (race[key] || 0) : 0;
}

function getAdjustedStat(stat) {
    const base = parseInt(charData.stats[stat], 10) || 0;
    return Math.max(1, Math.min(25, base + getRaceStatAdj(stat)));
}

function getRacialStatBounds(stat) {
    const race = getCurrentRaceRecord();
    if (!race) return { min: 3, max: 25 };
    const map = {
        STR: ['minStr', 'maxStr'], DEX: ['minDex', 'maxDex'],
        CON: ['minCon', 'maxCon'], INT: ['minInt', 'maxInt'],
        WIS: ['minWis', 'maxWis'], CHA: ['minCha', 'maxCha']
    };
    const keys = map[stat];
    if (!keys) return { min: 3, max: 25 };
    return {
        min: typeof race[keys[0]] === 'number' ? race[keys[0]] : 3,
        max: typeof race[keys[1]] === 'number' ? race[keys[1]] : 25
    };
}

function getRacialStatViolations() {
    return ["STR", "DEX", "CON", "INT", "WIS", "CHA"].reduce((violations, stat) => {
        const adjusted = getAdjustedStat(stat);
        const bounds = getRacialStatBounds(stat);
        if (adjusted < bounds.min || adjusted > bounds.max) {
            violations.push(`${stat} ${adjusted} (allowed ${bounds.min}-${bounds.max})`);
        }
        return violations;
    }, []);
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
        if (!current) { showRulesBanner(statMsg); return; }
        if (current.startsWith('Stat bounds:')) { showRulesBanner(statMsg); return; }
        const idx = current.indexOf(marker);
        if (idx >= 0) {
            showRulesBanner(`${current.slice(0, idx)}${marker}${statMsg.slice('Stat bounds:'.length)}`);
        } else {
            showRulesBanner(`${current}${marker}${statMsg.slice('Stat bounds:'.length)}`);
        }
        return;
    }

    if (!current) return;
    if (current.startsWith('Stat bounds:')) { showRulesBanner(''); return; }
    const idx = current.indexOf(marker);
    if (idx >= 0) showRulesBanner(current.slice(0, idx));
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

    ensureEquipmentInventoryModel();

    // Auto-equip starter kit if level 1 and the character has no items yet.
    const inventory = getInventoryContainer();
    const hasEquippedItems = EQUIP_SLOT_DEFS.some(def => {
        const container = getEquipContainer(def.slotKey);
        return container && Array.isArray(container.items) && container.items.length > 0;
    });
    if (charData.level === 1 && !hasEquippedItems && (!inventory || inventory.items.length === 0)) {
        applyStarterKit(cls);
    }

    renderAbilities();
    applyCharacterSheetReadOnlyMode();
    updateCalculations();
}

function applyStarterKit(cls) {
    const kit = STARTING_KITS[cls];
    if (!kit) return;

    ensureEquipmentInventoryModel();

    kit.forEach(item => {
        const armor = normalizeArmorName(item.name);
        const shield = normalizeShieldName(item.name);
        if (item.name === "Robes") {
            const inventory = getInventoryContainer();
            if (inventory) inventory.items.push(createItemInstanceFromBaseName(item.name, { weight: item.weight }));
        } else if (armor !== "None") {
            setEquippedItem('body', armor);
        } else if (shield !== "None") {
            setEquippedItem('shield', shield);
        } else if (CONTAINER_TYPE_OPTIONS.includes(item.name)) {
            charData.equipment.containers.push(createContainerFromType(item.name, { name: item.name }));
        } else {
            const inventory = getInventoryContainer();
            if (inventory) inventory.items.push(createItemInstanceFromBaseName(item.name, { weight: item.weight }));
        }
    });

    syncLegacyEquipmentFields();
}

function populateDropdowns() {
    const raceSel = document.getElementById('char-race');
    raceSel.innerHTML = '';
    raceList.forEach(r => raceSel.add(new Option(r, r)));

    if (!raceList.includes(charData.race)) {
        charData.race = raceList[0] || "Human";
    }
    raceSel.value = charData.race;

    enforceRaceClassRules(false);
    applyCharacterSheetReadOnlyMode();
    renderWearSlots();
}

function applyCharacterSheetReadOnlyMode() {
    if (!CHARACTER_SHEET_READ_ONLY) return;
    ['char-race', 'char-class', 'char-kit', 'char-level'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });
}

function renderAbilities() {
    const container = document.getElementById('abilities-container');
    const stats = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
    const disabledAttr = CHARACTER_SHEET_READ_ONLY ? 'disabled' : '';
    let html = "";
    stats.forEach(stat => {
        let subInput = "";
        if (stat === "STR" && ["Fighter", "Paladin", "Ranger"].includes(charData.class)) {
            subInput = `<input type="number" class="ability-sub" value="${charData.stats.STR_Pct}" min="0" max="100" onchange="updateStat('${stat}_Pct', this.value)" style="width:30px; text-align:center;" ${disabledAttr}>`;
        }
        html += `
        <div class="ability-card">
            <div class="ability-title">${stat}</div>
            <input type="number" class="ability-score" value="${getAdjustedStat(stat)}" min="3" max="25" onchange="updateStat('${stat}', this.value)" ${disabledAttr}>
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
