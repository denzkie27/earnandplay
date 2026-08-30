const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'scatter-slot-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Game configuration (server-side, not accessible to client)
const SYMBOLS = [
    { icon: 'star',      color: '#f1c40f' },  // scatter
    { icon: 'filter_7',  color: '#e74c3c' },
    { icon: 'diamond',   color: '#3498db' },
    { icon: 'favorite',  color: '#e74c3c' },
    { icon: 'flash_on',  color: '#f39c12' },
    { icon: 'ac_unit',   color: '#1abc9c' },
    { icon: 'whatshot',  color: '#e67e22' },
    { icon: 'bug_report',color: '#27ae60' },
    { icon: 'pets',      color: '#9b59b6' },
    { icon: 'local_florist', color: '#2ecc71' },
    { icon: 'wb_sunny',  color: '#f1c40f' },
    { icon: 'music_note',color: '#e91e63' }
];
const SCATTER_ICON = 'star';
const SCATTER_PAYOUTS = { 3: 2, 4: 5, 5: 10, 6: 20, 7: 50 };  // Lower multipliers
const FREE_SPINS = { 3: 2, 4: 4, 5: 8, 6: 12, 7: 20 };        // Fewer free spins
const VISIBLE_ROWS = 3;
const REEL_COUNT = 5;

// Initialize a new session's game state
function initGame(req) {
    if (!req.session.balance) {
        req.session.balance = 100;
        req.session.freeSpins = 0;
        req.session.lastBet = 1;
    }
}

// Generate a random 5x3 grid
function generateGrid() {
    const grid = [];
    for (let col = 0; col < REEL_COUNT; col++) {
        const colSymbols = [];
        for (let row = 0; row < VISIBLE_ROWS; row++) {
            colSymbols.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
        }
        grid.push(colSymbols);
    }
    return grid;
}

// Count scatters in grid
function countScatters(grid) {
    let count = 0;
    for (const col of grid) {
        for (const sym of col) {
            if (sym.icon === SCATTER_ICON) count++;
        }
    }
    return count;
}

// API endpoint to get initial balance
app.get('/api/state', (req, res) => {
    initGame(req);
    res.json({
        balance: req.session.balance,
        freeSpins: req.session.freeSpins,
        lastBet: req.session.lastBet
    });
});

// Spin endpoint (regular spin or free spin)
app.post('/api/spin', (req, res) => {
    initGame(req);
    const { isFreeSpin = false } = req.body;
    let betAmount = 0;

    if (isFreeSpin) {
        if (req.session.freeSpins <= 0) {
            return res.status(400).json({ error: 'No free spins available.' });
        }
        req.session.freeSpins--;
        betAmount = req.session.lastBet;
    } else {
        betAmount = parseInt(req.body.bet);
        if (isNaN(betAmount) || betAmount < 1 || betAmount > req.session.balance) {
            return res.status(400).json({ error: 'Invalid bet amount.' });
        }
        req.session.balance -= betAmount;
        req.session.lastBet = betAmount;
    }

    const grid = generateGrid();
    const scatters = countScatters(grid);
    let winAmount = 0;
    let freeSpinsAwarded = 0;

    if (scatters >= 3) {
        const multiplier = SCATTER_PAYOUTS[scatters] || 2;
        winAmount = betAmount * multiplier;
        req.session.balance += winAmount;
        freeSpinsAwarded = FREE_SPINS[scatters] || 2;
        req.session.freeSpins += freeSpinsAwarded;
    }

    res.json({
        grid,
        scatters,
        winAmount,
        freeSpinsAwarded,
        newBalance: req.session.balance,
        freeSpinsRemaining: req.session.freeSpins,
        betAmount
    });
});

app.listen(PORT, () => {
    console.log(`Scatter slot server running at http://localhost:${PORT}`);
});
