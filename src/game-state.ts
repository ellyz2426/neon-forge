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
