import { MToonMaterialLoaderPlugin, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRMCore } from '@pixiv/three-vrm';
import { VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import { AnimationMixer } from 'three';
import type { Scene } from 'three';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { getVrmThumbnail } from '../../../utils/vrm';
import { HeadTracker } from '../../../utils/headTracker';
import { applyModelPartsVisibility, extractModelParts } from '../../../utils/modelParts';
import { BRIDGE_BONES, MODELS } from '../constants';
import type { ModelAction, ModelSlice, ModelUri } from '../types';
import { safeRegisterPlugin } from '../utils';

export const modelSlice: ModelSlice<Pick<ModelAction, 'changeModel' | 'loadModel'>> = (
	set,
	get,
) => ({
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

	loadModel: async (uri: ModelUri, sceneOverride?: Scene) => {
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

			// Keep model hidden until isLoading is false.
			vrm.scene.visible = false;

			// Optimization
			VRMUtils.removeUnnecessaryVertices(gltfVrm.scene);
			VRMUtils.combineSkeletons(gltfVrm.scene);
			VRMUtils.combineMorphs(vrm);

			if (vrm.meta.metaVersion === '0') {
				VRMUtils.rotateVRM0(vrm);
			}

			vrm.scene.traverse((obj: any) => {
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
			vrm.scene.traverse((obj: any) => {
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
				const bone =
					vrm.humanoid?.getNormalizedBoneNode(name as any) ||
					vrm.humanoid?.getRawBoneNode(name as any);
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
				isModelVisible: true,
			});

			// Finally show the model.
			vrm.scene.visible = true;

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
});
