export const ITEM_NAMES = ['Sword', 'Axe', 'Shield', 'Dagger', 'Helmet'];
export const METAL_NAMES = ['Iron', 'Steel', 'Mithril'];
export const METAL_COLORS = [0x888888, 0xaaaacc, 0x88ddff];
export const METAL_EMISSIVE = [0x442200, 0x4444aa, 0x2266cc];

// Workpiece shapes per item type (scale factors for box geometry)
export const ITEM_SHAPES: [number, number, number][] = [
	[0.06, 0.35, 0.04], // Sword — tall thin
	[0.12, 0.28, 0.04], // Axe — wide tall
	[0.24, 0.24, 0.03], // Shield — wide square flat
	[0.04, 0.2, 0.03], // Dagger — small thin
	[0.18, 0.14, 0.16], // Helmet — round-ish
];

export type GamePhase = 'menu' | 'playing' | 'wave_intro' | 'wave_complete' | 'game_over' | 'paused';
export type WorkStep = 'idle' | 'heating' | 'hot' | 'hammering' | 'forged' | 'quenching' | 'ready';

export interface Order {
	itemType: number;
	metalType: number;
	hammerTarget: number;
	timeLimit: number;
	baseScore: number;
	isGolden: boolean;
	isRush: boolean;
}

export const gs = {
	phase: 'menu' as GamePhase,
	previousPhase: 'menu' as GamePhase,
	score: 0,
	combo: 0,
	maxCombo: 0,
	lives: 3,
	wave: 1,
	ordersThisWave: 0,
	ordersTarget: 3,
	totalOrders: 0,
	workStep: 'idle' as WorkStep,
	heatLevel: 0,
	hammerCount: 0,
	currentOrder: null as Order | null,
	orderTimer: 0,
	waveIntroTimer: 0,
	waveCompleteTimer: 0,
	soundEnabled: true,
	musicEnabled: true,
	difficulty: 'normal' as 'easy' | 'normal' | 'hard',
	dirty: true,
	highScore: 0,
	deliveryFlashTimer: 0,
	perfectWave: true,
	craftedByType: [0, 0, 0, 0, 0] as number[],
	craftedByMetal: [0, 0, 0] as number[],
	streak: 0,
	bestStreak: 0,
	goldenFlashTimer: 0,
	cameraShakeTimer: 0,
	cameraShakeIntensity: 0,
	lifetimeCrafted: 0,
	lifetimeGames: 0,
	bestWave: 0,
};

// Load high score from localStorage
try {
	const saved = localStorage.getItem('neon-forge-highscore');
	if (saved) gs.highScore = parseInt(saved, 10) || 0;
} catch { /* headless */ }

export function saveHighScore() {
	if (gs.score > gs.highScore) {
		gs.highScore = gs.score;
		try { localStorage.setItem('neon-forge-highscore', String(gs.highScore)); } catch { /* headless */ }
	}
}

// Mastery ranks based on total lifetime crafted items
export const MASTERY_RANKS = [
	{ threshold: 0, title: 'Apprentice', color: '#cccccc' },
	{ threshold: 10, title: 'Journeyman', color: '#44ff88' },
	{ threshold: 25, title: 'Blacksmith', color: '#44aaff' },
	{ threshold: 50, title: 'Artisan', color: '#ff8800' },
	{ threshold: 100, title: 'Master Smith', color: '#ffdd00' },
	{ threshold: 200, title: 'Legendary Smith', color: '#ff44ff' },
	{ threshold: 500, title: 'Forge Lord', color: '#ff2222' },
];

// Load lifetime stats
try {
	const saved = localStorage.getItem('neon-forge-lifetime-crafted');
	if (saved) gs.lifetimeCrafted = parseInt(saved, 10) || 0;
	const savedGames = localStorage.getItem('neon-forge-lifetime-games');
	if (savedGames) gs.lifetimeGames = parseInt(savedGames, 10) || 0;
	const savedBestWave = localStorage.getItem('neon-forge-best-wave');
	if (savedBestWave) gs.bestWave = parseInt(savedBestWave, 10) || 0;
} catch { /* headless */ }

export function saveLifetimeStats() {
	gs.lifetimeCrafted += gs.totalOrders;
	gs.lifetimeGames++;
	if (gs.wave > gs.bestWave) gs.bestWave = gs.wave;
	try {
		localStorage.setItem('neon-forge-lifetime-crafted', String(gs.lifetimeCrafted));
		localStorage.setItem('neon-forge-lifetime-games', String(gs.lifetimeGames));
		localStorage.setItem('neon-forge-best-wave', String(gs.bestWave));
	} catch { /* headless */ }
}

export function getMasteryRank(): { title: string; color: string; next: number | null } {
	let rank = MASTERY_RANKS[0];
	for (const r of MASTERY_RANKS) {
		if (gs.lifetimeCrafted >= r.threshold) rank = r;
	}
	const idx = MASTERY_RANKS.indexOf(rank);
	const next = idx < MASTERY_RANKS.length - 1 ? MASTERY_RANKS[idx + 1].threshold : null;
	return { title: rank.title, color: rank.color, next };
}
