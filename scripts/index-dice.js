// ============================================================
// index-dice.js — Dice roller modal
// Depends on: (none beyond DOM)
// ============================================================

function toggleDiceModal() {
    const modal = document.getElementById('dice-modal');
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function rollDice(sides) {
    displayRollResult(`d${sides}: ${Math.floor(Math.random() * sides) + 1}`);
}

function rollAbilityScores() {
    const results = [];
    for (let i = 0; i < 6; i++) {
        const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
        rolls.sort((a, b) => a - b);
        rolls.shift(); // drop lowest
        results.push(rolls.reduce((a, b) => a + b, 0));
    }
    displayRollResult("Stats: " + results.join(", "));
}

function displayRollResult(text) {
    document.getElementById('dice-result').innerText = text;
    const hist = document.getElementById('dice-history');
    hist.innerText = text + " | " + hist.innerText;
}
