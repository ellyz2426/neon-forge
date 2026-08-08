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
import { ForgeStation, BellowsInteract } from './components.js';
import { systemRefs } from './system-refs.js';
import {
	gs,
	ITEM_NAMES,
	METAL_NAMES,
	METAL_COLORS,
	METAL_EMISSIVE,
	saveHighScore,
	saveLifetimeStats,
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

// Heat decay rate per second when away from forge
const HEAT_DECAY_RATE = 0.08;
// Minimum heat threshold — below this, player must re-heat
const HEAT_MIN_THRESHOLD = 0.3;
// Rhythm tolerance in seconds
const RHYTHM_TOLERANCE = 0.2;

export class GameSystem extends createSystem({
	pressedStations: { required: [ForgeStation, Pressed] },
	pressedBellows: { required: [BellowsInteract, Pressed] },
}) {
	private fireLight!: PointLight;
	private fireLightAlt!: PointLight;
	private ambientFill!: PointLight;
	private workpiece!: Group;
	private workpieceMat!: MeshStandardMaterial;
	private sparkGroup!: Group;
	private smokeGroup!: Group;
	private steamGroup!: Group;
	private stationGlows: Mesh[] = [];
	private elapsed = 0;
	private activeStation = -1;
	private anvilTop: Mesh | null = null;
	private anvilBounceTimer = 0;
	private displayWeapons: Mesh[] = [];
	private displayWeaponMats: MeshStandardMaterial[] = [];
	private goldenGlow: Mesh | null = null;
	private torchLights: PointLight[] = [];
	private customerGroup: Group | null = null;
	private bellowsBoost = 0;
	private bellowsGroup: Group | null = null;
	private bellowsPuffGroup: Group | null = null;
	private customerBounceTimer = 0;
	private emberGroup: Group | null = null;
	private dustGroup: Group | null = null;
	private mainCamera: Group | null = null;
	private cameraBasePos = new Vector3();
	private ceilingGlow: Mesh | null = null;
	private ceilingGlowMat: MeshStandardMaterial | null = null;
	private chimneySparkGroup: Group | null = null;
	private customerVariant = 0;

	// Round 8 additions
	private anvilGlowMat: MeshStandardMaterial | null = null;
	private rainGroup: Group | null = null;
	private weatherWindTimer = 0;
	private forgeShadowLight: PointLight | null = null;
	private waterSurface: Mesh | null = null;
	private waterMat: MeshStandardMaterial | null = null;
	private flourishGroup: Group | null = null;
	private flourishMat: MeshStandardMaterial | null = null;

	init() {
		this.buildEnvironment();
		this.createWorkpiece();
		this.createSmokeParticles();
		this.createSteamParticles();
		this.createEmberParticles();
		this.createDustMotes();
		this.createCeilingGlow();
		this.createChimneySparks();
		this.createRainParticles();
		this.createFlourishWorkpiece();

		// Register self for cross-system lookups
		systemRefs.game = this;

		this.queries.pressedStations.subscribe('qualify', (entity) => {
			if (gs.phase !== 'playing') return;
			const t = entity.getValue(ForgeStation, 'stationType') as number;
			this.handleStation(t);
		});

		this.queries.pressedBellows.subscribe('qualify', () => {
			if (gs.phase !== 'playing') return;
			this.handleBellows();
		});
	}

	private get audioSys() { return systemRefs.audio; }

	/* ─── Environment ────────────────────────────────────────── */

	private buildEnvironment() {
		const sc = this.world.scene;

		// Stone floor tiles
		const tileShades = [0x151515, 0x181818, 0x1a1a1a, 0x1c1c1c, 0x131313];
		const tileMats: MeshStandardMaterial[] = tileShades.map(
			(c) => new MeshStandardMaterial({ color: c, roughness: 0.93, metalness: 0.05 }),
		);
		// Dark gap surface underneath tiles
		const gapMat = new MeshStandardMaterial({ color: 0x050505, roughness: 1.0 });
		const gapFloor = new Mesh(new PlaneGeometry(16, 16), gapMat);
		gapFloor.rotation.x = -Math.PI / 2;
		gapFloor.position.y = -0.025;
		gapFloor.receiveShadow = true;
		sc.add(gapFloor);
		for (let tx = -4; tx <= 4; tx++) {
			for (let tz = -4; tz <= 3; tz++) {
				const mat = tileMats[Math.floor(Math.random() * tileMats.length)];
				const tile = new Mesh(new BoxGeometry(0.9, 0.02, 0.9), mat);
				tile.position.set(
					tx + (Math.random() - 0.5) * 0.02,
					-0.01,
					tz + (Math.random() - 0.5) * 0.02,
				);
				tile.rotation.y = (Math.random() - 0.5) * 0.04;
				tile.receiveShadow = true;
				sc.add(tile);
			}
		}

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
		const hood = new Mesh(new ConeGeometry(0.8, 0.6, 6), chimneyMat);
		hood.position.set(-0.9, 2.0, -2.0);
		sc.add(hood);
		const chimPipe = new Mesh(new CylinderGeometry(0.25, 0.35, 2.5, 6), chimneyMat);
		chimPipe.position.set(-0.9, 3.55, -2.0);
		sc.add(chimPipe);

		// Tool rack, chains, swords
		this.buildToolRack(sc);
		this.buildHangingChains(sc);
		this.buildWallSwords(sc);

		// New props: bellows, barrel, crates, weapon display
		this.buildBellows(sc);
		this.buildBarrelAndCrates(sc);
		this.buildWeaponDisplay(sc);
		this.buildCoalBin(sc);

		// Round 4 additions
		this.buildTorches(sc);
		this.buildWindow(sc);
		this.buildCustomer(sc);

		// Forge fire lights
		this.fireLight = new PointLight(0xff6600, 3, 8);
		this.fireLight.position.set(-0.9, 1.4, -2.0);
		sc.add(this.fireLight);
		this.fireLightAlt = new PointLight(0xff4400, 1.5, 6);
		this.fireLightAlt.position.set(-0.9, 0.8, -1.7);
		sc.add(this.fireLightAlt);

		// Dynamic shadow-casting light from forge
		this.forgeShadowLight = new PointLight(0xff4400, 1.8, 10);
		this.forgeShadowLight.position.set(-0.9, 1.0, -1.5);
		sc.add(this.forgeShadowLight);

		// Ambient fill
		this.ambientFill = new PointLight(0x332211, 0.6, 12);
		this.ambientFill.position.set(0, 3, 0);
		sc.add(this.ambientFill);

		// Build each station
		for (let i = 0; i < 5; i++) {
			this.buildStation(i);
		}
	}

	private buildToolRack(sc: Scene) {
		const rackMat = new MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.85 });
		const metalMat = new MeshStandardMaterial({ color: 0x666677, metalness: 0.8, roughness: 0.25 });
		const board = new Mesh(new BoxGeometry(1.2, 0.08, 0.12), rackMat);
		board.position.set(0.0, 1.8, -3.85);
		sc.add(board);
		const hammerHandle = new Mesh(new CylinderGeometry(0.02, 0.02, 0.45, 6), rackMat);
		hammerHandle.rotation.z = Math.PI / 4;
		hammerHandle.position.set(-0.35, 1.95, -3.82);
		sc.add(hammerHandle);
		const hammerHead = new Mesh(new BoxGeometry(0.12, 0.07, 0.07), metalMat);
		hammerHead.position.set(-0.19, 2.11, -3.82);
		sc.add(hammerHead);
		const tongsMat = new MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.3 });
		for (let i = 0; i < 2; i++) {
			const leg = new Mesh(new CylinderGeometry(0.012, 0.015, 0.5, 5), tongsMat);
			leg.rotation.z = Math.PI / 6;
			leg.position.set(0.1 + i * 0.04, 1.95, -3.82);
			sc.add(leg);
		}
		for (let i = -1; i <= 1; i++) {
			const peg = new Mesh(new CylinderGeometry(0.015, 0.015, 0.1, 5), metalMat);
			peg.rotation.x = Math.PI / 2;
			peg.position.set(i * 0.4, 1.8, -3.8);
			sc.add(peg);
		}
	}

	private buildHangingChains(sc: Scene) {
		const chainMat = new MeshStandardMaterial({ color: 0x444444, metalness: 0.9, roughness: 0.2 });
		const chainPositions = [[-2.5, -1.3], [2.0, -1.3]];
		for (const [cx, cz] of chainPositions) {
			for (let j = 0; j < 5; j++) {
				const link = new Mesh(new TorusGeometry(0.03, 0.008, 6, 6), chainMat);
				link.position.set(cx, 4.5 - j * 0.12, cz);
				link.rotation.x = j % 2 === 0 ? 0 : Math.PI / 2;
				sc.add(link);
			}
			const hook = new Mesh(new ConeGeometry(0.025, 0.06, 5), chainMat);
			hook.position.set(cx, 3.85, cz);
			sc.add(hook);
		}
	}

	private buildWallSwords(sc: Scene) {
		const bladeMat = new MeshStandardMaterial({
			color: 0x8899aa, metalness: 0.9, roughness: 0.15,
			emissive: 0x222233, emissiveIntensity: 0.1,
		});
		const hiltMat = new MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
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

	/* ─── New Props ──────────────────────────────────────────── */

	private buildBellows(sc: Scene) {
		const woodMat = new MeshStandardMaterial({ color: 0x3a2510, roughness: 0.85 });
		const leatherMat = new MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
		const metalMat = new MeshStandardMaterial({ color: 0x555566, metalness: 0.8, roughness: 0.2 });

		this.bellowsGroup = new Group();
		this.bellowsGroup.position.set(-1.7, 0, -2.3);

		// Bellows body — two wedge-like boards
		const topBoard = new Mesh(new BoxGeometry(0.35, 0.03, 0.25), woodMat);
		topBoard.position.y = 0.65;
		topBoard.rotation.z = 0.15;
		this.bellowsGroup.add(topBoard);
		const botBoard = new Mesh(new BoxGeometry(0.35, 0.03, 0.25), woodMat);
		botBoard.position.y = 0.52;
		botBoard.rotation.z = -0.1;
		this.bellowsGroup.add(botBoard);

		// Leather middle
		const middle = new Mesh(new BoxGeometry(0.3, 0.1, 0.22), leatherMat);
		middle.position.y = 0.585;
		this.bellowsGroup.add(middle);

		// Nozzle
		const nozzle = new Mesh(new CylinderGeometry(0.03, 0.05, 0.15, 6), metalMat);
		nozzle.rotation.z = Math.PI / 2;
		nozzle.position.set(0.2, 0.58, 0);
		this.bellowsGroup.add(nozzle);

		// Handle
		const handle = new Mesh(new CylinderGeometry(0.02, 0.02, 0.2, 5), woodMat);
		handle.position.set(-0.22, 0.68, 0);
		this.bellowsGroup.add(handle);

		// Glow ring for bellows
		const glowMat = new MeshStandardMaterial({
			color: 0x44aaff, emissive: 0x44aaff, emissiveIntensity: 1.5,
			transparent: true, opacity: 0,
		});
		const glow = new Mesh(new CylinderGeometry(0.3, 0.3, 0.02, 16), glowMat);
		glow.position.y = 0.5;
		this.bellowsGroup.add(glow);

		sc.add(this.bellowsGroup);
		const ent = this.world.createTransformEntity(this.bellowsGroup);
		ent.addComponent(BellowsInteract);
		ent.addComponent(RayInteractable);

		// Bellows air puff particles
		this.bellowsPuffGroup = new Group();
		this.bellowsPuffGroup.position.set(-1.5, 0.58, -2.3);
		this.bellowsPuffGroup.visible = false;
		for (let i = 0; i < 6; i++) {
			const puffMat = new MeshStandardMaterial({
				color: 0xccddff, transparent: true, opacity: 0,
				emissive: 0x4488ff, emissiveIntensity: 0.3,
			});
			const puff = new Mesh(new SphereGeometry(0.02 + Math.random() * 0.015, 5, 4), puffMat);
			puff.userData.life = 0;
			puff.userData.maxLife = 0.4 + Math.random() * 0.3;
			puff.visible = false;
			this.bellowsPuffGroup.add(puff);
		}
		sc.add(this.bellowsPuffGroup);
	}

	private buildBarrelAndCrates(sc: Scene) {
		const barrelMat = new MeshStandardMaterial({ color: 0x3a2510, roughness: 0.8 });
		const bandMat = new MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.3 });
		const crateMat = new MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85 });

		// Barrel near right wall
		const barrel = new Mesh(new CylinderGeometry(0.22, 0.2, 0.6, 10), barrelMat);
		barrel.position.set(3.3, 0.3, -1.5);
		sc.add(barrel);
		// Barrel bands
		for (const by of [0.15, 0.35, 0.5]) {
			const band = new Mesh(new TorusGeometry(0.22, 0.008, 6, 10), bandMat);
			band.rotation.x = Math.PI / 2;
			band.position.set(3.3, by, -1.5);
			sc.add(band);
		}

		// Crate stack
		const crate1 = new Mesh(new BoxGeometry(0.45, 0.35, 0.4), crateMat);
		crate1.position.set(3.2, 0.175, -2.5);
		sc.add(crate1);
		const crate2 = new Mesh(new BoxGeometry(0.38, 0.3, 0.35), crateMat);
		crate2.position.set(3.25, 0.5, -2.45);
		crate2.rotation.y = 0.2;
		sc.add(crate2);

		// Small crate near delivery
		const crate3 = new Mesh(new BoxGeometry(0.3, 0.25, 0.3), crateMat);
		crate3.position.set(2.8, 0.125, -2.6);
		sc.add(crate3);
	}

	private buildWeaponDisplay(sc: Scene) {
		// Finished weapon display rack on left wall
		const rackMat = new MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.85 });

		// Horizontal rack bars
		for (const y of [1.4, 2.0, 2.6]) {
			const bar = new Mesh(new BoxGeometry(0.08, 0.06, 1.2), rackMat);
			bar.position.set(-3.88, y, -2.0);
			sc.add(bar);
		}

		// Display weapon slots (up to 5) — start empty, fill as orders complete
		const bladeMat = new MeshStandardMaterial({
			color: 0x667788, metalness: 0.85, roughness: 0.2,
			emissive: 0x223344, emissiveIntensity: 0.2,
		});
		for (let i = 0; i < 5; i++) {
			const w = new Mesh(new BoxGeometry(0.04, 0.4, 0.02), bladeMat.clone());
			const row = Math.floor(i / 3);
			const col = i % 3;
			w.position.set(-3.82, 1.6 + row * 0.6, -1.5 + col * 0.5);
			w.rotation.z = 0.1;
			w.visible = false;
			sc.add(w);
			this.displayWeapons.push(w);
			this.displayWeaponMats.push(w.material as MeshStandardMaterial);
		}
	}

	private buildCoalBin(sc: Scene) {
		const binMat = new MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 });
		const coalMat = new MeshStandardMaterial({
			color: 0x111111, roughness: 0.95,
			emissive: 0x220000, emissiveIntensity: 0.1,
		});

		// Bin container
		const bin = new Mesh(new BoxGeometry(0.4, 0.3, 0.35), binMat);
		bin.position.set(-1.6, 0.15, -1.5);
		this.world.scene.add(bin);

		// Coal lumps inside
		for (let i = 0; i < 4; i++) {
			const coal = new Mesh(new SphereGeometry(0.05 + Math.random() * 0.03, 5, 4), coalMat);
			coal.position.set(
				-1.6 + (Math.random() - 0.5) * 0.2,
				0.32,
				-1.5 + (Math.random() - 0.5) * 0.15,
			);
			this.world.scene.add(coal);
		}
	}

	/* ─── Wall Torches ──────────────────────────────────────── */

	private buildTorches(sc: Scene) {
		const woodMat = new MeshStandardMaterial({ color: 0x3a2510, roughness: 0.85 });
		const bracketMat = new MeshStandardMaterial({ color: 0x555566, metalness: 0.8, roughness: 0.2 });
		const flameMat = new MeshStandardMaterial({
			color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 2.0,
		});

		const torchDefs: [number, number, number][] = [
			[-3.88, 2.4, -1.2],
			[-3.88, 2.4, -2.8],
			[3.88, 2.4, -1.2],
			[3.88, 2.4, -2.8],
		];

		for (const [tx, ty, tz] of torchDefs) {
			const bracket = new Mesh(new BoxGeometry(0.08, 0.06, 0.14), bracketMat);
			bracket.position.set(tx, ty, tz);
			sc.add(bracket);

			const handle = new Mesh(new CylinderGeometry(0.022, 0.022, 0.4, 6), woodMat);
			handle.position.set(tx, ty + 0.22, tz);
			sc.add(handle);

			const flame = new Mesh(new SphereGeometry(0.055, 6, 5), flameMat.clone());
			flame.position.set(tx, ty + 0.46, tz);
			sc.add(flame);

			const light = new PointLight(0xff6600, 1.2, 5);
			light.position.set(tx, ty + 0.5, tz);
			sc.add(light);
			this.torchLights.push(light);
		}
	}

	/* ─── Back Wall Window ──────────────────────────────────── */

	private buildWindow(sc: Scene) {
		const frameMat = new MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.85 });

		// Night sky backdrop
		const skyMat = new MeshStandardMaterial({
			color: 0x0a0a2a, emissive: 0x110033, emissiveIntensity: 0.5,
		});
		const sky = new Mesh(new PlaneGeometry(1.2, 0.8), skyMat);
		sky.position.set(-2.2, 2.8, -3.89);
		sc.add(sky);

		// Frame borders
		const frameDefs: [number, number, number, number][] = [
			[-2.2, 3.21, 1.3, 0.06],
			[-2.2, 2.39, 1.3, 0.06],
			[-2.81, 2.8, 0.06, 0.88],
			[-1.59, 2.8, 0.06, 0.88],
		];
		for (const [fx, fy, fw, fh] of frameDefs) {
			const f = new Mesh(new BoxGeometry(fw, fh, 0.06), frameMat);
			f.position.set(fx, fy, -3.87);
			sc.add(f);
		}

		// Moon
		const moonMat = new MeshStandardMaterial({
			color: 0xeeeedd, emissive: 0xffffcc, emissiveIntensity: 1.5,
		});
		const moon = new Mesh(new SphereGeometry(0.08, 8, 6), moonMat);
		moon.position.set(-1.9, 3.0, -3.88);
		sc.add(moon);

		// Stars
		const starMat = new MeshStandardMaterial({
			color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.0,
		});
		const starDefs: [number, number][] = [
			[-2.5, 3.05], [-2.35, 2.65], [-2.6, 2.85],
			[-2.0, 2.55], [-1.75, 2.95], [-2.45, 2.5],
			[-1.85, 2.7], [-2.15, 3.1],
		];
		for (const [sx, sy] of starDefs) {
			const star = new Mesh(new SphereGeometry(0.012, 4, 3), starMat);
			star.position.set(sx, sy, -3.88);
			sc.add(star);
		}
	}

	/* ─── Customer Silhouette ───────────────────────────────── */

	private buildCustomer(sc: Scene) {
		this.customerGroup = new Group();
		this.customerGroup.position.set(2.2, 0, -1.0);
		this.buildCustomerShape(0);
		sc.add(this.customerGroup);
	}

	private buildCustomerShape(variant: number) {
		// Clear existing children
		while (this.customerGroup!.children.length > 0) {
			const child = this.customerGroup!.children[0];
			if (child instanceof Mesh) child.geometry.dispose();
			this.customerGroup!.remove(child);
		}

		const darkMat = new MeshStandardMaterial({
			color: 0x0a0a0a, roughness: 0.9,
			emissive: 0x221133, emissiveIntensity: 0.15,
		});

		switch (variant % 4) {
			case 0: {
				// Standard customer — tall figure
				const base = new Mesh(new BoxGeometry(0.3, 0.08, 0.2), darkMat);
				base.position.y = 0.04;
				this.customerGroup!.add(base);
				const body = new Mesh(new CylinderGeometry(0.15, 0.18, 0.7, 8), darkMat);
				body.position.y = 0.43;
				this.customerGroup!.add(body);
				const head = new Mesh(new SphereGeometry(0.12, 8, 6), darkMat);
				head.position.y = 0.92;
				this.customerGroup!.add(head);
				break;
			}
			case 1: {
				// Short stocky customer (dwarf-like)
				const base = new Mesh(new BoxGeometry(0.35, 0.06, 0.25), darkMat);
				base.position.y = 0.03;
				this.customerGroup!.add(base);
				const body = new Mesh(new CylinderGeometry(0.2, 0.22, 0.45, 8), darkMat);
				body.position.y = 0.3;
				this.customerGroup!.add(body);
				const head = new Mesh(new SphereGeometry(0.14, 8, 6), darkMat);
				head.position.y = 0.65;
				this.customerGroup!.add(head);
				// Beard
				const beard = new Mesh(new ConeGeometry(0.1, 0.12, 6), darkMat);
				beard.position.set(0, 0.53, 0.08);
				this.customerGroup!.add(beard);
				break;
			}
			case 2: {
				// Tall thin customer (elf-like)
				const base = new Mesh(new BoxGeometry(0.22, 0.06, 0.18), darkMat);
				base.position.y = 0.03;
				this.customerGroup!.add(base);
				const body = new Mesh(new CylinderGeometry(0.1, 0.14, 0.85, 8), darkMat);
				body.position.y = 0.48;
				this.customerGroup!.add(body);
				const head = new Mesh(new SphereGeometry(0.1, 8, 6), darkMat);
				head.position.y = 1.0;
				this.customerGroup!.add(head);
				// Pointed hat
				const hat = new Mesh(new ConeGeometry(0.1, 0.2, 6), darkMat);
				hat.position.y = 1.2;
				this.customerGroup!.add(hat);
				break;
			}
			case 3: {
				// Armored knight customer
				const base = new Mesh(new BoxGeometry(0.32, 0.08, 0.22), darkMat);
				base.position.y = 0.04;
				this.customerGroup!.add(base);
				const body = new Mesh(new BoxGeometry(0.3, 0.65, 0.2), darkMat);
				body.position.y = 0.4;
				this.customerGroup!.add(body);
				const head = new Mesh(new BoxGeometry(0.16, 0.18, 0.16), darkMat);
				head.position.y = 0.82;
				this.customerGroup!.add(head);
				// Shoulder pads
				const padMat = new MeshStandardMaterial({
					color: 0x111111, roughness: 0.7, metalness: 0.3,
					emissive: 0x110022, emissiveIntensity: 0.1,
				});
				const lPad = new Mesh(new SphereGeometry(0.08, 6, 5), padMat);
				lPad.position.set(-0.2, 0.7, 0);
				this.customerGroup!.add(lPad);
				const rPad = new Mesh(new SphereGeometry(0.08, 6, 5), padMat);
				rPad.position.set(0.2, 0.7, 0);
				this.customerGroup!.add(rPad);
				break;
			}
		}
	}

	private buildStation(type: number) {
		const g = new Group();
		const [px, py, pz] = STATION_POSITIONS[type];
		g.position.set(px, py, pz);
		g.name = STATION_LABELS[type];

		const darkMat = new MeshStandardMaterial({
			color: 0x333333, roughness: 0.8, metalness: 0.2,
		});

		switch (type) {
			case 0: {
				const frame = new Mesh(new BoxGeometry(0.8, 1.3, 0.4), darkMat);
				frame.position.y = 0.65;
				g.add(frame);
				for (let i = 0; i < 3; i++) {
					const im = new MeshStandardMaterial({
						color: METAL_COLORS[i], emissive: METAL_EMISSIVE[i],
						emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3,
					});
					const ingot = new Mesh(new BoxGeometry(0.18, 0.08, 0.28), im);
					ingot.position.set(-0.2 + i * 0.2, 0.85 + i * 0.2, 0);
					g.add(ingot);
				}
				const accentR = new Mesh(
					new BoxGeometry(0.02, 1.3, 0.02),
					new MeshStandardMaterial({ color: 0xff8800, emissive: 0xff8800, emissiveIntensity: 1.0 }),
				);
				accentR.position.set(0.41, 0.65, 0.2);
				g.add(accentR);
				break;
			}
			case 1: {
				const base = new Mesh(
					new BoxGeometry(1.0, 0.75, 0.8),
					new MeshStandardMaterial({ color: 0x442200, roughness: 0.7 }),
				);
				base.position.y = 0.375;
				g.add(base);
				const embers = new Mesh(
					new BoxGeometry(0.7, 0.08, 0.5),
					new MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1.2 }),
				);
				embers.position.y = 0.8;
				g.add(embers);
				for (let c = 0; c < 6; c++) {
					const coal = new Mesh(
						new SphereGeometry(0.06, 6, 4),
						new MeshStandardMaterial({
							color: 0x331100, emissive: 0xff2200,
							emissiveIntensity: 0.6 + Math.random() * 0.6,
						}),
					);
					coal.position.set(-0.2 + Math.random() * 0.4, 0.85, -0.15 + Math.random() * 0.3);
					g.add(coal);
				}
				break;
			}
			case 2: {
				const anvilMat = new MeshStandardMaterial({ color: 0x555566, metalness: 0.9, roughness: 0.2 });
				const stump = new Mesh(new CylinderGeometry(0.22, 0.28, 0.55, 8), darkMat);
				stump.position.y = 0.275;
				g.add(stump);
				const top = new Mesh(new BoxGeometry(0.55, 0.12, 0.28), anvilMat);
				top.position.y = 0.62;
				g.add(top);
				this.anvilTop = top;
				const horn = new Mesh(new CylinderGeometry(0.02, 0.1, 0.2, 6), anvilMat);
				horn.rotation.z = Math.PI / 2;
				horn.position.set(0.35, 0.62, 0);
				g.add(horn);
				// Rhythm glow ring on anvil — pulses when rhythm bonus is active
				this.anvilGlowMat = new MeshStandardMaterial({
					color: 0x44ddff, emissive: 0x44ddff, emissiveIntensity: 2.0,
					transparent: true, opacity: 0,
				});
				const rhythmGlow = new Mesh(new TorusGeometry(0.3, 0.012, 8, 16), this.anvilGlowMat);
				rhythmGlow.rotation.x = Math.PI / 2;
				rhythmGlow.position.y = 0.7;
				g.add(rhythmGlow);
				break;
			}
			case 3: {
				const troughMat = new MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.85 });
				const basin = new Mesh(new BoxGeometry(0.8, 0.45, 0.4), troughMat);
				basin.position.y = 0.35;
				g.add(basin);
				this.waterMat = new MeshStandardMaterial({
					color: 0x1144aa, emissive: 0x0033ff, emissiveIntensity: 0.25,
					transparent: true, opacity: 0.7,
				});
				this.waterSurface = new Mesh(new PlaneGeometry(0.65, 0.3, 6, 6), this.waterMat);
				this.waterSurface.rotation.x = -Math.PI / 2;
				this.waterSurface.position.y = 0.58;
				g.add(this.waterSurface);
				break;
			}
			case 4: {
				const deskMat = new MeshStandardMaterial({
					color: 0x224422, emissive: 0x00aa44, emissiveIntensity: 0.15, roughness: 0.6,
				});
				const desk = new Mesh(new BoxGeometry(0.8, 0.8, 0.5), deskMat);
				desk.position.y = 0.4;
				g.add(desk);
				const bell = new Mesh(
					new SphereGeometry(0.06, 8, 6),
					new MeshStandardMaterial({ color: 0xddaa00, metalness: 0.9, roughness: 0.2 }),
				);
				bell.position.set(0.2, 0.85, 0);
				g.add(bell);
				break;
			}
		}

		// Glow ring
		const glowMat = new MeshStandardMaterial({
			color: 0xff8800, emissive: 0xff8800, emissiveIntensity: 2.0,
			transparent: true, opacity: 0,
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
			color: 0x888888, emissive: 0x000000, emissiveIntensity: 0,
			metalness: 0.7, roughness: 0.3,
		});
		this.workpiece = new Group();
		this.workpiece.visible = false;
		this.workpiece.position.set(0, 0.75, -1.8);
		this.world.scene.add(this.workpiece);

		// Golden glow ring for golden orders
		const goldenMat = new MeshStandardMaterial({
			color: 0xffdd00, emissive: 0xffdd00, emissiveIntensity: 2.5,
			transparent: true, opacity: 0,
		});
		this.goldenGlow = new Mesh(new TorusGeometry(0.15, 0.015, 8, 16), goldenMat);
		this.goldenGlow.rotation.x = Math.PI / 2;
		this.goldenGlow.visible = false;
		this.world.scene.add(this.goldenGlow);

		// Spark particles
		this.sparkGroup = new Group();
		this.sparkGroup.visible = false;
		for (let i = 0; i < 12; i++) {
			const sp = new Mesh(
				new SphereGeometry(0.015, 4, 3),
				new MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 2 }),
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

	/* ─── Workpiece Shape Variety ────────────────────────────── */

	private createWorkpieceShape(itemType: number) {
		// Clear existing children
		while (this.workpiece.children.length > 0) {
			const child = this.workpiece.children[0];
			if (child instanceof Mesh) child.geometry.dispose();
			this.workpiece.remove(child);
		}
		switch (itemType) {
			case 0: { // Sword — tall thin
				const blade = new Mesh(new BoxGeometry(0.06, 0.35, 0.04), this.workpieceMat);
				this.workpiece.add(blade);
				break;
			}
			case 1: { // Axe — handle + head group
				const handle = new Mesh(new CylinderGeometry(0.02, 0.02, 0.28, 6), this.workpieceMat);
				this.workpiece.add(handle);
				const head = new Mesh(new BoxGeometry(0.14, 0.1, 0.03), this.workpieceMat);
				head.position.y = 0.12;
				this.workpiece.add(head);
				break;
			}
			case 2: { // Shield — flat disc
				const disc = new Mesh(new CylinderGeometry(0.12, 0.12, 0.03, 12), this.workpieceMat);
				disc.rotation.x = Math.PI / 2;
				this.workpiece.add(disc);
				break;
			}
			case 3: { // Dagger — cone
				const cone = new Mesh(new ConeGeometry(0.035, 0.2, 6), this.workpieceMat);
				this.workpiece.add(cone);
				break;
			}
			case 4: { // Helmet — hemisphere
				const hemi = new Mesh(
					new SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
					this.workpieceMat,
				);
				hemi.rotation.x = Math.PI;
				this.workpiece.add(hemi);
				break;
			}
		}
	}

	/* ─── Smoke Particles ───────────────────────────────────── */

	private createSmokeParticles() {
		this.smokeGroup = new Group();
		this.smokeGroup.position.set(-0.9, 1.5, -2.0);
		for (let i = 0; i < 8; i++) {
			const smokeMat = new MeshStandardMaterial({ color: 0x444444, transparent: true, opacity: 0 });
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

	/* ─── Bellows Interaction ─────────────────────────────────── */

	private handleBellows() {
		if (gs.workStep !== 'heating') return;
		// Boost heat rate for 2 seconds
		this.bellowsBoost = 2.0;
		this.audioSys?.playBellows();
		this.triggerBellowsPuff();
		// Animate bellows squeeze
		if (this.bellowsGroup) {
			const top = this.bellowsGroup.children[0];
			const bot = this.bellowsGroup.children[1];
			if (top && bot) {
				top.position.y = 0.61;
				bot.position.y = 0.56;
				setTimeout(() => {
					top.position.y = 0.65;
					bot.position.y = 0.52;
				}, 200);
			}
		}
	}

	private triggerBellowsPuff() {
		if (!this.bellowsPuffGroup) return;
		this.bellowsPuffGroup.visible = true;
		for (const sp of this.bellowsPuffGroup.children) {
			const m = sp as Mesh;
			m.position.set(0, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
			m.userData.life = m.userData.maxLife;
			m.visible = true;
			(m.material as MeshStandardMaterial).opacity = 0.5;
		}
	}

	/* ─── Ember Particles ─────────────────────────────────────── */

	private createEmberParticles() {
		this.emberGroup = new Group();
		this.emberGroup.position.set(-0.9, 0.9, -2.0);
		for (let i = 0; i < 10; i++) {
			const emberMat = new MeshStandardMaterial({
				color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 3.0,
				transparent: true, opacity: 0,
			});
			const ember = new Mesh(new SphereGeometry(0.008 + Math.random() * 0.006, 4, 3), emberMat);
			ember.userData.vel = 0.15 + Math.random() * 0.25;
			ember.userData.drift = (Math.random() - 0.5) * 0.2;
			ember.userData.driftZ = (Math.random() - 0.5) * 0.1;
			ember.userData.maxLife = 1.5 + Math.random() * 1.5;
			ember.userData.life = Math.random() * ember.userData.maxLife;
			ember.position.set(
				(Math.random() - 0.5) * 0.4,
				ember.userData.life * ember.userData.vel,
				(Math.random() - 0.5) * 0.3,
			);
			this.emberGroup.add(ember);
		}
		this.world.scene.add(this.emberGroup);
	}

	/* ─── Steam Particles ───────────────────────────────────── */

	private createSteamParticles() {
		this.steamGroup = new Group();
		this.steamGroup.position.set(0.9, 0.6, -2.0);
		this.steamGroup.visible = false;
		for (let i = 0; i < 15; i++) {
			const steamMat = new MeshStandardMaterial({ color: 0xccccdd, transparent: true, opacity: 0 });
			const sp = new Mesh(new SphereGeometry(0.03 + Math.random() * 0.025, 5, 4), steamMat);
			sp.userData.vel = 0.8 + Math.random() * 0.5;
			sp.userData.drift = (Math.random() - 0.5) * 0.4;
			sp.userData.maxLife = 1.2 + Math.random() * 0.6;
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
			m.position.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.2);
			m.userData.life = m.userData.maxLife;
			m.visible = true;
			(m.material as MeshStandardMaterial).opacity = 0.7;
		}
	}

	/* ─── Dust Motes ──────────────────────────────────────── */

	private createDustMotes() {
		this.dustGroup = new Group();
		this.dustGroup.position.set(0, 2.5, -1.5);
		for (let i = 0; i < 20; i++) {
			const dustMat = new MeshStandardMaterial({
				color: 0xffddaa, emissive: 0xffaa44, emissiveIntensity: 0.5,
				transparent: true, opacity: 0.15 + Math.random() * 0.2,
			});
			const mote = new Mesh(new SphereGeometry(0.006 + Math.random() * 0.006, 4, 3), dustMat);
			mote.position.set(
				(Math.random() - 0.5) * 4,
				(Math.random() - 0.5) * 3,
				(Math.random() - 0.5) * 3,
			);
			mote.userData.baseX = mote.position.x;
			mote.userData.baseY = mote.position.y;
			mote.userData.baseZ = mote.position.z;
			mote.userData.phaseX = Math.random() * Math.PI * 2;
			mote.userData.phaseY = Math.random() * Math.PI * 2;
			mote.userData.phaseZ = Math.random() * Math.PI * 2;
			mote.userData.speedX = 0.3 + Math.random() * 0.5;
			mote.userData.speedY = 0.2 + Math.random() * 0.3;
			mote.userData.speedZ = 0.15 + Math.random() * 0.25;
			mote.userData.ampX = 0.1 + Math.random() * 0.15;
			mote.userData.ampY = 0.05 + Math.random() * 0.08;
			mote.userData.ampZ = 0.08 + Math.random() * 0.1;
			this.dustGroup.add(mote);
		}
		this.world.scene.add(this.dustGroup);
	}

	/* ─── Ceiling Glow ────────────────────────────────────── */

	private createCeilingGlow() {
		this.ceilingGlowMat = new MeshStandardMaterial({
			color: 0xff4400, emissive: 0xff3300, emissiveIntensity: 0.5,
			transparent: true, opacity: 0.15,
		});
		this.ceilingGlow = new Mesh(new PlaneGeometry(3, 3), this.ceilingGlowMat);
		this.ceilingGlow.rotation.x = Math.PI / 2;
		this.ceilingGlow.position.set(-0.9, 4.95, -2.0);
		this.world.scene.add(this.ceilingGlow);
	}

	/* ─── Chimney Sparks ────────────────────────────────── */

	private createChimneySparks() {
		this.chimneySparkGroup = new Group();
		this.chimneySparkGroup.position.set(-0.9, 3.5, -2.0);
		for (let i = 0; i < 6; i++) {
			const sparkMat = new MeshStandardMaterial({
				color: 0xff6600, emissive: 0xff8800, emissiveIntensity: 4.0,
				transparent: true, opacity: 0,
			});
			const spark = new Mesh(new SphereGeometry(0.005 + Math.random() * 0.004, 4, 3), sparkMat);
			spark.userData.active = false;
			spark.userData.life = 0;
			spark.userData.maxLife = 0.6 + Math.random() * 0.8;
			spark.userData.velX = 0;
			spark.userData.velY = 0;
			spark.userData.velZ = 0;
			spark.visible = false;
			this.chimneySparkGroup.add(spark);
		}
		this.world.scene.add(this.chimneySparkGroup);
	}

	private spawnChimneySpark() {
		if (!this.chimneySparkGroup) return;
		for (const sp of this.chimneySparkGroup.children) {
			const m = sp as Mesh;
			if (!m.userData.active) {
				m.userData.active = true;
				m.userData.life = m.userData.maxLife;
				m.userData.velX = (Math.random() - 0.5) * 0.3;
				m.userData.velY = 0.5 + Math.random() * 0.4;
				m.userData.velZ = (Math.random() - 0.5) * 0.2;
				m.position.set(
					(Math.random() - 0.5) * 0.15,
					0,
					(Math.random() - 0.5) * 0.15,
				);
				m.visible = true;
				(m.material as MeshStandardMaterial).opacity = 0.9;
				return;
			}
		}
	}

	/* ─── Rain Particles (Window) ──────────────────────────── */

	private createRainParticles() {
		this.rainGroup = new Group();
		// Position rain behind the window glass area
		this.rainGroup.position.set(-2.2, 2.8, -3.87);
		this.rainGroup.visible = false;
		for (let i = 0; i < 20; i++) {
			const rainMat = new MeshStandardMaterial({
				color: 0x6688cc, emissive: 0x4466aa, emissiveIntensity: 0.5,
				transparent: true, opacity: 0,
			});
			// Thin vertical line = rain streak
			const drop = new Mesh(new BoxGeometry(0.008, 0.06 + Math.random() * 0.04, 0.002), rainMat);
			drop.position.set(
				(Math.random() - 0.5) * 1.0,
				(Math.random() - 0.5) * 0.7,
				0,
			);
			drop.userData.speed = 1.5 + Math.random() * 1.0;
			drop.userData.drift = (Math.random() - 0.5) * 0.2;
			drop.userData.life = Math.random();
			drop.visible = false;
			this.rainGroup.add(drop);
		}
		this.world.scene.add(this.rainGroup);
	}

	/* ─── Delivery Flourish Workpiece ──────────────────────── */

	private createFlourishWorkpiece() {
		this.flourishMat = new MeshStandardMaterial({
			color: 0xffffff, emissive: 0xffdd88, emissiveIntensity: 1.5,
			metalness: 0.7, roughness: 0.3,
			transparent: true, opacity: 0,
		});
		this.flourishGroup = new Group();
		this.flourishGroup.visible = false;
		this.flourishGroup.position.set(2.2, 1.0, -2.2);
		// Default shape — gets rebuilt per delivery
		const shape = new Mesh(new BoxGeometry(0.06, 0.35, 0.04), this.flourishMat);
		this.flourishGroup.add(shape);
		this.world.scene.add(this.flourishGroup);
	}

	private startFlourishAnimation(itemType: number, metalType: number) {
		// Clear old shape
		while (this.flourishGroup!.children.length > 0) {
			const child = this.flourishGroup!.children[0];
			if (child instanceof Mesh) child.geometry.dispose();
			this.flourishGroup!.remove(child);
		}
		// Create a copy of the completed weapon shape
		const mat = this.flourishMat!;
		mat.color.setHex(METAL_COLORS[metalType]);
		mat.emissive.setHex(METAL_EMISSIVE[metalType]);
		mat.emissiveIntensity = 1.5;
		mat.opacity = 1.0;
		switch (itemType) {
			case 0: {
				const blade = new Mesh(new BoxGeometry(0.06, 0.35, 0.04), mat);
				this.flourishGroup!.add(blade);
				break;
			}
			case 1: {
				const handle = new Mesh(new CylinderGeometry(0.02, 0.02, 0.28, 6), mat);
				this.flourishGroup!.add(handle);
				const head = new Mesh(new BoxGeometry(0.14, 0.1, 0.03), mat);
				head.position.y = 0.12;
				this.flourishGroup!.add(head);
				break;
			}
			case 2: {
				const disc = new Mesh(new CylinderGeometry(0.12, 0.12, 0.03, 12), mat);
				disc.rotation.x = Math.PI / 2;
				this.flourishGroup!.add(disc);
				break;
			}
			case 3: {
				const cone = new Mesh(new ConeGeometry(0.035, 0.2, 6), mat);
				this.flourishGroup!.add(cone);
				break;
			}
			case 4: {
				const hemi = new Mesh(
					new SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
					mat,
				);
				hemi.rotation.x = Math.PI;
				this.flourishGroup!.add(hemi);
				break;
			}
		}
		// Position at delivery station
		this.flourishGroup!.position.set(2.2, 1.0, -2.2);
		this.flourishGroup!.rotation.set(0, 0, 0);
		this.flourishGroup!.visible = true;
		gs.flourishTimer = 1.5;
		gs.flourishItemType = itemType;
		gs.flourishMetalType = metalType;
	}

	/* ─── Order Queue Generation ──────────────────────────── */

	private generateOrder(): Order {
		const w = gs.wave;
		const metalMax = Math.min(w, 3);
		const metalType = Math.floor(Math.random() * metalMax);
		const itemType = Math.floor(Math.random() * ITEM_NAMES.length);
		const hammerTarget = 3 + Math.floor(w * 0.8) + metalType * 2;
		const timeLimit = Math.max(25, 65 - w * 3) * DIFF_MULT[gs.difficulty];
		const baseScore = (50 + metalType * 30 + w * 10) | 0;
		const isGolden = w >= 3 && Math.random() < 0.15;
		const isRush = !isGolden && w >= 2 && Math.random() < 0.12;
		const rushTimeMult = isRush ? 0.6 : 1;
		return {
			itemType, metalType, hammerTarget,
			timeLimit: timeLimit * rushTimeMult,
			baseScore: isRush ? Math.floor(baseScore * 1.5) : baseScore,
			isGolden, isRush,
		};
	}

	private fillOrderQueue() {
		// Keep queue at 2 upcoming orders
		while (gs.orderQueue.length < 2) {
			gs.orderQueue.push(this.generateOrder());
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
		gs.deliveryFlashTimer = 0;
		gs.perfectWave = true;
		gs.craftedByType = [0, 0, 0, 0, 0];
		gs.craftedByMetal = [0, 0, 0];
		gs.streak = 0;
		gs.bestStreak = 0;
		gs.goldenFlashTimer = 0;
		gs.cameraShakeTimer = 0;
		gs.cameraShakeIntensity = 0;
		// Round 8 resets
		gs.heatDecayActive = false;
		gs.rhythmStreak = 0;
		gs.lastHammerTime = 0;
		gs.prevHammerInterval = 0;
		gs.rhythmGlowTimer = 0;
		gs.weatherActive = Math.random() < 0.4; // 40% chance of weather per game
		gs.lightningTimer = 8 + Math.random() * 15;
		gs.lightningFlashTimer = 0;
		gs.orderQueue = [];
		gs.flourishTimer = 0;
		if (this.rainGroup) this.rainGroup.visible = gs.weatherActive;
		gs.dirty = true;
		// Reset weapon display
		for (const w of this.displayWeapons) w.visible = false;
		if (this.flourishGroup) this.flourishGroup.visible = false;
		this.fillOrderQueue();
		this.nextOrder();
	}

	public endGame() {
		gs.phase = 'game_over';
		gs.workStep = 'idle';
		gs.currentOrder = null;
		this.workpiece.visible = false;
		this.sparkGroup.visible = false;
		if (this.goldenGlow) this.goldenGlow.visible = false;
		if (this.flourishGroup) this.flourishGroup.visible = false;
		if (this.rainGroup) this.rainGroup.visible = false;
		gs.weatherActive = false;
		gs.flourishTimer = 0;
		saveHighScore();
		saveLifetimeStats();
		gs.dirty = true;
		this.clearGlows();
	}

	public pauseGame() {
		if (gs.phase === 'playing' || gs.phase === 'wave_intro') {
			gs.previousPhase = gs.phase;
			gs.phase = 'paused';
			gs.dirty = true;
		}
	}

	public resumeGame() {
		if (gs.phase === 'paused') {
			gs.phase = gs.previousPhase;
			gs.dirty = true;
		}
	}

	private nextOrder() {
		if (gs.ordersThisWave >= gs.ordersTarget) {
			// Wave complete
			gs.phase = 'wave_complete';
			gs.waveCompleteTimer = 2.0;
			gs.dirty = true;
			return;
		}

		// Pull from queue
		this.fillOrderQueue();
		const order = gs.orderQueue.shift()!;
		this.fillOrderQueue(); // refill so queue always has 2

		gs.currentOrder = order;
		gs.orderTimer = order.timeLimit;
		gs.workStep = 'idle';
		gs.heatLevel = 0;
		gs.hammerCount = 0;
		gs.heatDecayActive = false;
		gs.rhythmStreak = 0;
		gs.lastHammerTime = 0;
		gs.prevHammerInterval = 0;
		gs.dirty = true;
		this.updateActiveStation();
		// Change customer appearance each order
		this.customerVariant++;
		if (this.customerGroup) this.buildCustomerShape(this.customerVariant);
	}

	private handleStation(type: number) {
		const o = gs.currentOrder;
		if (!o) return;

		switch (type) {
			case 0:
				if (gs.workStep === 'idle') {
					gs.workStep = 'heating';
					gs.heatLevel = 0;
					gs.heatDecayActive = false;
					this.moveWorkpiece(1);
					// Shape workpiece based on item type
					this.createWorkpieceShape(o.itemType);
					this.workpieceMat.color.setHex(METAL_COLORS[o.metalType]);
					this.workpieceMat.emissive.setHex(0x000000);
					this.workpieceMat.emissiveIntensity = 0;
					this.workpiece.visible = true;
					// Golden glow
					if (o.isGolden && this.goldenGlow) {
						this.goldenGlow.visible = true;
					}
					gs.dirty = true;
					this.updateActiveStation();
				}
				break;
			case 1:
				if (gs.workStep === 'heating') {
					gs.heatLevel = Math.min(1, gs.heatLevel + 0.15);
					this.audioSys?.playFireCrackle();
					gs.dirty = true;
				} else if (gs.workStep === 'cooled') {
					// Re-heat: workpiece cooled below threshold, player brought it back
					gs.workStep = 'heating';
					gs.heatDecayActive = false;
					this.moveWorkpiece(1);
					this.updateActiveStation();
					gs.dirty = true;
				}
				break;
			case 2:
				if (gs.workStep === 'hot' || gs.workStep === 'hammering') {
					gs.workStep = 'hammering';
					gs.heatDecayActive = true; // start cooling once hammering begins

					// Rhythm hammer detection
					const now = this.elapsed;
					const interval = now - gs.lastHammerTime;
					if (gs.lastHammerTime > 0 && gs.prevHammerInterval > 0) {
						const diff = Math.abs(interval - gs.prevHammerInterval);
						if (diff < RHYTHM_TOLERANCE) {
							gs.rhythmStreak++;
							gs.rhythmGlowTimer = 0.3;
							this.audioSys?.playRhythmBonusTick();
						} else {
							gs.rhythmStreak = 0;
						}
					}
					gs.prevHammerInterval = interval;
					gs.lastHammerTime = now;

					// Hammer progress — double if in rhythm
					const hammerProgress = gs.rhythmStreak >= 2 ? 2 : 1;
					gs.hammerCount += hammerProgress;

					this.triggerSparks();
					this.audioSys?.playHammer();
					this.anvilBounceTimer = 0.15;
					gs.cameraShakeTimer = 0.12;
					gs.cameraShakeIntensity = 0.008;
					if (gs.hammerCount >= o.hammerTarget) {
						gs.workStep = 'forged';
						gs.heatDecayActive = false;
						this.moveWorkpiece(3);
						this.updateActiveStation();
					}
					gs.dirty = true;
				}
				break;
			case 3:
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
			case 4:
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
		gs.streak++;
		if (gs.streak > gs.bestStreak) gs.bestStreak = gs.streak;
		// Streak bonus: +50 per streak level after 3
		const streakBonus = gs.streak >= 3 ? (gs.streak - 2) * 50 : 0;
		const comboMult = 1 + (gs.combo - 1) * 0.25;
		const goldenMult = o.isGolden ? 2.5 : 1;
		const points = ((o.baseScore + timeBonus + streakBonus) * comboMult * goldenMult) | 0;
		gs.score += points;
		gs.ordersThisWave++;
		gs.totalOrders++;
		gs.craftedByType[o.itemType]++;
		gs.craftedByMetal[o.metalType]++;
		gs.workStep = 'idle';
		gs.deliveryFlashTimer = 0.8;

		// Golden order completion flash
		if (o.isGolden) {
			gs.goldenFlashTimer = 1.2;
		}

		// Delivery flourish animation
		this.startFlourishAnimation(o.itemType, o.metalType);

		// Show on weapon display
		const displayIdx = (gs.totalOrders - 1) % this.displayWeapons.length;
		if (this.displayWeapons[displayIdx]) {
			this.displayWeapons[displayIdx].visible = true;
			this.displayWeaponMats[displayIdx].color.setHex(METAL_COLORS[o.metalType]);
			this.displayWeaponMats[displayIdx].emissive.setHex(METAL_EMISSIVE[o.metalType]);
			this.displayWeaponMats[displayIdx].emissiveIntensity = 0.4;
		}

		this.workpiece.visible = false;
		this.sparkGroup.visible = false;
		if (this.goldenGlow) this.goldenGlow.visible = false;
		this.audioSys?.playComplete();
		this.customerBounceTimer = 0.6; // Trigger customer delivery reaction
		gs.dirty = true;
		this.clearGlows();
		this.nextOrder();
	}

	private failOrder() {
		gs.lives--;
		gs.combo = 0;
		gs.streak = 0;
		gs.perfectWave = false;
		gs.workStep = 'idle';
		this.workpiece.visible = false;
		this.sparkGroup.visible = false;
		if (this.goldenGlow) this.goldenGlow.visible = false;
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
		if (this.goldenGlow) {
			this.goldenGlow.position.copy(this.workpiece.position);
			this.goldenGlow.position.y += 0.05;
		}
	}

	private updateActiveStation() {
		this.clearGlows();
		const stepToStation: Record<string, number> = {
			idle: 0, heating: 1, hot: 2, hammering: 2,
			forged: 3, quenching: 3, ready: 4, cooled: 1,
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

	/* ─── Workpiece Heat Color ────────────────────────────── */

	private updateWorkpieceHeatColor() {
		const h = gs.heatLevel;
		if (h < 0.3) {
			this.workpieceMat.emissive.setHex(0xff2200);
			this.workpieceMat.emissiveIntensity = h * 2.0;
		} else if (h < 0.6) {
			this.workpieceMat.emissive.setHex(0xff6600);
			this.workpieceMat.emissiveIntensity = 0.6 + (h - 0.3) * 3.0;
		} else if (h < 0.85) {
			this.workpieceMat.emissive.setHex(0xffaa22);
			this.workpieceMat.emissiveIntensity = 1.5 + (h - 0.6) * 2.0;
		} else {
			this.workpieceMat.emissive.setHex(0xffddaa);
			this.workpieceMat.emissiveIntensity = 2.0 + (h - 0.85) * 4.0;
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

		// Dynamic shadow light — oscillates position and intensity to cast moving shadows on walls
		if (this.forgeShadowLight) {
			const sx = Math.sin(time * 1.7) * 0.15;
			const sy = Math.sin(time * 2.3) * 0.1;
			this.forgeShadowLight.position.set(-0.9 + sx, 1.0 + sy, -1.5);
			this.forgeShadowLight.intensity = 1.5 + Math.sin(time * 5) * 0.6 + Math.sin(time * 11) * 0.3;
		}

		// Torch flicker
		for (let i = 0; i < this.torchLights.length; i++) {
			const tl = this.torchLights[i];
			tl.intensity = 1.0 + Math.sin(time * 7 + i * 1.7) * 0.35 + Math.sin(time * 13 + i * 2.3) * 0.2;
		}

		// Water ripple animation — oscillate opacity + emissive
		if (this.waterSurface && this.waterMat) {
			const ripple = Math.sin(time * 3) * 0.1 + Math.sin(time * 7.3) * 0.05;
			this.waterMat.opacity = 0.65 + ripple;
			this.waterMat.emissiveIntensity = 0.2 + Math.sin(time * 4.5) * 0.1;
			// Subtle vertex-like shimmer via scale oscillation
			this.waterSurface.scale.set(
				1 + Math.sin(time * 2.1) * 0.015,
				1,
				1 + Math.cos(time * 2.7) * 0.015,
			);
		}

		// Customer idle bob + delivery bounce
		if (this.customerGroup) {
			const baseBob = Math.sin(time * 1.5) * 0.02;
			if (this.customerBounceTimer > 0) {
				this.customerBounceTimer -= delta;
				const bounce = Math.sin(this.customerBounceTimer * 20) * this.customerBounceTimer * 0.15;
				this.customerGroup.position.y = baseBob + bounce;
				// Nod by rotating head slightly
				const head = this.customerGroup.children[2];
				if (head) head.rotation.x = Math.sin(this.customerBounceTimer * 15) * 0.2;
			} else {
				this.customerGroup.position.y = baseBob;
				const head = this.customerGroup.children[2];
				if (head) head.rotation.x = 0;
			}
		}

		// Delivery flash — brief white pulse on ambient
		if (gs.deliveryFlashTimer > 0) {
			gs.deliveryFlashTimer -= delta;
			const flash = Math.max(0, gs.deliveryFlashTimer / 0.8);
			if (this.ambientFill) {
				this.ambientFill.intensity = 0.6 + flash * 2.0;
				this.ambientFill.color.setHex(flash > 0.5 ? 0xffffff : 0x332211);
			}
		} else if (this.ambientFill) {
			this.ambientFill.color.setHex(0x332211);
			this.ambientFill.intensity = 0.6;
		}

		// Delivery flourish animation — weapon spins upward and fades out
		if (gs.flourishTimer > 0 && this.flourishGroup && this.flourishMat) {
			gs.flourishTimer -= delta;
			const progress = 1 - (gs.flourishTimer / 1.5);
			// Float up
			this.flourishGroup.position.y = 1.0 + progress * 1.2;
			// Spin
			this.flourishGroup.rotation.y = progress * Math.PI * 4;
			// Slight tilt
			this.flourishGroup.rotation.z = Math.sin(progress * Math.PI) * 0.3;
			// Fade out in last 40%
			if (progress > 0.6) {
				this.flourishMat.opacity = Math.max(0, (1 - progress) / 0.4);
			} else {
				this.flourishMat.opacity = 1;
			}
			// Pulse emissive
			this.flourishMat.emissiveIntensity = 1.5 + Math.sin(time * 10) * 0.5;
			if (gs.flourishTimer <= 0) {
				this.flourishGroup.visible = false;
			}
		}

		// Station glow pulse — faster when timer is low
		if (this.activeStation >= 0 && this.stationGlows[this.activeStation]) {
			const mat = this.stationGlows[this.activeStation].material as MeshStandardMaterial;
			const urgency = gs.orderTimer < 10 ? 8 : gs.orderTimer < 20 ? 6 : 4;
			mat.opacity = 0.3 + Math.sin(time * urgency) * 0.2;
			// Red tint when urgent
			if (gs.orderTimer < 10) {
				mat.color.setHex(0xff2200);
				mat.emissive.setHex(0xff2200);
			} else {
				mat.color.setHex(0xff8800);
				mat.emissive.setHex(0xff8800);
			}
		}

		// Rhythm hammer glow on anvil
		if (this.anvilGlowMat) {
			if (gs.rhythmStreak >= 2) {
				gs.rhythmGlowTimer = Math.max(0, gs.rhythmGlowTimer - delta);
				const pulse = 0.3 + Math.sin(time * 12) * 0.15;
				this.anvilGlowMat.opacity = pulse;
				this.anvilGlowMat.emissiveIntensity = 2.0 + gs.rhythmStreak * 0.3;
			} else {
				this.anvilGlowMat.opacity = Math.max(0, this.anvilGlowMat.opacity - delta * 3);
			}
		}

		// Timer urgency — red tint on ambient light when <10s
		if (gs.phase === 'playing' && gs.orderTimer < 10 && gs.orderTimer > 0) {
			const urgencyPulse = 0.5 + Math.sin(time * 10) * 0.3;
			if (this.fireLightAlt) {
				this.fireLightAlt.color.setHex(0xff0000);
				this.fireLightAlt.intensity = 1.5 + urgencyPulse;
			}
		} else if (this.fireLightAlt) {
			this.fireLightAlt.color.setHex(0xff4400);
		}

		// Golden glow rotation
		if (this.goldenGlow && this.goldenGlow.visible) {
			this.goldenGlow.rotation.z = time * 2;
			const mat = this.goldenGlow.material as MeshStandardMaterial;
			mat.opacity = 0.4 + Math.sin(time * 5) * 0.2;
		}

		// Weather effects — rain and lightning
		if (gs.weatherActive && this.rainGroup) {
			this.rainGroup.visible = true;
			// Rain streaks
			for (const sp of this.rainGroup.children) {
				const m = sp as Mesh;
				m.userData.life += delta;
				const mat = m.material as MeshStandardMaterial;
				// Fall down
				m.position.y -= m.userData.speed * delta;
				m.position.x += m.userData.drift * delta;
				// Reset at bottom
				if (m.position.y < -0.4) {
					m.position.y = 0.4;
					m.position.x = (Math.random() - 0.5) * 1.0;
					m.userData.speed = 1.5 + Math.random() * 1.0;
					m.userData.drift = (Math.random() - 0.5) * 0.2;
				}
				mat.opacity = 0.4 + Math.sin(m.userData.life * 8) * 0.15;
				m.visible = true;
			}

			// Lightning
			gs.lightningTimer -= delta;
			if (gs.lightningTimer <= 0) {
				gs.lightningFlashTimer = 0.15;
				gs.lightningTimer = 10 + Math.random() * 20;
				// Play thunder slightly delayed
				setTimeout(() => this.audioSys?.playThunder(), 300 + Math.random() * 600);
			}
			if (gs.lightningFlashTimer > 0) {
				gs.lightningFlashTimer -= delta;
				if (this.ambientFill && gs.deliveryFlashTimer <= 0) {
					const flash = gs.lightningFlashTimer / 0.15;
					this.ambientFill.intensity = 0.6 + flash * 3.0;
					this.ambientFill.color.setHex(0xccccff);
				}
			}

			// Wind gust sound every 8-20 seconds
			this.weatherWindTimer -= delta;
			if (this.weatherWindTimer <= 0) {
				this.audioSys?.playWindGust();
				this.weatherWindTimer = 8 + Math.random() * 12;
			}
		}

		// Wave complete countdown
		if (gs.phase === 'wave_complete') {
			gs.waveCompleteTimer -= delta;
			if (gs.waveCompleteTimer <= 0) {
				// Bonus for perfect wave (no fails)
				if (gs.perfectWave) {
					gs.score += gs.wave * 100;
				}
				gs.wave++;
				gs.ordersThisWave = 0;
				gs.ordersTarget = Math.min(3 + gs.wave, 8);
				gs.phase = 'wave_intro';
				gs.waveIntroTimer = 2.0;
				gs.perfectWave = true;
				// Refill order queue for new wave
				gs.orderQueue = [];
				this.fillOrderQueue();
				gs.dirty = true;
			}
			return;
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

		if (gs.phase === 'paused') return;
		if (gs.phase !== 'playing' || !gs.currentOrder) return;

		// Order timer
		gs.orderTimer -= delta;
		if (gs.orderTimer <= 0) {
			this.failOrder();
			return;
		}

		// Heat decay — workpiece cools when away from forge during hammering
		if (gs.heatDecayActive && (gs.workStep === 'hammering' || gs.workStep === 'hot')) {
			gs.heatLevel -= HEAT_DECAY_RATE * delta;
			if (gs.heatLevel <= HEAT_MIN_THRESHOLD) {
				// Workpiece cooled! Must re-heat
				gs.heatLevel = HEAT_MIN_THRESHOLD * 0.5;
				gs.workStep = 'cooled';
				gs.heatDecayActive = false;
				gs.rhythmStreak = 0;
				this.moveWorkpiece(1);
				this.updateActiveStation();
				this.audioSys?.playFail();
			}
			gs.dirty = true;
		}

		// Bellows boost timer
		if (this.bellowsBoost > 0) {
			this.bellowsBoost -= delta;
		}

		// Bellows puff particles
		if (this.bellowsPuffGroup && this.bellowsPuffGroup.visible) {
			let anyPuff = false;
			for (const sp of this.bellowsPuffGroup.children) {
				const m = sp as Mesh;
				if (m.userData.life > 0) {
					m.userData.life -= delta;
					m.position.x += 0.8 * delta; // Move toward forge
					m.position.y += (Math.random() - 0.5) * delta * 0.3;
					const mat = m.material as MeshStandardMaterial;
					const r = m.userData.life / m.userData.maxLife;
					mat.opacity = r * 0.4;
					m.scale.setScalar(1 + (1 - r) * 2);
					anyPuff = true;
				} else {
					m.visible = false;
				}
			}
			if (!anyPuff) this.bellowsPuffGroup.visible = false;
		}

		// Bellows glow indicator (shows when heating is active)
		if (this.bellowsGroup) {
			const glowRing = this.bellowsGroup.children[this.bellowsGroup.children.length - 1] as Mesh;
			if (glowRing && glowRing.material) {
				const mat = glowRing.material as MeshStandardMaterial;
				const showGlow = gs.phase === 'playing' && (gs.workStep === 'heating' || gs.workStep === 'cooled');
				const targetOpacity = showGlow ? 0.25 + Math.sin(time * 4) * 0.15 : 0;
				mat.opacity += (targetOpacity - mat.opacity) * Math.min(1, delta * 8);
			}
		}

		// Heating logic with color transitions: cold → orange → yellow → white-hot
		if (gs.workStep === 'heating') {
			const heatRate = this.bellowsBoost > 0 ? 0.3 : 0.12;
			gs.heatLevel += delta * heatRate;
			if (gs.heatLevel >= 1) {
				gs.heatLevel = 1;
				gs.workStep = 'hot';
				this.moveWorkpiece(2);
				this.updateActiveStation();
			}
			this.updateWorkpieceHeatColor();
			gs.dirty = true;
		}

		// Cooled state — workpiece shows dim glow, hint to re-heat
		if (gs.workStep === 'cooled') {
			this.updateWorkpieceHeatColor();
		}

		// Persist heat glow during hot/hammering, with heat decay visual
		if (gs.workStep === 'hot' || gs.workStep === 'hammering') {
			this.updateWorkpieceHeatColor();
		}

		// Forged — dim glow
		if (gs.workStep === 'forged') {
			this.workpieceMat.emissive.setHex(0xff2200);
			this.workpieceMat.emissiveIntensity = 0.4;
		}

		// Quenching visual
		if (gs.workStep === 'quenching') {
			this.workpieceMat.emissive.setHex(0x2244ff);
			this.workpieceMat.emissiveIntensity = 0.6;
		}

		// Ready visual — pulse green
		if (gs.workStep === 'ready') {
			this.workpieceMat.emissive.setHex(0x00ff44);
			this.workpieceMat.emissiveIntensity = 0.3 + Math.sin(time * 5) * 0.2;
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

		// Smoke particles
		for (const sp of this.smokeGroup.children) {
			const m = sp as Mesh;
			m.userData.life += delta;
			if (m.userData.life >= m.userData.maxLife) {
				m.userData.life = 0;
				m.position.set((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15);
			}
			const t2 = m.userData.life / m.userData.maxLife;
			m.position.y = m.userData.life * m.userData.vel;
			m.position.x += m.userData.drift * delta;
			const mat = m.material as MeshStandardMaterial;
			mat.opacity = t2 < 0.2 ? t2 * 3 : Math.max(0, 0.6 * (1 - t2));
			m.scale.setScalar(1 + t2 * 2);
		}

		// Steam particles
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

		// Ember particles — always rising from forge
		if (this.emberGroup) {
			for (const sp of this.emberGroup.children) {
				const m = sp as Mesh;
				m.userData.life += delta;
				if (m.userData.life >= m.userData.maxLife) {
					m.userData.life = 0;
					m.position.set(
						(Math.random() - 0.5) * 0.4,
						0,
						(Math.random() - 0.5) * 0.3,
					);
					m.userData.vel = 0.15 + Math.random() * 0.25;
					m.userData.drift = (Math.random() - 0.5) * 0.2;
					m.userData.driftZ = (Math.random() - 0.5) * 0.1;
					m.userData.maxLife = 1.5 + Math.random() * 1.5;
				}
				const t2 = m.userData.life / m.userData.maxLife;
				m.position.y = m.userData.life * m.userData.vel;
				m.position.x += m.userData.drift * delta;
				m.position.z += m.userData.driftZ * delta;
				const mat = m.material as MeshStandardMaterial;
				// Fade in, glow, fade out
				if (t2 < 0.1) {
					mat.opacity = t2 * 8;
				} else if (t2 > 0.7) {
					mat.opacity = Math.max(0, (1 - t2) / 0.3) * 0.8;
				} else {
					mat.opacity = 0.8;
				}
				// Color shift: orange -> red -> dark as it rises
				if (t2 > 0.5) {
					mat.emissive.setHex(0xff2200);
					mat.emissiveIntensity = 2.0 * (1 - t2);
				}
			}
		}

		// Anvil bounce
		if (this.anvilBounceTimer > 0 && this.anvilTop) {
			this.anvilBounceTimer -= delta;
			const bounce = Math.sin(this.anvilBounceTimer * 40) * this.anvilBounceTimer * 0.15;
			this.anvilTop.position.y = 0.62 + bounce;
		}

		// Camera shake on anvil hits
		if (gs.cameraShakeTimer > 0) {
			gs.cameraShakeTimer -= delta;
			const shakeX = (Math.random() - 0.5) * gs.cameraShakeIntensity * 2;
			const shakeY = (Math.random() - 0.5) * gs.cameraShakeIntensity * 2;
			const cam = this.world.scene.getObjectByProperty('type', 'PerspectiveCamera');
			if (cam) {
				if (!this.mainCamera) {
					this.mainCamera = cam as Group;
					this.cameraBasePos.copy(cam.position);
				}
				cam.position.x = this.cameraBasePos.x + shakeX * (gs.cameraShakeTimer / 0.12);
				cam.position.y = this.cameraBasePos.y + shakeY * (gs.cameraShakeTimer / 0.12);
			}
		} else if (this.mainCamera) {
			this.mainCamera.position.copy(this.cameraBasePos);
		}

		// Golden order completion screen flash
		if (gs.goldenFlashTimer > 0) {
			gs.goldenFlashTimer -= delta;
			const flash = Math.max(0, gs.goldenFlashTimer / 1.2);
			if (this.ambientFill) {
				const goldenPulse = flash > 0.7 ? (flash - 0.7) / 0.3 : 0;
				if (goldenPulse > 0) {
					this.ambientFill.color.setHex(0xffdd00);
					this.ambientFill.intensity = 0.6 + goldenPulse * 4.0;
				}
			}
		}

		// Dust motes floating in forge light beams
		if (this.dustGroup) {
			for (const sp of this.dustGroup.children) {
				const m = sp as Mesh;
				m.position.x = m.userData.baseX + Math.sin(time * m.userData.speedX + m.userData.phaseX) * m.userData.ampX;
				m.position.y = m.userData.baseY + Math.sin(time * m.userData.speedY + m.userData.phaseY) * m.userData.ampY;
				m.position.z = m.userData.baseZ + Math.cos(time * m.userData.speedZ + m.userData.phaseZ) * m.userData.ampZ;
				const mat = m.material as MeshStandardMaterial;
				// Subtle shimmer as motes catch the light
				mat.opacity = 0.12 + Math.sin(time * 2 + m.userData.phaseX) * 0.08;
			}
		}

		// Ceiling glow — pulses with forge fire intensity
		if (this.ceilingGlow && this.ceilingGlowMat) {
			const fireIntensity = 0.12 + Math.sin(time * 6) * 0.04 + Math.sin(time * 9.5) * 0.03;
			this.ceilingGlowMat.opacity = fireIntensity;
			this.ceilingGlowMat.emissiveIntensity = 0.3 + Math.sin(time * 7) * 0.15;
		}

		// Chimney sparks — occasional sparks fly out of chimney
		if (this.chimneySparkGroup) {
			// Spawn a new spark randomly (~1 every 1.5 seconds)
			if (Math.random() < delta * 0.7) {
				this.spawnChimneySpark();
			}
			for (const sp of this.chimneySparkGroup.children) {
				const m = sp as Mesh;
				if (m.userData.active) {
					m.userData.life -= delta;
					if (m.userData.life <= 0) {
						m.userData.active = false;
						m.visible = false;
						continue;
					}
					m.position.x += m.userData.velX * delta;
					m.position.y += m.userData.velY * delta;
					m.position.z += m.userData.velZ * delta;
					m.userData.velY -= 0.3 * delta; // slight gravity
					const r = m.userData.life / m.userData.maxLife;
					const mat = m.material as MeshStandardMaterial;
					mat.opacity = r * 0.9;
					// Color shift to red as they die
					if (r < 0.3) {
						mat.emissive.setHex(0xff2200);
						mat.emissiveIntensity = 2.0;
					}
				}
			}
		}

		gs.dirty = true;
	}
}
