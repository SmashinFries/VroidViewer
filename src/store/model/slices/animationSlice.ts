import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { AnimationMixer } from 'three';
import { GLTFLoader } from 'three-stdlib';
import { loadMixamoAnimation as loadMixamoAnimationClip } from '../../../utils/animation';
import { ANIMS, EXPRESSION_LERP_SPEED, MIXAMO_ANIMS } from '../constants';
import type { AnimName, MixamoAnimName, ModelAction, ModelSlice } from '../types';
import { safeRegisterPlugin } from '../utils';

export const animationSlice: ModelSlice<
	Pick<
		ModelAction,
		| 'updateAnimations'
		| 'loadAnimation'
		| 'loadMixamoAnimation'
		| 'playMixamoAnimation'
		| 'updateAnimationFrame'
	>
> = (set, get) => ({
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

	loadAnimation: async (name: AnimName) => {
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
			const vrmAnimationClip = await loadMixamoAnimationClip(uri, vrm as any);

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
			// 1. Update the appropriate mixer BEFORE vrm.update so the humanoid
			// can sync its internal state with the animated bone nodes for this frame.
			if (state.currentAnimationType === 'vrma' && mixer) {
				mixer.update(delta);
			} else if (state.currentAnimationType === 'mixamo' && mixamoMixer) {
				mixamoMixer.update(delta);
			}

			// 2. Update VRM internal state (Humanoid, LookAt, etc.)
			vrm.update(delta);

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
});
