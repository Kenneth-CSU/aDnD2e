/** 
 * AD&D 2nd Edition - FULL DATA & LOGIC
 */

const CHARACTER_SHEET_READ_ONLY = true;

// --- DATABASES ---

const CORE_RACES = [
    "Human", "Elf", "Half-Elf", "Dwarf", "Gnome", "Halfling", "Half-Orc"
];

const CORE_CLASSES = [
    "Fighter", "Paladin", "Ranger", "Mage", "Cleric", "Druid", "Thief", "Bard"
];

const CORE_KITS = {
    "Fighter": ["Myrmidon", "Swashbuckler", "Gladiator", "Cavalier", "Berserker"],
    "Paladin": ["Inquisitor", "Cavalier", "Enforcer"],
    "Ranger": ["Archer", "Beastmaster", "Mountain Man", "Stalker"],
    "Mage": ["Abjurer", "Conjurer", "Diviner", "Enchanter", "Illusionist", "Invoker", "Necromancer", "Transmuter", "Elementalist", "Wild Mage"],
    "Cleric": ["Acolyte", "Amazon", "Crusader", "Monk", "Warrior Priest"],
    "Druid": ["Shapeshifter", "Totemic Druid"],
    "Thief": ["Swashbuckler", "Investigator", "Acrobat", "Beggar"],
    "Bard": ["Gallant", "Blade", "Skald", "Herald"]
};

let raceList = [...CORE_RACES];
let classList = [...CORE_CLASSES];
let kitsByClass = { ...CORE_KITS };

const RACE_CLASS_RULES_FALLBACK = {
    "Human": ["Fighter", "Paladin", "Ranger", "Mage", "Cleric", "Druid", "Thief", "Bard"],
    "Elf": ["Fighter", "Mage", "Cleric", "Thief"],
    "Half-Elf": ["Fighter", "Mage", "Cleric", "Druid", "Thief", "Ranger", "Bard"],
    "Dwarf": ["Fighter", "Cleric", "Thief"],
    "Gnome": ["Fighter", "Mage", "Cleric", "Thief"],
    "Halfling": ["Fighter", "Cleric", "Thief"],
    "Half-Orc": ["Fighter", "Cleric", "Thief"]
};

let raceClassRules = { ...RACE_CLASS_RULES_FALLBACK };
let raceData = {};

const ARMOR_TYPES_FALLBACK = [
    {name: "None", base: 10, maxDex: 99, weight: 0},
    {name: "Leather Armor", base: 8, maxDex: 99, weight: 15},
    {name: "Studded Leather", base: 7, maxDex: 99, weight: 20},
    {name: "Hide Armor", base: 6, maxDex: 99, weight: 35},
    {name: "Chainmail", base: 5, maxDex: 99, weight: 40},
    {name: "Splint Mail", base: 4, maxDex: 99, weight: 50},
    {name: "Plate Mail", base: 3, maxDex: 99, weight: 70},
    {name: "Full Plate", base: 1, maxDex: 99, weight: 70}
];

const SHIELD_TYPES_FALLBACK = [
    {name: "None", bonus: 0, weight: 0},
    {name: "Small Shield", bonus: 1, weight: 5},
    {name: "Medium Shield", bonus: 1, weight: 10},
    {name: "Body Shield (Tower)", bonus: 1, weight: 15}
];

let armorTypes = [...ARMOR_TYPES_FALLBACK];
let shieldTypes = [...SHIELD_TYPES_FALLBACK];

const ARMOR_NAME_MAP = {
    "none": "None",
    "leather": "Leather Armor",
    "leather armor": "Leather Armor",
    "studded leather": "Studded Leather",
    "hide": "Hide Armor",
    "hide armor": "Hide Armor",
    "chain mail": "Chainmail",
    "chainmail": "Chainmail",
    "splint": "Splint Mail",
    "splint mail": "Splint Mail",
    "plate": "Plate Mail",
    "plate mail": "Plate Mail",
    "full plate": "Full Plate",
    "robes": "None"
};

const SHIELD_NAME_MAP = {
    "none": "None",
    "small": "Small Shield",
    "small shield": "Small Shield",
    "shield, small": "Small Shield",
    "medium": "Medium Shield",
    "medium shield": "Medium Shield",
    "shield, medium": "Medium Shield",
    "body": "Body Shield (Tower)",
    "body shield": "Body Shield (Tower)",
    "body shield (tower)": "Body Shield (Tower)",
    "shield, body": "Body Shield (Tower)"
};

const ITEM_TYPE_ENUM = Object.freeze([
    'weapon',
    'shield',
    'armor',
    'container',
    'tool',
    'consumable',
    'component',
    'equipment',
    'treasure',
    'mount',
    'miscellaneous'
]);

const DAMAGE_TYPE_ENUM = Object.freeze([
    'bludgeoning',
    'piercing',
    'slashing',
    'fire',
    'cold',
    'lightning',
    'acid',
    'poison',
    'necrotic',
    'radiant',
    'force',
    'psychic',
    'thunder',
    'special'
]);

const ITEM_ROLE_ENUM = Object.freeze([
    'offense',
    'defense',
    'exploration',
    'survival',
    'mobility',
    'social',
    'utility',
    'healing',
    'support',
    'arcane',
    'divine',
    'crafting',
    'economy'
]);

const MODIFIER_TYPE_ENUM = Object.freeze([
    'attack',
    'damage',
    'armorClass',
    'thac0',
    'savingThrow',
    'abilityScore',
    'hitPoints',
    'movement',
    'skillCheck',
    'initiative',
    'encumbrance',
    'resource',
    'resistance',
    'other'
]);

const MODIFIER_TARGET_ENUM = Object.freeze([
    'self',
    'mainHand',
    'offHand',
    'melee',
    'ranged',
    'missile',
    'armor',
    'shield',
    'vsUndead',
    'vsHumanoid',
    'vsGiant',
    'vsDragon',
    'all'
]);

const ITEM_FLAG_KEYS = Object.freeze([
    'isMagical',
    'isCursed',
    'isClassUsable',
    'isRaceUsable',
    'isLevelUsable',
    'isEquipped',
    'isIdentified',
    'isStackable'
]);

// Full Item DB
const ITEM_DB_FALLBACK = [
    {name: "Long Sword", weight: 4, type: "weapon"},
    {name: "Short Sword", weight: 3, type: "weapon"},
    {name: "Broad Sword", weight: 4, type: "weapon"},
    {name: "Two-Handed Sword", weight: 7, type: "weapon"},
    {name: "Dagger", weight: 1, type: "weapon"},
    {name: "Dart", weight: 0.5, type: "weapon"},
    {name: "Knife", weight: 0.5, type: "weapon"},
    {name: "Spear", weight: 5, type: "weapon"},
    {name: "Javelin", weight: 2, type: "weapon"},
    {name: "Axe, Hand", weight: 2, type: "weapon"},
    {name: "Axe, Battle", weight: 5, type: "weapon"},
    {name: "Hammer, War", weight: 5, type: "weapon"},
    {name: "Mace", weight: 5, type: "weapon"},
    {name: "Club", weight: 3, type: "weapon"},
    {name: "Staff", weight: 4, type: "weapon"},
    {name: "Bow, Short", weight: 2, type: "weapon"},
    {name: "Bow, Long", weight: 3, type: "weapon"},
    {name: "Crossbow, Light", weight: 7, type: "weapon"},
    {name: "Crossbow, Heavy", weight: 14, type: "weapon"},
    {name: "Arrow (20)", weight: 3, type: "ammo"},
    {name: "Bolt (20)", weight: 4, type: "ammo"},
    {name: "Quiver", weight: 1, type: "container", capacity: 20},
    {name: "Case, Scroll", weight: 1, type: "container", capacity: 10},
    {name: "Backpack", weight: 2, type: "container", capacity: 40},
    {name: "Bag, Small", weight: 0.5, type: "container", capacity: 10},
    {name: "Bag, Large", weight: 1, type: "container", capacity: 25},
    {name: "Pouch, Belt", weight: 0.5, type: "container", capacity: 5},
    {name: "Rations, Iron (1 week)", weight: 14, type: "gear"},
    {name: "Rations, Standard (1 week)", weight: 7, type: "gear"},
    {name: "Bedroll", weight: 5, type: "gear"},
    {name: "Blanket", weight: 3, type: "gear"},
    {name: "Flint & Steel", weight: 0, type: "gear"},
    {name: "Torches (3)", weight: 3, type: "gear"},
    {name: "Lantern, Hooded", weight: 10, type: "gear"},
    {name: "Oil (1 flask)", weight: 1, type: "gear"},
    {name: "Waterskin", weight: 5, type: "gear"},
    {name: "Rope, Hemp (50ft)", weight: 10, type: "gear"},
    {name: "Rope, Silk (50ft)", weight: 5, type: "gear"},
    {name: "Grappling Hook", weight: 4, type: "gear"},
    {name: "Sack, Small", weight: 0.5, type: "gear"},
    {name: "Sack, Large", weight: 1, type: "gear"},
    {name: "Mirror, Small", weight: 0.5, type: "gear"},
    {name: "Holy Symbol", weight: 1, type: "gear"},
    {name: "Spellbook", weight: 3, type: "gear"},
    {name: "Thieves' Picks", weight: 1, type: "gear"},
    {name: "Caltrops (20)", weight: 2, type: "gear"},
    {name: "Crowbar", weight: 5, type: "gear"},
    {name: "Hammer, Sledge", weight: 10, type: "gear"},
    {name: "Manacles", weight: 4, type: "gear"},
    {name: "Chain (10ft)", weight: 10, type: "gear"},
    {name: "Potion", weight: 0.5, type: "misc"},
    {name: "Scroll", weight: 0, type: "misc"},
    {name: "Ring", weight: 0, type: "misc"},
    {name: "Wand", weight: 1, type: "misc"},
    {name: "Robes", weight: 4, type: "armor"}
];
let itemDb = [...ITEM_DB_FALLBACK];
const CORE_WEAPON_DB = [
    {name: 'Dagger', type: 'Piercing', size: 'S', proficiencyGroup: 'Dagger'},
    {name: 'Club', type: 'Bludgeoning', size: 'S', proficiencyGroup: 'Club'},
    {name: 'Mace', type: 'Bludgeoning', size: 'M', proficiencyGroup: 'Mace'},
    {name: 'Staff', type: 'Bludgeoning', size: 'M', proficiencyGroup: 'Staff'},
    {name: 'Spear', type: 'Piercing', size: 'M', proficiencyGroup: 'Spear'},
    {name: 'Long Sword', type: 'Slashing', size: 'M', proficiencyGroup: 'Long Sword'},
    {name: 'Short Sword', type: 'Piercing', size: 'S', proficiencyGroup: 'Short Sword'},
    {name: 'Axe, Battle', type: 'Slashing', size: 'M', proficiencyGroup: 'Battle Axe'},
    {name: 'Hammer, War', type: 'Bludgeoning', size: 'S', proficiencyGroup: 'War Hammer'},
    {name: 'Bow, Short', type: 'Piercing', size: 'M', proficiencyGroup: 'Short Bow'},
    {name: 'Bow, Long', type: 'Piercing', size: 'M', proficiencyGroup: 'Long Bow'},
    {name: 'Sling', type: 'Bludgeoning', size: 'S', proficiencyGroup: 'Sling'}
];
const WEAPON_PROFICIENCIES_FALLBACK = [...new Set(
    CORE_WEAPON_DB.map(w => (w && (w.proficiencyGroup || w.name)) || null).filter(Boolean)
)].sort((a, b) => a.localeCompare(b));
let weaponDb = [];
let weaponProficienciesData = [...WEAPON_PROFICIENCIES_FALLBACK];
let classData = {};
const PROFICIENCIES_FALLBACK = {
    nonWeapon: [
        {name: "Alertness", ability: "WIS", category: "General", slots: 1, checkMod: 0},
        {name: "Direction Sense", ability: "WIS", category: "General", slots: 1, checkMod: 0},
        {name: "Endurance", ability: "CON", category: "General", slots: 1, checkMod: 0},
        {name: "Healing", ability: "WIS", category: "General", slots: 2, checkMod: -2},
        {name: "Riding, Land-Based", ability: "WIS", category: "General", slots: 1, checkMod: 0},
        {name: "Survival", ability: "WIS", category: "General", slots: 2, checkMod: 0},
        {name: "Weaponsmithing", ability: "INT", category: "Warrior", slots: 2, checkMod: -3},
        {name: "Religion", ability: "WIS", category: "Priest", slots: 1, checkMod: 0},
        {name: "Alchemy", ability: "INT", category: "Wizard", slots: 2, checkMod: -2},
        {name: "Disguise", ability: "CHA", category: "Rogue", slots: 1, checkMod: -1}
    ],
    classCategory: {
        Fighter: "Warrior",
        Paladin: "Warrior",
        Ranger: "Warrior",
        Cleric: "Priest",
        Druid: "Priest",
        Mage: "Wizard",
        Thief: "Rogue",
        Bard: "Rogue"
    }
};
let proficiencyData = { ...PROFICIENCIES_FALLBACK };
const STARTING_KITS = {
    "Fighter": [{name:"Long Sword", weight:4}, {name:"Dagger", weight:1}, {name:"Chainmail", weight:40}, {name:"Medium Shield", weight:10}, {name:"Backpack", weight:2}, {name:"Rations, Iron (1 week)", weight:14}],
    "Paladin": [{name:"Long Sword", weight:4}, {name:"Plate Mail", weight:70}, {name:"Medium Shield", weight:10}, {name:"Holy Symbol", weight:1}, {name:"Backpack", weight:2}],
    "Ranger": [{name:"Long Sword", weight:4}, {name:"Bow, Long", weight:3}, {name:"Arrow (20)", weight:3}, {name:"Leather Armor", weight:15}, {name:"Backpack", weight:2}],
    "Mage": [{name:"Dagger", weight:1}, {name:"Robes", weight:4}, {name:"Spellbook", weight:3}, {name:"Backpack", weight:2}, {name:"Rations, Iron (1 week)", weight:14}],
    "Cleric": [{name:"Mace", weight:5}, {name:"Chainmail", weight:40}, {name:"Medium Shield", weight:10}, {name:"Holy Symbol", weight:1}, {name:"Backpack", weight:2}],
    "Druid": [{name:"Staff", weight:4}, {name:"Leather Armor", weight:15}, {name:"Small Shield", weight:5}, {name:"Holy Symbol", weight:1}, {name:"Backpack", weight:2}],
    "Thief": [{name:"Short Sword", weight:3}, {name:"Leather Armor", weight:15}, {name:"Thieves' Picks", weight:1}, {name:"Grappling Hook", weight:4}, {name:"Backpack", weight:2}],
    "Bard": [{name:"Short Sword", weight:3}, {name:"Leather Armor", weight:15}, {name:"Musical Instrument", weight:3}, {name:"Backpack", weight:2}]
};

// THAC0 Table (Level 1-20+)
// Index 0 = Level 1
const THAC0_TABLE = {
    "Warrior": [20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1],
    "Priest": [20,20,18,18,16,16,14,14,12,12,10,10,8,8,6,6,4,4,2,2],
    "Rogue": [20,20,19,19,18,18,17,17,16,16,15,15,14,14,13,13,12,12,11,11],
    "Wizard": [20,20,20,19,19,19,18,18,18,17,17,17,16,16,16,15,15,15,14,14]
};

// Saving Throws Table (Simplified structure: [Paralyzation, Rod/Staff, Petrification, Breath, Spell])
// Indexed by Level-1. Groups: Warrior, Priest, Rogue, Wizard
const SAVE_TABLE = {
    "Warrior": [
        [14,16,15,17,17], [13,15,14,16,16], [12,14,13,15,15], [11,13,12,14,14], [10,12,11,13,13],
        [9,11,10,12,12], [8,10,9,11,11], [7,9,8,10,10], [6,8,7,9,9], [5,7,6,8,8],
        [4,6,5,7,7], [3,5,4,6,6], [2,4,3,5,5], [1,3,2,4,4], [0,2,1,3,3]
    ],
    "Priest": [
        [10,14,13,16,15], [9,13,12,15,14], [8,12,11,14,13], [7,11,10,13,12], [6,10,9,12,11],
        [5,9,8,11,10], [4,8,7,10,9], [3,7,6,9,8], [2,6,5,8,7], [1,5,4,7,6],
        [0,4,3,6,5], [0,3,2,5,4], [0,2,1,4,3], [0,1,0,3,2], [0,0,0,2,1]
    ],
    "Rogue": [
        [13,14,12,16,15], [12,13,11,15,14], [11,12,10,14,13], [10,11,9,13,12], [9,10,8,12,11],
        [8,9,7,11,10], [7,8,6,10,9], [6,7,5,9,8], [5,6,4,8,7], [4,5,3,7,6],
        [3,4,2,6,5], [2,3,1,5,4], [1,2,0,4,3], [0,1,0,3,2], [0,0,0,2,1]
    ],
    "Wizard": [
        [14,11,15,15,12], [13,10,14,14,11], [13,9,13,13,10], [12,8,12,12,9], [11,7,11,11,8],
        [10,6,10,10,7], [9,5,9,9,6], [8,4,8,8,5], [7,3,7,7,4], [6,2,6,6,3],
        [5,1,5,5,2], [4,0,4,4,1], [3,0,3,3,0], [2,0,2,2,0], [1,0,1,1,0]
    ]
};

// Thief Skills Base (Level 1)
const THIEF_BASE = {
    "PP": 15, "OL": 10, "FRT": 5, "MS": 10, "HS": 5, "DN": 15, "CW": 60, "RL": 0
};
const THIEF_INCREASE = {
    "PP": 5, "OL": 2, "FRT": 2, "MS": 5, "HS": 5, "DN": 2, "CW": 5, "RL": 5
};

// State
let charData = {
    name: "", race: "Human", class: "Fighter", kit: "", level: 1,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10, STR_Pct: 0 },
    hp: { cur: 10, max: 10 },
    equipment: {
        armor: "None", shield: "None", magicBonus: 0,
        worn: {}, containers: [], loose: []
    },
    henchmen: [],
    familiars: [],
    companions: [],
    stronghold: { storage: { containers: [] } },
    treasureHoards: [{ id: 'hoard-default', name: 'Main Hoard', containers: [] }],
    spellComponents: { containers: [] },
    classificationNeedsReview: false,
    proficiencies: { weapons: [], nwps: [] },
    notes: "", gp: 0,
    encumMode: "off"
};
