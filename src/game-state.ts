export const ITEM_NAMES = ['Sword', 'Axe', 'Shield', 'Dagger', 'Helmet'];
export const METAL_NAMES = ['Iron', 'Steel', 'Mithril'];
export const METAL_COLORS = [0x888888, 0xaaaacc, 0x88ddff];
export const METAL_EMISSIVE = [0x442200, 0x4444aa, 0x2266cc];

export type GamePhase = 'menu' | 'playing' | 'wave_intro' | 'game_over';
export type WorkStep = 'idle' | 'heating' | 'hot' | 'hammering' | 'forged' | 'quenching' | 'ready';

export interface Order {
	itemType: number;
	metalType: number;
	hammerTarget: number;
	timeLimit: number;
	baseScore: number;
}

export const gs = {
	phase: 'menu' as GamePhase,
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
	soundEnabled: true,
	musicEnabled: true,
	difficulty: 'normal' as 'easy' | 'normal' | 'hard',
	dirty: true,
};
