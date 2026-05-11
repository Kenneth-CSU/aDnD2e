// --- INIT ---
async function init() {
    await Promise.all([loadRaceClassRules(), loadArmourData(), loadClassData(), loadItemDatabase(), loadProficiencyData()]);
    await loadWeaponProficiencyData();
    try {
        populateDropdowns();
        renderAbilities();
        loadCharacter();
        updateCalculations();
        if (typeof applyCharacterSheetReadOnlyMode === 'function') {
            applyCharacterSheetReadOnlyMode();
        }
        if (window.location.hash === '#batch-classify' && typeof openClassificationBatchEditor === 'function') {
            openClassificationBatchEditor();
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
            }
        }
    } finally {
        // Continue autosave setup even if one render step throws.
    }
    setInterval(() => { if(localStorage.getItem('adsheet_autosave') === 'true') saveCharacter(); }, 30000);
}

// Shared loader: check localStorage cache -> fetch file -> validate. Returns data or null.
async function fetchJsonData(storageKey, filePath, validator) {
    const cached = localStorage.getItem(storageKey);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (validator(parsed)) return parsed;
        } catch (e) {
            console.error(`Failed to parse cached ${storageKey}, trying data file:`, e);
        }
    }
    try {
        const r = await fetch(filePath);
        if (!r.ok) throw new Error(`HTTP ${r.status} loading ${filePath}`);
        const loaded = await r.json();
        if (validator(loaded)) return loaded;
    } catch (e) {
        console.error(`Failed to load ${filePath}:`, e);
    }
    return null;
}

async function loadArmourData() {
    const source = await fetchJsonData('armourDB', 'data/armour.json', d => Array.isArray(d) && d.length > 0);
    if (!source) return; // keep fallbacks

    const armors = [{name: "None", base: 10, maxDex: 99, weight: 0}];
    const shields = [{name: "None", bonus: 0, weight: 0}];

    source.forEach(entry => {
        if (!entry || typeof entry.name !== 'string') return;
        if (entry.isShield) {
            shields.push({
                name: entry.name,
                bonus: entry.baseAC != null ? entry.baseAC : 1,
                weight: entry.weight || 0
            });
        } else {
            armors.push({
                name: entry.name,
                base: entry.baseAC != null ? entry.baseAC : 10,
                maxDex: entry.maxDexBonus != null ? entry.maxDexBonus : 99,
                weight: entry.weight || 0
            });
        }
    });

    armorTypes = armors;
    shieldTypes = shields;
}

async function loadClassData() {
    const source = await fetchJsonData('classesDB', 'data/classes.json', d => Array.isArray(d) && d.length > 0);
    if (!source) {
        classList = [...CORE_CLASSES];
        kitsByClass = { ...CORE_KITS };
        return;
    }

    const mapped = {};
    source.forEach(c => {
        if (!c || typeof c.name !== 'string') return;
        mapped[c.name] = c;
    });
    if (Object.keys(mapped).length > 0) {
        classData = mapped;
        classList = Object.keys(mapped);

        const loadedKits = {};
        classList.forEach(clsName => {
            const rec = mapped[clsName];
            loadedKits[clsName] = Array.isArray(rec.kits)
                ? rec.kits.map(k => (k && k.name ? k.name : null)).filter(Boolean)
                : [];
        });
        kitsByClass = loadedKits;
    }
}

async function loadItemDatabase() {
    const merged = new Map();
    const withDefaults = entry => ({
        ...entry,
        isMagical: !!entry.isMagical,
        isCursed: !!entry.isCursed,
        isClassUsable: entry.isClassUsable !== false,
        isRaceUsable: entry.isRaceUsable !== false,
        isLevelUsable: entry.isLevelUsable !== false,
        isEquipped: !!entry.isEquipped,
        isIdentified: entry.isIdentified !== false,
        isStackable: entry.isStackable === true
    });

    const applyClassification = (base, classificationMap) => {
        if (!base || !base.name) return base;
        const key = String(base.name).toLowerCase();
        if (!classificationMap.has(key)) return withDefaults(base);
        const cls = classificationMap.get(key);
        return withDefaults({ ...base, ...cls, name: base.name });
    };

    ITEM_DB_FALLBACK.forEach(item => {
        if (!item || typeof item.name !== 'string') return;
        const normalized = typeof normalizeDbItem === 'function' ? normalizeDbItem(item) : item;
        merged.set(item.name.toLowerCase(), withDefaults(normalized));
    });

    const [items, weapons, classifications] = await Promise.all([
        fetchJsonData('itemsDB', 'data/items.json', d => Array.isArray(d)),
        fetchJsonData('weaponsDB', 'data/weapons.json', d => Array.isArray(d)),
        fetchJsonData('itemClassificationsDB', 'data/itemClassifications.json', d => Array.isArray(d))
    ]);

    const classificationMap = new Map(
        (Array.isArray(classifications) ? classifications : [])
            .filter(entry => entry && typeof entry.name === 'string')
            .map(entry => [String(entry.name).toLowerCase(), entry])
    );

    const itemList = items || [];
    const weaponList = weapons || [];
    weaponDb = weaponList.filter(w => w && typeof w.name === 'string');
    if (weaponDb.length === 0) {
        weaponDb = CORE_WEAPON_DB.map(w => ({ ...w }));
    }

    itemList.forEach(it => {
        if (!it || typeof it.name !== 'string') return;
        const normalized = typeof normalizeDbItem === 'function'
            ? normalizeDbItem(it)
            : {
                name: it.name,
                weight: typeof it.weight === 'number' ? it.weight : 0,
                type: 'equipment'
            };
        merged.set(it.name.toLowerCase(), applyClassification(normalized, classificationMap));
    });

    weaponList.forEach(w => {
        if (!w || typeof w.name !== 'string') return;
        const weaponEntry = {
            name: w.name,
            weight: typeof w.weight === 'number' ? w.weight : 0,
            type: 'weapon',
            isMagical: !!w.isMagical,
            isCursed: !!w.isCursed,
            isClassUsable: w.isClassUsable !== false,
            isRaceUsable: w.isRaceUsable !== false,
            isLevelUsable: w.isLevelUsable !== false,
            isEquipped: false,
            isIdentified: w.isIdentified !== false,
            isStackable: w.isStackable === true
        };
        merged.set(w.name.toLowerCase(), applyClassification(weaponEntry, classificationMap));
    });

    [...merged.keys()].forEach(key => {
        merged.set(key, applyClassification(merged.get(key), classificationMap));
    });

    itemDb = [...merged.values()];
}

async function loadWeaponProficiencyData() {
    const source = await fetchJsonData('weaponProficienciesDB', 'data/weaponProficiencies.json', d => Array.isArray(d));
    if (source && source.length > 0) {
        const unique = [...new Set(source
            .filter(v => typeof v === 'string')
            .map(v => v.trim())
            .filter(Boolean))];
        weaponProficienciesData = unique.length > 0
            ? unique.sort((a, b) => a.localeCompare(b))
            : [...WEAPON_PROFICIENCIES_FALLBACK];
        return;
    }

    const fromWeapons = [...new Set(
        (Array.isArray(weaponDb) ? weaponDb : [])
            .map(w => (w && (w.proficiencyGroup || w.name)) || null)
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    weaponProficienciesData = fromWeapons.length > 0
        ? fromWeapons
        : [...WEAPON_PROFICIENCIES_FALLBACK];
}

async function loadProficiencyData() {
    const source = await fetchJsonData('proficienciesDB', 'data/proficiencies.json', d => d != null && Array.isArray(d.nonWeapon));
    if (!source) {
        proficiencyData = { ...PROFICIENCIES_FALLBACK };
        return;
    }

    proficiencyData = {
        nonWeapon: source.nonWeapon,
        classCategory: source.classCategory || { ...PROFICIENCIES_FALLBACK.classCategory }
    };
}

async function loadRaceClassRules() {
    const source = await fetchJsonData('racesDB', 'data/races.json', d => Array.isArray(d) && d.length > 0);
    if (!source) {
        raceClassRules = { ...RACE_CLASS_RULES_FALLBACK };
        raceData = {};
        return;
    }

    const mapped = {};
    const raceMapped = {};
    source.forEach(r => {
        if (!r || typeof r.name !== 'string') return;
        // Store raw class names from JSON without filtering against classList here.
        // classList may not be fully loaded yet (parallel Promise.all load).
        // Filtering happens in getAllowedClassesForRace() which runs after all data loads.
        mapped[r.name] = Array.isArray(r.allowedClasses) ? [...r.allowedClasses] : [];
        raceMapped[r.name] = r;
    });

    raceClassRules = Object.keys(mapped).length > 0 ? mapped : { ...RACE_CLASS_RULES_FALLBACK };
    raceData = raceMapped;
    raceList = Object.keys(raceMapped).length > 0 ? Object.keys(raceMapped) : [...CORE_RACES];
}
