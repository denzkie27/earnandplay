const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'scatter-slot-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
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

const REGULAR_SYMBOLS = SYMBOLS.filter(s => !s.isScatter && !s.isWild);
const VISIBLE_ROWS = 5;
const REEL_COUNT = 5;

// Multiplier sequence: 1x, 2x, 3x, 4x, 6x, 10x
const MULTIPLIER_SEQUENCE = [1, 2, 3, 4, 6, 10];

const SCATTER_PAYOUT = 2;
const FREE_SPINS_AMOUNT = 10;
const SCATTER_COOLDOWN_SPINS = 10;

function getClusterPayout(count) {
    if (count === 5 || count === 6) return 0.5;
    if (count === 7) return 1.0;
    if (count >= 8) return 2.0;
    return 0;
}

function initGame(req) {
    if (typeof req.session.balance !== 'number') req.session.balance = 1000;
    if (typeof req.session.freeSpins !== 'number') req.session.freeSpins = 0;
    if (typeof req.session.lastBet !== 'number') req.session.lastBet = 1;
    if (typeof req.session.multiplierIndex !== 'number' ||
        req.session.multiplierIndex < -1 ||
        req.session.multiplierIndex >= MULTIPLIER_SEQUENCE.length) {
        req.session.multiplierIndex = -1;   // -1 = no multiplier
    }
    if (typeof req.session.scatterCooldown !== 'number') req.session.scatterCooldown = 0;
    if (typeof req.session.freeSpinAccumulator !== 'number') req.session.freeSpinAccumulator = 0;
}

function randomSymbol({ allowScatter = true, allowWild = true } = {}) {
    const rand = Math.random();
    if (allowScatter && rand < 0.05) return SYMBOLS.find(s => s.isScatter);
    if (allowWild && rand < 0.08) return SYMBOLS.find(s => s.isWild);
    return REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)];
}

function generateWinningGrid(allowScatter = true) {
    const grid = [];
    let scatterCount = 0, wildCount = 0;
    const winSymbol = REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)];
    const totalCells = REEL_COUNT * VISIBLE_ROWS;
    const winningPositions = [];
    while (winningPositions.length < 5) {
        const pos = Math.floor(Math.random() * totalCells);
        if (!winningPositions.includes(pos)) winningPositions.push(pos);
    }
    for (let i = 0; i < totalCells; i++) {
        const col = Math.floor(i / VISIBLE_ROWS);
        const row = i % VISIBLE_ROWS;
        if (!grid[col]) grid[col] = [];
        if (winningPositions.includes(i)) {
            grid[col][row] = winSymbol;
        } else {
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

function generateLosingGrid(allowScatter = true) {
    const grid = [];
    let scatterCount = 0, wildCount = 0;
    const usedRegular = new Set();
    for (let col = 0; col < REEL_COUNT; col++) {
        grid[col] = [];
        for (let row = 0; row < VISIBLE_ROWS; row++) {
            let placedSpecial = false;
            if (allowScatter && scatterCount < 3 && Math.random() < 0.05) {
                grid[col][row] = SYMBOLS.find(s => s.isScatter);
                scatterCount++;
                placedSpecial = true;
            } else if (wildCount < 3 && Math.random() < 0.08) {
                grid[col][row] = SYMBOLS.find(s => s.isWild);
                wildCount++;
                placedSpecial = true;
            }
            if (!placedSpecial) {
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

function countScatters(grid) {
    let count = 0;
    for (const col of grid) for (const sym of col) if (sym.isScatter) count++;
    return count;
}

function detectWins(grid) {
    const wildPositions = [];
    const symbolCounts = {};
    const symbolPositions = {};
    REGULAR_SYMBOLS.forEach(s => { symbolCounts[s.id] = 0; symbolPositions[s.id] = []; });
    for (let col = 0; col < REEL_COUNT; col++) {
        for (let row = 0; row < VISIBLE_ROWS; row++) {
            const sym = grid[col][row];
            if (sym.isWild) wildPositions.push({ col, row });
            else if (!sym.isScatter) {
                symbolCounts[sym.id]++;
                symbolPositions[sym.id].push({ col, row });
            }
        }
    }
    const wins = [];
    let availableWilds = wildPositions.slice();
    const symbolIds = Object.keys(symbolCounts).sort((a,b)=>symbolCounts[b]-symbolCounts[a]);
    for (const id of symbolIds) {
        const baseCount = symbolCounts[id];
        if (baseCount >= 5) {
            wins.push({
                symbol: REGULAR_SYMBOLS.find(s=>s.id===id),
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
                    symbol: REGULAR_SYMBOLS.find(s=>s.id===id),
                    count: totalCount,
                    positions: symbolPositions[id].concat(usedWilds).slice(0, totalCount),
                    wildPositionsUsed: usedWilds
                });
            }
        }
    }
    if (availableWilds.length > 0 && wins.length > 0) {
        wins.sort((a,b)=>b.count-a.count);
        const best = wins[0];
        best.count += availableWilds.length;
        best.positions.push(...availableWilds);
        best.wildPositionsUsed.push(...availableWilds);
    }
    return wins;
}

function evaluateSpin(grid, bet, gameSession) {
    const clusterWins = detectWins(grid);
    const scatterCount = countScatters(grid);
    const hasWin = clusterWins.length > 0 || scatterCount >= 3;

    let currentMultiplier;
    if (hasWin) {
        if (gameSession.multiplierIndex < MULTIPLIER_SEQUENCE.length - 1) {
            gameSession.multiplierIndex++;
        }
        currentMultiplier = MULTIPLIER_SEQUENCE[gameSession.multiplierIndex];
    } else {
        gameSession.multiplierIndex = -1;
        currentMultiplier = 0;
    }

    let totalWin = 0;
    const wins = [];
    let freeSpinsAwarded = 0;

    for (const win of clusterWins) {
        const payout = getClusterPayout(win.count);
        const winAmount = Math.round(bet * payout * currentMultiplier);
        totalWin += winAmount;
        wins.push({
            symbol: win.symbol,
            count: win.count,
            positions: win.positions,
            wildPositionsUsed: win.wildPositionsUsed,
            winAmount,
            multiplier: currentMultiplier
        });
    }

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

    totalWin = Math.round(totalWin || 0);

    gameSession.freeSpins += freeSpinsAwarded;

    return {
        grid,
        totalWin,
        wins,
        freeSpinsAwarded,
        scatters: scatterCount,
        freeSpinsRemaining: gameSession.freeSpins,
        multiplierUsed: currentMultiplier,
        currentMultiplier: gameSession.multiplierIndex === -1 ? 0 : MULTIPLIER_SEQUENCE[gameSession.multiplierIndex]
    };
}

app.get('/api/state', (req, res) => {
    initGame(req);
    res.json({
        balance: req.session.balance,
        freeSpins: req.session.freeSpins,
        lastBet: req.session.lastBet,
        multiplier: req.session.multiplierIndex === -1 ? 0 : MULTIPLIER_SEQUENCE[req.session.multiplierIndex]
    });
});

app.post('/api/spin', (req, res) => {
    initGame(req);
    if (req.session.scatterCooldown > 0) req.session.scatterCooldown--;

    const isFreeSpin = req.body.isFreeSpin === true;
    let betAmount = 0;

    if (isFreeSpin) {
        if (req.session.freeSpins <= 0) return res.status(400).json({ error: 'No free spins available.' });
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
    const forceWin = Math.random() < 0.17;   // 17% regular win + scatter ~13% = 30% total

    const grid = forceWin ? generateWinningGrid(allowScatter) : generateLosingGrid(allowScatter);
    const result = evaluateSpin(grid, betAmount, req.session);

    let totalFreeSpinWin = undefined;
    if (isFreeSpin) {
        req.session.freeSpinAccumulator += result.totalWin;
        if (req.session.freeSpins <= 0) {
            totalFreeSpinWin = req.session.freeSpinAccumulator;
            req.session.balance += totalFreeSpinWin;
            req.session.freeSpinAccumulator = 0;
        }
    } else {
        req.session.balance += result.totalWin;
    }

    if (result.freeSpinsAwarded > 0) req.session.scatterCooldown = SCATTER_COOLDOWN_SPINS;

    res.json({
        grid: result.grid,
        totalWin: result.totalWin,
        wins: result.wins,
        freeSpinsAwarded: result.freeSpinsAwarded,
        scatters: result.scatters,
        newBalance: req.session.balance,
        freeSpinsRemaining: result.freeSpinsRemaining,
        multiplierUsed: result.multiplierUsed,
        currentMultiplier: result.currentMultiplier,
        totalFreeSpinWin: totalFreeSpinWin
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

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
