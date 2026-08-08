import { createSystem, UIKitMLAsset } from '@iwsdk/core';
import {
	gs,
	ITEM_NAMES,
	METAL_NAMES,
	getMasteryRank,
	type GamePhase,
} from './game-state.js';
import { systemRefs } from './system-refs.js';

export class UISystem extends createSystem({}) {
	private menuPanel: UIKitMLAsset | undefined;
	private hudPanel: UIKitMLAsset | undefined;
	private orderPanel: UIKitMLAsset | undefined;
	private gameOverPanel: UIKitMLAsset | undefined;
	private settingsPanel: UIKitMLAsset | undefined;
	private pausePanel: UIKitMLAsset | undefined;
	private wavePanel: UIKitMLAsset | undefined;
	private helpPanel: UIKitMLAsset | undefined;
	private lastPhase: GamePhase = 'menu';
	private wired = false;
	private wireAttempts = 0;
	private wireDelay = 0;

	init() {
		this.wireDelay = 0.5;
	}

	private wirePanels() {
		try {
			this.menuPanel = this.world.getSceneObject<UIKitMLAsset>('menu-panel');
			this.hudPanel = this.world.getSceneObject<UIKitMLAsset>('hud-panel');
			this.orderPanel = this.world.getSceneObject<UIKitMLAsset>('order-panel');
			this.gameOverPanel = this.world.getSceneObject<UIKitMLAsset>('game-over-panel');
			this.settingsPanel = this.world.getSceneObject<UIKitMLAsset>('settings-panel');
			this.pausePanel = this.world.getSceneObject<UIKitMLAsset>('pause-panel');
			this.wavePanel = this.world.getSceneObject<UIKitMLAsset>('wave-panel');
			this.helpPanel = this.world.getSceneObject<UIKitMLAsset>('help-panel');
		} catch {
			return;
		}

		const gameSys = systemRefs.game;
		const audioSys = systemRefs.audio;

		// Menu buttons
		this.menuPanel?.getElementById('btn-play')?.addEventListener('click', () => {
			audioSys?.playSelect();
			gameSys?.startGame();
		});
		this.menuPanel?.getElementById('btn-settings')?.addEventListener('click', () => {
			audioSys?.playSelect();
			this.showSettings();
		});
		this.menuPanel?.getElementById('btn-help')?.addEventListener('click', () => {
			audioSys?.playSelect();
			this.showHelp();
		});

		// Game over buttons
		this.gameOverPanel?.getElementById('btn-restart')?.addEventListener('click', () => {
			audioSys?.playSelect();
			gameSys?.startGame();
		});
		this.gameOverPanel?.getElementById('btn-menu')?.addEventListener('click', () => {
			audioSys?.playSelect();
			gs.phase = 'menu';
			gs.dirty = true;
		});

		// Settings buttons
		this.settingsPanel?.getElementById('btn-difficulty')?.addEventListener('click', () => {
			audioSys?.playSelect();
			const modes = ['easy', 'normal', 'hard'] as const;
			const idx = modes.indexOf(gs.difficulty);
			gs.difficulty = modes[(idx + 1) % 3];
			this.settingsPanel?.getElementById('difficulty-val')?.setProperties({ text: gs.difficulty.toUpperCase() });
		});
		this.settingsPanel?.getElementById('btn-sound')?.addEventListener('click', () => {
			gs.soundEnabled = !gs.soundEnabled;
			this.settingsPanel?.getElementById('sound-val')?.setProperties({ text: gs.soundEnabled ? 'ON' : 'OFF' });
		});
		this.settingsPanel?.getElementById('btn-music')?.addEventListener('click', () => {
			gs.musicEnabled = !gs.musicEnabled;
			this.settingsPanel?.getElementById('music-val')?.setProperties({ text: gs.musicEnabled ? 'ON' : 'OFF' });
		});
		this.settingsPanel?.getElementById('btn-back')?.addEventListener('click', () => {
			audioSys?.playSelect();
			this.hideSettings();
		});

		// Help panel back button
		this.helpPanel?.getElementById('btn-help-back')?.addEventListener('click', () => {
			audioSys?.playSelect();
			this.hideHelp();
		});

		// Pause panel buttons
		this.pausePanel?.getElementById('btn-resume')?.addEventListener('click', () => {
			audioSys?.playSelect();
			gameSys?.resumeGame();
		});
		this.pausePanel?.getElementById('btn-quit')?.addEventListener('click', () => {
			audioSys?.playSelect();
			gs.phase = 'menu';
			gs.dirty = true;
		});

		// HUD pause button
		this.hudPanel?.getElementById('btn-pause')?.addEventListener('click', () => {
			audioSys?.playSelect();
			gameSys?.pauseGame();
		});

		this.wired = true;
		this.showPhase('menu');
	}

	private settingsShown = false;
	private helpShown = false;

	private showSettings() {
		this.settingsShown = true;
		if (this.menuPanel) this.menuPanel.visible = false;
		if (this.settingsPanel) this.settingsPanel.visible = true;
	}

	private hideSettings() {
		this.settingsShown = false;
		if (this.settingsPanel) this.settingsPanel.visible = false;
		if (this.menuPanel) this.menuPanel.visible = true;
	}

	private showHelp() {
		this.helpShown = true;
		if (this.menuPanel) this.menuPanel.visible = false;
		if (this.helpPanel) this.helpPanel.visible = true;
	}

	private hideHelp() {
		this.helpShown = false;
		if (this.helpPanel) this.helpPanel.visible = false;
		if (this.menuPanel) this.menuPanel.visible = true;
	}

	private showPhase(phase: GamePhase) {
		this.settingsShown = false;
		this.helpShown = false;
		const m = phase === 'menu';
		const p = phase === 'playing' || phase === 'wave_intro' || phase === 'wave_complete';
		const g = phase === 'game_over';
		const pa = phase === 'paused';
		const w = phase === 'wave_intro' || phase === 'wave_complete';
		if (this.menuPanel) this.menuPanel.visible = m;
		if (this.hudPanel) this.hudPanel.visible = p || pa;
		if (this.orderPanel) this.orderPanel.visible = phase === 'playing';
		if (this.gameOverPanel) this.gameOverPanel.visible = g;
		if (this.settingsPanel) this.settingsPanel.visible = false;
		if (this.helpPanel) this.helpPanel.visible = false;
		if (this.pausePanel) this.pausePanel.visible = pa;
		if (this.wavePanel) this.wavePanel.visible = w;

		// Update mastery rank on menu
		if (m) {
			const rank = getMasteryRank();
			this.menuPanel?.getElementById('rank')?.setProperties({ text: rank.title });
			this.menuPanel?.getElementById('rank-progress')?.setProperties({
				text: rank.next !== null ? `${gs.lifetimeCrafted}/${rank.next} items` : `${gs.lifetimeCrafted} items`,
			});
		}
	}

	private updateHUD() {
		this.hudPanel?.getElementById('score')?.setProperties({ text: String(gs.score) });
		this.hudPanel?.getElementById('combo')?.setProperties({ text: `x${gs.combo + 1}` });
		this.hudPanel?.getElementById('wave')?.setProperties({ text: String(gs.wave) });
		const hearts = '\u2665'.repeat(gs.lives);
		this.hudPanel?.getElementById('lives')?.setProperties({ text: hearts || '---' });
		// High score
		this.hudPanel?.getElementById('highscore')?.setProperties({
			text: gs.score > gs.highScore ? String(gs.score) : String(gs.highScore),
		});
		// Difficulty indicator
		this.hudPanel?.getElementById('difficulty')?.setProperties({
			text: gs.difficulty.toUpperCase(),
		});
		// Streak indicator
		const streakText = gs.streak >= 3 ? `${gs.streak} 🔥` : String(gs.streak);
		this.hudPanel?.getElementById('streak')?.setProperties({ text: streakText });
	}

	private updateOrder() {
		const o = gs.currentOrder;
		if (!o) {
			this.orderPanel?.getElementById('order-name')?.setProperties({ text: 'WAITING...' });
			this.orderPanel?.getElementById('order-metal')?.setProperties({ text: '' });
			return;
		}
		const prefix = o.isGolden ? '* ' : '';
		const name = `${prefix}${METAL_NAMES[o.metalType]} ${ITEM_NAMES[o.itemType]}`;
		this.orderPanel?.getElementById('order-name')?.setProperties({ text: name });
		this.orderPanel?.getElementById('order-metal')?.setProperties({
			text: o.isGolden ? 'GOLDEN ORDER!' : `Metal: ${METAL_NAMES[o.metalType]}`,
		});

		const steps: [string, string][] = [
			['step-heat', gs.workStep === 'heating' ? `${(gs.heatLevel * 100) | 0}%` : gs.heatLevel >= 1 ? 'DONE' : '---'],
			['step-hammer', gs.workStep === 'hammering' || gs.workStep === 'hot' ? `${gs.hammerCount}/${o.hammerTarget}` : gs.hammerCount >= o.hammerTarget ? 'DONE' : '---'],
			['step-quench', gs.workStep === 'quenching' ? 'COOLING' : gs.workStep === 'ready' ? 'DONE' : '---'],
			['step-deliver', gs.workStep === 'ready' ? 'READY!' : '---'],
		];
		for (const [id, text] of steps) {
			this.orderPanel?.getElementById(id)?.setProperties({ text });
		}

		const timer = Math.max(0, gs.orderTimer) | 0;
		this.orderPanel?.getElementById('order-timer')?.setProperties({ text: `TIME: ${timer}s` });
		// Rush order indicator
		this.orderPanel?.getElementById('rush-label')?.setProperties({
			text: o.isRush ? '⚡ RUSH ORDER — 1.5x SCORE!' : '',
		});
	}

	private updateGameOver() {
		this.gameOverPanel?.getElementById('go-score')?.setProperties({ text: String(gs.score) });
		this.gameOverPanel?.getElementById('go-waves')?.setProperties({ text: String(gs.wave) });
		this.gameOverPanel?.getElementById('go-orders')?.setProperties({ text: String(gs.totalOrders) });
		this.gameOverPanel?.getElementById('go-combo')?.setProperties({ text: `x${gs.maxCombo + 1}` });
		this.gameOverPanel?.getElementById('go-streak')?.setProperties({ text: String(gs.bestStreak) });
		const isNew = gs.score >= gs.highScore && gs.score > 0;
		this.gameOverPanel?.getElementById('go-highscore')?.setProperties({
			text: isNew ? `NEW! ${gs.score}` : String(gs.highScore),
		});
		// Crafted stats
		const craftedParts: string[] = [];
		for (let i = 0; i < ITEM_NAMES.length; i++) {
			if (gs.craftedByType[i] > 0) craftedParts.push(`${gs.craftedByType[i]} ${ITEM_NAMES[i]}`);
		}
		const craftedText = craftedParts.length > 0 ? craftedParts.join(', ') : '0';
		this.gameOverPanel?.getElementById('go-crafted')?.setProperties({ text: craftedText });
		// Mastery rank
		const rank = getMasteryRank();
		this.gameOverPanel?.getElementById('go-rank')?.setProperties({ text: rank.title });
	}

	private updateWavePanel() {
		if (gs.phase === 'wave_intro') {
			this.wavePanel?.getElementById('wave-title')?.setProperties({ text: `WAVE ${gs.wave}` });
			this.wavePanel?.getElementById('wave-sub')?.setProperties({
				text: `${gs.ordersTarget} orders to fill`,
			});
		} else if (gs.phase === 'wave_complete') {
			this.wavePanel?.getElementById('wave-title')?.setProperties({ text: 'WAVE COMPLETE!' });
			const bonus = gs.perfectWave ? `+${gs.wave * 100} PERFECT BONUS` : 'Next wave incoming...';
			this.wavePanel?.getElementById('wave-sub')?.setProperties({ text: bonus });
		}
	}

	update(delta: number) {
		if (!this.wired) {
			this.wireDelay -= delta;
			if (this.wireDelay <= 0 && this.wireAttempts < 10) {
				this.wireAttempts++;
				this.wirePanels();
				if (!this.wired) this.wireDelay = 0.5;
			}
			return;
		}

		// Phase transitions
		if (gs.phase !== this.lastPhase) {
			this.lastPhase = gs.phase;
			this.showPhase(gs.phase);
			if (gs.phase === 'game_over') {
				this.updateGameOver();
				systemRefs.audio?.playFail();
			}
			if (gs.phase === 'wave_intro' || gs.phase === 'wave_complete') {
				this.updateWavePanel();
			}
		}

		if (!gs.dirty) return;
		gs.dirty = false;

		if (gs.phase === 'playing') {
			this.updateHUD();
			this.updateOrder();
		} else if (gs.phase === 'wave_intro' || gs.phase === 'wave_complete') {
			this.updateHUD();
			this.updateWavePanel();
		} else if (gs.phase === 'paused') {
			this.updateHUD();
		}
	}
}
