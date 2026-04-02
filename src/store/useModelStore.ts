import { MToonMaterialLoaderPlugin, VRMCore, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {
	createVRMAnimationClip,
	VRMAnimationLoaderPlugin,
	VRMLookAtQuaternionProxy,
} from '@pixiv/three-vrm-animation';
import { Platform } from 'react-native';
import { AnimationMixer, PerspectiveCamera, Scene, AnimationClip } from 'three';
import { GLTFLoader } from 'three-stdlib';
import { Asset } from 'expo-asset';
import { create } from 'zustand';
import { getVrmThumbnail } from '../utils/vrm';
import { loadMixamoAnimation } from '../utils/animation';
import * as THREE from 'three';
import { HeadTracker } from '../utils/headTracker';
import { applyModelPartsVisibility, extractModelParts } from '../utils/modelParts';
import { resolve } from '@react-three/fiber/dist/declarations/src/core/utils';
import {
	CustomModelInfo,
	deleteCustomModelInfo,
	loadCustomModelInfo,
	saveCustomModelFromUri,
} from '../utils/customModelStorage';
import * as DocumentPicker from 'expo-document-picker';

export const MODELS = {
	vrm0: require('../../assets/models/vrm0.vrm'),
	vrm1: require('../../assets/models/vrm1.vrm'),
	Sonya: require('../../assets/models/Sonya_Sinclair.vrm'),
	custom: 'custom',
};

export const ANIMS = {
	idle: require('../../assets/animations/idle_loop.vrma'),
	happy_synthesizer: require('../../assets/animations/Happy_Synthesizer.vrma'),
};

export const MIXAMO_ANIMS = {
	salute: require('../../assets/animations/Salute.fbx'),
	hello: require('../../assets/animations/Idle.fbx'),
};

export const BRIDGE_BONES = [
	'head',
	'neck',
	'spine',
	'hips',
	'rightUpperArm',
	'rightLowerArm',
	'rightHand',
	'rightThumbMetacarpal',
	'rightThumbProximal',
	'rightThumbDistal',
	'rightIndexProximal',
	'rightIndexIntermediate',
	'rightIndexDistal',
	'rightMiddleProximal',
	'rightMiddleIntermediate',
	'rightMiddleDistal',
	'rightRingProximal',
	'rightRingIntermediate',
	'rightRingDistal',
	'rightLittleProximal',
	'rightLittleIntermediate',
	'rightLittleDistal',
	'leftUpperArm',
	'leftLowerArm',
	'leftHand',
	'leftThumbMetacarpal',
	'leftThumbProximal',
	'leftThumbDistal',
	'leftIndexProximal',
	'leftIndexIntermediate',
	'leftIndexDistal',
	'leftMiddleProximal',
	'leftMiddleIntermediate',
	'leftMiddleDistal',
	'leftRingProximal',
	'leftRingIntermediate',
	'leftRingDistal',
	'leftLittleProximal',
	'leftLittleIntermediate',
	'leftLittleDistal',
	'rightUpperLeg',
	'rightLowerLeg',
	'leftUpperLeg',
	'leftLowerLeg',
	'leftShoulder',
	'rightShoulder',
	'upperChest',
] as const;

export const EXPRESSION_LERP_SPEED = 0.15;

type ModelName = keyof typeof MODELS;
type AnimName = keyof typeof ANIMS;
type MixamoAnimName = keyof typeof MIXAMO_ANIMS;

type ModelSettings = {
	enableEyeLookAt: boolean;
	enableHeadTracking: boolean;
};

// Safe plugin registration
const safeRegisterPlugin = (
	loader: GLTFLoader,
	pluginFactory: (parser: any) => any,
	pluginName: string,
) => {
	try {
		loader.register(pluginFactory);
		return true;
	} catch (error) {
		console.warn(`Failed to register ${pluginName}:`, error);
		return false;
	}
};

export type ModelPart = {
	id: string;
	name: string;
	meshNames: string[];
	hidden: boolean;
	thumbnail?: string | null;
};

export type ModelUri = string | number;

export type ModelState = {
	modelName: ModelName;
	modelUri: string;
	thumbnail: string | null;
	animationName: AnimName | null;
	mixamoAnimationName: MixamoAnimName | null;
	vrm: VRMCore | null;
	mixer: AnimationMixer | null;
	mixamoMixer: AnimationMixer | null;
	loadedMixamoAnimations: Map<MixamoAnimName, AnimationClip>;
	mixamoActions: Map<MixamoAnimName, THREE.AnimationAction>;
	isLoading: boolean;
	loadProgress: number;
	settings: ModelSettings;
	camera: PerspectiveCamera;
	currentAnimationType: 'vrma' | 'mixamo' | null;
	headTracker: HeadTracker | null;
	facialExpression: string;
	expressionMap: { [key: string]: { [expression: string]: number } };
	expressionNeedsUpdate: boolean;

	modelParts: ModelPart[];
	restPose: Record<string, { x: number; y: number; z: number; w: number }> | null;
	currentScene: THREE.Scene | null;
	showAllParts: boolean;
	isModelVisible: boolean;
	customModel: CustomModelInfo | null;
	isPickingModel: boolean,
	importModelError: string | null;
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
	importCustomModel: (options?: {
		sourceUri?: string;
		displayName?: string;
		size?: number | null;
		thumbnailUri?: string | null;
	}) => Promise<boolean>;
	deleteCustomModel: () => Promise<void>;
};

export const useModelStore = create<ModelState & ModelAction>()((set, get) => ({
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
	expressionMap: {
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
	},
	expressionNeedsUpdate: false,

	modelParts: [],
	restPose: null,
	currentScene: null,
	showAllParts: false,
	isModelVisible: false,
	customModel: null,
	isPickingModel: false,
	importModelError: null,

	applyFacialExpression: () => {
		const { vrm, facialExpression, expressionMap } = get();

		if (!vrm?.expressionManager) {
			return;
		}

		try {
			const expressionManager = vrm.expressionManager;

			// Get expression names properly
			const expressionNames = Object.keys(expressionManager.expressions);

			// Reset all expressions to 0
			expressionNames.forEach((expressionName) => {
				try {
					expressionManager.setValue(expressionName, 0);
				} catch (error) {
					console.warn(`Failed to reset expression '${expressionName}':`, error);
				}
			});

			// Apply the current facial expression
			const expressionValues = expressionMap[facialExpression];

			if (expressionValues) {
				for (const [expressionName, value] of Object.entries(expressionValues)) {
					const clampedValue = Math.max(0, Math.min(1, value));

					try {
						expressionManager.setValue(expressionName, clampedValue);
					} catch (error) {
						console.warn(`Failed to set expression '${expressionName}':`, error);
					}
				}
			}

			expressionManager.update();

			// Mark as updated
			set({ expressionNeedsUpdate: false });
		} catch (error) {
			console.error('Error applying facial expression:', error);
		}
	},

	setFacialExpression: (expression: string) => {
		set({ facialExpression: expression });

		// Apply the expression immediately after setting it
		setTimeout(() => {
			get().applyFacialExpression();
		}, 0);
	},

	updateModelSettings(params) {
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

		set((state) => ({
			...state,
			settings: { ...state.settings, ...params },
		}));
	},

	updateAnimations: (deltaTime: number) => {
		const {
			mixer,
			mixamoMixer,
			currentAnimationType,
			headTracker,
			expressionNeedsUpdate,
			vrm,
		} = get();

		if (currentAnimationType === 'vrma' && mixer) {
			mixer.update(deltaTime);
		} else if (currentAnimationType === 'mixamo' && mixamoMixer) {
			mixamoMixer.update(deltaTime);
		}

		// Update head tracking
		if (headTracker) {
			headTracker.update(deltaTime);
		}

		// Only apply facial expressions when needed
		if (vrm?.expressionManager && expressionNeedsUpdate) {
			get().applyFacialExpression();
		}

		// Continuously apply facial expressions
		if (vrm?.expressionManager) {
			get().applyFacialExpression();
		}
	},

	changeModel: (name) => {
		console.log('Changing model to', name);
		const { vrm } = get();
		if (vrm) vrm.scene.visible = false;
		set({ isModelVisible: false });

		// Clean up existing head tracker
		const currentHeadTracker = get().headTracker;
		if (currentHeadTracker) {
			currentHeadTracker.dispose();
		}

		if (name === 'custom') {
			const customModel = get().customModel;
			if (!customModel?.uri) {
				console.warn('No custom model available to load.');
				return;
			}
			set({ modelName: name, modelUri: customModel.uri, thumbnail: null });
			get().loadModel(customModel.uri);
			return;
		}

		const uri = MODELS[name];
		set({
			modelName: name,
			modelUri: MODELS[name],
			thumbnail: null,
			isLoading: true,
			loadProgress: 0,
			headTracker: null,
		});
		get().loadModel(uri);
	},

	loadModel: async (uri: string | number, sceneOverride?: Scene) => {
		const {
			vrm: currentVrm,
			headTracker: currentHeadTracker,
			currentScene: storeScene,
		} = get();

		// Clean up existing head tracker
		if (currentHeadTracker) {
			currentHeadTracker.dispose();
		}

		const scene = sceneOverride || storeScene || undefined;

		// Set loading state at the beginning
		set({
			isLoading: true,
			loadProgress: 0,
			headTracker: null,
			restPose: null,
			modelParts: [],
		});

		const loader = new GLTFLoader();

		if (scene) {
			scene.children
				.filter((child) => child.type.includes('Light'))
				.forEach((light) => {
					scene.remove(light);
				});

			const ambientLight = new THREE.AmbientLight(0xfff0f5, 0.45);
			scene.add(ambientLight);

			const keyLight = new THREE.DirectionalLight(0xffebe6, 0.9);
			keyLight.position.set(-1, 1.2, 1);
			keyLight.castShadow = false;
			scene.add(keyLight);

			if (Platform.OS === 'android' || Platform.OS === 'ios') {
				const fillLight = new THREE.DirectionalLight(0xffe4e6, 0.25);
				fillLight.position.set(1, 0.5, -0.5);
				scene.add(fillLight);

				const rimLight = new THREE.DirectionalLight(0xfff8dc, 0.15);
				rimLight.position.set(0, 1, -1);
				scene.add(rimLight);

				const bounceLight = new THREE.DirectionalLight(0xffeef0, 0.1);
				bounceLight.position.set(0, -0.5, 1);
				scene.add(bounceLight);
			}
		}

		// Only Register the MToonMaterialLoaderPlugin for mobile because The model aren't render correctly on mobile only
		if (Platform.OS === 'ios' || Platform.OS === 'android') {
			safeRegisterPlugin(
				loader,
				(parser) => new MToonMaterialLoaderPlugin(parser),
				'MToonMaterialLoaderPlugin',
			);
		}

		safeRegisterPlugin(
			loader,
			(parser) => new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true }),
			'VRMLoaderPlugin',
		);

		try {
			let resolvedUri: string = typeof uri === 'string' ? uri : '';

			if (typeof uri !== 'string') {
				const asset = Asset.fromModule(uri);
				await asset.downloadAsync();
				resolvedUri = asset.localUri || asset.uri;
			}

			if (!resolvedUri) {
				throw new Error('Failed to resolve VRM URI for loading.');
			}

			const gltfVrm = await new Promise<any>((resolve, reject) => {
				loader.load(
					resolvedUri,
					(gltf) => {
						resolve(gltf);
					},
					(event) => {
						const progress = Math.round((event.loaded / event.total) * 100);
						if (progress % 10 === 0) set({ loadProgress: progress });
					},
					(err) => {
						reject(err);
					},
				);
			});

			const vrm = gltfVrm.userData.vrm as VRMCore;

			if (!vrm) {
				throw new Error('No VRM data found in loaded file');
			}

			// Optimization
			VRMUtils.removeUnnecessaryVertices(gltfVrm.scene);
			VRMUtils.combineSkeletons(gltfVrm.scene);
			VRMUtils.combineMorphs(vrm);

			if (vrm.meta.metaVersion === '0') {
				VRMUtils.rotateVRM0(vrm);
			}

			vrm.scene.traverse((obj) => {
				obj.frustumCulled = true;
				obj.castShadow = true;
				obj.receiveShadow = true;
			});

			// Remove old VRM
			if (currentVrm && scene) {
				scene.remove(currentVrm.scene);
				VRMUtils.deepDispose(currentVrm.scene);
			}

			// Avoid the typescript error "TS2345: Argument of type 'VRMLookAt | undefined' is not assignable to parameter of type 'VRMLookAt' "
			if (vrm.lookAt) {
				try {
					const lookAtQuatProxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
					lookAtQuatProxy.name = 'lookAtQuaternionProxy';
					if (scene) vrm.scene.add(lookAtQuatProxy);
				} catch (error) {
					console.warn('Failed to create lookAt proxy:', error);
				}
			}

			// Disable frustumCulled (from three-vrm example)
			vrm.scene.traverse((obj) => {
				obj.frustumCulled = false;
			});

			// Get thumbnail asynchronously
			try {
				const thumbnail = await getVrmThumbnail(
					gltfVrm.parser,
					vrm.meta?.metaVersion || '1.0',
				);
				if (thumbnail?.data?.localUri) {
					set({ thumbnail: thumbnail.data.localUri });
				}
			} catch (error) {
				console.warn('Failed to get VRM thumbnail:', error);
			}

			const restPose: Record<string, { x: number; y: number; z: number; w: number }> = {};
			for (const name of BRIDGE_BONES) {
				const bone = vrm.humanoid?.getRawBoneNode(name as any);
				if (bone) {
					restPose[name] = {
						x: bone.quaternion.x,
						y: bone.quaternion.y,
						z: bone.quaternion.z,
						w: bone.quaternion.w,
					};
				}
			}

			scene?.add(vrm.scene);

			// Create head tracker
			const camera = get().camera;
			const headTracker = new HeadTracker(vrm, camera);
			headTracker.setEnabled(get().settings.enableHeadTracking);

			// Update state with loaded model and set loading to false
			set({
				vrm,
				headTracker,
				mixamoMixer: new AnimationMixer(vrm.scene),
				isLoading: false,
				loadProgress: 100,
				restPose,
			});

			const modelParts = extractModelParts(vrm, { includeAll: get().showAllParts });
			set({ modelParts });
			applyModelPartsVisibility(vrm, modelParts);

			// Configure eye look-at
			if (get().settings.enableEyeLookAt && vrm.lookAt) {
				vrm.lookAt.target = camera;
			}

			// Apply initial facial expression immediately after model is loaded
			console.log('Model loaded, applying initial expression...');
			setTimeout(() => {
				get().setFacialExpression('relaxed');
				get().applyFacialExpression();
			}, 100);

			// Load idle animation after model is loaded
			get()
				.loadAnimation('idle')
				.then(() => {
					console.log('Model and animation loaded successfully');
				})
				.catch((animError) => {
					console.warn('Failed to load animation:', animError);
				});
		} catch (error) {
			console.error('Error processing loaded model:', error);
			set({ isLoading: false });
		}
	},

	loadAnimation: async (name) => {
		const vrm = get().vrm;
		if (!vrm) {
			console.warn('No VRM model loaded, cannot load animation');
			return;
		}

		try {
			const loader = new GLTFLoader();

			safeRegisterPlugin(
				loader,
				(parser) => new VRMAnimationLoaderPlugin(parser),
				'VRMAnimationLoaderPlugin',
			);

			// Load VRMA
			const gltfVrma = await loader.loadAsync(ANIMS[name]);
			const vrmAnim = gltfVrma.userData.vrmAnimations?.[0];

			if (!vrmAnim) {
				console.warn(`No animation found in ${name}`);
				return;
			}

			// Create clip
			const clip = createVRMAnimationClip(vrmAnim, vrm);

			// Stop previous animation if exists
			const currentMixer = get().mixer;
			if (currentMixer) {
				currentMixer.stopAllAction();
			}

			// Play new animation
			const mixer = new AnimationMixer(vrm.scene);
			const action = mixer.clipAction(clip);
			action.play();

			set({
				mixer: mixer,
				animationName: name,
				mixamoAnimationName: null,
				currentAnimationType: 'vrma',
			});
			console.log(`Animation '${name}' loaded and playing`);
		} catch (error) {
			console.error(`Failed to load animation '${name}':`, error);
		}
	},

	loadMixamoAnimation: async (name: MixamoAnimName): Promise<boolean> => {
		const state = get();
		const { vrm, mixamoMixer, loadedMixamoAnimations } = state;

		if (!vrm || !mixamoMixer) {
			console.warn('VRM or mixer not ready');
			return false;
		}

		if (loadedMixamoAnimations.has(name)) {
			console.log(`Mixamo animation '${name}' already loaded`);
			return true;
		}

		try {
			const assetModule = MIXAMO_ANIMS[name];
			const asset = Asset.fromModule(assetModule);

			await asset.downloadAsync();
			const uri = asset.localUri || asset.uri;

			if (!uri) {
				throw new Error(`Failed to resolve URI for animation ${name}`);
			}

			console.log(`Loading Mixamo animation from: ${uri}`);
			const vrmAnimationClip = await loadMixamoAnimation(uri, vrm as any);

			if (vrmAnimationClip) {
				vrmAnimationClip.name = name;
				loadedMixamoAnimations.set(name, vrmAnimationClip);

				// Create and configure the action properly
				const action = mixamoMixer.clipAction(vrmAnimationClip);
				action.reset();

				state.mixamoActions.set(name, action);

				set({
					loadedMixamoAnimations: new Map(loadedMixamoAnimations),
					mixamoActions: new Map(state.mixamoActions),
				});

				console.log(`Mixamo animation '${name}' loaded successfully`);
				console.log(`Animation duration: ${vrmAnimationClip.duration}s`);

				return true;
			} else {
				console.error(`Failed to load/convert Mixamo animation: ${name}`);
				return false;
			}
		} catch (error) {
			console.error(`Error loading Mixamo animation ${name}:`, error);
			return false;
		}
	},

	playMixamoAnimation: (name: MixamoAnimName) => {
		const state = get();
		const { mixamoActions, mixer, mixamoMixer } = state;

		console.log(`Attempting to play Mixamo animation: ${name}`);

		// Stop VRM animations first
		if (mixer) {
			mixer.stopAllAction();
			console.log('Stopped VRM animations');
		}

		// Stop all current Mixamo animations
		mixamoActions.forEach((action, actionName) => {
			if (action) {
				action.stop();
				action.reset();
				console.log(`Stopped Mixamo animation: ${actionName}`);
			}
		});

		// Get and configure the selected Mixamo animation
		const action = mixamoActions.get(name);
		if (action && mixamoMixer) {
			console.log(`Found action for ${name}, configuring...`);

			// Reset and configure the action
			action.reset();
			action.setLoop(THREE.LoopRepeat, Infinity);
			action.clampWhenFinished = false;
			action.enabled = true;
			action.weight = 1.0;
			action.timeScale = 1.0;

			// Update state BEFORE playing
			set({
				mixamoAnimationName: name,
				animationName: null,
				currentAnimationType: 'mixamo',
			});

			// Start the animation
			action.play();
		} else {
			console.error(`Mixamo animation action not found: ${name}`);
			console.log('Available actions:', Array.from(mixamoActions.keys()));
		}
	},

	// Animation frame update without heavy lip sync processing
	updateAnimationFrame: (delta: number) => {
		const state = get();
		const {
			vrm,
			mixer,
			mixamoMixer,
			facialExpression,
			expressionMap,
			headTracker,
			settings,
			isLoading,
		} = state;

		if (!vrm) return;

		const now = performance.now();

		try {
			vrm.update(delta);

			if (mixer) {
				mixer.update(delta);
			} else if (mixamoMixer) {
				mixamoMixer.update(delta);
			}

			if (headTracker && settings.enableEyeLookAt) {
				headTracker.update(delta);
			}

			const expressionManager = vrm.expressionManager;
			if (expressionManager) {
				const shouldUpdateExpressions = now;

				if (shouldUpdateExpressions) {
					const baseExpressions = expressionMap['default'];
					const expressionsToUpdate = ['joy', 'sad', 'angry', 'surprised', 'relaxed'];

					for (const expr of expressionsToUpdate) {
						const targetValue = baseExpressions?.[expr] || 0;
						const currentValue = expressionManager.getValue(expr) || 0;

						if (Math.abs(currentValue - targetValue) > 0.01) {
							const newValue = THREE.MathUtils.lerp(
								currentValue,
								targetValue,
								EXPRESSION_LERP_SPEED,
							);
							expressionManager.setValue(expr, newValue);
						}
					}
				}
			}
		} catch (error) {
			console.error('Error in animation frame update:', error);
		}
	},

	loadCustomModelFromStorage: async () => {
		if (Platform.OS === 'web') return;
		try {
			const info = await loadCustomModelInfo();
			set({ customModel: info });
		} catch (error) {
			console.warn('Failed to load custom model info:', error);
			set({ customModel: null });
		}
	},

	importCustomModel: async (options) => {
		if (Platform.OS === 'web') {
			console.warn('Custom model import is only supported on mobile.');
			return false;
		}
		if (get().isPickingModel) {
			console.warn('Document picker already in progress.');
			return false;
		}

		try {
			set({ isPickingModel: true, importModelError: null });

			let sourceUri = options?.sourceUri ?? '';
			let displayName = options?.displayName ?? '';
			let fileSize = options?.size ?? null;
			let fileNameFromPicker = '';
			let mimeTypeFromPicker = '';

			if (!sourceUri) {
				const result = await DocumentPicker.getDocumentAsync({
					type: '*/*',
					copyToCacheDirectory: true,
					multiple: false,
				});

				if (result.canceled || !result.assets?.length) {
					return false;
				}

				const asset = result.assets[0];
				if (!asset?.uri) {
					console.warn('No asset URI returned from document picker.');
					set({ importModelError: 'No file URI returned by the picker.' });
					return false;
				}

				sourceUri = asset.uri;
				fileNameFromPicker = asset.name ?? '';
				fileSize = asset.size ?? null;
				mimeTypeFromPicker = asset.mimeType ?? '';
			}

			const derivedName =
				displayName || fileNameFromPicker || sourceUri.split('/').pop() || 'Custom VRM';
			const fileName = derivedName.replace(/\.vrm$/i, '');

			const lowerName = derivedName.toLowerCase();
			const uriPath = sourceUri.split('?')[0];
			const uriExt = uriPath.includes('.') ? uriPath.split('.').pop()?.toLowerCase() : '';
			const mimeType = (mimeTypeFromPicker || '').toLowerCase();
			const isVrm =
				lowerName.endsWith('.vrm') ||
				uriExt === 'vrm' ||
				mimeType.includes('model') ||
				mimeType.includes('octet-stream');

			if (!isVrm) {
				console.warn('Selected file does not look like a VRM file.');
				set({
					importModelError:
						'Selected file does not look like a .vrm. Please choose a VRM file.',
				});
				return false;
			}

			const info = await saveCustomModelFromUri(
				sourceUri,
				fileName,
				fileSize,
				options?.thumbnailUri ?? null,
			);
			set({
				customModel: info,
				modelName: 'custom',
				modelUri: info.uri,
				thumbnail: null,
				importModelError: null,
			});

			await get().loadModel(info.uri);
			return true;
		} catch (error) {
			console.error('Failed to import custom model:', error);
			set({ importModelError: 'Import failed. Please try another .vrm file.' });
			return false;
		} finally {
			set({ isPickingModel: false });
		}
	},

	deleteCustomModel: async () => {
		try {
			await deleteCustomModelInfo();
		} catch (error) {
			console.warn('Failed to delete custom model:', error);
		} finally {
			set({ customModel: null });
			if (get().modelName === 'custom') {
				get().changeModel('vrm1');
			}
		}
	},
}));
