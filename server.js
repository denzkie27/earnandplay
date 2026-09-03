const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===================== MIDDLEWARE =====================

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'scatter-slot-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ===================== GAME CONFIG =====================

const SYMBOLS = [
    { id: 'scatter', image: '/images/scatter.png', isScatter: true, isWild: false },
    { id: 'wild', image: '/images/wild.png', isScatter: false, isWild: true },

    { id: 'lion', image: '/images/lion.png' },
    { id: 'tiger', image: '/images/tiger.png' },
    { id: 'badger', image: '/images/badger.png' },
    { id: 'bear', image: '/images/bear.png' },
    { id: 'boar', image: '/images/boar.png' },
    { id: 'dragon', image: '/images/dragon.png' },
    { id: 'duck', image: '/images/duck.png' },
    { id: 'eagle', image: '/images/eagle.png' },
    { id: 'elephant', image: '/images/elephant.png' },
    { id: 'frog', image: '/images/frog.png' },
    { id: 'goat', image: '/images/goat.png' },
    { id: 'gorilla', image: '/images/gorilla.png' },
    { id: 'hawk', image: '/images/hawk.png' },
    { id: 'hedgehog', image: '/images/hedgehog.png' },
    { id: 'mouse', image: '/images/mouse.png' },
    { id: 'owl', image: '/images/owl.png' },
    { id: 'panther', image: '/images/panther.png' },
    { id: 'pig', image: '/images/pig.png' },
    { id: 'rabbit', image: '/images/rabbit.png' },
    { id: 'racoon', image: '/images/racoon.png' },
    { id: 'rhino', image: '/images/rhino.png' },
    { id: 'rooster', image: '/images/rooster.png' },
    { id: 'shark', image: '/images/shark.png' },
    { id: 'squirrel', image: '/images/squirrel.png' },
    { id: 'wolf', image: '/images/wolf.png' }
];

const REGULAR_SYMBOLS = SYMBOLS.filter(symbol => !symbol.isScatter && !symbol.isWild);

const VISIBLE_ROWS = 5;
const REEL_COUNT = 5;

const MULTIPLIER_SEQUENCE = [1, 2, 4, 6, 10];

const SCATTER_PAYOUT = 2;
const FREE_SPINS_AMOUNT = 10;
const SCATTER_COOLDOWN_SPINS = 10;

// ===================== PAYOUT =====================

function getClusterPayout(count) {
    // 5 of a kind = 50% of bet, 6 = 100%, 7 = 150%, etc.
    if (count < 5) return 0;
    return (count - 4) * 0.5;
}

// ===================== SESSION =====================

function initGame(req) {
    if (typeof req.session.balance !== 'number') req.session.balance = 1000;
    if (typeof req.session.freeSpins !== 'number') req.session.freeSpins = 0;
    if (typeof req.session.lastBet !== 'number') req.session.lastBet = 1;
    if (
        typeof req.session.multiplierIndex !== 'number' ||
        req.session.multiplierIndex < 0 ||
        req.session.multiplierIndex >= MULTIPLIER_SEQUENCE.length
    ) {
        req.session.multiplierIndex = 0;
    }
    if (typeof req.session.scatterCooldown !== 'number') req.session.scatterCooldown = 0;
}

// ===================== RANDOM SYMBOL =====================

function randomSymbol({ allowScatter = true, allowWild = true } = {}) {
    const rand = Math.random();

    if (allowScatter && rand < 0.05) {
        return SYMBOLS.find(symbol => symbol.isScatter);
    }

    if (allowWild && rand < 0.15) {
        return SYMBOLS.find(symbol => symbol.isWild);
    }

    return REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)];
}

// ===================== GENERATE GRID =====================

// Generates a grid that guarantees at least one winning combination (5 of a kind)
function generateWinningGrid(allowScatter = true) {
    const grid = [];
    let scatterCount = 0;
    let wildCount = 0;

    // Choose a random regular symbol to be the winner
    const winSymbol = REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)];

    // Reserve 5 cells for the winning symbol; place them randomly
    const totalCells = REEL_COUNT * VISIBLE_ROWS;
    const winningPositions = [];
    while (winningPositions.length < 5) {
        const pos = Math.floor(Math.random() * totalCells);
        if (!winningPositions.includes(pos)) {
            winningPositions.push(pos);
        }
    }

    // Fill the grid cell by cell
    for (let i = 0; i < totalCells; i++) {
        const col = Math.floor(i / VISIBLE_ROWS);
        const row = i % VISIBLE_ROWS;

        if (!grid[col]) grid[col] = [];

        if (winningPositions.includes(i)) {
            // Place the winning symbol
            grid[col][row] = winSymbol;
        } else {
            // Place random symbol respecting limits
            const symbol = randomSymbol({
                allowScatter: allowScatter && scatterCount < 3,
                allowWild: wildCount < 3
            });
            if (symbol.isScatter) scatterCount++;
            if (symbol.isWild) wildCount++;
            grid[col][row] = symbol;
        }
    }

    return grid;
}

// Generates a grid that guarantees NO winning combination (each regular symbol appears at most once)
function generateLosingGrid(allowScatter = true) {
    const grid = [];
    let scatterCount = 0;
    let wildCount = 0;

    // We'll fill with unique regular symbols (max one per symbol)
    const usedRegular = new Set();

    for (let col = 0; col < REEL_COUNT; col++) {
        grid[col] = [];
        for (let row = 0; row < VISIBLE_ROWS; row++) {
            // Decide if we should place a scatter or wild (respecting limits)
            let placedSpecial = false;
            if (allowScatter && scatterCount < 3 && Math.random() < 0.05) {
                grid[col][row] = SYMBOLS.find(s => s.isScatter);
                scatterCount++;
                placedSpecial = true;
            } else if (wildCount < 3 && Math.random() < 0.15) {
                grid[col][row] = SYMBOLS.find(s => s.isWild);
                wildCount++;
                placedSpecial = true;
            }

            if (!placedSpecial) {
                // Pick a regular symbol that hasn't been used yet
                let symbol;
                do {
                    symbol = REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)];
                } while (usedRegular.has(symbol.id));
                usedRegular.add(symbol.id);
                grid[col][row] = symbol;
            }
        }
    }

    return grid;
}

// Main grid generation: chooses based on forceWin flag
function generateGrid(allowScatter = true, forceWin = null) {
    if (forceWin === true) {
        return generateWinningGrid(allowScatter);
    } else if (forceWin === false) {
        return generateLosingGrid(allowScatter);
    } else {
        // Random grid (legacy, not used now but kept for completeness)
        const grid = [];
        let scatterCount = 0;
        let wildCount = 0;
        for (let col = 0; col < REEL_COUNT; col++) {
            grid[col] = [];
            for (let row = 0; row < VISIBLE_ROWS; row++) {
                const symbol = randomSymbol({
                    allowScatter: allowScatter && scatterCount < 3,
                    allowWild: wildCount < 3
                });
                if (symbol.isScatter) scatterCount++;
                if (symbol.isWild) wildCount++;
                grid[col][row] = symbol;
            }
        }
        return grid;
    }
}

// ===================== COUNT SCATTERS =====================

function countScatters(grid) {
    let count = 0;
    for (const column of grid) {
        for (const symbol of column) {
            if (symbol.isScatter) count++;
        }
    }
    return count;
}

// ===================== DETECT WINS =====================

function detectWins(grid) {
    const wildPositions = [];
    const symbolCounts = {};
    const symbolPositions = {};

    REGULAR_SYMBOLS.forEach(symbol => {
        symbolCounts[symbol.id] = 0;
        symbolPositions[symbol.id] = [];
    });

    for (let column = 0; column < REEL_COUNT; column++) {
        for (let row = 0; row < VISIBLE_ROWS; row++) {
            const symbol = grid[column][row];
            if (symbol.isWild) {
                wildPositions.push({ col: column, row: row });
            } else if (!symbol.isScatter) {
                symbolCounts[symbol.id]++;
                symbolPositions[symbol.id].push({ col: column, row: row });
            }
        }
    }

    const wins = [];
    let availableWilds = wildPositions.slice();

    // Sort symbols from highest count to lowest
    const symbolIds = Object.keys(symbolCounts).sort((a, b) => symbolCounts[b] - symbolCounts[a]);

    // First pass: try to form wins with 5 or more symbols
    for (const id of symbolIds) {
        const baseCount = symbolCounts[id];

        if (baseCount >= 5) {
            wins.push({
                symbol: REGULAR_SYMBOLS.find(s => s.id === id),
                count: baseCount,
                positions: symbolPositions[id].slice(0, baseCount),
                wildPositionsUsed: []
            });
        } else if (baseCount >= 1) {
            const neededWilds = 5 - baseCount;
            if (availableWilds.length >= neededWilds) {
                const usedWilds = availableWilds.splice(0, neededWilds);
                const totalCount = baseCount + neededWilds;
                wins.push({
                    symbol: REGULAR_SYMBOLS.find(s => s.id === id),
                    count: totalCount,
                    positions: symbolPositions[id].concat(usedWilds).slice(0, totalCount),
                    wildPositionsUsed: usedWilds
                });
            }
        }
    }

    // Second pass: add remaining wilds to strongest win
    if (availableWilds.length > 0 && wins.length > 0) {
        wins.sort((a, b) => b.count - a.count);
        const bestWin = wins[0];
        bestWin.count += availableWilds.length;
        bestWin.positions.push(...availableWilds);
        bestWin.wildPositionsUsed.push(...availableWilds);
    }

    return wins;
}

// ===================== EVALUATE SPIN =====================

function evaluateSpin(grid, bet, gameSession) {
    let totalWin = 0;
    const wins = [];
    let freeSpinsAwarded = 0;

    const currentMultiplier = MULTIPLIER_SEQUENCE[gameSession.multiplierIndex] || 1;

    const clusterWins = detectWins(grid);

    for (const win of clusterWins) {
        const payout = getClusterPayout(win.count);
        const winAmount = Math.round(bet * payout * currentMultiplier);
        totalWin += winAmount;

        wins.push({
            symbol: win.symbol,
            count: win.count,
            positions: win.positions,
            wildPositionsUsed: win.wildPositionsUsed,
            winAmount: winAmount,
            multiplier: currentMultiplier
        });
    }

    const scatterCount = countScatters(grid);

    if (scatterCount >= 3) {
        const scatterWin = Math.round(bet * SCATTER_PAYOUT * currentMultiplier);
        totalWin += scatterWin;
        freeSpinsAwarded = FREE_SPINS_AMOUNT;

        wins.push({
            type: 'scatter',
            count: scatterCount,
            winAmount: scatterWin,
            multiplier: currentMultiplier,
            positions: []
        });
    }

    totalWin = Math.round(Number(totalWin) || 0);

    if (totalWin > 0) {
        gameSession.multiplierIndex = Math.min(
            gameSession.multiplierIndex + 1,
            MULTIPLIER_SEQUENCE.length - 1
        );
    } else {
        gameSession.multiplierIndex = 0;
    }

    gameSession.balance += totalWin;
    gameSession.freeSpins += freeSpinsAwarded;

    return {
        grid,
        totalWin,
        wins,
        freeSpinsAwarded,
        scatters: scatterCount,
        newBalance: gameSession.balance,
        freeSpinsRemaining: gameSession.freeSpins,
        multiplierUsed: currentMultiplier,
        currentMultiplier: MULTIPLIER_SEQUENCE[gameSession.multiplierIndex] || 1
    };
}

// ===================== ROUTES =====================

app.get('/api/state', (req, res) => {
    initGame(req);
    res.json({
        balance: req.session.balance,
        freeSpins: req.session.freeSpins,
        lastBet: req.session.lastBet,
        multiplier: MULTIPLIER_SEQUENCE[req.session.multiplierIndex] || 1
    });
});

app.post('/api/spin', (req, res) => {
    initGame(req);

    if (req.session.scatterCooldown > 0) req.session.scatterCooldown--;

    const isFreeSpin = req.body.isFreeSpin === true;
    let betAmount = 0;

    if (isFreeSpin) {
        if (req.session.freeSpins <= 0) {
            return res.status(400).json({ error: 'No free spins available.' });
        }
        req.session.freeSpins--;
        betAmount = req.session.lastBet;
    } else {
        betAmount = parseInt(req.body.bet, 10);
        if (isNaN(betAmount) || betAmount < 1 || betAmount > req.session.balance) {
            return res.status(400).json({ error: 'Invalid bet amount.' });
        }
        req.session.balance -= betAmount;
        req.session.lastBet = betAmount;
    }

    const allowScatter = req.session.scatterCooldown <= 0;

    // ===== 50-50 win probability =====
    const forceWin = Math.random() < 0.5;  // true = winning spin, false = losing spin
    const grid = generateGrid(allowScatter, forceWin);

    const result = evaluateSpin(grid, betAmount, req.session);

    if (result.freeSpinsAwarded > 0) {
        req.session.scatterCooldown = SCATTER_COOLDOWN_SPINS;
    }

    res.json({
        grid: result.grid,
        totalWin: result.totalWin,
        wins: result.wins,
        freeSpinsAwarded: result.freeSpinsAwarded,
        scatters: result.scatters,
        newBalance: result.newBalance,
        freeSpinsRemaining: result.freeSpinsRemaining,
        multiplierUsed: result.multiplierUsed,
        currentMultiplier: result.currentMultiplier
    });
});

app.post('/api/add-coins', (req, res) => {
    initGame(req);
    const amount = parseInt(req.body.amount, 10);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount.' });
    req.session.balance += amount;
    res.json({ newBalance: req.session.balance });
});

app.post('/api/sync-balance', (req, res) => {
    initGame(req);
    const balance = parseInt(req.body.balance, 10);
    if (isNaN(balance) || balance < 0) return res.status(400).json({ error: 'Invalid balance.' });
    req.session.balance = balance;
    res.json({ newBalance: req.session.balance });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
