import type { VRMCore } from '@pixiv/three-vrm';
import type { AnimationAction, AnimationClip, AnimationMixer, PerspectiveCamera, Scene } from 'three';
import type { StateCreator } from 'zustand';
import type { CustomModelInfo } from '../../utils/customModelStorage';
import type { HeadTracker } from '../../utils/headTracker';
import type { ModelPart } from '../../types/types';
import { ANIMS, MIXAMO_ANIMS, MODELS } from './constants';

export type ModelName = keyof typeof MODELS;
export type AnimName = keyof typeof ANIMS;
export type MixamoAnimName = keyof typeof MIXAMO_ANIMS;

export type ModelSettings = {
	enableEyeLookAt: boolean;
	enableHeadTracking: boolean;
};

export type ModelUri = string | number;

export type ModelState = {
	modelName: ModelName;
	modelUri: ModelUri;
	thumbnail: string | null;
	animationName: AnimName | null;
	mixamoAnimationName: MixamoAnimName | null;
	vrm: VRMCore | null;
	mixer: AnimationMixer | null;
	mixamoMixer: AnimationMixer | null;
	loadedMixamoAnimations: Map<MixamoAnimName, AnimationClip>;
	mixamoActions: Map<MixamoAnimName, AnimationAction>;
	isLoading: boolean;
	loadProgress: number;
	settings: ModelSettings;
	camera: PerspectiveCamera;
	currentAnimationType: 'vrma' | 'mixamo' | null;
	headTracker: HeadTracker | null;
	facialExpression: string;
	expressionMap: Record<string, Record<string, number>>;
	expressionNeedsUpdate: boolean;
	modelParts: ModelPart[];
	restPose: Record<string, { x: number; y: number; z: number; w: number }> | null;
	currentScene: Scene | null;
	showAllParts: boolean;
	isModelVisible: boolean;
	customModel: CustomModelInfo | null;
	isPickingModel: boolean;
	importModelError: string | null;
};

export type ImportCustomModelOptions = {
	sourceUri?: string;
	displayName?: string;
	size?: number | null;
	thumbnailUri?: string | null;
};

export type ModelAction = {
	changeModel: (name: ModelName) => void;
	loadModel: (uri: ModelUri, scene?: Scene) => Promise<void>;
	updateModelSettings: (params: Partial<ModelSettings>) => void;
	loadAnimation: (name: AnimName) => Promise<void>;
	loadMixamoAnimation: (name: MixamoAnimName) => Promise<boolean>;
	playMixamoAnimation: (name: MixamoAnimName) => void;
	updateAnimations: (deltaTime: number) => void;
	setFacialExpression: (expression: string) => void;
	applyFacialExpression: () => void;
	updateAnimationFrame: (delta: number) => void;
	loadCustomModelFromStorage: () => Promise<void>;
	importCustomModel: (options?: ImportCustomModelOptions) => Promise<boolean>;
	deleteCustomModel: () => Promise<void>;
};

export type ModelStore = ModelState & ModelAction;

export type ModelSlice<T extends object> = StateCreator<ModelStore, [], [], T>;
