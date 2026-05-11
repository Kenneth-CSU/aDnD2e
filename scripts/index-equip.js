// ============================================================
// index-equip.js — Armor/shield normalization and compatibility wrappers
// Depends on: index-data.js, index-items.js
// ============================================================

function normalizeArmorName(name) {
    const key = String(name || "None").trim().toLowerCase();
    const alias = ARMOR_NAME_MAP[key];
    if (alias) return alias;
    const known = (Array.isArray(armorTypes) ? armorTypes : []).find(entry => String(entry && entry.name || '').trim().toLowerCase() === key);
    return known ? known.name : "None";
}

function normalizeShieldName(name) {
    const key = String(name || "None").trim().toLowerCase();
    const alias = SHIELD_NAME_MAP[key];
    if (alias) return alias;
    const known = (Array.isArray(shieldTypes) ? shieldTypes : []).find(entry => String(entry && entry.name || '').trim().toLowerCase() === key);
    return known ? known.name : "None";
}

function changeArmor(val) {
    setEquippedItem('body', normalizeArmorName(val));
    updateCalculations();
}

function changeShield(val) {
    setEquippedItem('shield', normalizeShieldName(val));
    updateCalculations();
}

function unequipItem(slot) {
    clearEquippedItem(slot);
    renderWearSlots();
    updateCalculations();
}
