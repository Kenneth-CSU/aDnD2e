// ============================================================
// index-save.js — Character save / load / reset
// Depends on: index-data.js, index-char.js, index-equip.js, index-prof.js
// ============================================================

function saveCharacter() {
    ensureEquipmentInventoryModel();
    syncLegacyEquipmentFields();
    charData.name  = document.getElementById('char-name').value;
    charData.hp.cur = parseInt(document.getElementById('hp-cur').value) || 0;
    charData.notes = document.getElementById('char-notes').value;
    charData.gp    = parseInt(document.getElementById('char-gp').value)   || 0;
    localStorage.setItem('adnd_char_data', JSON.stringify(charData));
    alert("Saved!");
}

function loadCharacter() {
    const raw = localStorage.getItem('adnd_char_data');
    if (!raw) return;

    let loaded;
    try {
        loaded = JSON.parse(raw);
    } catch (e) {
        console.error('Failed to parse saved character data:', e);
        localStorage.removeItem('adnd_char_data');
        return;
    }

    charData = loaded;
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
}

function resetCharacter() {
    if (confirm("Wipe current character?")) {
        localStorage.removeItem('adnd_char_data');
        location.reload();
    }
}

// Bootstrap — all modules are loaded, start the app
init();
