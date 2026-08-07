import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GameSystem } from './game-system.js';
import { AudioSystem } from './audio-system.js';
import { UISystem } from './ui-system.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, {
	...(projectOptions as any),
	browserControls: true,
} as any).then((world) => {
	world.registerSystem(AudioSystem);
	world.registerSystem(GameSystem);
	world.registerSystem(UISystem);
});
