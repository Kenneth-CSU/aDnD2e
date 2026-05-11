// ============================================================
// index-items.js — Unified container/item model with classification
// Depends on: index-data.js
// ============================================================

const EQUIP_SLOT_DEFS = [
    { slotKey: 'rightArm', label: 'Weapons', capacitySlots: 1 },
    { slotKey: 'leftArm', label: 'Weapons', capacitySlots: 1 },
    { slotKey: 'shield', label: 'Shield', capacitySlots: 1 },
    { slotKey: 'body', label: 'Body', capacitySlots: 1 },
    { slotKey: 'head', label: 'Head', capacitySlots: 1 },
    { slotKey: 'hands', label: 'Hands', capacitySlots: 1 },
    { slotKey: 'belt', label: 'Belt', capacitySlots: 1 },
    { slotKey: 'legs', label: 'Legs', capacitySlots: 1 },
    { slotKey: 'feet', label: 'Feet', capacitySlots: 1 }
];

const DEFAULT_EQUIP_SLOT_GROUPS = [
    { label: 'Weapons', slots: ['rightArm', 'leftArm'] },
    { label: 'Shield', slots: ['shield'] },
    { label: 'Body', slots: ['body'] },
    { label: 'Head', slots: ['head'] },
    { label: 'Hands', slots: ['hands'] },
    { label: 'Belt', slots: ['belt'] },
    { label: 'Legs', slots: ['legs'] },
    { label: 'Feet', slots: ['feet'] }
];

let EQUIP_SLOT_GROUPS = DEFAULT_EQUIP_SLOT_GROUPS.map(group => ({ ...group }));

const SLOT_ALLOWED_ITEM_TYPES = {
    rightArm: ['weapon', 'tool', 'equipment', 'miscellaneous'],
    leftArm: ['weapon', 'tool', 'equipment', 'miscellaneous'],
    shield: ['shield'],
    body: ['armor'],
    head: ['armor', 'equipment', 'miscellaneous'],
    hands: ['armor', 'equipment', 'tool', 'miscellaneous'],
    belt: ['equipment', 'tool', 'consumable', 'component', 'miscellaneous'],
    legs: ['armor', 'equipment', 'miscellaneous'],
    feet: ['armor', 'equipment', 'miscellaneous']
};

const CONTAINER_TYPE_PRESETS = {
    Bag: { capacitySlots: 10, baseWeight: 0.5 },
    Backpack: { capacitySlots: 40, baseWeight: 2 },
    Quiver: { capacitySlots: 20, baseWeight: 1 },
    Case: { capacitySlots: 10, baseWeight: 0.5 },
    Pouch: { capacitySlots: 5, baseWeight: 0.5 }
};

let CONTAINER_TYPE_OPTIONS = Object.keys(CONTAINER_TYPE_PRESETS);
const ROOT_INVENTORY_CONTAINER_ID = 'inventory-root';

let activeContainerId = '';
let activeItemId = '';
let isNormalizingEquipment = false;
let batchEditorRows = [];

function createUniqueId(prefix) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function parseAdminOptionList(storageKey, fallback) {
    if (typeof parseAdminList === 'function') {
        return parseAdminList(storageKey, fallback);
    }

    const raw = localStorage.getItem(storageKey);
    if (!raw) return [...fallback];

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [...fallback];
        const unique = [];
        const seen = new Set();
        parsed.forEach(entry => {
            const value = String(entry || '').trim();
            if (!value) return;
            const key = value.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            unique.push(value);
        });
        return unique.length ? unique : [...fallback];
    } catch (error) {
        console.error(`Failed parsing ${storageKey}:`, error);
        return [...fallback];
    }
}

function setSelectOptions(selectId, values, labelBuilder) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const previous = select.value;
    select.innerHTML = '';
    values.forEach(value => {
        const label = labelBuilder ? labelBuilder(value) : value;
        select.add(new Option(label, value));
    });

    if (values.includes(previous)) {
        select.value = previous;
    }
}

function applyAdminManagedItemOptions() {
    ITEM_TYPE_ENUM = parseAdminOptionList('admin_item_types', ['weapon', 'shield', 'armor', 'container', 'tool', 'consumable', 'component', 'equipment', 'treasure', 'mount', 'miscellaneous']);
    CONTAINER_TYPE_OPTIONS = parseAdminOptionList('admin_container_types', Object.keys(CONTAINER_TYPE_PRESETS));

    const slotLabels = parseAdminOptionList('admin_wear_slots', DEFAULT_EQUIP_SLOT_GROUPS.map(group => group.label));
    EQUIP_SLOT_GROUPS = DEFAULT_EQUIP_SLOT_GROUPS.map((group, index) => ({
        ...group,
        label: slotLabels[index] || group.label
    }));

    setSelectOptions('new-item-type', ITEM_TYPE_ENUM);
    setSelectOptions('container-modal-type', CONTAINER_TYPE_OPTIONS);

    if (typeof renderWearSlots === 'function') {
        renderWearSlots();
    }
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function ensureEnumValue(enumValues, value, fallback) {
    const normalized = String(value || '').trim().toLowerCase();
    return enumValues.includes(normalized) ? normalized : fallback;
}

function parseCsvToEnumArray(value, enumValues) {
    if (Array.isArray(value)) {
        return [...new Set(value
            .map(token => String(token || '').trim().toLowerCase())
            .filter(token => enumValues.includes(token)))];
    }

    if (typeof value !== 'string') return [];
    return [...new Set(value
        .split(/[;,/|]+/)
        .map(token => token.trim().toLowerCase())
        .filter(token => enumValues.includes(token)))];
}

function ensureEnumArray(enumValues, values, fallbackValues) {
    const parsed = parseCsvToEnumArray(values, enumValues);
    if (parsed.length > 0) return parsed;
    const fallbackParsed = parseCsvToEnumArray(fallbackValues, enumValues);
    return fallbackParsed.length > 0 ? fallbackParsed : [];
}

function ensureModifierList(value, fallbackValue) {
    const fromValue = Array.isArray(value)
        ? value
        : (value && typeof value === 'object' ? [value] : []);
    if (fromValue.length > 0) return fromValue.map(normalizeModifier);

    const fromFallback = Array.isArray(fallbackValue)
        ? fallbackValue
        : (fallbackValue && typeof fallbackValue === 'object' ? [fallbackValue] : []);
    return fromFallback.map(normalizeModifier);
}

function ensureItemType(type) {
    const value = String(type || '').trim().toLowerCase();
    if (ITEM_TYPE_ENUM.includes(value)) return value;

    if (value === 'gear' || value === 'misc') return 'equipment';
    if (value === 'ammo') return 'consumable';

    return 'equipment';
}

function guessItemTypeByName(name, fallbackType) {
    const normalizedFallback = ensureItemType(fallbackType);
    if (normalizedFallback !== 'equipment') return normalizedFallback;

    const lower = String(name || '').toLowerCase();
    if (!lower) return normalizedFallback;
    if (/(sword|dagger|axe|mace|staff|spear|bow|crossbow|hammer|javelin|dart|club|sling|knife|halberd|flail)/.test(lower)) return 'weapon';
    if (/shield/.test(lower)) return 'shield';
    if (/(armor|mail|plate|robes|helm|helmet|greaves|boots|gauntlets)/.test(lower)) return 'armor';
    if (/(bag|backpack|quiver|pouch|sack|case|chest|coffer)/.test(lower)) return 'container';
    if (/(potion|oil|torch|ration|arrow|bolt|bandage|water|waterskin)/.test(lower)) return 'consumable';
    if (/(component|incense|powder|gem dust|bat guano|chalk|sulfur|material)/.test(lower)) return 'component';
    if (/(coin|gem|jewel|jewelry|art object|treasure)/.test(lower)) return 'treasure';
    if (/(horse|pony|warhorse|camel|mule)/.test(lower)) return 'mount';
    if (/(pick|tool|rope|hook|lock|crowbar|flint)/.test(lower)) return 'tool';

    return normalizedFallback;
}

function guessStackableByName(name) {
    const lower = String(name || '').toLowerCase();
    if (!lower) return false;
    return /(\(\d+\)|arrow|bolt|ration|torch|oil|coin|gem|potion|component|bandage|dart|caltrops|manacle key)/.test(lower);
}

function getDefaultItemFlags(baseName, type, classificationProvided) {
    if (!classificationProvided) {
        return {
            isMagical: false,
            isCursed: false,
            isClassUsable: false,
            isRaceUsable: false,
            isLevelUsable: false,
            isEquipped: false,
            isIdentified: false,
            isStackable: guessStackableByName(baseName)
        };
    }

    const normalizedType = ensureItemType(type);
    return {
        isMagical: false,
        isCursed: false,
        isClassUsable: true,
        isRaceUsable: true,
        isLevelUsable: true,
        isEquipped: false,
        isIdentified: true,
        isStackable: normalizedType === 'consumable' || normalizedType === 'component' || guessStackableByName(baseName)
    };
}

function buildItemDisplayName(item) {
    const baseName = String(item && item.baseName ? item.baseName : item && item.name ? item.name : 'Unknown Item').trim();
    const extraName = String(item && item.extraName ? item.extraName : '').trim();
    return extraName ? `${baseName} - ${extraName}` : baseName;
}

function normalizeModifier(modifier) {
    if (typeof modifier === 'number') {
        return {
            id: createUniqueId('mod'),
            value: modifier,
            note: '',
            modifierType: 'other',
            target: 'self',
            role: 'utility',
            stackingRule: 'stack',
            condition: '',
            source: ''
        };
    }

    if (!modifier || typeof modifier !== 'object') {
        return {
            id: createUniqueId('mod'),
            value: 0,
            note: '',
            modifierType: 'other',
            target: 'self',
            role: 'utility',
            stackingRule: 'stack',
            condition: '',
            source: ''
        };
    }

    return {
        id: modifier.id || createUniqueId('mod'),
        value: parseInt(modifier.value, 10) || 0,
        note: String(modifier.note || '').trim(),
        modifierType: ensureEnumValue(MODIFIER_TYPE_ENUM, modifier.modifierType, 'other'),
        target: ensureEnumValue(MODIFIER_TARGET_ENUM, modifier.target, 'self'),
        role: ensureEnumValue(ITEM_ROLE_ENUM, modifier.role, 'utility'),
        stackingRule: String(modifier.stackingRule || 'stack').trim().toLowerCase() || 'stack',
        condition: String(modifier.condition || '').trim(),
        source: String(modifier.source || '').trim()
    };
}

function normalizeDbItem(entry) {
    if (!entry || typeof entry.name !== 'string') return null;
    const name = String(entry.name).trim();
    if (!name) return null;
    const type = guessItemTypeByName(name, entry.type || 'equipment');
    const roles = ensureEnumArray(ITEM_ROLE_ENUM, entry.roles, entry.itemRoles);
    const damageTypes = ensureEnumArray(DAMAGE_TYPE_ENUM, entry.damageTypes, entry.type === 'weapon' ? entry.damageType : []);
    return {
        ...entry,
        name,
        weight: typeof entry.weight === 'number' ? entry.weight : (parseFloat(entry.weight) || 0),
        type,
        itemCategory: String(entry.itemCategory || type).trim().toLowerCase() || type,
        itemSubcategory: String(entry.itemSubcategory || '').trim(),
        roles,
        damageTypes,
        modifierProfiles: ensureModifierList(entry.modifierProfiles),
        usage: entry && typeof entry.usage === 'object' ? {
            activation: String(entry.usage.activation || 'action').trim().toLowerCase() || 'action',
            duration: String(entry.usage.duration || '').trim(),
            charges: Math.max(0, parseInt(entry.usage.charges, 10) || 0),
            recharge: String(entry.usage.recharge || '').trim(),
            consumableKind: String(entry.usage.consumableKind || '').trim().toLowerCase()
        } : {
            activation: 'action',
            duration: '',
            charges: 0,
            recharge: '',
            consumableKind: ''
        },
        isMagical: !!entry.isMagical,
        isCursed: !!entry.isCursed,
        isClassUsable: entry.isClassUsable !== false,
        isRaceUsable: entry.isRaceUsable !== false,
        isLevelUsable: entry.isLevelUsable !== false,
        isEquipped: !!entry.isEquipped,
        isIdentified: entry.isIdentified !== false,
        isStackable: entry.isStackable != null ? !!entry.isStackable : (type === 'consumable' || type === 'component' || guessStackableByName(name)),
        quantity: Math.max(1, parseInt(entry.quantity, 10) || 1)
    };
}

function getBaseItemRecord(name) {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return null;

    const itemMatch = (Array.isArray(itemDb) ? itemDb : [])
        .map(normalizeDbItem)
        .find(entry => entry && String(entry.name || '').trim().toLowerCase() === target);
    if (itemMatch && itemMatch.type !== 'container') return itemMatch;

    const armorMatch = (Array.isArray(armorTypes) ? armorTypes : []).find(entry => String(entry && entry.name || '').trim().toLowerCase() === target);
    if (armorMatch) {
        return {
            name: armorMatch.name,
            weight: armorMatch.weight || 0,
            type: 'armor',
            isMagical: false,
            isCursed: false,
            isClassUsable: true,
            isRaceUsable: true,
            isLevelUsable: true,
            isEquipped: false,
            isIdentified: true,
            isStackable: false,
            quantity: 1
        };
    }

    const shieldMatch = (Array.isArray(shieldTypes) ? shieldTypes : []).find(entry => String(entry && entry.name || '').trim().toLowerCase() === target);
    if (shieldMatch) {
        return {
            name: shieldMatch.name,
            weight: shieldMatch.weight || 0,
            type: 'shield',
            isMagical: false,
            isCursed: false,
            isClassUsable: true,
            isRaceUsable: true,
            isLevelUsable: true,
            isEquipped: false,
            isIdentified: true,
            isStackable: false,
            quantity: 1
        };
    }

    return null;
}

function getBaseItemOptions() {
    const options = [];
    const isContainerName = name => /(backpack|quiver|case|pouch|bag|sack|chest)/i.test(String(name || ''));

    (Array.isArray(itemDb) ? itemDb : []).map(normalizeDbItem).forEach(entry => {
        if (!entry || typeof entry.name !== 'string' || entry.type === 'container' || isContainerName(entry.name)) return;
        options.push(entry.name);
    });

    (Array.isArray(armorTypes) ? armorTypes : []).forEach(entry => {
        if (!entry || entry.name === 'None') return;
        options.push(entry.name);
    });

    (Array.isArray(shieldTypes) ? shieldTypes : []).forEach(entry => {
        if (!entry || entry.name === 'None') return;
        options.push(entry.name);
    });

    const unique = [...new Set(options)];
    const rank = name => {
        const base = getBaseItemRecord(name);
        if (!base) return 4;
        if (base.type === 'weapon') return 0;
        if (base.type === 'shield') return 1;
        if (base.type === 'armor') return 2;
        return 3;
    };

    return unique.sort((a, b) => {
        const rankDiff = rank(a) - rank(b);
        return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
    });
}

function normalizeItemInstance(item, fallbackName, options = {}) {
    const migratedRef = options.migratedRef || { changed: false };

    if (!item || typeof item !== 'object') {
        const name = String(fallbackName || 'Unknown Item').trim();
        const defaults = getDefaultItemFlags(name, 'equipment', false);
        migratedRef.changed = true;
        return {
            id: createUniqueId('itm'),
            baseName: name,
            name,
            extraName: '',
            slotCost: 1,
            modifiers: [],
            notes: '',
            weight: 0,
            type: 'equipment',
            quantity: defaults.isStackable ? 1 : 1,
            ...defaults
        };
    }

    const baseName = String(item.baseName || item.name || fallbackName || 'Unknown Item').trim();
    const extraName = String(item.extraName || '').trim();
    const base = getBaseItemRecord(baseName);
    const classificationProvided = ITEM_FLAG_KEYS.every(key => Object.prototype.hasOwnProperty.call(item, key));
    if (!classificationProvided) migratedRef.changed = true;

    const chosenType = classificationProvided
        ? guessItemTypeByName(baseName, item.type || (base && base.type) || 'equipment')
        : 'equipment';
    const defaults = getDefaultItemFlags(baseName, chosenType, classificationProvided);

    const normalized = {
        ...item,
        id: item.id || createUniqueId('itm'),
        baseName,
        extraName,
        name: buildItemDisplayName({ baseName, extraName }),
        slotCost: Math.max(1, parseInt(item.slotCost != null ? item.slotCost : item.slots, 10) || 1),
        modifiers: Array.isArray(item.modifiers) ? item.modifiers.map(normalizeModifier) : [],
        notes: String(item.notes || '').trim(),
        weight: typeof item.weight === 'number' ? item.weight : (parseFloat(item.weight) || (base ? base.weight || 0 : 0)),
        type: chosenType,
        itemCategory: String(item.itemCategory || (base && base.itemCategory) || chosenType).trim().toLowerCase() || chosenType,
        itemSubcategory: String(item.itemSubcategory || (base && base.itemSubcategory) || '').trim(),
        roles: ensureEnumArray(ITEM_ROLE_ENUM, item.roles, base && base.roles),
        damageTypes: ensureEnumArray(DAMAGE_TYPE_ENUM, item.damageTypes, base && base.damageTypes),
        modifierProfiles: ensureModifierList(item.modifierProfiles, base && base.modifierProfiles),
        usage: item && typeof item.usage === 'object'
            ? {
                activation: String(item.usage.activation || 'action').trim().toLowerCase() || 'action',
                duration: String(item.usage.duration || '').trim(),
                charges: Math.max(0, parseInt(item.usage.charges, 10) || 0),
                recharge: String(item.usage.recharge || '').trim(),
                consumableKind: String(item.usage.consumableKind || '').trim().toLowerCase()
            }
            : {
                activation: String((base && base.usage && base.usage.activation) || 'action').trim().toLowerCase() || 'action',
                duration: String((base && base.usage && base.usage.duration) || '').trim(),
                charges: Math.max(0, parseInt((base && base.usage && base.usage.charges), 10) || 0),
                recharge: String((base && base.usage && base.usage.recharge) || '').trim(),
                consumableKind: String((base && base.usage && base.usage.consumableKind) || '').trim().toLowerCase()
            },
        isMagical: item.isMagical != null ? !!item.isMagical : defaults.isMagical,
        isCursed: item.isCursed != null ? !!item.isCursed : defaults.isCursed,
        isClassUsable: item.isClassUsable != null ? !!item.isClassUsable : defaults.isClassUsable,
        isRaceUsable: item.isRaceUsable != null ? !!item.isRaceUsable : defaults.isRaceUsable,
        isLevelUsable: item.isLevelUsable != null ? !!item.isLevelUsable : defaults.isLevelUsable,
        isEquipped: item.isEquipped != null ? !!item.isEquipped : defaults.isEquipped,
        isIdentified: item.isIdentified != null ? !!item.isIdentified : defaults.isIdentified,
        isStackable: item.isStackable != null ? !!item.isStackable : defaults.isStackable
    };

    const parsedQty = Math.max(1, parseInt(item.quantity, 10) || 1);
    normalized.quantity = normalized.isStackable ? parsedQty : 1;
    return normalized;
}

function createItemInstanceFromBaseName(baseName, overrides = {}) {
    const base = getBaseItemRecord(baseName);
    const record = base || normalizeDbItem({ name: String(baseName || 'Unknown Item').trim(), weight: 0, type: 'equipment' });
    const defaultFlags = getDefaultItemFlags(record.name, record.type, true);

    return normalizeItemInstance({
        id: overrides.id,
        baseName: record.name,
        name: overrides.name || record.name,
        extraName: overrides.extraName || '',
        slotCost: overrides.slotCost != null ? overrides.slotCost : 1,
        modifiers: overrides.modifiers || [],
        notes: overrides.notes || '',
        weight: overrides.weight != null ? overrides.weight : (record.weight || 0),
        type: overrides.type || record.type || 'equipment',
        quantity: overrides.quantity != null ? overrides.quantity : (record.quantity || 1),
        isMagical: overrides.isMagical != null ? overrides.isMagical : (record.isMagical != null ? record.isMagical : defaultFlags.isMagical),
        isCursed: overrides.isCursed != null ? overrides.isCursed : (record.isCursed != null ? record.isCursed : defaultFlags.isCursed),
        isClassUsable: overrides.isClassUsable != null ? overrides.isClassUsable : (record.isClassUsable != null ? record.isClassUsable : defaultFlags.isClassUsable),
        isRaceUsable: overrides.isRaceUsable != null ? overrides.isRaceUsable : (record.isRaceUsable != null ? record.isRaceUsable : defaultFlags.isRaceUsable),
        isLevelUsable: overrides.isLevelUsable != null ? overrides.isLevelUsable : (record.isLevelUsable != null ? record.isLevelUsable : defaultFlags.isLevelUsable),
        isEquipped: overrides.isEquipped != null ? overrides.isEquipped : false,
        isIdentified: overrides.isIdentified != null ? overrides.isIdentified : (record.isIdentified != null ? record.isIdentified : defaultFlags.isIdentified),
        isStackable: overrides.isStackable != null ? overrides.isStackable : (record.isStackable != null ? record.isStackable : defaultFlags.isStackable)
    }, record.name, { migratedRef: { changed: false } });
}

function normalizeContainerInstance(container, migratedRef) {
    if (!container || typeof container !== 'object') {
        return {
            id: createUniqueId('con'),
            kind: 'container',
            containerType: 'Bag',
            name: 'Bag',
            extraName: '',
            capacitySlots: 10,
            baseWeight: 0.5,
            items: [],
            notes: '',
            removable: true
        };
    }

    const kind = container.kind || (container.slotKey ? 'equip' : 'container');
    const slotDef = EQUIP_SLOT_DEFS.find(def => def.slotKey === container.slotKey);
    const containerType = kind === 'inventory'
        ? 'Inventory'
        : (container.containerType || container.baseName || container.name || (slotDef ? slotDef.label : 'Bag'));
    const preset = CONTAINER_TYPE_PRESETS[containerType] || { capacitySlots: 10, baseWeight: 0.5 };

    return {
        ...container,
        id: container.id || createUniqueId('con'),
        kind,
        slotKey: container.slotKey || (kind === 'equip' && slotDef ? slotDef.slotKey : ''),
        containerType,
        name: String(container.name || (slotDef ? slotDef.label : containerType) || 'Container').trim(),
        extraName: String(container.extraName || '').trim(),
        capacitySlots: kind === 'inventory'
            ? Infinity
            : Math.max(1, parseInt(container.capacitySlots != null ? container.capacitySlots : preset.capacitySlots, 10) || preset.capacitySlots || 1),
        baseWeight: typeof container.baseWeight === 'number' ? container.baseWeight : (parseFloat(container.baseWeight) || preset.baseWeight || 0),
        items: Array.isArray(container.items)
            ? container.items.map(item => normalizeItemInstance(item, '', { migratedRef }))
            : [],
        notes: String(container.notes || '').trim(),
        removable: kind === 'equip' || kind === 'inventory' ? false : container.removable !== false
    };
}

function createContainerFromType(containerType, overrides = {}) {
    const preset = CONTAINER_TYPE_PRESETS[containerType] || { capacitySlots: 10, baseWeight: 0.5 };
    return normalizeContainerInstance({
        id: overrides.id,
        kind: 'container',
        containerType,
        name: overrides.name || containerType,
        extraName: overrides.extraName || '',
        capacitySlots: overrides.capacitySlots != null ? overrides.capacitySlots : preset.capacitySlots,
        baseWeight: overrides.baseWeight != null ? overrides.baseWeight : preset.baseWeight,
        items: overrides.items || [],
        notes: overrides.notes || '',
        removable: overrides.removable !== false
    }, { changed: false });
}

function ensureActorEquipmentModel(actor, idPrefix) {
    if (!actor || typeof actor !== 'object') return;
    const migratedRef = { changed: false };

    if (!actor.equipment || typeof actor.equipment !== 'object') {
        actor.equipment = { armor: 'None', shield: 'None', magicBonus: 0, worn: {}, containers: [], loose: [] };
        migratedRef.changed = true;
    }

    const equipment = actor.equipment;
    const incoming = Array.isArray(equipment.containers) ? equipment.containers : [];
    const migrated = [];
    const equipMap = new Map();

    incoming.forEach(container => {
        const normalized = normalizeContainerInstance(container, migratedRef);
        if (normalized.kind === 'equip' && normalized.slotKey) {
            equipMap.set(normalized.slotKey, normalized);
        }
    });

    EQUIP_SLOT_DEFS.forEach(def => {
        let container = equipMap.get(def.slotKey) || null;
        if (!container) {
            const legacy = equipment.worn && equipment.worn[def.slotKey] ? equipment.worn[def.slotKey] : null;
            const legacyArmor = def.slotKey === 'body' && equipment.armor && equipment.armor !== 'None'
                ? createItemInstanceFromBaseName(equipment.armor)
                : null;
            const legacyShield = def.slotKey === 'shield' && equipment.shield && equipment.shield !== 'None'
                ? createItemInstanceFromBaseName(equipment.shield)
                : null;
            const seedItem = legacy ? normalizeItemInstance(legacy, '', { migratedRef }) : (legacyArmor || legacyShield);
            container = normalizeContainerInstance({
                id: createUniqueId(`${idPrefix}-equip`),
                kind: 'equip',
                slotKey: def.slotKey,
                name: def.label,
                capacitySlots: def.capacitySlots,
                baseWeight: 0,
                removable: false,
                items: seedItem ? [seedItem] : []
            }, migratedRef);
        } else {
            container = normalizeContainerInstance({
                ...container,
                kind: 'equip',
                slotKey: def.slotKey,
                name: def.label,
                capacitySlots: def.capacitySlots,
                removable: false
            }, migratedRef);
        }

        container.items = container.items.slice(0, 1).map(item => ({ ...item, isEquipped: true }));
        migrated.push(container);
    });

    const inventoryItems = [];
    if (Array.isArray(equipment.loose)) inventoryItems.push(...equipment.loose);

    const existingInventory = incoming.find(container => container.kind === 'inventory' || container.id === ROOT_INVENTORY_CONTAINER_ID);
    if (existingInventory && Array.isArray(existingInventory.items)) inventoryItems.push(...existingInventory.items);

    migrated.push(normalizeContainerInstance({
        id: `${idPrefix}-${ROOT_INVENTORY_CONTAINER_ID}`,
        kind: 'inventory',
        containerType: 'Inventory',
        name: 'Inventory',
        baseWeight: 0,
        capacitySlots: Infinity,
        removable: false,
        items: inventoryItems
    }, migratedRef));

    incoming.forEach(container => {
        const normalized = normalizeContainerInstance(container, migratedRef);
        if (normalized.kind === 'equip' || normalized.kind === 'inventory') return;
        migrated.push(normalized);
    });

    equipment.containers = migrated;
    equipment.worn = {};
    equipment.loose = [];

    return migratedRef.changed;
}

function ensureSimpleContainerStore(store, idPrefix) {
    if (!store || typeof store !== 'object') {
        return {
            changed: true,
            value: {
                containers: [normalizeContainerInstance({
                    id: `${idPrefix}-${ROOT_INVENTORY_CONTAINER_ID}`,
                    kind: 'inventory',
                    containerType: 'Inventory',
                    name: 'Inventory',
                    baseWeight: 0,
                    capacitySlots: Infinity,
                    removable: false,
                    items: []
                }, { changed: false })]
            }
        };
    }

    const migratedRef = { changed: false };
    const containers = Array.isArray(store.containers) ? store.containers : [];
    const normalized = containers.map(container => normalizeContainerInstance(container, migratedRef));
    const hasInventory = normalized.some(container => container.kind === 'inventory');
    if (!hasInventory) {
        normalized.push(normalizeContainerInstance({
            id: `${idPrefix}-${ROOT_INVENTORY_CONTAINER_ID}`,
            kind: 'inventory',
            containerType: 'Inventory',
            name: 'Inventory',
            baseWeight: 0,
            capacitySlots: Infinity,
            removable: false,
            items: []
        }, migratedRef));
        migratedRef.changed = true;
    }

    return {
        changed: migratedRef.changed,
        value: { ...store, containers: normalized }
    };
}

function ensureExtendedStores() {
    let changed = false;

    if (!Array.isArray(charData.henchmen)) { charData.henchmen = []; changed = true; }
    if (!Array.isArray(charData.familiars)) { charData.familiars = []; changed = true; }
    if (!Array.isArray(charData.companions)) { charData.companions = []; changed = true; }

    charData.henchmen = charData.henchmen.map((entry, idx) => {
        const actor = {
            id: entry && entry.id ? entry.id : createUniqueId('hench'),
            name: String(entry && entry.name || `Henchman ${idx + 1}`).trim(),
            class: String(entry && entry.class || 'Fighter').trim() || 'Fighter',
            race: String(entry && entry.race || 'Human').trim() || 'Human',
            level: Math.max(1, parseInt(entry && entry.level, 10) || 1),
            equipment: entry && entry.equipment ? entry.equipment : { armor: 'None', shield: 'None', magicBonus: 0, worn: {}, containers: [], loose: [] }
        };
        const migrated = ensureActorEquipmentModel(actor, `hench-${idx}`);
        changed = changed || migrated;
        return actor;
    });

    charData.familiars = charData.familiars.map((entry, idx) => {
        const actor = {
            id: entry && entry.id ? entry.id : createUniqueId('fam'),
            name: String(entry && entry.name || `Familiar ${idx + 1}`).trim(),
            class: String(entry && entry.class || 'Mage').trim() || 'Mage',
            race: String(entry && entry.race || 'Animal').trim() || 'Animal',
            level: Math.max(1, parseInt(entry && entry.level, 10) || 1),
            equipment: entry && entry.equipment ? entry.equipment : { armor: 'None', shield: 'None', magicBonus: 0, worn: {}, containers: [], loose: [] }
        };
        const migrated = ensureActorEquipmentModel(actor, `fam-${idx}`);
        changed = changed || migrated;
        return actor;
    });

    charData.companions = charData.companions.map((entry, idx) => {
        const actor = {
            id: entry && entry.id ? entry.id : createUniqueId('comp'),
            name: String(entry && entry.name || `Companion ${idx + 1}`).trim(),
            class: String(entry && entry.class || 'Ranger').trim() || 'Ranger',
            race: String(entry && entry.race || 'Animal').trim() || 'Animal',
            level: Math.max(1, parseInt(entry && entry.level, 10) || 1),
            equipment: entry && entry.equipment ? entry.equipment : { armor: 'None', shield: 'None', magicBonus: 0, worn: {}, containers: [], loose: [] }
        };
        const migrated = ensureActorEquipmentModel(actor, `comp-${idx}`);
        changed = changed || migrated;
        return actor;
    });

    const stronghold = ensureSimpleContainerStore(charData.stronghold && charData.stronghold.storage, 'stronghold');
    charData.stronghold = { storage: stronghold.value };
    changed = changed || stronghold.changed;

    if (!Array.isArray(charData.treasureHoards) || charData.treasureHoards.length === 0) {
        charData.treasureHoards = [{ id: 'hoard-default', name: 'Main Hoard', containers: [] }];
        changed = true;
    }
    charData.treasureHoards = charData.treasureHoards.map((hoard, idx) => {
        const normalized = ensureSimpleContainerStore(hoard, `hoard-${idx}`);
        const next = { ...normalized.value, id: hoard.id || createUniqueId('hoard'), name: String(hoard.name || `Hoard ${idx + 1}`) };
        changed = changed || normalized.changed;
        return next;
    });

    const spellComponents = ensureSimpleContainerStore(charData.spellComponents, 'components');
    charData.spellComponents = spellComponents.value;
    changed = changed || spellComponents.changed;

    if (typeof charData.classificationNeedsReview !== 'boolean') {
        charData.classificationNeedsReview = false;
        changed = true;
    }

    return changed;
}

function getAllContainerStores() {
    ensureEquipmentInventoryModel();
    const stores = [
        {
            scope: 'PC',
            owner: charData.name || 'Character',
            actor: charData,
            containers: Array.isArray(charData.equipment && charData.equipment.containers) ? charData.equipment.containers : []
        }
    ];

    (Array.isArray(charData.henchmen) ? charData.henchmen : []).forEach(entry => {
        stores.push({
            scope: 'Henchman',
            owner: entry.name || 'Henchman',
            actor: entry,
            containers: Array.isArray(entry.equipment && entry.equipment.containers) ? entry.equipment.containers : []
        });
    });

    (Array.isArray(charData.familiars) ? charData.familiars : []).forEach(entry => {
        stores.push({
            scope: 'Familiar',
            owner: entry.name || 'Familiar',
            actor: entry,
            containers: Array.isArray(entry.equipment && entry.equipment.containers) ? entry.equipment.containers : []
        });
    });

    (Array.isArray(charData.companions) ? charData.companions : []).forEach(entry => {
        stores.push({
            scope: 'Companion',
            owner: entry.name || 'Companion',
            actor: entry,
            containers: Array.isArray(entry.equipment && entry.equipment.containers) ? entry.equipment.containers : []
        });
    });

    stores.push({
        scope: 'Stronghold',
        owner: 'Stronghold Storage',
        actor: null,
        containers: Array.isArray(charData.stronghold && charData.stronghold.storage && charData.stronghold.storage.containers)
            ? charData.stronghold.storage.containers
            : []
    });

    (Array.isArray(charData.treasureHoards) ? charData.treasureHoards : []).forEach(hoard => {
        stores.push({
            scope: 'Treasure Hoard',
            owner: hoard.name || 'Hoard',
            actor: null,
            containers: Array.isArray(hoard.containers) ? hoard.containers : []
        });
    });

    stores.push({
        scope: 'Spell Components',
        owner: 'Spell Components',
        actor: null,
        containers: Array.isArray(charData.spellComponents && charData.spellComponents.containers)
            ? charData.spellComponents.containers
            : []
    });

    return stores;
}

function getContainerContextById(containerId) {
    if (!containerId) return null;
    for (const store of getAllContainerStores()) {
        const index = store.containers.findIndex(container => container.id === containerId);
        if (index >= 0) {
            return {
                ...store,
                container: store.containers[index],
                containerIndex: index
            };
        }
    }
    return null;
}

function removeContainerById(containerId) {
    const context = getContainerContextById(containerId);
    if (!context) return false;
    context.containers.splice(context.containerIndex, 1);
    return true;
}

function getEquipmentContainers() {
    ensureEquipmentInventoryModel();
    return Array.isArray(charData.equipment.containers) ? charData.equipment.containers : [];
}

function getContainerById(containerId) {
    const context = getContainerContextById(containerId);
    return context ? context.container : null;
}

function getEquipContainer(slotKey) {
    return getEquipmentContainers().find(container => container.kind === 'equip' && container.slotKey === slotKey) || null;
}

function getInventoryContainer() {
    return getEquipmentContainers().find(container => container.kind === 'inventory') || null;
}

function getContainerSlotUsage(container) {
    const items = container && Array.isArray(container.items) ? container.items : [];
    return items.reduce((sum, item) => sum + (Math.max(1, parseInt(item.slotCost, 10) || 1)), 0);
}

function getContainerWeight(container) {
    if (!container) return 0;
    const itemWeight = (Array.isArray(container.items) ? container.items : []).reduce((sum, item) => {
        const qty = item && item.isStackable ? Math.max(1, parseInt(item.quantity, 10) || 1) : 1;
        return sum + ((parseFloat(item.weight) || 0) * qty);
    }, 0);
    return itemWeight + (parseFloat(container.baseWeight) || 0);
}

function getContainerItemCount(container) {
    return Array.isArray(container && container.items) ? container.items.length : 0;
}

function syncLegacyEquipmentFields() {
    if (!charData.equipment) return;
    const containers = Array.isArray(charData.equipment.containers) ? charData.equipment.containers : [];
    const body = containers.find(container => container.kind === 'equip' && container.slotKey === 'body') || null;
    const shield = containers.find(container => container.kind === 'equip' && container.slotKey === 'shield') || null;
    const bodyItem = body && body.items[0] ? body.items[0] : null;
    const shieldItem = shield && shield.items[0] ? shield.items[0] : null;
    charData.equipment.armor = bodyItem ? bodyItem.baseName : 'None';
    charData.equipment.shield = shieldItem ? shieldItem.baseName : 'None';
}

function ensureEquipmentInventoryModel() {
    if (isNormalizingEquipment) return;
    isNormalizingEquipment = true;

    try {
        if (!charData.equipment || typeof charData.equipment !== 'object') {
            charData.equipment = { armor: 'None', shield: 'None', magicBonus: 0, worn: {}, containers: [], loose: [] };
        }

        const mainMigrated = ensureActorEquipmentModel(charData, 'pc');
        const extraMigrated = ensureExtendedStores();
        if (mainMigrated || extraMigrated) {
            charData.classificationNeedsReview = true;
        }

        syncLegacyEquipmentFields();
    } finally {
        isNormalizingEquipment = false;
    }
}

function getActorProfile(actor) {
    return {
        class: String(actor && actor.class || charData.class || 'Fighter'),
        race: String(actor && actor.race || charData.race || 'Human'),
        level: Math.max(1, parseInt(actor && actor.level, 10) || charData.level || 1)
    };
}

function getAdndClassRestrictionMessage(actorProfile, item, slotKey) {
    const cls = actorProfile.class;
    const armor = slotKey === 'body' ? item.baseName : 'None';
    const shield = slotKey === 'shield' ? item.baseName : 'None';

    if (cls === 'Mage' && (slotKey === 'body' || slotKey === 'shield')) {
        return 'AD&D 2e: Mages cannot equip armor or shields.';
    }

    if (cls === 'Thief' && slotKey === 'body' && !['None', 'Leather Armor', 'Studded Leather', 'Padded Armor'].includes(armor)) {
        return 'AD&D 2e: Thieves are restricted to padded, leather, or studded leather armor.';
    }

    if (cls === 'Ranger' && slotKey === 'body' && !['None', 'Leather Armor', 'Studded Leather', 'Padded Armor', 'Hide Armor', 'Chainmail'].includes(armor)) {
        return 'AD&D 2e: Rangers cannot wear armor heavier than chainmail.';
    }

    if (cls === 'Druid' && slotKey === 'body' && !['None', 'Leather Armor', 'Studded Leather', 'Padded Armor', 'Hide Armor'].includes(armor)) {
        return 'AD&D 2e: Druids cannot wear metal armor.';
    }

    if (cls === 'Druid' && slotKey === 'shield' && !['None', 'Small Shield'].includes(shield)) {
        return 'AD&D 2e: Druids are limited to small shields.';
    }

    return '';
}

function validateItemForSlot(item, slotKey, actorProfile) {
    const allowed = SLOT_ALLOWED_ITEM_TYPES[slotKey] || ITEM_TYPE_ENUM;
    if (!allowed.includes(item.type)) {
        return {
            ok: false,
            message: `AD&D 2e: ${buildItemDisplayName(item)} is type '${item.type}' and cannot be equipped in ${slotKey}.`
        };
    }

    if (!item.isClassUsable) {
        return { ok: false, message: 'AD&D 2e: Item class usability check failed (isClassUsable = false).' };
    }
    if (!item.isRaceUsable) {
        return { ok: false, message: 'AD&D 2e: Item race usability check failed (isRaceUsable = false).' };
    }
    if (!item.isLevelUsable) {
        return { ok: false, message: 'AD&D 2e: Item level usability check failed (isLevelUsable = false).' };
    }

    const classRestriction = getAdndClassRestrictionMessage(actorProfile, item, slotKey);
    if (classRestriction) return { ok: false, message: classRestriction };

    return { ok: true, message: '' };
}

function setEquippedItem(slotKey, itemOrName) {
    ensureEquipmentInventoryModel();
    const container = getEquipContainer(slotKey);
    if (!container) return;

    if (!itemOrName || (typeof itemOrName === 'string' && !String(itemOrName).trim()) || itemOrName === 'None') {
        container.items = [];
        syncLegacyEquipmentFields();
        return;
    }

    const item = typeof itemOrName === 'string' ? createItemInstanceFromBaseName(itemOrName) : normalizeItemInstance(itemOrName, '', { migratedRef: { changed: false } });
    const actorProfile = getActorProfile(charData);
    const validation = validateItemForSlot(item, slotKey, actorProfile);
    if (!validation.ok) {
        showRulesBanner(validation.message);
        return;
    }

    item.isEquipped = true;
    container.items = [item];
    syncLegacyEquipmentFields();
}

function getEquippedItem(slotKey) {
    const container = getEquipContainer(slotKey);
    return container && container.items[0] ? container.items[0] : null;
}

function clearEquippedItem(slotKey) {
    setEquippedItem(slotKey, null);
}

function revalidateActorEquipment(actor, actorName) {
    if (!actor || !actor.equipment || !Array.isArray(actor.equipment.containers)) return [];
    const actorProfile = getActorProfile(actor);
    const messages = [];

    actor.equipment.containers.forEach(container => {
        if (container.kind !== 'equip' || !container.items || container.items.length === 0) return;
        const item = normalizeItemInstance(container.items[0], '', { migratedRef: { changed: false } });
        const validation = validateItemForSlot(item, container.slotKey, actorProfile);
        if (!validation.ok) {
            container.items = [];
            messages.push(`${actorName}: ${validation.message}`);
        }
    });

    return messages;
}

function reevaluatePrimaryCharacterEquipment() {
    ensureEquipmentInventoryModel();
    const messages = revalidateActorEquipment(charData, 'Character');
    charData.henchmen.forEach(entry => messages.push(...revalidateActorEquipment(entry, entry.name || 'Henchman')));
    charData.familiars.forEach(entry => messages.push(...revalidateActorEquipment(entry, entry.name || 'Familiar')));
    charData.companions.forEach(entry => messages.push(...revalidateActorEquipment(entry, entry.name || 'Companion')));

    syncLegacyEquipmentFields();
    return messages;
}

function getItemModifierTotal(item) {
    return (Array.isArray(item && item.modifiers) ? item.modifiers : []).reduce((sum, modifier) => sum + (parseInt(modifier.value, 10) || 0), 0);
}

function getItemModifierSummary(item) {
    const modifiers = Array.isArray(item && item.modifiers) ? item.modifiers : [];
    if (modifiers.length === 0) return '';
    return modifiers.map(modifier => {
        const value = parseInt(modifier.value, 10) || 0;
        const sign = value >= 0 ? '+' : '';
        const type = ensureEnumValue(MODIFIER_TYPE_ENUM, modifier.modifierType, 'other');
        const target = ensureEnumValue(MODIFIER_TARGET_ENUM, modifier.target, 'self');
        const note = modifier.note ? ` ${modifier.note}` : '';
        return `${sign}${value} ${type}@${target}${note}`.trim();
    }).join(', ');
}

function getItemSummaryHtml(item) {
    const modifierSummary = getItemModifierSummary(item);
    const extra = item.extraName ? ` <span style="color:#666;">(${escapeHtml(item.extraName)})</span>` : '';
    const mods = modifierSummary ? ` <span style="color:#005a2a;">[${escapeHtml(modifierSummary)}]</span>` : '';
    const qty = item.isStackable ? ` <span style="color:#5d463a;">x${Math.max(1, parseInt(item.quantity, 10) || 1)}</span>` : '';
    return `${escapeHtml(buildItemDisplayName(item))}${extra}${qty}${mods}`;
}

function getAllFlatItems() {
    return getEquipmentContainers().flatMap(container => {
        const items = Array.isArray(container.items) ? container.items : [];
        return items.map(item => ({
            containerId: container.id,
            containerLabel: container.name,
            containerKind: container.kind,
            item
        }));
    });
}

function getInventoryFilterState() {
    return {
        type: String(document.getElementById('inv-filter-type')?.value || 'all'),
        magical: String(document.getElementById('inv-filter-magical')?.value || 'all'),
        usable: String(document.getElementById('inv-filter-usable')?.value || 'all'),
        sort: String(document.getElementById('inv-sort-mode')?.value || 'name')
    };
}

function applyInventoryFilters(items) {
    const state = getInventoryFilterState();
    const filtered = items.filter(entry => {
        const item = entry.item;
        if (state.type !== 'all' && item.type !== state.type) return false;
        if (state.magical === 'magical' && !item.isMagical) return false;
        if (state.magical === 'mundane' && item.isMagical) return false;

        const usable = item.isClassUsable && item.isRaceUsable && item.isLevelUsable;
        if (state.usable === 'usable' && !usable) return false;
        if (state.usable === 'blocked' && usable) return false;

        return true;
    });

    filtered.sort((a, b) => {
        const itemA = a.item;
        const itemB = b.item;
        if (state.sort === 'type') {
            const byType = itemA.type.localeCompare(itemB.type);
            if (byType !== 0) return byType;
            return buildItemDisplayName(itemA).localeCompare(buildItemDisplayName(itemB));
        }
        if (state.sort === 'weight') {
            const byWeight = (parseFloat(itemA.weight) || 0) - (parseFloat(itemB.weight) || 0);
            if (byWeight !== 0) return byWeight;
            return buildItemDisplayName(itemA).localeCompare(buildItemDisplayName(itemB));
        }
        if (state.sort === 'magical') {
            const byMagical = Number(itemB.isMagical) - Number(itemA.isMagical);
            if (byMagical !== 0) return byMagical;
            return buildItemDisplayName(itemA).localeCompare(buildItemDisplayName(itemB));
        }
        if (state.sort === 'usability') {
            const useA = Number(itemA.isClassUsable && itemA.isRaceUsable && itemA.isLevelUsable);
            const useB = Number(itemB.isClassUsable && itemB.isRaceUsable && itemB.isLevelUsable);
            const byUse = useB - useA;
            if (byUse !== 0) return byUse;
            return buildItemDisplayName(itemA).localeCompare(buildItemDisplayName(itemB));
        }
        return buildItemDisplayName(itemA).localeCompare(buildItemDisplayName(itemB));
    });

    return filtered;
}

function renderWearSlots() {
    ensureEquipmentInventoryModel();
    const slots = EQUIP_SLOT_GROUPS.map(group => {
        const containers = group.slots
            .map(slotKey => getEquipContainer(slotKey) || getEquipmentContainers().find(entry => entry.kind === 'equip' && entry.slotKey === slotKey))
            .filter(Boolean);
        const primary = containers[0] || null;
        const items = containers.flatMap(container => Array.isArray(container.items) ? container.items : []);
        const preview = items.length === 0
            ? '<div class="slot-empty">Empty</div>'
            : items.map(item => `<div class="slot-item">${getItemSummaryHtml(item)}</div>`).join('');
        const editTarget = primary ? primary.id : (getEquipContainer(group.slots[0]) ? getEquipContainer(group.slots[0]).id : '');

        const totalUsed = group.slots.reduce((sum, slotKey) => {
            const container = getEquipContainer(slotKey);
            return sum + getContainerSlotUsage(container);
        }, 0);
        const totalCapacity = group.slots.reduce((sum, slotKey) => {
            const container = getEquipContainer(slotKey);
            const def = EQUIP_SLOT_DEFS.find(entry => entry.slotKey === slotKey);
            const capacity = container ? container.capacitySlots : (def ? def.capacitySlots : 1);
            return sum + (capacity === Infinity ? 0 : capacity);
        }, 0);

        return `
        <div class="slot-card">
            <div class="slot-card-head">
                <div>
                    <strong>${escapeHtml(group.label)}</strong>
                    <span class="slot-count">${totalUsed}/${totalCapacity}</span>
                </div>
                <div class="slot-card-actions">
                    <button type="button" onclick="openContainerModal('${escapeAttr(editTarget)}')">Edit</button>
                </div>
            </div>
            <div class="slot-card-body">
                <div style="border-top:1px dotted rgba(92,64,51,0.35); padding-top:6px; margin-top:6px;">
                    ${preview}
                </div>
            </div>
        </div>`;
    }).join('');

    const target = document.getElementById('wear-slots');
    if (target) target.innerHTML = slots;
}

function getClassificationReviewBannerHtml() {
    if (!charData.classificationNeedsReview) return '';
    return `
        <div style="padding:6px; border:1px solid #9f7b00; background:#fff5cc; color:#5d4300; border-radius:4px; margin-bottom:6px; font-size:0.75rem;">
            Item classification migration applied defaults. Review all classifications before play.
            <button type="button" style="margin-left:8px;" onclick="openClassificationBatchEditor()">Review Now</button>
            <button type="button" style="margin-left:4px;" onclick="dismissClassificationReviewNotice()">Dismiss</button>
        </div>`;
}

function dismissClassificationReviewNotice() {
    charData.classificationNeedsReview = false;
    renderInventory();
}

function renderInventory() {
    ensureEquipmentInventoryModel();
    const carriedItems = applyInventoryFilters(getAllFlatItems());

    const containerHtml = getEquipmentContainers()
        .filter(container => container.kind === 'container')
        .map(container => `
        <div class="inventory-card">
            <div class="slot-card-head">
                <div>
                    <strong>${escapeHtml(container.name)}</strong>
                    <span class="slot-count">${getContainerSlotUsage(container)}/${container.capacitySlots === Infinity ? '∞' : container.capacitySlots}</span>
                </div>
                <div class="slot-card-actions">
                    <button type="button" onclick="openContainerModal('${container.id}')">Edit</button>
                </div>
            </div>
            <div class="inventory-preview">
                ${container.items.length === 0
                    ? '<div class="slot-empty">Empty container.</div>'
                    : container.items.map(item => `<div class="slot-item">${getItemSummaryHtml(item)}</div>`).join('')}
            </div>
            <button type="button" class="add-btn" style="margin-top:8px; background:#d6d6d6;" onclick="addItemTo('${container.id}')">+ Item</button>
        </div>`)
        .join('');

    const looseTarget = document.getElementById('loose-inventory');
    if (looseTarget) looseTarget.innerHTML = '';

    const containersTarget = document.getElementById('containers-list');
    if (containersTarget) {
        containersTarget.innerHTML = containerHtml || '<div class="slot-empty">No containers added yet.</div>';
    }

    const allItemsTarget = document.getElementById('all-items-summary');
    if (allItemsTarget) {
        allItemsTarget.innerHTML = `${getClassificationReviewBannerHtml()}${carriedItems.length === 0
            ? '<div class="slot-empty">No carried items (or none match filter).</div>'
            : carriedItems.map(entry => {
                const useBtn = entry.item.type === 'consumable'
                    ? `<button type="button" style="padding:0 4px; font-size:0.7rem;" onclick="useItem('${entry.containerId}', '${entry.item.id}')">Use</button>`
                    : '';
                return `
                <div class="item-row">
                    <span>${getItemSummaryHtml(entry.item)} <small style="color:#666;">[${escapeHtml(entry.containerLabel)}]</small></span>
                    <span>
                        <button type="button" style="padding:0 4px; font-size:0.7rem;" onclick="openItemDetailModal('${entry.containerId}', '${entry.item.id}')">View</button>
                        <button type="button" style="padding:0 4px; font-size:0.7rem;" onclick="openItemModal('${entry.containerId}', '${entry.item.id}')">Edit</button>
                        ${useBtn}
                    </span>
                </div>`;
            }).join('')}`;
    }
}

function populateItemModalBaseOptions(selectedName) {
    const select = document.getElementById('item-modal-base');
    if (!select) return;
    const options = getBaseItemOptions();
    select.innerHTML = options.map(name => `<option value="${escapeAttr(name)}" ${selectedName === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
}

function persistItemDatabase() {
    localStorage.setItem('itemsDB', JSON.stringify((Array.isArray(itemDb) ? itemDb : []).map(entry => {
        const normalized = normalizeDbItem(entry);
        return {
            name: normalized.name,
            weight: normalized.weight,
            type: normalized.type,
            itemCategory: normalized.itemCategory,
            itemSubcategory: normalized.itemSubcategory,
            roles: normalized.roles,
            damageTypes: normalized.damageTypes,
            modifierProfiles: normalized.modifierProfiles,
            usage: normalized.usage,
            isMagical: normalized.isMagical,
            isCursed: normalized.isCursed,
            isClassUsable: normalized.isClassUsable,
            isRaceUsable: normalized.isRaceUsable,
            isLevelUsable: normalized.isLevelUsable,
            isIdentified: normalized.isIdentified,
            isStackable: normalized.isStackable,
            description: normalized.description || ''
        };
    }).filter(Boolean)));
}

function renderItemModalModifiers(item) {
    const target = document.getElementById('item-modal-mods');
    if (!target) return;
    const mods = Array.isArray(item && item.modifiers) ? item.modifiers : [];
    target.innerHTML = mods.length === 0
        ? '<div class="slot-empty">No modifiers.</div>'
        : mods.map((modifier, index) => `
            <div class="modifier-row" data-idx="${index}">
                <input type="number" class="modifier-value" value="${escapeAttr(modifier.value)}" min="-99" max="99">
                <input type="text" class="modifier-note" value="${escapeAttr(modifier.note || '')}" placeholder="short note">
                <button type="button" onclick="removeItemModifierRow(this)">Remove</button>
            </div>`).join('');
}

function setFlagCheckbox(id, value) {
    const input = document.getElementById(id);
    if (input) input.checked = !!value;
}

function getFlagCheckbox(id) {
    return !!document.getElementById(id)?.checked;
}

function openNewItemModal() {
    const modal = document.getElementById('new-item-modal');
    if (!modal) return;
    const nameInput = document.getElementById('new-item-name');
    const weightInput = document.getElementById('new-item-weight');
    const typeSelect = document.getElementById('new-item-type');
    if (nameInput) nameInput.value = '';
    if (weightInput) weightInput.value = '';
    if (typeSelect) typeSelect.value = 'equipment';

    setFlagCheckbox('new-item-flag-magical', false);
    setFlagCheckbox('new-item-flag-cursed', false);
    setFlagCheckbox('new-item-flag-class', true);
    setFlagCheckbox('new-item-flag-race', true);
    setFlagCheckbox('new-item-flag-level', true);
    setFlagCheckbox('new-item-flag-identified', true);
    setFlagCheckbox('new-item-flag-stackable', false);

    modal.style.display = 'flex';
}

function closeNewItemModal() {
    const modal = document.getElementById('new-item-modal');
    if (modal) modal.style.display = 'none';
}

function openClassificationBatchEditorFrom(source) {
    const key = String(source || '').toLowerCase();
    if (key === 'item') {
        closeItemModal();
    } else if (key === 'container') {
        closeContainerModal();
    } else if (key === 'new-item') {
        closeNewItemModal();
    }
    openClassificationBatchEditor();
}

function saveNewItemModal() {
    ensureEquipmentInventoryModel();
    const nameInput = document.getElementById('new-item-name');
    const weightInput = document.getElementById('new-item-weight');
    const typeSelect = document.getElementById('new-item-type');
    const name = String(nameInput && nameInput.value || '').trim();
    if (!name) {
        alert('Enter a new item name.');
        return;
    }

    const type = ensureItemType(String(typeSelect && typeSelect.value || '').trim());
    if (!ITEM_TYPE_ENUM.includes(type)) {
        alert('Select a valid item type.');
        return;
    }

    const weight = parseFloat(weightInput && weightInput.value);
    const next = {
        name,
        weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
        type,
        isMagical: getFlagCheckbox('new-item-flag-magical'),
        isCursed: getFlagCheckbox('new-item-flag-cursed'),
        isClassUsable: getFlagCheckbox('new-item-flag-class'),
        isRaceUsable: getFlagCheckbox('new-item-flag-race'),
        isLevelUsable: getFlagCheckbox('new-item-flag-level'),
        isEquipped: false,
        isIdentified: getFlagCheckbox('new-item-flag-identified'),
        isStackable: getFlagCheckbox('new-item-flag-stackable')
    };

    const existingIndex = (Array.isArray(itemDb) ? itemDb : []).findIndex(entry => String(entry && entry.name || '').trim().toLowerCase() === name.toLowerCase());
    if (existingIndex >= 0) {
        itemDb[existingIndex] = { ...itemDb[existingIndex], ...next };
    } else {
        itemDb.push(next);
    }

    persistItemDatabase();
    populateItemModalBaseOptions(name);
    const select = document.getElementById('item-modal-base');
    if (select) select.value = name;
    closeNewItemModal();
}

function openContainerModal(containerId) {
    ensureEquipmentInventoryModel();
    const container = getContainerById(containerId);
    if (!container) return;
    activeContainerId = container.id;

    const modal = document.getElementById('container-modal');
    const title = document.getElementById('container-modal-title');
    const nameInput = document.getElementById('container-modal-name');
    const typeSelect = document.getElementById('container-modal-type');
    const capInput = document.getElementById('container-modal-capacity');
    const weightInput = document.getElementById('container-modal-weight');
    const slotText = document.getElementById('container-modal-slot-text');
    const itemList = document.getElementById('container-modal-items');
    const deleteButton = document.getElementById('container-modal-delete');

    if (!modal || !title || !nameInput || !typeSelect || !capInput || !weightInput || !slotText || !itemList || !deleteButton) return;

    title.textContent = container.kind === 'equip'
        ? `${container.name} Slot`
        : (container.kind === 'inventory' ? 'Inventory' : 'Container');

    nameInput.value = container.name || '';
    typeSelect.value = container.kind === 'container' ? (container.containerType || 'Bag') : 'Inventory';
    typeSelect.disabled = container.kind !== 'container';
    nameInput.disabled = container.kind === 'equip';
    capInput.value = container.capacitySlots === Infinity ? '' : String(container.capacitySlots);
    capInput.disabled = container.kind !== 'container';
    weightInput.value = String(container.baseWeight || 0);
    weightInput.disabled = container.kind !== 'container';
    slotText.textContent = `${getContainerSlotUsage(container)} slots used`;
    deleteButton.style.display = container.removable === false ? 'none' : 'inline-block';
    deleteButton.disabled = container.removable === false;
    deleteButton.textContent = container.kind === 'container' ? 'Delete Container' : 'Delete';

    const addItemBtn = document.getElementById('container-modal-add-item');
    if (addItemBtn) {
        // For equip slots with capacity 1 that are already occupied, disable the button
        const isEquipFull = container.kind === 'equip' && container.items.length >= container.capacitySlots;
        addItemBtn.disabled = isEquipFull;
        addItemBtn.title = isEquipFull ? 'Slot occupied — edit the existing item to replace it' : '';
    }

    itemList.innerHTML = container.items.length === 0
        ? '<div class="slot-empty">No items in this container.</div>'
        : container.items.map(item => {
            const useBtn = item.type === 'consumable'
                ? `<button type="button" style="padding:0 4px; font-size:0.7rem;" onclick="useItem('${container.id}', '${item.id}')">Use</button>`
                : '';
            return `
            <div class="item-row">
                <span>${getItemSummaryHtml(item)} <small style="color:#666;">(${Math.max(1, parseInt(item.slotCost, 10) || 1)} slot${Math.max(1, parseInt(item.slotCost, 10) || 1) === 1 ? '' : 's'})</small></span>
                <span>
                    <button type="button" style="padding:0 4px; font-size:0.7rem;" onclick="openItemDetailModal('${container.id}', '${item.id}')">View</button>
                    <button type="button" style="padding:0 4px; font-size:0.7rem;" onclick="openItemModal('${container.id}', '${item.id}')">Edit</button>
                    <button type="button" style="padding:0 4px; font-size:0.7rem;" onclick="deleteItemFromContainer('${container.id}', '${item.id}')">Del</button>
                    ${useBtn}
                </span>
            </div>`;
        }).join('');

    modal.style.display = 'flex';
}

function addCurrentContainerItem() {
    if (!activeContainerId) return;
    openItemModal(activeContainerId);
}

function refreshContainerModalItems(overrideId) {
    const modal = document.getElementById('container-modal');
    if (!modal || modal.style.display === 'none') return;
    const container = getContainerById(overrideId || activeContainerId);
    if (!container) return;
    activeContainerId = container.id;

    const slotText = document.getElementById('container-modal-slot-text');
    if (slotText) slotText.textContent = `${getContainerSlotUsage(container)} slots used`;

    const addItemBtn = document.getElementById('container-modal-add-item');
    if (addItemBtn) {
        const isEquipFull = container.kind === 'equip' && container.items.length >= container.capacitySlots;
        addItemBtn.disabled = isEquipFull;
        addItemBtn.title = isEquipFull ? 'Slot occupied — edit the existing item to replace it' : '';
    }

    const itemList = document.getElementById('container-modal-items');
    if (!itemList) return;
    itemList.innerHTML = container.items.length === 0
        ? '<div class="slot-empty">No items in this container.</div>'
        : container.items.map(item => {
            const useBtn = item.type === 'consumable'
                ? `<button type="button" style="padding:0 4px; font-size:0.7rem;" onclick="useItem('${container.id}', '${item.id}')">Use</button>`
                : '';
            return `
            <div class="item-row">
                <span>${getItemSummaryHtml(item)} <small style="color:#666;">(${Math.max(1, parseInt(item.slotCost, 10) || 1)} slot${Math.max(1, parseInt(item.slotCost, 10) || 1) === 1 ? '' : 's'})</small></span>
                <span>
                    <button type="button" style="padding:0 4px; font-size:0.7rem;" onclick="openItemDetailModal('${container.id}', '${item.id}')">View</button>
                    <button type="button" style="padding:0 4px; font-size:0.7rem;" onclick="openItemModal('${container.id}', '${item.id}')">Edit</button>
                    <button type="button" style="padding:0 4px; font-size:0.7rem;" onclick="deleteItemFromContainer('${container.id}', '${item.id}')">Del</button>
                    ${useBtn}
                </span>
            </div>`;
        }).join('');
}

function closeContainerModal() {
    const modal = document.getElementById('container-modal');
    if (modal) modal.style.display = 'none';
    activeContainerId = '';
}

function populateItemTypeSelect(id, value) {
    const select = document.getElementById(id);
    if (!select) return;
    const normalized = ensureItemType(value);
    select.innerHTML = ITEM_TYPE_ENUM
        .map(type => `<option value="${escapeAttr(type)}" ${type === normalized ? 'selected' : ''}>${escapeHtml(type)}</option>`)
        .join('');
}

function openItemModal(containerId, itemId) {
    ensureEquipmentInventoryModel();
    const container = getContainerById(containerId) || getInventoryContainer();
    if (!container) return;
    activeContainerId = container.id;
    activeItemId = itemId || '';

    const existing = itemId ? container.items.find(item => item.id === itemId) : null;
    const item = existing ? normalizeItemInstance(existing, '', { migratedRef: { changed: false } }) : createItemInstanceFromBaseName(getBaseItemOptions()[0] || 'Unknown Item');
    const modal = document.getElementById('item-modal');
    if (!modal) return;

    document.getElementById('item-modal-title').textContent = existing ? 'Edit Item' : 'Add Item';
    document.getElementById('item-modal-id').value = item.id;
    document.getElementById('item-modal-container').value = container.id;
    document.getElementById('item-modal-extra').value = item.extraName || '';
    document.getElementById('item-modal-slot').value = String(item.slotCost || 1);
    document.getElementById('item-modal-qty').value = String(item.quantity || 1);
    document.getElementById('item-modal-notes').value = item.notes || '';
    populateItemModalBaseOptions(item.baseName);
    populateItemTypeSelect('item-modal-type', item.type);
    renderItemModalModifiers(item);

    setFlagCheckbox('item-modal-flag-magical', item.isMagical);
    setFlagCheckbox('item-modal-flag-cursed', item.isCursed);
    setFlagCheckbox('item-modal-flag-class', item.isClassUsable);
    setFlagCheckbox('item-modal-flag-race', item.isRaceUsable);
    setFlagCheckbox('item-modal-flag-level', item.isLevelUsable);
    setFlagCheckbox('item-modal-flag-identified', item.isIdentified);
    setFlagCheckbox('item-modal-flag-stackable', item.isStackable);

    modal.style.display = 'flex';
}

function closeItemModal() {
    const modal = document.getElementById('item-modal');
    if (modal) modal.style.display = 'none';
    activeContainerId = '';
    activeItemId = '';
}

function addItemModifierRow() {
    const list = document.getElementById('item-modal-mods');
    if (!list) return;
    if (list.querySelector('.slot-empty')) list.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'modifier-row';
    row.innerHTML = `
        <input type="number" class="modifier-value" value="0" min="-99" max="99">
        <input type="text" class="modifier-note" value="" placeholder="short note">
        <button type="button" onclick="removeItemModifierRow(this)">Remove</button>`;
    list.appendChild(row);
}

function removeItemModifierRow(button) {
    const row = button && button.closest ? button.closest('.modifier-row') : null;
    if (row) row.remove();
}

function readItemModalModifiers() {
    const rows = Array.from(document.querySelectorAll('#item-modal-mods .modifier-row'));
    return rows.map(row => ({
        id: createUniqueId('mod'),
        value: parseInt(row.querySelector('.modifier-value')?.value, 10) || 0,
        note: String(row.querySelector('.modifier-note')?.value || '').trim(),
        modifierType: 'other',
        target: 'self',
        role: 'utility',
        stackingRule: 'stack',
        condition: '',
        source: ''
    })).filter(modifier => modifier.value !== 0 || modifier.note);
}

function saveItemModal() {
    ensureEquipmentInventoryModel();
    const containerId = document.getElementById('item-modal-container').value;
    const container = getContainerById(containerId)
        || getContainerById(activeContainerId)
        || getInventoryContainer();
    if (!container) {
        alert('Unable to find target container for this item. Reopen the slot/container and try again.');
        return;
    }

    const baseName = String(document.getElementById('item-modal-base').value || '').trim();
    const itemType = ensureItemType(document.getElementById('item-modal-type').value);
    if (!baseName) {
        alert('Base item is required.');
        return;
    }
    if (!ITEM_TYPE_ENUM.includes(itemType)) {
        alert('Item type is required.');
        return;
    }

    const extraName = document.getElementById('item-modal-extra').value.trim();
    const slotCost = Math.max(1, parseInt(document.getElementById('item-modal-slot').value, 10) || 1);
    const quantityInput = Math.max(1, parseInt(document.getElementById('item-modal-qty').value, 10) || 1);
    const notes = document.getElementById('item-modal-notes').value.trim();
    const modifiers = readItemModalModifiers();
    const previous = activeItemId ? container.items.find(item => item.id === activeItemId) : null;

    const next = normalizeItemInstance({
        id: previous ? previous.id : document.getElementById('item-modal-id').value || createUniqueId('itm'),
        baseName,
        extraName,
        slotCost,
        notes,
        modifiers,
        weight: previous ? previous.weight : undefined,
        type: itemType,
        quantity: quantityInput,
        isMagical: getFlagCheckbox('item-modal-flag-magical'),
        isCursed: getFlagCheckbox('item-modal-flag-cursed'),
        isClassUsable: getFlagCheckbox('item-modal-flag-class'),
        isRaceUsable: getFlagCheckbox('item-modal-flag-race'),
        isLevelUsable: getFlagCheckbox('item-modal-flag-level'),
        isEquipped: container.kind === 'equip',
        isIdentified: getFlagCheckbox('item-modal-flag-identified'),
        isStackable: getFlagCheckbox('item-modal-flag-stackable')
    }, baseName, { migratedRef: { changed: false } });

    if (container.kind === 'equip') {
        const context = getContainerContextById(container.id);
        const actorProfile = getActorProfile(context && context.actor ? context.actor : charData);
        const validation = validateItemForSlot(next, container.slotKey, actorProfile);
        if (!validation.ok) {
            alert(validation.message);
            return;
        }
    }

    if (container.kind === 'equip') {
        // Use canonical equip path so slot updates stay consistent with legacy fields and restrictions.
        setEquippedItem(container.slotKey, next);
    } else if (activeItemId) {
        const index = container.items.findIndex(item => item.id === activeItemId);
        if (index >= 0) {
            container.items[index] = next;
        } else {
            container.items.push(next);
        }
    } else {
        container.items.push(next);
    }

    syncLegacyEquipmentFields();
    const savedContainerId = activeContainerId;
    closeItemModal();
    refreshContainerModalItems(savedContainerId);
    renderWearSlots();
    renderInventory();
    updateCalculations();
}

function deleteItemFromContainer(containerId, itemId) {
    ensureEquipmentInventoryModel();
    const container = getContainerById(containerId);
    if (!container) return;
    const index = container.items.findIndex(item => item.id === itemId);
    if (index < 0) return;
    if (!confirm(`Remove ${container.items[index].name}?`)) return;
    container.items.splice(index, 1);
    if (activeContainerId === containerId && activeItemId === itemId) {
        closeItemModal();
    }
    syncLegacyEquipmentFields();
    refreshContainerModalItems();
    renderWearSlots();
    renderInventory();
    updateCalculations();
}

function useItem(containerId, itemId) {
    ensureEquipmentInventoryModel();
    const container = getContainerById(containerId);
    if (!container) return;
    const item = container.items.find(entry => entry.id === itemId);
    if (!item) return;
    if (item.type !== 'consumable') {
        alert('Only consumables can be used with this action.');
        return;
    }

    const qty = Math.max(1, parseInt(item.quantity, 10) || 1) - 1;
    if (qty <= 0) {
        container.items = container.items.filter(entry => entry.id !== item.id);
    } else {
        item.quantity = qty;
    }

    renderInventory();
    updateCalculations();
}

function saveContainerModal() {
    ensureEquipmentInventoryModel();
    const container = getContainerById(activeContainerId);
    if (!container) return;

    if (container.kind === 'equip' || container.kind === 'inventory') {
        closeContainerModal();
        return;
    }

    const name = document.getElementById('container-modal-name').value.trim() || container.name;
    const type = document.getElementById('container-modal-type').value || container.containerType || 'Bag';
    const capacity = Math.max(1, parseInt(document.getElementById('container-modal-capacity').value, 10) || (CONTAINER_TYPE_PRESETS[type] && CONTAINER_TYPE_PRESETS[type].capacitySlots) || 1);
    const weight = parseFloat(document.getElementById('container-modal-weight').value) || 0;

    container.name = name;
    container.containerType = type;
    container.capacitySlots = capacity;
    container.baseWeight = weight;
    closeContainerModal();
    renderWearSlots();
    renderInventory();
    updateCalculations();
}

function deleteCurrentContainer() {
    ensureEquipmentInventoryModel();
    const container = getContainerById(activeContainerId);
    if (!container || container.removable === false) return;
    if (!confirm(`Delete ${container.name} and all of its contents?`)) return;
    removeContainerById(container.id);
    closeContainerModal();
    renderWearSlots();
    renderInventory();
    updateCalculations();
}

function addContainer() {
    ensureEquipmentInventoryModel();
    const newContainer = createContainerFromType('Bag', { name: 'Bag' });
    charData.equipment.containers.push(newContainer);
    openContainerModal(newContainer.id);
}

function addItemTo(containerId) {
    const targetId = containerId === 'loose' ? `${'pc'}-${ROOT_INVENTORY_CONTAINER_ID}` : containerId;
    openItemModal(targetId);
}

function removeContainer(indexOrId) {
    ensureEquipmentInventoryModel();
    const container = typeof indexOrId === 'string'
        ? getContainerById(indexOrId)
        : (charData.equipment.containers || [])[indexOrId];
    if (!container || container.removable === false) return;
    if (!confirm(`Delete ${container.name} and all of its contents?`)) return;
    removeContainerById(container.id);
    renderWearSlots();
    renderInventory();
    updateCalculations();
}

function addContainerItem(containerId) {
    addItemTo(containerId);
}

function removeContainerItem(containerId, itemIndex) {
    ensureEquipmentInventoryModel();
    const container = getContainerById(containerId);
    if (!container) return;
    const item = container.items[itemIndex];
    if (!item) return;
    deleteItemFromContainer(containerId, item.id);
}

function setContainerTypeFromModal(type) {
    const preset = CONTAINER_TYPE_PRESETS[type] || { capacitySlots: 10, baseWeight: 0.5 };
    const capacity = document.getElementById('container-modal-capacity');
    const weight = document.getElementById('container-modal-weight');
    const name = document.getElementById('container-modal-name');
    if (capacity && (capacity.value === '' || capacity.value === '0')) capacity.value = String(preset.capacitySlots);
    if (weight && (weight.value === '' || weight.value === '0')) weight.value = String(preset.baseWeight);
    if (name && (!name.value || name.value === 'Bag')) name.value = type;
}

function createSlotSelectOptions() {
    return CONTAINER_TYPE_OPTIONS.map(type => `<option value="${escapeAttr(type)}">${escapeHtml(type)}</option>`).join('');
}

function getItemCountSummary() {
    const flat = getAllFlatItems();
    return `${flat.length} item${flat.length === 1 ? '' : 's'}`;
}

function openItemDetailModal(containerId, itemId) {
    ensureEquipmentInventoryModel();
    const modal = document.getElementById('item-detail-modal');
    const body = document.getElementById('item-detail-body');
    if (!modal || !body) return;

    const container = getContainerById(containerId);
    const item = container && container.items ? container.items.find(entry => entry.id === itemId) : null;
    if (!item) return;

    const curseText = item.isIdentified
        ? (item.isCursed ? 'Yes' : 'No')
        : 'Unknown until identified';
    const usableText = item.isClassUsable && item.isRaceUsable && item.isLevelUsable ? 'Usable' : 'Blocked';

    body.innerHTML = `
        <div style="font-size:0.78rem; color:#5d463a; display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
            <div><strong>Name:</strong> ${escapeHtml(buildItemDisplayName(item))}</div>
            <div><strong>Type:</strong> ${escapeHtml(item.type)}</div>
            <div><strong>Category:</strong> ${escapeHtml(item.itemCategory || item.type)}</div>
            <div><strong>Quantity:</strong> ${escapeHtml(item.quantity)}</div>
            <div><strong>Weight:</strong> ${escapeHtml(item.weight)}</div>
            <div><strong>Roles:</strong> ${escapeHtml((Array.isArray(item.roles) ? item.roles : []).join(', ') || 'None')}</div>
            <div><strong>Damage Types:</strong> ${escapeHtml((Array.isArray(item.damageTypes) ? item.damageTypes : []).join(', ') || 'None')}</div>
            <div><strong>Magical:</strong> ${item.isMagical ? 'Yes' : 'No'}</div>
            <div><strong>Cursed:</strong> ${escapeHtml(curseText)}</div>
            <div><strong>Identified:</strong> ${item.isIdentified ? 'Yes' : 'No'}</div>
            <div><strong>Stackable:</strong> ${item.isStackable ? 'Yes' : 'No'}</div>
            <div><strong>Class Usable:</strong> ${item.isClassUsable ? 'Yes' : 'No'}</div>
            <div><strong>Race Usable:</strong> ${item.isRaceUsable ? 'Yes' : 'No'}</div>
            <div><strong>Level Usable:</strong> ${item.isLevelUsable ? 'Yes' : 'No'}</div>
            <div><strong>Overall Usability:</strong> ${escapeHtml(usableText)}</div>
            <div style="grid-column:1 / span 2;"><strong>Notes:</strong> ${escapeHtml(item.notes || 'None')}</div>
        </div>`;

    modal.style.display = 'flex';
}

function closeItemDetailModal() {
    const modal = document.getElementById('item-detail-modal');
    if (modal) modal.style.display = 'none';
}

function getBatchEditorItems() {
    const rows = [];

    const addFromContainers = (scope, owner, containers) => {
        (Array.isArray(containers) ? containers : []).forEach(container => {
            (Array.isArray(container.items) ? container.items : []).forEach(item => {
                rows.push({
                    scope,
                    owner,
                    container,
                    item
                });
            });
        });
    };

    getAllContainerStores().forEach(store => addFromContainers(store.scope, store.owner, store.containers));

    return rows;
}

function getActorArrayByType(type) {
    if (type === 'henchmen') return charData.henchmen;
    if (type === 'familiars') return charData.familiars;
    if (type === 'companions') return charData.companions;
    return [];
}

function getActorTypeLabel(type) {
    if (type === 'henchmen') return 'Henchman';
    if (type === 'familiars') return 'Familiar';
    if (type === 'companions') return 'Companion';
    return 'Retainer';
}

function addActorEntry(type) {
    ensureEquipmentInventoryModel();
    const list = getActorArrayByType(type);
    const label = getActorTypeLabel(type);
    const actor = {
        id: createUniqueId(type.slice(0, 4)),
        name: `${label} ${list.length + 1}`,
        class: type === 'familiars' ? 'Mage' : 'Fighter',
        race: type === 'familiars' || type === 'companions' ? 'Animal' : 'Human',
        level: 1,
        equipment: { armor: 'None', shield: 'None', magicBonus: 0, worn: {}, containers: [], loose: [] }
    };
    ensureActorEquipmentModel(actor, `${type}-${list.length}`);
    list.push(actor);
    openInventoryScopeModal();
}

function removeActorEntry(type, actorId) {
    const list = getActorArrayByType(type);
    const idx = list.findIndex(entry => entry.id === actorId);
    if (idx < 0) return;
    if (!confirm(`Remove ${list[idx].name}?`)) return;
    list.splice(idx, 1);
    openInventoryScopeModal();
    updateCalculations();
}

function updateActorField(type, actorId, field, value) {
    const list = getActorArrayByType(type);
    const actor = list.find(entry => entry.id === actorId);
    if (!actor) return;
    if (field === 'level') {
        actor.level = Math.max(1, parseInt(value, 10) || 1);
    } else {
        actor[field] = String(value || '').trim() || actor[field];
    }
    updateCalculations();
}

function addContainerToActor(type, actorId) {
    const list = getActorArrayByType(type);
    const actor = list.find(entry => entry.id === actorId);
    if (!actor || !actor.equipment || !Array.isArray(actor.equipment.containers)) return;
    actor.equipment.containers.push(createContainerFromType('Bag', { name: 'Bag' }));
    openInventoryScopeModal();
}

function addContainerToStore(scope, ownerNameOrId) {
    ensureEquipmentInventoryModel();
    let context = null;
    if (scope === 'Treasure Hoard') {
        const hoard = (Array.isArray(charData.treasureHoards) ? charData.treasureHoards : []).find(entry => entry.id === ownerNameOrId);
        if (hoard) {
            context = {
                scope: 'Treasure Hoard',
                owner: hoard.name,
                containers: Array.isArray(hoard.containers) ? hoard.containers : []
            };
        }
    } else {
        context = getAllContainerStores().find(entry => entry.scope === scope && entry.owner === ownerNameOrId);
    }
    if (!context) return;
    const container = createContainerFromType('Bag', { name: 'Bag' });
    context.containers.push(container);
    openInventoryScopeModal();
}

function addTreasureHoard() {
    ensureEquipmentInventoryModel();
    const nextIdx = (Array.isArray(charData.treasureHoards) ? charData.treasureHoards.length : 0) + 1;
    charData.treasureHoards.push({ id: createUniqueId('hoard'), name: `Hoard ${nextIdx}`, containers: [] });
    const hoard = charData.treasureHoards[charData.treasureHoards.length - 1];
    const normalized = ensureSimpleContainerStore(hoard, `hoard-new-${nextIdx}`);
    hoard.containers = normalized.value.containers;
    openInventoryScopeModal();
}

function removeTreasureHoard(hoardId) {
    const idx = charData.treasureHoards.findIndex(entry => entry.id === hoardId);
    if (idx < 0) return;
    if (!confirm(`Delete ${charData.treasureHoards[idx].name}?`)) return;
    charData.treasureHoards.splice(idx, 1);
    if (charData.treasureHoards.length === 0) {
        charData.treasureHoards.push({ id: createUniqueId('hoard'), name: 'Main Hoard', containers: [] });
        const normalized = ensureSimpleContainerStore(charData.treasureHoards[0], 'hoard-default');
        charData.treasureHoards[0].containers = normalized.value.containers;
    }
    openInventoryScopeModal();
}

function updateTreasureHoardName(hoardId, value) {
    const hoard = charData.treasureHoards.find(entry => entry.id === hoardId);
    if (!hoard) return;
    hoard.name = String(value || '').trim() || hoard.name;
}

function getContainerQuickButtons(containers) {
    return (Array.isArray(containers) ? containers : []).map(container => `
        <div class="item-row" style="font-size:0.72rem;">
            <span>${escapeHtml(container.name)} (${getContainerItemCount(container)} items)</span>
            <span>
                <button type="button" style="padding:0 4px; font-size:0.68rem;" onclick="openContainerModal('${escapeAttr(container.id)}')">Edit</button>
                <button type="button" style="padding:0 4px; font-size:0.68rem;" onclick="addItemTo('${escapeAttr(container.id)}')">+Item</button>
            </span>
        </div>
    `).join('');
}

function renderActorSection(type, label) {
    const list = getActorArrayByType(type);
    return `
        <div style="border:1px solid var(--border); padding:6px; border-radius:4px; margin-bottom:6px; background:rgba(255,255,255,0.55);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong>${escapeHtml(label)}</strong>
                <button type="button" onclick="addActorEntry('${type}')">+ Add</button>
            </div>
            ${list.length === 0
                ? '<div class="slot-empty">None.</div>'
                : list.map(actor => {
                    const containers = Array.isArray(actor.equipment && actor.equipment.containers) ? actor.equipment.containers : [];
                    return `
                    <div style="border:1px dotted #9a8268; padding:5px; margin-bottom:6px;">
                        <div style="display:flex; justify-content:flex-end; gap:4px; margin-bottom:4px;">
                            <button type="button" onclick="addContainerToActor('${type}','${escapeAttr(actor.id)}')">+ Container</button>
                        </div>
                        <div style="display:grid; grid-template-columns:1.2fr 1fr 1fr 80px auto; gap:4px; margin-bottom:4px;">
                            <input type="text" value="${escapeAttr(actor.name)}" onchange="updateActorField('${type}','${escapeAttr(actor.id)}','name',this.value)">
                            <input type="text" value="${escapeAttr(actor.class)}" onchange="updateActorField('${type}','${escapeAttr(actor.id)}','class',this.value)">
                            <input type="text" value="${escapeAttr(actor.race)}" onchange="updateActorField('${type}','${escapeAttr(actor.id)}','race',this.value)">
                            <input type="number" min="1" value="${escapeAttr(actor.level)}" onchange="updateActorField('${type}','${escapeAttr(actor.id)}','level',this.value)">
                            <button type="button" class="danger" onclick="removeActorEntry('${type}','${escapeAttr(actor.id)}')">Remove</button>
                        </div>
                        ${getContainerQuickButtons(containers)}
                    </div>`;
                }).join('')}
        </div>
    `;
}

function openInventoryScopeModal() {
    ensureEquipmentInventoryModel();
    const modal = document.getElementById('inventory-scope-modal');
    const body = document.getElementById('inventory-scope-body');
    if (!modal || !body) return;

    const strongholdContainers = Array.isArray(charData.stronghold && charData.stronghold.storage && charData.stronghold.storage.containers)
        ? charData.stronghold.storage.containers
        : [];
    const spellComponentContainers = Array.isArray(charData.spellComponents && charData.spellComponents.containers)
        ? charData.spellComponents.containers
        : [];

    body.innerHTML = `
        ${renderActorSection('henchmen', 'Henchmen')}
        ${renderActorSection('familiars', 'Familiars')}
        ${renderActorSection('companions', 'Animal Companions')}

        <div style="border:1px solid var(--border); padding:6px; border-radius:4px; margin-bottom:6px; background:rgba(255,255,255,0.55);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong>Stronghold Storage</strong>
                <button type="button" onclick="addContainerToStore('Stronghold','Stronghold Storage')">+ Container</button>
            </div>
            ${getContainerQuickButtons(strongholdContainers) || '<div class="slot-empty">No containers.</div>'}
        </div>

        <div style="border:1px solid var(--border); padding:6px; border-radius:4px; margin-bottom:6px; background:rgba(255,255,255,0.55);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong>Spell Components</strong>
                <button type="button" onclick="addContainerToStore('Spell Components','Spell Components')">+ Container</button>
            </div>
            ${getContainerQuickButtons(spellComponentContainers) || '<div class="slot-empty">No containers.</div>'}
        </div>

        <div style="border:1px solid var(--border); padding:6px; border-radius:4px; margin-bottom:6px; background:rgba(255,255,255,0.55);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong>Treasure Hoards</strong>
                <button type="button" onclick="addTreasureHoard()">+ Hoard</button>
            </div>
            ${(Array.isArray(charData.treasureHoards) ? charData.treasureHoards : []).map(hoard => `
                <div style="border:1px dotted #9a8268; padding:5px; margin-bottom:6px;">
                    <div style="display:grid; grid-template-columns:1fr auto auto; gap:4px; margin-bottom:4px;">
                        <input type="text" value="${escapeAttr(hoard.name)}" onchange="updateTreasureHoardName('${escapeAttr(hoard.id)}', this.value)">
                        <button type="button" onclick="addContainerToStore('Treasure Hoard','${escapeAttr(hoard.id)}')">+ Container</button>
                        <button type="button" class="danger" onclick="removeTreasureHoard('${escapeAttr(hoard.id)}')">Remove</button>
                    </div>
                    ${getContainerQuickButtons(hoard.containers)}
                </div>
            `).join('')}
        </div>
    `;

    modal.style.display = 'flex';
}

function closeInventoryScopeModal() {
    const modal = document.getElementById('inventory-scope-modal');
    if (modal) modal.style.display = 'none';
    renderInventory();
    updateCalculations();
}

function openClassificationBatchEditor() {
    ensureEquipmentInventoryModel();
    const modal = document.getElementById('classification-batch-modal');
    const body = document.getElementById('classification-batch-body');
    if (!modal || !body) return;

    batchEditorRows = getBatchEditorItems();
    if (batchEditorRows.length === 0) {
        body.innerHTML = '<div class="slot-empty">No items found across PC, henchmen, or stronghold.</div>';
        modal.style.display = 'flex';
        return;
    }

    body.innerHTML = `
        <div style="max-height:360px; overflow:auto; border:1px solid var(--border);">
            <table style="width:100%; border-collapse:collapse; font-size:0.72rem;">
                <thead>
                    <tr style="background:#eee; position:sticky; top:0;">
                        <th style="text-align:left; padding:4px; border-bottom:1px solid #bbb;">Scope</th>
                        <th style="text-align:left; padding:4px; border-bottom:1px solid #bbb;">Owner</th>
                        <th style="text-align:left; padding:4px; border-bottom:1px solid #bbb;">Item</th>
                        <th style="text-align:left; padding:4px; border-bottom:1px solid #bbb;">Type</th>
                        <th style="padding:4px; border-bottom:1px solid #bbb;">Mag</th>
                        <th style="padding:4px; border-bottom:1px solid #bbb;">Cur</th>
                        <th style="padding:4px; border-bottom:1px solid #bbb;">Cls</th>
                        <th style="padding:4px; border-bottom:1px solid #bbb;">Race</th>
                        <th style="padding:4px; border-bottom:1px solid #bbb;">Lvl</th>
                        <th style="padding:4px; border-bottom:1px solid #bbb;">Id</th>
                        <th style="padding:4px; border-bottom:1px solid #bbb;">Stk</th>
                    </tr>
                </thead>
                <tbody>
                    ${batchEditorRows.map((row, idx) => {
                        return `
                        <tr>
                            <td style="padding:4px; border-bottom:1px solid #ddd;">${escapeHtml(row.scope)}</td>
                            <td style="padding:4px; border-bottom:1px solid #ddd;">${escapeHtml(row.owner)}</td>
                            <td style="padding:4px; border-bottom:1px solid #ddd;">${escapeHtml(buildItemDisplayName(row.item))}</td>
                            <td style="padding:4px; border-bottom:1px solid #ddd;">
                                <select data-row="${idx}" data-field="type" style="font-size:0.7rem;">
                                    ${ITEM_TYPE_ENUM.map(type => `<option value="${escapeAttr(type)}" ${row.item.type === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
                                </select>
                            </td>
                            <td style="text-align:center; border-bottom:1px solid #ddd;"><input data-row="${idx}" data-field="isMagical" type="checkbox" ${row.item.isMagical ? 'checked' : ''}></td>
                            <td style="text-align:center; border-bottom:1px solid #ddd;"><input data-row="${idx}" data-field="isCursed" type="checkbox" ${row.item.isCursed ? 'checked' : ''}></td>
                            <td style="text-align:center; border-bottom:1px solid #ddd;"><input data-row="${idx}" data-field="isClassUsable" type="checkbox" ${row.item.isClassUsable ? 'checked' : ''}></td>
                            <td style="text-align:center; border-bottom:1px solid #ddd;"><input data-row="${idx}" data-field="isRaceUsable" type="checkbox" ${row.item.isRaceUsable ? 'checked' : ''}></td>
                            <td style="text-align:center; border-bottom:1px solid #ddd;"><input data-row="${idx}" data-field="isLevelUsable" type="checkbox" ${row.item.isLevelUsable ? 'checked' : ''}></td>
                            <td style="text-align:center; border-bottom:1px solid #ddd;"><input data-row="${idx}" data-field="isIdentified" type="checkbox" ${row.item.isIdentified ? 'checked' : ''}></td>
                            <td style="text-align:center; border-bottom:1px solid #ddd;"><input data-row="${idx}" data-field="isStackable" type="checkbox" ${row.item.isStackable ? 'checked' : ''}></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    modal.style.display = 'flex';
}

function saveClassificationBatchEditor() {
    const fields = ['isMagical', 'isCursed', 'isClassUsable', 'isRaceUsable', 'isLevelUsable', 'isIdentified', 'isStackable'];
    batchEditorRows.forEach((row, idx) => {
        const typeValue = document.querySelector(`[data-row="${idx}"][data-field="type"]`)?.value;
        row.item.type = ensureItemType(typeValue);
        fields.forEach(field => {
            row.item[field] = !!document.querySelector(`[data-row="${idx}"][data-field="${field}"]`)?.checked;
        });
        if (!row.item.isStackable) row.item.quantity = 1;
    });

    charData.classificationNeedsReview = false;
    closeClassificationBatchEditor();
    renderInventory();
    renderWearSlots();
    updateCalculations();
}

function closeClassificationBatchEditor() {
    const modal = document.getElementById('classification-batch-modal');
    if (modal) modal.style.display = 'none';
    batchEditorRows = [];
}

function breakTreasureHoardsIntoItems() {
    ensureEquipmentInventoryModel();
    (Array.isArray(charData.treasureHoards) ? charData.treasureHoards : []).forEach(hoard => {
        (Array.isArray(hoard.containers) ? hoard.containers : []).forEach(container => {
            const nextItems = [];
            (Array.isArray(container.items) ? container.items : []).forEach(item => {
                const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
                if (qty <= 1) {
                    nextItems.push(item);
                    return;
                }
                for (let i = 0; i < qty; i += 1) {
                    nextItems.push(normalizeItemInstance({ ...item, id: createUniqueId('itm'), quantity: 1, isStackable: false }, '', { migratedRef: { changed: false } }));
                }
            });
            container.items = nextItems;
        });
    });

    alert('Treasure hoards were split into individual classified items.');
}
