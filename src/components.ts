import { createComponent, Types, defineComponents } from '@iwsdk/core';

export const ForgeStation = createComponent('ForgeStation', {
	stationType: { type: Types.Int32, default: 0 },
});

export default defineComponents([ForgeStation]);
