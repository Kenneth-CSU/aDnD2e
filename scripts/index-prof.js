// ============================================================
// index-prof.js — Weapon & non-weapon proficiency logic
// Depends on: index-data.js, index-char.js, index-calc.js
// ============================================================

function normalizeToken(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeProficienciesShape() {
    if (!charData.proficiencies || typeof charData.proficiencies !== 'object') {
        charData.proficiencies = { weapons: [], nwps: [] };
    }
    if (!Array.isArray(charData.proficiencies.weapons)) charData.proficiencies.weapons = [];
    if (!Array.isArray(charData.proficiencies.nwps))    charData.proficiencies.nwps    = [];

    charData.proficiencies.weapons = charData.proficiencies.weapons.map(entry => {
        if (typeof entry === 'string') return { name: entry, slots: 1 };
        return {
            name:  entry && entry.name  ? entry.name  : 'Unknown Weapon',
            slots: Math.max(1, parseInt(entry && entry.slots, 10) || 1)
        };
    });

    charData.proficiencies.nwps = charData.proficiencies.nwps.map(entry => {
        if (typeof entry === 'string') return { name: entry, slots: 1, ability: 'INT', checkMod: 0, category: 'General' };
        return {
            name:     entry && entry.name     ? entry.name     : 'Unknown Proficiency',
            slots:    Math.max(1, parseInt(entry && entry.slots, 10) || 1),
            ability:  (entry && entry.ability)  || 'INT',
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
    return parseInt(row[Math.max(0, Math.min(level - 1, row.length - 1))], 10) || 0;
}

function getUsedSlots(list) {
    return (Array.isArray(list) ? list : []).reduce((sum, p) => sum + Math.max(1, parseInt(p.slots, 10) || 1), 0);
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
            const smallWhitelist = ['dagger','dart','knife','club','sling','shortsword','handcrossbow','staff'];
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
    const classGroups = (rec && Array.isArray(rec.weaponGroups) && rec.weaponGroups.length > 0)
        ? rec.weaponGroups : ['all'];
    const source = Array.isArray(weaponProficienciesData) ? weaponProficienciesData : [];
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

    const rec        = getClassRecord();
    const weaponCap  = getSlotCap(rec && rec.weaponProficiencies,    charData.level);
    const nwpCap     = getSlotCap(rec && rec.nonweaponProficiencies,  charData.level);
    const usedWeapon = getUsedSlots(charData.proficiencies.weapons);
    const usedNwp    = getUsedSlots(charData.proficiencies.nwps);

    const wpCount  = document.getElementById('wp-slots-count');
    const nwpCount = document.getElementById('nwp-slots-count');
    if (wpCount)  wpCount.textContent  = `${usedWeapon}/${weaponCap}`;
    if (nwpCount) nwpCount.textContent = `${usedNwp}/${nwpCap}`;

    // --- Weapon proficiency list ---
    const allowedWeapons = new Set(getAllowedWeaponProficiencies().map(w => w.toLowerCase()));
    const availableWeapons = getAllowedWeaponProficiencies().filter(w =>
        !charData.proficiencies.weapons.some(p => String(p.name || '').toLowerCase() === w.toLowerCase())
    );

    const wpList = document.getElementById('wp-list');
    if (wpList) {
        const canEditWeapons = !!document.getElementById('wp-choice') && !!document.getElementById('wp-slot-invest');
        wpList.innerHTML = charData.proficiencies.weapons.length === 0
            ? '<div style="font-size:0.72rem; color:#444;">No weapon proficiencies selected.</div>'
            : charData.proficiencies.weapons.map((p, idx) => {
                const allowed = allowedWeapons.has(String(p.name || '').toLowerCase());
                const marker  = allowed ? '' : ' <em style="color:#8b0000;">(class restricted)</em>';
                const removeBtn = canEditWeapons
                    ? `<button style="padding:0 2px;" onclick="removeWeaponProficiency(${idx})">x</button>`
                    : '';
                return `<div class="item-row"><span>${p.name} [${p.slots}]${marker}</span>${removeBtn}</div>`;
            }).join('');
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
        wpSlotInput.max      = String(Math.max(1, remaining));
        wpSlotInput.value    = String(Math.min(cur, Math.max(1, remaining)));
        wpSlotInput.disabled = remaining <= 0;
    }

    // --- Non-weapon proficiency list ---
    const allowedNwp = new Set(getAllowedNWProficiencies().map(p => p.name.toLowerCase()));
    const availableNwp = getAllowedNWProficiencies().filter(p =>
        !charData.proficiencies.nwps.some(n => String(n.name || '').toLowerCase() === p.name.toLowerCase())
    );

    const nwpList = document.getElementById('nwp-list');
    if (nwpList) {
        const canEditNwp = !!document.getElementById('nwp-choice');
        nwpList.innerHTML = charData.proficiencies.nwps.length === 0
            ? '<div style="font-size:0.72rem; color:#444;">No non-weapon proficiencies selected.</div>'
            : charData.proficiencies.nwps.map((p, idx) => {
                const allowed = allowedNwp.has(String(p.name || '').toLowerCase());
                const marker  = allowed ? '' : ' <em style="color:#8b0000;">(class restricted)</em>';
                const sign    = p.checkMod >= 0 ? '+' : '';
                const controls = canEditNwp
                    ? `<span><button style="padding:0 2px; margin-right:2px;" onclick="rollNWPCheck(${idx})">chk</button><button style="padding:0 2px;" onclick="removeNWP(${idx})">x</button></span>`
                    : '';
                return `<div class="item-row"><span>${p.name} [${p.slots}] (${p.ability}${sign}${p.checkMod})${marker}</span>${controls}</div>`;
            }).join('');
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
    const ability      = String(prof.ability || 'INT').toUpperCase();
    const abilityScore = getAdjustedStat(ability);
    const checkMod     = parseInt(prof.checkMod, 10) || 0;
    const target = Math.max(1, Math.min(20, abilityScore + checkMod));
    const roll   = Math.floor(Math.random() * 20) + 1;
    const ok     = roll <= target;
    displayRollResult(`${prof.name} check (${ability}${checkMod >= 0 ? '+' : ''}${checkMod} => ${target}): d20=${roll} ${ok ? 'SUCCESS' : 'FAIL'}`);
}

function addWeaponProficiency() {
    normalizeProficienciesShape();
    const rec = getClassRecord();
    const cap  = getSlotCap(rec && rec.weaponProficiencies, charData.level);
    const used = getUsedSlots(charData.proficiencies.weapons);
    if (used >= cap) { alert(`No weapon slots available (${used}/${cap}).`); return; }

    const wpChoice = document.getElementById('wp-choice');
    const chosen = wpChoice ? wpChoice.value : '';
    if (!chosen) { alert('Select a weapon proficiency from the list first.'); return; }

    const remaining   = cap - used;
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
    const cap  = getSlotCap(rec && rec.nonweaponProficiencies, charData.level);
    const used = getUsedSlots(charData.proficiencies.nwps);
    if (used >= cap) { alert(`No non-weapon slots available (${used}/${cap}).`); return; }

    const nwpChoice    = document.getElementById('nwp-choice');
    const selectedName = nwpChoice ? nwpChoice.value : '';
    const options      = getAllowedNWProficiencies().filter(p =>
        !charData.proficiencies.nwps.some(n => String(n.name || '').toLowerCase() === p.name.toLowerCase())
    );
    const selected = options.find(p => p.name.toLowerCase() === selectedName.toLowerCase());
    if (!selected) { alert('Select a non-weapon proficiency from the list first.'); return; }

    if ((used + selected.slots) > cap) {
        alert(`Not enough slots for ${selected.name} (needs ${selected.slots}, has ${cap - used}).`);
        return;
    }

    charData.proficiencies.nwps.push({
        name:     selected.name,
        slots:    selected.slots,
        ability:  selected.ability,
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
