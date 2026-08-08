import type { AudioSystem } from './audio-system.js';
import type { GameSystem } from './game-system.js';

/**
 * Module-level singleton references for cross-system communication.
 * Each system registers itself during init(). Avoids (world as any)._systems.
 */
export const systemRefs: {
	audio: AudioSystem | null;
	game: GameSystem | null;
} = {
	audio: null,
	game: null,
};
