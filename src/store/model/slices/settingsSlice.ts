import type { ModelAction, ModelSlice } from '../types';

export const settingsSlice: ModelSlice<
	Pick<ModelAction, 'updateModelSettings'>
> = (set, get) => ({
	updateModelSettings: (params) => {
		const state = get();

		// Handle eye look-at setting
		if (params.enableEyeLookAt !== undefined) {
			if (params.enableEyeLookAt && state.vrm?.lookAt) {
				state.vrm.lookAt.target = state.camera;
			} else if (state.vrm?.lookAt) {
				state.vrm.lookAt.target = null;
			}
		}

		if (params.enableHeadTracking !== undefined && state.headTracker) {
			state.headTracker.setEnabled(params.enableHeadTracking);
		}

		set((current) => ({
			...current,
			settings: { ...current.settings, ...params },
		}));
	},
});
