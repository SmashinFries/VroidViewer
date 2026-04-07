import { Platform } from 'react-native';
import { PerspectiveCamera } from 'three';
import { MODELS } from './constants';
import type { ModelState } from './types';

const expressionMap: ModelState['expressionMap'] = {
	default: {},
	relaxed: { relaxed: 0.9 },
	smile: { happy: 0.6, relaxed: 0.2 },
	happy: { happy: 1.0, relaxed: 0.3 },
	grin: { happy: 0.8, surprised: 0.2 },
	laugh: { happy: 1.0, surprised: 0.3, relaxed: -0.2 },
	funnyFace: { happy: 0.7, surprised: 0.4, angry: 0.1 },
	wink: { happy: 0.5, relaxed: 0.4 },
	sad: { sad: 1.0, relaxed: -0.3 },
	crying: { sad: 1.0, surprised: 0.2, relaxed: -0.5 },
	disappointed: { sad: 0.6, angry: 0.2, relaxed: -0.2 },
	angry: { angry: 1.0, relaxed: -0.4 },
	annoyed: { angry: 0.5, sad: 0.2, relaxed: -0.2 },
	furious: { angry: 1.0, surprised: 0.3, relaxed: -0.6 },
	surprised: { surprised: 1.0 },
	shocked: { surprised: 1.0, sad: 0.2 },
	amazed: { surprised: 0.8, happy: 0.4 },
	scared: { surprised: 0.8, sad: 0.4, relaxed: -0.5 },
	worried: { sad: 0.4, angry: 0.2, surprised: 0.3, relaxed: -0.3 },
	thinking: { relaxed: 0.3, sad: 0.1 },
	confused: { surprised: 0.4, sad: 0.2, angry: 0.1 },
	focused: { angry: 0.2, relaxed: 0.4 },
	sleepy: { relaxed: 0.8, sad: 0.2 },
	bored: { relaxed: 0.5, sad: 0.3 },
	shy: { sad: 0.3, happy: 0.2, relaxed: 0.4 },
	embarrassed: { happy: 0.3, surprised: 0.2, sad: 0.2 },
	confident: { happy: 0.4, relaxed: 0.6, angry: 0.1 },
	ecstatic: { happy: 1.0, surprised: 0.5, relaxed: 0.3 },
	devastated: { sad: 1.0, surprised: 0.3, relaxed: -0.6 },
	enraged: { angry: 1.0, surprised: 0.2, relaxed: -0.8 },
};

export const initialModelState = (): ModelState => ({
	modelName: 'vrm1',
	modelUri: MODELS.vrm1,
	thumbnail: null,
	vrm: null,
	mixer: null,
	mixamoMixer: null,
	loadedMixamoAnimations: new Map(),
	mixamoActions: new Map(),
	animationName: null,
	mixamoAnimationName: null,
	camera:
		Platform.OS === 'web'
			? new PerspectiveCamera(30, undefined, 0.1, 20)
			: new PerspectiveCamera(70, undefined, 0.1, 2000),
	isLoading: true,
	loadProgress: 0,
	currentAnimationType: null,
	headTracker: null,
	settings: {
		enableEyeLookAt: true,
		enableHeadTracking: true,
	},
	facialExpression: 'relaxed',
	expressionMap,
	expressionNeedsUpdate: false,

	modelParts: [],
	restPose: null,
	currentScene: null,
	showAllParts: false,
	isModelVisible: false,
	customModel: null,
	isPickingModel: false,
	importModelError: null,
});
