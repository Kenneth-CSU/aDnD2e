// ============================================================
// index-features.js — Class-specific features: thief skills,
//                     spell slots, backstab, turn undead
// Depends on: index-data.js, index-char.js, index-calc.js, index-prof.js
// ============================================================

function updateClassFeatures(thac0, group) {
    _renderThiefSkills();
    _renderSpellSlots();
    _renderBackstab();
    _renderTurnUndead();
    renderProficiencies();
}

function _renderThiefSkills() {
    const thiefBlock = document.getElementById('thief-skills-block');
    const isThiefClass = charData.class === "Thief" || charData.class === "Bard";
    if (!isThiefClass) { thiefBlock.classList.add('hidden'); return; }

    thiefBlock.classList.remove('hidden');
    const race      = getCurrentRaceRecord();
    const raceMods  = (race && race.thiefSkillMods) ? race.thiefSkillMods : {};
    const cls       = classData[charData.class] || null;
    const thiefBase = (cls && cls.thiefBase) ? cls.thiefBase : null;
    const levelIdx  = Math.max(0, Math.min(charData.level - 1, 19));

    const skills = [
        { id: "PP",  name: "Pick Pockets", classKey: "pickPockets",   raceKey: "pickPockets"   },
        { id: "OL",  name: "Open Locks",   classKey: "openLocks",     raceKey: "openLocks"     },
        { id: "FRT", name: "Find Traps",   classKey: "findTraps",     raceKey: "findTraps"     },
        { id: "MS",  name: "Move Silent",  classKey: "moveSilently",  raceKey: "moveSilently"  },
        { id: "HS",  name: "Hide",         classKey: "hideShadows",   raceKey: "hideShadows"   },
        { id: "DN",  name: "Detect Noise", classKey: "detectNoise",   raceKey: "detectNoise"   },
        { id: "CW",  name: "Climb Walls",  classKey: "climbWalls",    raceKey: "climbWalls"    },
        { id: "RL",  name: "Read Lang",    classKey: "readLanguages", raceKey: "readLanguages" }
    ];

    document.getElementById('thief-skills-list').innerHTML = skills.map(s => {
        let val = 0;
        if (thiefBase && Array.isArray(thiefBase[s.classKey])) {
            val = thiefBase[s.classKey][Math.min(levelIdx, thiefBase[s.classKey].length - 1)] || 0;
        } else {
            val = THIEF_BASE[s.id] + ((charData.level - 1) * THIEF_INCREASE[s.id]);
        }
        val += (raceMods[s.raceKey] || 0);
        val = Math.max(0, Math.min(95, val));
        return `<div class="item-row"><span>${s.name}</span><span>${val}%</span></div>`;
    }).join('');
}

function _renderSpellSlots() {
    const spellBlock = document.getElementById('spell-slots-block');
    const spellClasses = ["Mage", "Cleric", "Druid", "Bard", "Paladin", "Ranger"];
    if (!spellClasses.includes(charData.class)) { spellBlock.classList.add('hidden'); return; }

    spellBlock.classList.remove('hidden');
    const rec  = classData[charData.class];
    const row  = rec && Array.isArray(rec.spellSlots) ? rec.spellSlots[Math.min(charData.level - 1, rec.spellSlots.length - 1)] : null;
    let slots  = Array.isArray(row) ? [...row] : [];

    if (["Cleric", "Druid"].includes(charData.class)) {
        const wis   = Math.max(0, Math.min(25, getAdjustedStat('WIS') || 0));
        const bonus = WIS_BONUS_SPELLS[wis] || [];
        const count = Math.max(slots.length, bonus.length);
        for (let i = 0; i < count; i++) slots[i] = (slots[i] || 0) + (bonus[i] || 0);
    }

    let html = "<div style='display:grid; grid-template-columns:1fr 1fr; gap:5px;'>";
    slots.forEach((n, idx) => {
        if ((n || 0) > 0) html += `<label>Lvl ${idx + 1}: <input type="number" value="${n}" style="width:40px;"></label>`;
    });
    if (html === "<div style='display:grid; grid-template-columns:1fr 1fr; gap:5px;'>") {
        html += "<span style='grid-column:1/-1; font-size:0.75rem;'>No spells at this level.</span>";
    }
    html += "</div>";
    document.getElementById('spell-slots-list').innerHTML = html;
}

function _renderBackstab() {
    if (charData.class !== "Thief") {
        document.getElementById('val-backstab').innerText = "-";
        return;
    }
    let mult = 2;
    if (charData.level >= 5)  mult = 3;
    if (charData.level >= 9)  mult = 4;
    if (charData.level >= 13) mult = 5;
    document.getElementById('val-backstab').innerText = "x" + mult;
}

function _renderTurnUndead() {
    if (!["Cleric", "Paladin"].includes(charData.class)) {
        document.getElementById('val-turn').innerText = "-";
        return;
    }
    const rec     = classData[charData.class];
    const turnRow = rec && Array.isArray(rec.turnTable) ? rec.turnTable : null;
    document.getElementById('val-turn').innerText =
        (turnRow && turnRow.length > 0) ? (turnRow[Math.min(charData.level - 1, turnRow.length - 1)] || "-") : "-";
}
