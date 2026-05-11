// ============================================================
// index-save.js — Character save / load / reset
// Depends on: index-data.js, index-char.js, index-equip.js, index-prof.js
// ============================================================

const CHAR_ROSTER_KEY = 'adnd_char_roster';
const CHAR_ACTIVE_ID_KEY = 'adnd_active_char_id';
const CHAR_DATA_PREFIX = 'adnd_char_data_';
const LEGACY_CHAR_KEY = 'adnd_char_data';
let charSwitchStatusTimer = null;

function setCharacterSwitchStatus(message, isError) {
    const el = document.getElementById('char-switch-status');
    if (!el) return;
    el.textContent = String(message || '');
    el.style.color = isError ? '#ffd0c8' : '#f9e7b0';
    if (charSwitchStatusTimer) clearTimeout(charSwitchStatusTimer);
    if (message) {
        charSwitchStatusTimer = setTimeout(() => {
            const node = document.getElementById('char-switch-status');
            if (node) node.textContent = '';
        }, 3000);
    }
}

function generateCharacterId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `char-${crypto.randomUUID()}`;
    }
    return `char-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function getCharacterStorageKey(charId) {
    return `${CHAR_DATA_PREFIX}${charId}`;
}

function readCharacterRoster() {
    const raw = localStorage.getItem(CHAR_ROSTER_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(entry => entry && typeof entry.id === 'string')
            .map(entry => ({ id: String(entry.id), name: String(entry.name || '') }));
    } catch (e) {
        console.error('Failed parsing character roster:', e);
        return [];
    }
}

function writeCharacterRoster(roster) {
    localStorage.setItem(CHAR_ROSTER_KEY, JSON.stringify(Array.isArray(roster) ? roster : []));
}

function ensureCharacterId(character) {
    if (!character || typeof character !== 'object') return '';
    if (!character.id || typeof character.id !== 'string') {
        character.id = generateCharacterId();
    }
    return character.id;
}

function ensureCharacterRosterMigration() {
    let roster = readCharacterRoster();

    if (roster.length === 0) {
        const legacyRaw = localStorage.getItem(LEGACY_CHAR_KEY);
        let legacy = null;
        if (legacyRaw) {
            try {
                legacy = JSON.parse(legacyRaw);
            } catch (e) {
                console.error('Failed parsing legacy character data:', e);
            }
        }

        const seed = legacy && typeof legacy === 'object' ? legacy : charData;
        const id = ensureCharacterId(seed);
        localStorage.setItem(getCharacterStorageKey(id), JSON.stringify(seed));
        localStorage.setItem(CHAR_ACTIVE_ID_KEY, id);
        roster = [{ id, name: String(seed.name || '') }];
        writeCharacterRoster(roster);
    }

    let activeId = localStorage.getItem(CHAR_ACTIVE_ID_KEY);
    if (!activeId || !roster.some(entry => entry.id === activeId)) {
        activeId = roster[0].id;
        localStorage.setItem(CHAR_ACTIVE_ID_KEY, activeId);
    }

    const selector = document.getElementById('char-select');
    if (selector) {
        selector.innerHTML = roster
            .map(entry => {
                const label = entry.name && entry.name.trim() ? entry.name.trim() : `Unnamed (${entry.id.slice(0, 8)})`;
                return `<option value="${entry.id}">${label}</option>`;
            })
            .join('');
        selector.value = activeId;
    }

    return { roster, activeId };
}

function upsertActiveCharacterInRoster() {
    const id = ensureCharacterId(charData);
    const roster = readCharacterRoster();
    const existing = roster.find(entry => entry.id === id);
    const name = String(charData.name || '').trim();
    if (existing) {
        existing.name = name;
    } else {
        roster.push({ id, name });
    }
    writeCharacterRoster(roster);
    localStorage.setItem(CHAR_ACTIVE_ID_KEY, id);
    ensureCharacterRosterMigration();
    return id;
}

function changeActiveCharacter(charId) {
    if (!charId) return;
    loadCharacter(charId);
}

function saveCharacter() {
    ensureEquipmentInventoryModel();
    syncLegacyEquipmentFields();
    ensureCharacterRosterMigration();
    ensureCharacterId(charData);
    charData.name  = document.getElementById('char-name').value;
    charData.hp.cur = parseInt(document.getElementById('hp-cur').value) || 0;
    charData.notes = document.getElementById('char-notes').value;
    charData.gp    = parseInt(document.getElementById('char-gp').value)   || 0;
    const id = upsertActiveCharacterInRoster();
    localStorage.setItem(getCharacterStorageKey(id), JSON.stringify(charData));
    localStorage.setItem(LEGACY_CHAR_KEY, JSON.stringify(charData));
    setCharacterSwitchStatus('Character saved.');
    alert("Saved!");
}

function loadCharacter(requestedId) {
    const { activeId } = ensureCharacterRosterMigration();
    const selector = document.getElementById('char-select');
    const charId = requestedId || (selector && selector.value) || activeId;
    if (!charId) return;

    localStorage.setItem(CHAR_ACTIVE_ID_KEY, charId);
    if (selector) selector.value = charId;

    const raw = localStorage.getItem(getCharacterStorageKey(charId)) || localStorage.getItem(LEGACY_CHAR_KEY);
    if (!raw) {
        setCharacterSwitchStatus('No character data found.', true);
        return;
    }

    let loaded;
    try {
        loaded = JSON.parse(raw);
    } catch (e) {
        console.error('Failed to parse saved character data:', e);
        localStorage.removeItem(getCharacterStorageKey(charId));
        setCharacterSwitchStatus('Character data was invalid JSON.', true);
        return;
    }

    charData = loaded;
    ensureCharacterId(charData);
    if (charData.id !== charId) {
        charData.id = charId;
    }
    charData.equipment = charData.equipment || { armor: "None", shield: "None", magicBonus: 0, worn: {}, containers: [], loose: [] };
    ensureEquipmentInventoryModel();
    normalizeProficienciesShape();
    syncLegacyEquipmentFields();
    charData.equipment.armor  = normalizeArmorName(charData.equipment.armor);
    charData.equipment.shield = normalizeShieldName(charData.equipment.shield);

    document.getElementById('char-name').value    = charData.name;
    document.getElementById('char-race').value    = charData.race;
    document.getElementById('char-class').value   = charData.class;
    document.getElementById('char-kit').value     = charData.kit || "";
    document.getElementById('char-level').value   = charData.level;
    document.getElementById('hp-cur').value        = charData.hp.cur;
    document.getElementById('char-notes').value   = charData.notes || "";
    document.getElementById('char-gp').value      = charData.gp || 0;
    document.getElementById('encum-mode').value   = charData.encumMode || "off";

    Object.keys(charData.stats).forEach(k => {
        const el = document.querySelector(`input[onchange="updateStat('${k}', this.value)"]`);
        if (el) el.value = charData.stats[k];
    });

    renderWearSlots();
    renderInventory();
    handleClassChange();
    upsertActiveCharacterInRoster();
    const label = String(charData.name || '').trim() || 'Unnamed';
    setCharacterSwitchStatus(`Loaded ${label}`);
}

function resetCharacter() {
    const { roster, activeId } = ensureCharacterRosterMigration();
    if (!activeId) return;
    if (!confirm("Delete current character from roster?")) return;

    localStorage.removeItem(getCharacterStorageKey(activeId));

    const nextRoster = roster.filter(entry => entry.id !== activeId);
    writeCharacterRoster(nextRoster);

    if (nextRoster.length > 0) {
        localStorage.setItem(CHAR_ACTIVE_ID_KEY, nextRoster[0].id);
        loadCharacter(nextRoster[0].id);
        setCharacterSwitchStatus('Character deleted. Switched to next.');
    } else {
        charData.id = generateCharacterId();
        charData.name = '';
        charData.race = 'Human';
        charData.class = 'Fighter';
        charData.kit = '';
        charData.level = 1;
        localStorage.setItem(getCharacterStorageKey(charData.id), JSON.stringify(charData));
        writeCharacterRoster([{ id: charData.id, name: '' }]);
        localStorage.setItem(CHAR_ACTIVE_ID_KEY, charData.id);
        loadCharacter(charData.id);
        setCharacterSwitchStatus('Character deleted. New blank character created.');
    }
}

// Bootstrap — all modules are loaded, start the app
init();
