import { create } from 'zustand';
import { initialModelState } from './model/state';
import { animationSlice } from './model/slices/animationSlice';
import { customModelSlice } from './model/slices/customModelSlice';
import { facialExpressionSlice } from './model/slices/facialExpressionSlice';
import { modelSlice } from './model/slices/modelSlice';
import { settingsSlice } from './model/slices/settingsSlice';
import type { ModelStore } from './model/types';

export {
	ANIMS,
	BRIDGE_BONES,
	EXPRESSION_LERP_SPEED,
	MIXAMO_ANIMS,
	MODELS,
} from './model/constants';
export type {
	AnimName,
	ImportCustomModelOptions,
	MixamoAnimName,
	ModelAction,
	ModelName,
	ModelSettings,
	ModelState,
	ModelUri,
} from './model/types';

export const useModelStore = create<ModelStore>()((...args) => ({
	...initialModelState(),
	...facialExpressionSlice(...args),
	...settingsSlice(...args),
	...animationSlice(...args),
	...modelSlice(...args),
	...customModelSlice(...args),
}));
