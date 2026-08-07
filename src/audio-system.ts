import { createSystem } from '@iwsdk/core';
import { gs } from './game-state.js';

export class AudioSystem extends createSystem({}) {
	private ctx: AudioContext | null = null;
	private masterGain: GainNode | null = null;

	init() {
		try {
			this.ctx = new AudioContext();
			this.masterGain = this.ctx.createGain();
			this.masterGain.gain.value = 0.35;
			this.masterGain.connect(this.ctx.destination);
		} catch {
			/* audio unavailable */
		}
	}

	public playHammer() {
		if (!this.ctx || !this.masterGain || !gs.soundEnabled) return;
		this.resumeCtx();
		const t = this.ctx.currentTime;
		// Impact tone
		const osc = this.ctx.createOscillator();
		const env = this.ctx.createGain();
		osc.type = 'square';
		osc.frequency.setValueAtTime(220 + Math.random() * 60, t);
		osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);
		env.gain.setValueAtTime(0.6, t);
		env.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
		osc.connect(env).connect(this.masterGain);
		osc.start(t);
		osc.stop(t + 0.12);
		// Metal ring
		const ring = this.ctx.createOscillator();
		const rEnv = this.ctx.createGain();
		ring.type = 'sine';
		ring.frequency.value = 800 + Math.random() * 300;
		rEnv.gain.setValueAtTime(0.15, t);
		rEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
		ring.connect(rEnv).connect(this.masterGain);
		ring.start(t);
		ring.stop(t + 0.2);
	}

	public playFireCrackle() {
		if (!this.ctx || !this.masterGain || !gs.soundEnabled) return;
		this.resumeCtx();
		const t = this.ctx.currentTime;
		const dur = 0.08 + Math.random() * 0.06;
		const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
		const src = this.ctx.createBufferSource();
		src.buffer = buf;
		const filt = this.ctx.createBiquadFilter();
		filt.type = 'bandpass';
		filt.frequency.value = 600 + Math.random() * 400;
		filt.Q.value = 2;
		const env = this.ctx.createGain();
		env.gain.setValueAtTime(0.2, t);
		env.gain.exponentialRampToValueAtTime(0.001, t + dur);
		src.connect(filt).connect(env).connect(this.masterGain);
		src.start(t);
	}

	public playQuench() {
		if (!this.ctx || !this.masterGain || !gs.soundEnabled) return;
		this.resumeCtx();
		const t = this.ctx.currentTime;
		const dur = 0.6;
		const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
		const src = this.ctx.createBufferSource();
		src.buffer = buf;
		const filt = this.ctx.createBiquadFilter();
		filt.type = 'highpass';
		filt.frequency.value = 2000;
		const env = this.ctx.createGain();
		env.gain.setValueAtTime(0.35, t);
		env.gain.exponentialRampToValueAtTime(0.001, t + dur);
		src.connect(filt).connect(env).connect(this.masterGain);
		src.start(t);
	}

	public playComplete() {
		if (!this.ctx || !this.masterGain || !gs.soundEnabled) return;
		this.resumeCtx();
		const t = this.ctx.currentTime;
		const notes = [523, 659, 784];
		for (let i = 0; i < notes.length; i++) {
			const osc = this.ctx.createOscillator();
			const env = this.ctx.createGain();
			osc.type = 'sine';
			osc.frequency.value = notes[i];
			env.gain.setValueAtTime(0, t + i * 0.1);
			env.gain.linearRampToValueAtTime(0.25, t + i * 0.1 + 0.02);
			env.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.3);
			osc.connect(env).connect(this.masterGain);
			osc.start(t + i * 0.1);
			osc.stop(t + i * 0.1 + 0.3);
		}
	}

	public playFail() {
		if (!this.ctx || !this.masterGain || !gs.soundEnabled) return;
		this.resumeCtx();
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const env = this.ctx.createGain();
		osc.type = 'sawtooth';
		osc.frequency.setValueAtTime(200, t);
		osc.frequency.exponentialRampToValueAtTime(80, t + 0.4);
		env.gain.setValueAtTime(0.3, t);
		env.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
		osc.connect(env).connect(this.masterGain);
		osc.start(t);
		osc.stop(t + 0.4);
	}

	public playSelect() {
		if (!this.ctx || !this.masterGain || !gs.soundEnabled) return;
		this.resumeCtx();
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const env = this.ctx.createGain();
		osc.type = 'sine';
		osc.frequency.value = 440;
		env.gain.setValueAtTime(0.2, t);
		env.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
		osc.connect(env).connect(this.masterGain);
		osc.start(t);
		osc.stop(t + 0.1);
	}

	private resumeCtx() {
		if (this.ctx && this.ctx.state === 'suspended') {
			this.ctx.resume().catch(() => {});
		}
	}

	private fireTimer = 0;
	update(delta: number) {
		this.fireTimer -= delta;
		if (this.fireTimer <= 0 && gs.phase === 'playing') {
			this.playFireCrackle();
			this.fireTimer = 0.3 + Math.random() * 0.5;
		}
	}
}
