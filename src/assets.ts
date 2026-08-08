import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
	`${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
	'menu-panel': {
		url: publicAssetUrl('ui/menu.uikitml'),
		type: AssetType.UIKitML,
		name: 'Menu Panel',
	},
	'hud-panel': {
		url: publicAssetUrl('ui/hud.uikitml'),
		type: AssetType.UIKitML,
		name: 'HUD Panel',
	},
	'order-panel': {
		url: publicAssetUrl('ui/order.uikitml'),
		type: AssetType.UIKitML,
		name: 'Order Panel',
	},
	'game-over-panel': {
		url: publicAssetUrl('ui/game-over.uikitml'),
		type: AssetType.UIKitML,
		name: 'Game Over Panel',
	},
	'settings-panel': {
		url: publicAssetUrl('ui/settings.uikitml'),
		type: AssetType.UIKitML,
		name: 'Settings Panel',
	},
	'pause-panel': {
		url: publicAssetUrl('ui/pause.uikitml'),
		type: AssetType.UIKitML,
		name: 'Pause Panel',
	},
	'wave-panel': {
		url: publicAssetUrl('ui/wave.uikitml'),
		type: AssetType.UIKitML,
		name: 'Wave Panel',
	},
	'help-panel': {
		url: publicAssetUrl('ui/help.uikitml'),
		type: AssetType.UIKitML,
		name: 'Help Panel',
	},
});
