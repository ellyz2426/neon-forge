import {
	createSystem,
	Mesh,
	MeshStandardMaterial,
	BoxGeometry,
	CylinderGeometry,
	PlaneGeometry,
	SphereGeometry,
	ConeGeometry,
	TorusGeometry,
	PointLight,
	Group,
	Scene,
	Vector3,
	Color,
	Pressed,
	RayInteractable,
} from '@iwsdk/core';
import { ForgeStation } from './components.js';
import { AudioSystem } from './audio-system.js';
import {
	gs,
	ITEM_NAMES,
	METAL_NAMES,
	METAL_COLORS,
	METAL_EMISSIVE,
	type Order,
	type WorkStep,
} from './game-state.js';

const STATION_POSITIONS: [number, number, number][] = [
	[-2.2, 0, -2.2], // 0 = ingot rack
	[-0.9, 0, -2.0], // 1 = forge
	[0.0, 0, -1.8], // 2 = anvil
	[0.9, 0, -2.0], // 3 = trough
	[2.2, 0, -2.2], // 4 = delivery
];

const STATION_LABELS = ['RACK', 'FORGE', 'ANVIL', 'TROUGH', 'DELIVER'];

const DIFF_MULT: Record<string, number> = { easy: 1.3, normal: 1.0, hard: 0.7 };

export class GameSystem extends createSystem({
	pressedStations: { required: [ForgeStation, Pressed] },
}) {
	private fireLight!: PointLight;
	private fireLightAlt!: PointLight;
	private workpiece!: Mesh;
	private workpieceMat!: MeshStandardMaterial;
	private sparkGroup!: Group;
	private smokeGroup!: Group;
	private steamGroup!: Group;
	private stationGlows: Mesh[] = [];
	private elapsed = 0;
	private activeStation = -1;
	private audioSys: AudioSystem | null = null;
	private anvilTop: Mesh | null = null;
	private anvilBounceTimer = 0;

	init() {
		this.buildEnvironment();
		this.createWorkpiece();
		this.createSmokeParticles();
		this.createSteamParticles();

		// Find AudioSystem
		for (const sys of (this.world as any)._systems || []) {
			if (sys instanceof AudioSystem) this.audioSys = sys;
		}

		this.queries.pressedStations.subscribe('qualify', (entity) => {
			if (gs.phase !== 'playing') return;
			const t = entity.getValue(ForgeStation, 'stationType') as number;
			this.handleStation(t);
		});
	}

	/* ─── Environment ────────────────────────────────────────── */

	private buildEnvironment() {
		const sc = this.world.scene;

		// Floor
		const floorMat = new MeshStandardMaterial({
			color: 0x111111,
			roughness: 0.95,
			metalness: 0.1,
		});
		const floor = new Mesh(new PlaneGeometry(16, 16), floorMat);
		floor.rotation.x = -Math.PI / 2;
		floor.receiveShadow = true;
		sc.add(floor);

		// Back wall
		const wallMat = new MeshStandardMaterial({
			color: 0x0a0a0a,
			roughness: 0.9,
		});
		const wall = new Mesh(new BoxGeometry(16, 6, 0.2), wallMat);
		wall.position.set(0, 3, -4);
		sc.add(wall);

		// Side walls
		const lw = new Mesh(new BoxGeometry(0.2, 6, 8), wallMat);
		lw.position.set(-4, 3, -0.5);
		sc.add(lw);
		const rw = new Mesh(new BoxGeometry(0.2, 6, 8), wallMat);
		rw.position.set(4, 3, -0.5);
		sc.add(rw);

		// Ceiling
		const ceilMat = new MeshStandardMaterial({
			color: 0x080808,
			roughness: 0.95,
		});
		const ceiling = new Mesh(new PlaneGeometry(16, 16), ceilMat);
		ceiling.rotation.x = Math.PI / 2;
		ceiling.position.y = 5;
		sc.add(ceiling);

		// Wooden beams across ceiling
		const beamMat = new MeshStandardMaterial({
			color: 0x2a1a0a,
			roughness: 0.85,
		});
		for (let i = -3; i <= 3; i += 2) {
			const beam = new Mesh(new BoxGeometry(8.5, 0.2, 0.25), beamMat);
			beam.position.set(0, 4.85, i * 0.8 - 0.5);
			sc.add(beam);
		}

		// Chimney / hood above forge
		const chimneyMat = new MeshStandardMaterial({
			color: 0x1a1210,
			roughness: 0.8,
			metalness: 0.3,
		});
		// Hood base (wide cone above forge)
		const hood = new Mesh(new ConeGeometry(0.8, 0.6, 6), chimneyMat);
		hood.position.set(-0.9, 2.0, -2.0);
		sc.add(hood);
		// Chimney pipe
		const chimPipe = new Mesh(new CylinderGeometry(0.25, 0.35, 2.5, 6), chimneyMat);
		chimPipe.position.set(-0.9, 3.55, -2.0);
		sc.add(chimPipe);

		// Tool rack on back wall (near anvil)
		this.buildToolRack(sc);

		// Hanging chains from beams
		this.buildHangingChains(sc);

		// Decorative wall swords
		this.buildWallSwords(sc);

		// Forge fire lights
		this.fireLight = new PointLight(0xff6600, 3, 8);
		this.fireLight.position.set(-0.9, 1.4, -2.0);
		sc.add(this.fireLight);
		this.fireLightAlt = new PointLight(0xff4400, 1.5, 6);
		this.fireLightAlt.position.set(-0.9, 0.8, -1.7);
		sc.add(this.fireLightAlt);

		// Ambient fill
		const fill = new PointLight(0x332211, 0.6, 12);
		fill.position.set(0, 3, 0);
		sc.add(fill);

		// Build each station
		for (let i = 0; i < 5; i++) {
			this.buildStation(i);
		}
	}

	private buildToolRack(sc: Scene) {
		const rackMat = new MeshStandardMaterial({
			color: 0x2a1a0a,
			roughness: 0.85,
		});
		const metalMat = new MeshStandardMaterial({
			color: 0x666677,
			metalness: 0.8,
			roughness: 0.25,
		});

		// Rack board on wall
		const board = new Mesh(new BoxGeometry(1.2, 0.08, 0.12), rackMat);
		board.position.set(0.0, 1.8, -3.85);
		sc.add(board);

		// Hammer — handle + head
		const hammerHandle = new Mesh(new CylinderGeometry(0.02, 0.02, 0.45, 6), rackMat);
		hammerHandle.rotation.z = Math.PI / 4;
		hammerHandle.position.set(-0.35, 1.95, -3.82);
		sc.add(hammerHandle);
		const hammerHead = new Mesh(new BoxGeometry(0.12, 0.07, 0.07), metalMat);
		hammerHead.position.set(-0.19, 2.11, -3.82);
		sc.add(hammerHead);

		// Tongs — two legs
		const tongsMat = new MeshStandardMaterial({
			color: 0x555555,
			metalness: 0.7,
			roughness: 0.3,
		});
		for (let i = 0; i < 2; i++) {
			const leg = new Mesh(new CylinderGeometry(0.012, 0.015, 0.5, 5), tongsMat);
			leg.rotation.z = Math.PI / 6;
			leg.position.set(0.1 + i * 0.04, 1.95, -3.82);
			sc.add(leg);
		}

		// Pegs
		for (let i = -1; i <= 1; i++) {
			const peg = new Mesh(new CylinderGeometry(0.015, 0.015, 0.1, 5), metalMat);
			peg.rotation.x = Math.PI / 2;
			peg.position.set(i * 0.4, 1.8, -3.8);
			sc.add(peg);
		}
	}

	private buildHangingChains(sc: Scene) {
		const chainMat = new MeshStandardMaterial({
			color: 0x444444,
			metalness: 0.9,
			roughness: 0.2,
		});
		// Two chains hanging from beams
		const chainPositions = [[-2.5, -1.3], [2.0, -1.3]];
		for (const [cx, cz] of chainPositions) {
			for (let j = 0; j < 5; j++) {
				const link = new Mesh(new TorusGeometry(0.03, 0.008, 6, 6), chainMat);
				link.position.set(cx, 4.5 - j * 0.12, cz);
				link.rotation.x = j % 2 === 0 ? 0 : Math.PI / 2;
				sc.add(link);
			}
			// Hook at bottom
			const hook = new Mesh(new ConeGeometry(0.025, 0.06, 5), chainMat);
			hook.position.set(cx, 3.85, cz);
			sc.add(hook);
		}
	}

	private buildWallSwords(sc: Scene) {
		const bladeMat = new MeshStandardMaterial({
			color: 0x8899aa,
			metalness: 0.9,
			roughness: 0.15,
			emissive: 0x222233,
			emissiveIntensity: 0.1,
		});
		const hiltMat = new MeshStandardMaterial({
			color: 0x3a2a1a,
			roughness: 0.8,
		});
		// Two crossed swords on back wall
		for (let s = 0; s < 2; s++) {
			const angle = s === 0 ? 0.3 : -0.3;
			const blade = new Mesh(new BoxGeometry(0.04, 0.65, 0.015), bladeMat);
			blade.position.set(2.5, 2.8, -3.88);
			blade.rotation.z = angle;
			sc.add(blade);
			const hilt = new Mesh(new BoxGeometry(0.18, 0.04, 0.025), hiltMat);
			hilt.position.set(2.5 - Math.sin(angle) * 0.3, 2.5, -3.87);
			hilt.rotation.z = angle;
			sc.add(hilt);
		}
	}

	private buildStation(type: number) {
		const g = new Group();
		const [px, py, pz] = STATION_POSITIONS[type];
		g.position.set(px, py, pz);
		g.name = STATION_LABELS[type];

		const darkMat = new MeshStandardMaterial({
			color: 0x333333,
			roughness: 0.8,
			metalness: 0.2,
		});

		switch (type) {
			case 0: {
				// Ingot Rack — shelves with colored ingots
				const frame = new Mesh(new BoxGeometry(0.8, 1.3, 0.4), darkMat);
				frame.position.y = 0.65;
				g.add(frame);
				for (let i = 0; i < 3; i++) {
					const im = new MeshStandardMaterial({
						color: METAL_COLORS[i],
						emissive: METAL_EMISSIVE[i],
						emissiveIntensity: 0.4,
						metalness: 0.6,
						roughness: 0.3,
					});
					const ingot = new Mesh(new BoxGeometry(0.18, 0.08, 0.28), im);
					ingot.position.set(-0.2 + i * 0.2, 0.85 + i * 0.2, 0);
					g.add(ingot);
				}
				// Neon accent strip
				const accentR = new Mesh(
					new BoxGeometry(0.02, 1.3, 0.02),
					new MeshStandardMaterial({
						color: 0xff8800,
						emissive: 0xff8800,
						emissiveIntensity: 1.0,
					}),
				);
				accentR.position.set(0.41, 0.65, 0.2);
				g.add(accentR);
				break;
			}
			case 1: {
				// Forge — fire pit
				const base = new Mesh(
					new BoxGeometry(1.0, 0.75, 0.8),
					new MeshStandardMaterial({
						color: 0x442200,
						roughness: 0.7,
					}),
				);
				base.position.y = 0.375;
				g.add(base);
				const embers = new Mesh(
					new BoxGeometry(0.7, 0.08, 0.5),
					new MeshStandardMaterial({
						color: 0xff4400,
						emissive: 0xff4400,
						emissiveIntensity: 1.2,
					}),
				);
				embers.position.y = 0.8;
				g.add(embers);
				// Coal pieces
				for (let c = 0; c < 6; c++) {
					const coal = new Mesh(
						new SphereGeometry(0.06, 6, 4),
						new MeshStandardMaterial({
							color: 0x331100,
							emissive: 0xff2200,
							emissiveIntensity: 0.6 + Math.random() * 0.6,
						}),
					);
					coal.position.set(
						-0.2 + Math.random() * 0.4,
						0.85,
						-0.15 + Math.random() * 0.3,
					);
					g.add(coal);
				}
				break;
			}
			case 2: {
				// Anvil
				const anvilMat = new MeshStandardMaterial({
					color: 0x555566,
					metalness: 0.9,
					roughness: 0.2,
				});
				const stump = new Mesh(
					new CylinderGeometry(0.22, 0.28, 0.55, 8),
					darkMat,
				);
				stump.position.y = 0.275;
				g.add(stump);
				const top = new Mesh(new BoxGeometry(0.55, 0.12, 0.28), anvilMat);
				top.position.y = 0.62;
				g.add(top);
				this.anvilTop = top;
				const horn = new Mesh(
					new CylinderGeometry(0.02, 0.1, 0.2, 6),
					anvilMat,
				);
				horn.rotation.z = Math.PI / 2;
				horn.position.set(0.35, 0.62, 0);
				g.add(horn);
				break;
			}
			case 3: {
				// Water trough
				const troughMat = new MeshStandardMaterial({
					color: 0x3a2a1a,
					roughness: 0.85,
				});
				const basin = new Mesh(new BoxGeometry(0.8, 0.45, 0.4), troughMat);
				basin.position.y = 0.35;
				g.add(basin);
				const waterMat = new MeshStandardMaterial({
					color: 0x1144aa,
					emissive: 0x0033ff,
					emissiveIntensity: 0.25,
					transparent: true,
					opacity: 0.7,
				});
				const water = new Mesh(new PlaneGeometry(0.65, 0.3), waterMat);
				water.rotation.x = -Math.PI / 2;
				water.position.y = 0.58;
				g.add(water);
				break;
			}
			case 4: {
				// Delivery counter
				const deskMat = new MeshStandardMaterial({
					color: 0x224422,
					emissive: 0x00aa44,
					emissiveIntensity: 0.15,
					roughness: 0.6,
				});
				const desk = new Mesh(new BoxGeometry(0.8, 0.8, 0.5), deskMat);
				desk.position.y = 0.4;
				g.add(desk);
				const bell = new Mesh(
					new SphereGeometry(0.06, 8, 6),
					new MeshStandardMaterial({
						color: 0xddaa00,
						metalness: 0.9,
						roughness: 0.2,
					}),
				);
				bell.position.set(0.2, 0.85, 0);
				g.add(bell);
				break;
			}
		}

		// Glow ring highlight (invisible until active)
		const glowMat = new MeshStandardMaterial({
			color: 0xff8800,
			emissive: 0xff8800,
			emissiveIntensity: 2.0,
			transparent: true,
			opacity: 0,
		});
		const glow = new Mesh(new CylinderGeometry(0.5, 0.5, 0.02, 24), glowMat);
		glow.position.y = 0.01;
		g.add(glow);
		this.stationGlows[type] = glow;

		this.world.scene.add(g);
		const ent = this.world.createTransformEntity(g);
		ent.addComponent(ForgeStation, { stationType: type });
		ent.addComponent(RayInteractable);
	}

	/* ─── Workpiece ──────────────────────────────────────────── */

	private createWorkpiece() {
		this.workpieceMat = new MeshStandardMaterial({
			color: 0x888888,
			emissive: 0x000000,
			emissiveIntensity: 0,
			metalness: 0.7,
			roughness: 0.3,
		});
		this.workpiece = new Mesh(
			new BoxGeometry(0.22, 0.08, 0.12),
			this.workpieceMat,
		);
		this.workpiece.visible = false;
		this.workpiece.position.set(0, 0.75, -1.8);
		this.world.scene.add(this.workpiece);

		// Spark particles
		this.sparkGroup = new Group();
		this.sparkGroup.visible = false;
		for (let i = 0; i < 12; i++) {
			const sp = new Mesh(
				new SphereGeometry(0.015, 4, 3),
				new MeshStandardMaterial({
					color: 0xffaa00,
					emissive: 0xffaa00,
					emissiveIntensity: 2,
				}),
			);
			sp.position.set(
				(Math.random() - 0.5) * 0.3,
				Math.random() * 0.3,
				(Math.random() - 0.5) * 0.3,
			);
			sp.userData.vel = new Vector3(
				(Math.random() - 0.5) * 2,
				1 + Math.random() * 2,
				(Math.random() - 0.5) * 2,
			);
			sp.userData.life = 0;
			this.sparkGroup.add(sp);
		}
		this.world.scene.add(this.sparkGroup);
	}

	/* ─── Smoke Particles (from forge) ───────────────────────── */

	private createSmokeParticles() {
		this.smokeGroup = new Group();
		this.smokeGroup.position.set(-0.9, 1.5, -2.0);
		for (let i = 0; i < 8; i++) {
			const smokeMat = new MeshStandardMaterial({
				color: 0x444444,
				transparent: true,
				opacity: 0,
			});
			const sp = new Mesh(new SphereGeometry(0.04 + Math.random() * 0.03, 5, 4), smokeMat);
			sp.userData.vel = 0.3 + Math.random() * 0.2;
			sp.userData.drift = (Math.random() - 0.5) * 0.15;
			sp.userData.phase = Math.random() * Math.PI * 2;
			sp.userData.maxLife = 2.5 + Math.random();
			sp.userData.life = Math.random() * sp.userData.maxLife;
			sp.position.set(
				(Math.random() - 0.5) * 0.15,
				sp.userData.life * sp.userData.vel,
				(Math.random() - 0.5) * 0.15,
			);
			this.smokeGroup.add(sp);
		}
		this.world.scene.add(this.smokeGroup);
	}

	/* ─── Steam Particles (from quench trough) ──────────────── */

	private createSteamParticles() {
		this.steamGroup = new Group();
		this.steamGroup.position.set(0.9, 0.6, -2.0);
		this.steamGroup.visible = false;
		for (let i = 0; i < 10; i++) {
			const steamMat = new MeshStandardMaterial({
				color: 0xccccdd,
				transparent: true,
				opacity: 0,
			});
			const sp = new Mesh(new SphereGeometry(0.025 + Math.random() * 0.02, 5, 4), steamMat);
			sp.userData.vel = 0.6 + Math.random() * 0.4;
			sp.userData.drift = (Math.random() - 0.5) * 0.3;
			sp.userData.maxLife = 1.0 + Math.random() * 0.5;
			sp.userData.life = 0;
			sp.visible = false;
			this.steamGroup.add(sp);
		}
		this.world.scene.add(this.steamGroup);
	}

	private triggerSteam() {
		this.steamGroup.visible = true;
		for (const sp of this.steamGroup.children) {
			const m = sp as Mesh;
			m.position.set(
				(Math.random() - 0.5) * 0.3,
				0,
				(Math.random() - 0.5) * 0.15,
			);
			m.userData.life = m.userData.maxLife;
			m.visible = true;
			(m.material as MeshStandardMaterial).opacity = 0.6;
		}
	}

	/* ─── Game Logic ─────────────────────────────────────────── */

	public startGame() {
		gs.phase = 'playing';
		gs.score = 0;
		gs.combo = 0;
		gs.maxCombo = 0;
		gs.lives = 3;
		gs.wave = 1;
		gs.ordersThisWave = 0;
		gs.ordersTarget = 3;
		gs.totalOrders = 0;
		gs.workStep = 'idle';
		gs.heatLevel = 0;
		gs.hammerCount = 0;
		gs.currentOrder = null;
		gs.dirty = true;
		this.nextOrder();
	}

	public endGame() {
		gs.phase = 'game_over';
		gs.workStep = 'idle';
		gs.currentOrder = null;
		this.workpiece.visible = false;
		this.sparkGroup.visible = false;
		gs.dirty = true;
		this.clearGlows();
	}

	private nextOrder() {
		if (gs.ordersThisWave >= gs.ordersTarget) {
			gs.wave++;
			gs.ordersThisWave = 0;
			gs.ordersTarget = Math.min(3 + gs.wave, 8);
			gs.phase = 'wave_intro';
			gs.waveIntroTimer = 2.5;
			gs.dirty = true;
			return;
		}

		const w = gs.wave;
		const metalMax = Math.min(w, 3);
		const metalType = Math.floor(Math.random() * metalMax);
		const itemType = Math.floor(Math.random() * ITEM_NAMES.length);
		const hammerTarget = 3 + Math.floor(w * 0.8) + metalType * 2;
		const timeLimit =
			Math.max(25, 65 - w * 3) * DIFF_MULT[gs.difficulty];
		const baseScore = (50 + metalType * 30 + w * 10) | 0;

		gs.currentOrder = {
			itemType,
			metalType,
			hammerTarget,
			timeLimit,
			baseScore,
		};
		gs.orderTimer = timeLimit;
		gs.workStep = 'idle';
		gs.heatLevel = 0;
		gs.hammerCount = 0;
		gs.dirty = true;
		this.updateActiveStation();
	}

	private handleStation(type: number) {
		const o = gs.currentOrder;
		if (!o) return;

		switch (type) {
			case 0: // Rack — pick ingot
				if (gs.workStep === 'idle') {
					gs.workStep = 'heating';
					gs.heatLevel = 0;
					this.moveWorkpiece(1);
					this.workpieceMat.color.setHex(METAL_COLORS[o.metalType]);
					this.workpieceMat.emissive.setHex(0x000000);
					this.workpieceMat.emissiveIntensity = 0;
					this.workpiece.visible = true;
					gs.dirty = true;
					this.updateActiveStation();
				}
				break;
			case 1: // Forge — heat (auto-heats in update, click to boost)
				if (gs.workStep === 'heating') {
					gs.heatLevel = Math.min(1, gs.heatLevel + 0.15);
					this.audioSys?.playFireCrackle();
					gs.dirty = true;
				}
				break;
			case 2: // Anvil — hammer
				if (gs.workStep === 'hot' || gs.workStep === 'hammering') {
					gs.workStep = 'hammering';
					gs.hammerCount++;
					this.triggerSparks();
					this.audioSys?.playHammer();
					this.anvilBounceTimer = 0.15;
					if (gs.hammerCount >= o.hammerTarget) {
						gs.workStep = 'forged';
						this.moveWorkpiece(3);
						this.updateActiveStation();
					}
					gs.dirty = true;
				}
				break;
			case 3: // Trough — quench
				if (gs.workStep === 'forged') {
					gs.workStep = 'quenching';
					this.audioSys?.playQuench();
					this.triggerSteam();
					gs.dirty = true;
					setTimeout(() => {
						if (gs.workStep === 'quenching') {
							gs.workStep = 'ready';
							this.moveWorkpiece(4);
							this.updateActiveStation();
							gs.dirty = true;
						}
					}, 800);
				}
				break;
			case 4: // Delivery — deliver
				if (gs.workStep === 'ready') {
					this.completeOrder();
				}
				break;
		}
	}

	private completeOrder() {
		const o = gs.currentOrder!;
		const timeBonus = Math.max(0, (gs.orderTimer / o.timeLimit) * 50) | 0;
		gs.combo++;
		if (gs.combo > gs.maxCombo) gs.maxCombo = gs.combo;
		const comboMult = 1 + (gs.combo - 1) * 0.25;
		const points = ((o.baseScore + timeBonus) * comboMult) | 0;
		gs.score += points;
		gs.ordersThisWave++;
		gs.totalOrders++;
		gs.workStep = 'idle';
		this.workpiece.visible = false;
		this.sparkGroup.visible = false;
		this.audioSys?.playComplete();
		gs.dirty = true;
		this.clearGlows();
		this.nextOrder();
	}

	private failOrder() {
		gs.lives--;
		gs.combo = 0;
		gs.workStep = 'idle';
		this.workpiece.visible = false;
		this.sparkGroup.visible = false;
		this.audioSys?.playFail();
		gs.dirty = true;
		this.clearGlows();
		if (gs.lives <= 0) {
			this.endGame();
		} else {
			this.nextOrder();
		}
	}

	private moveWorkpiece(stationIdx: number) {
		const [sx, , sz] = STATION_POSITIONS[stationIdx];
		const heights = [1.35, 0.95, 0.75, 0.7, 0.9];
		this.workpiece.position.set(sx, heights[stationIdx], sz);
		this.sparkGroup.position.copy(this.workpiece.position);
	}

	private updateActiveStation() {
		this.clearGlows();
		const stepToStation: Record<string, number> = {
			idle: 0,
			heating: 1,
			hot: 2,
			hammering: 2,
			forged: 3,
			quenching: 3,
			ready: 4,
		};
		const idx = stepToStation[gs.workStep];
		if (idx !== undefined && this.stationGlows[idx]) {
			this.activeStation = idx;
		}
	}

	private clearGlows() {
		this.activeStation = -1;
		for (const g of this.stationGlows) {
			if (g) (g.material as MeshStandardMaterial).opacity = 0;
		}
	}

	private triggerSparks() {
		this.sparkGroup.visible = true;
		this.sparkGroup.position.copy(this.workpiece.position);
		for (const sp of this.sparkGroup.children) {
			const m = sp as Mesh;
			m.position.set(0, 0.05, 0);
			m.userData.vel.set(
				(Math.random() - 0.5) * 2,
				1.5 + Math.random() * 2,
				(Math.random() - 0.5) * 2,
			);
			m.userData.life = 0.4 + Math.random() * 0.3;
			m.visible = true;
		}
	}

	/* ─── Update Loop ────────────────────────────────────────── */

	update(delta: number, time: number) {
		this.elapsed = time;

		// Fire flicker
		if (this.fireLight) {
			this.fireLight.intensity = 2.5 + Math.sin(time * 8) * 0.5 + Math.sin(time * 13) * 0.3;
			this.fireLightAlt.intensity = 1.2 + Math.cos(time * 6) * 0.4;
		}

		// Station glow pulse
		if (this.activeStation >= 0 && this.stationGlows[this.activeStation]) {
			const mat = this.stationGlows[this.activeStation]
				.material as MeshStandardMaterial;
			mat.opacity = 0.3 + Math.sin(time * 4) * 0.2;
		}

		// Wave intro countdown
		if (gs.phase === 'wave_intro') {
			gs.waveIntroTimer -= delta;
			if (gs.waveIntroTimer <= 0) {
				gs.phase = 'playing';
				gs.dirty = true;
				this.nextOrder();
			}
			return;
		}

		if (gs.phase !== 'playing' || !gs.currentOrder) return;

		// Order timer
		gs.orderTimer -= delta;
		if (gs.orderTimer <= 0) {
			this.failOrder();
			return;
		}

		// Heating logic
		if (gs.workStep === 'heating') {
			gs.heatLevel += delta * 0.12;
			if (gs.heatLevel >= 1) {
				gs.heatLevel = 1;
				gs.workStep = 'hot';
				this.moveWorkpiece(2);
				this.updateActiveStation();
			}
			// Visual: emissive ramp
			this.workpieceMat.emissive.setHex(0xff4400);
			this.workpieceMat.emissiveIntensity = gs.heatLevel * 1.5;
			gs.dirty = true;
		}

		// Quenching visual
		if (gs.workStep === 'quenching') {
			this.workpieceMat.emissive.setHex(0x2244ff);
			this.workpieceMat.emissiveIntensity = 0.6;
		}

		// Ready visual
		if (gs.workStep === 'ready') {
			this.workpieceMat.emissive.setHex(0x00ff44);
			this.workpieceMat.emissiveIntensity =
				0.3 + Math.sin(time * 5) * 0.2;
		}

		// Spark particles
		if (this.sparkGroup.visible) {
			let anyAlive = false;
			for (const sp of this.sparkGroup.children) {
				const m = sp as Mesh;
				if (m.userData.life > 0) {
					m.userData.life -= delta;
					m.position.x += m.userData.vel.x * delta;
					m.position.y += m.userData.vel.y * delta;
					m.position.z += m.userData.vel.z * delta;
					m.userData.vel.y -= 5 * delta;
					anyAlive = true;
				} else {
					m.visible = false;
				}
			}
			if (!anyAlive) this.sparkGroup.visible = false;
		}

		// Smoke particles (always rising from forge)
		for (const sp of this.smokeGroup.children) {
			const m = sp as Mesh;
			m.userData.life += delta;
			if (m.userData.life >= m.userData.maxLife) {
				m.userData.life = 0;
				m.position.set(
					(Math.random() - 0.5) * 0.15,
					0,
					(Math.random() - 0.5) * 0.15,
				);
			}
			const t2 = m.userData.life / m.userData.maxLife;
			m.position.y = m.userData.life * m.userData.vel;
			m.position.x += m.userData.drift * delta;
			const mat = m.material as MeshStandardMaterial;
			mat.opacity = t2 < 0.2 ? t2 * 3 : Math.max(0, 0.6 * (1 - t2));
			m.scale.setScalar(1 + t2 * 2);
		}

		// Steam particles (when quenching)
		if (this.steamGroup.visible) {
			let anyAlive2 = false;
			for (const sp of this.steamGroup.children) {
				const m = sp as Mesh;
				if (m.userData.life > 0) {
					m.userData.life -= delta;
					m.position.y += m.userData.vel * delta;
					m.position.x += m.userData.drift * delta;
					const mat = m.material as MeshStandardMaterial;
					const r = m.userData.life / m.userData.maxLife;
					mat.opacity = r * 0.6;
					m.scale.setScalar(1 + (1 - r) * 3);
					anyAlive2 = true;
				} else {
					m.visible = false;
				}
			}
			if (!anyAlive2) this.steamGroup.visible = false;
		}

		// Anvil bounce
		if (this.anvilBounceTimer > 0 && this.anvilTop) {
			this.anvilBounceTimer -= delta;
			const bounce = Math.sin(this.anvilBounceTimer * 40) * this.anvilBounceTimer * 0.15;
			this.anvilTop.position.y = 0.62 + bounce;
		}

		gs.dirty = true; // timer always changes
	}
}
