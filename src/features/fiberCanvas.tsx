import { Grid } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Text, StatusBar } from 'react-native';
import { Vector3 } from 'three';
import { BRIDGE_BONES, useModelStore } from '../store/useModelStore';
import { ModelSelector } from '../components/selector';
import useControls from 'r3f-native-orbitcontrols';
import LottieView from '../components/LottieView';
import { MenusContainer } from '../components/menus';
import * as THREE from 'three';
import { NativeVroidView, NativeVroidViewHandle } from '../components/NativeVroidView';
import { getHiddenMeshNames } from '../utils/modelParts';
import { Asset } from 'expo-asset';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const sceneColor = 0x6ad6f0;

const Lights = () => {
	return (
		<>
			{/* Warm ambient with subtle pink undertones */}
			<ambientLight
				intensity={Platform.OS === 'web' ? 0.4 : 0.35}
				color="#fff0f5" // Lavender blush
			/>

			{/* Main key light with peachy warmth */}
			<directionalLight
				position={[1, 1.2, 1]}
				intensity={Platform.OS === 'web' ? 1.0 : 0.85}
				color="#ffebe6" // Soft peach
				castShadow={Platform.OS === 'web'} // Softer shadows for anime look
			/>

			{/* Mobile lighting for natural pink skin tones */}
			{(Platform.OS === 'android' || Platform.OS === 'ios') && (
				<>
					{/* Pink-tinted fill light */}
					<directionalLight
						position={[-1, 0.8, 0.5]}
						intensity={0.3}
						color="#ffe4e6" // Light pink fill
					/>

					{/* Anime-style rim lighting */}
					<directionalLight
						position={[0, 1, -1]}
						intensity={0.18}
						color="#fff8dc" // Cornsilk highlight
					/>

					{/* Subtle bounce light from below (anime technique) */}
					<directionalLight
						position={[0, -0.3, 1]}
						intensity={0.12}
						color="#ffeef0" // Very soft pink bounce
					/>
				</>
			)}
		</>
	);
};

const Model = () => {
	const { modelUri, vrm, mixer, mixamoMixer, updateAnimations, loadModel } = useModelStore();
	const { scene } = useThree();

	useFrame((state, delta) => {
		vrm && vrm.update(delta);
		mixamoMixer && updateAnimations(delta);
		mixer && mixer.update(delta);
	});

	useEffect(() => {
		if (!modelUri) return;
		loadModel(modelUri, scene);
	}, [modelUri]);

	return null;
};

interface FiberCanvasProps {
	onPreviewPress: () => void;
}

export const FiberCanvas: React.FC<FiberCanvasProps> = ({ onPreviewPress }) => {
	const [OrbitControls, events] = useControls();
	const modelUri = useModelStore((state) => state.modelUri);
	const camera = useModelStore((state) => state.camera);
	const modelParts = useModelStore((state) => state.modelParts);
	const restPose = useModelStore((state) => state.restPose);
	const isModelVisible = useModelStore((state) => state.isModelVisible);
	const settings = useModelStore((state) => state.settings);

	const isLoading = useModelStore((state) => state.isLoading);

	const [useNative, setUseNative] = useState(Platform.OS === 'ios'|| Platform.OS === 'android');
	const [nativeUri, setNativeUri] = useState<string | null>(null);
	const [currentExpressions, setCurrentExpressions] = useState<Record<string, number>>({});
	const [currentRotations, setCurrentRotations] = useState<
		Record<string, { x: number; y: number; z: number; w: number }>
	>({});
	const restPoseRef = useRef<Record<
		string,
		{ x: number; y: number; z: number; w: number }
	> | null>(null);
	const restQuat = useRef(new THREE.Quaternion());
	const deltaQuat = useRef(new THREE.Quaternion());
	const hiddenMeshes = useMemo(() => getHiddenMeshNames(modelParts), [modelParts]);
	const nativeViewRef = useRef<NativeVroidViewHandle | null>(null);

	const touchStartPos = useRef<{ x: number; y: number } | null>(null);
	const touchStartTime = useRef<number | null>(null);

	useEffect(() => {
		restPoseRef.current = restPose;
	}, [restPose]);

	// "0" for VRM 0.x (rotateVRM0 was applied in JS), "1" for VRM 1.0
	const [vrmVersion, setVrmVersion] = useState<string>('1');

	// 1. Resolve Native URI
	useEffect(() => {
		if (useNative && modelUri) {
			const resolveUri = async () => {
				try {
					if (typeof modelUri === 'string') {
						setNativeUri(modelUri);
						return;
					}

					const asset = Asset.fromModule(modelUri);
					await asset.downloadAsync();
					setNativeUri(asset.localUri || asset.uri);
				} catch (error) {
					console.error('Failed to resolve native URI:', error);
				}
			};
			resolveUri();
		}
	}, [useNative, modelUri]);

	// 2. Ensure Model is Loaded in Store
	useEffect(() => {
		if (!modelUri) return;
		const state = useModelStore.getState();
		if (state.vrm) return;
		const hasActiveLoad = state.isLoading && state.loadProgress > 0;
		if (hasActiveLoad) return;
		console.log('📦 FiberCanvas: Triggering initial VRM load...');
		state.loadModel(modelUri).catch((error) => {
			console.error('❌ FiberCanvas: Failed to trigger initial VRM load:', error);
		});
	}, [modelUri]);

	// Native state bridge loop
	useEffect(() => {
		if (!useNative) return;

		let rafId: number;
		let lastTime = performance.now();

		const loop = (time: number) => {
			const delta = (time - lastTime) / 1000;
			lastTime = time;

			const state = useModelStore.getState();

			// Drive the store logic if it's not being driven by R3F Canvas
			state.updateAnimationFrame(delta);

			const vrm = state.vrm;
			if (vrm) {
				const exprs: Record<string, number> = {};

				// 1. Synchronize Expressions/Morphs
				const expressionManager = vrm.expressionManager;
				if (expressionManager) {
					const names = [
						'joy',
						'sad',
						'angry',
						'surprised',
						'relaxed',
						'blink',
						'aa',
						'ih',
						'ou',
						'ee',
						'oh',
					];

					names.forEach((name) => {
						const val = expressionManager.getValue(name);
						if (val != null) exprs[name] = val;
					});
					setCurrentExpressions(exprs);
				}

				// 2. Synchronize Bone Rotations (Humanoid bones)
				const rotations: Record<string, { x: number; y: number; z: number; w: number }> =
					{};
				BRIDGE_BONES.forEach((name) => {
					// Use normalized bones for animations (Mixamo/VRMA)
					const bone = vrm.humanoid?.getNormalizedBoneNode(name as any) || vrm.humanoid?.getRawBoneNode(name as any);
					if (bone) {
						const rest = restPoseRef.current?.[name];
						if (rest) {
							restQuat.current.set(rest.x, rest.y, rest.z, rest.w);
							deltaQuat.current
								.copy(restQuat.current)
								.invert()
								.multiply(bone.quaternion);
						} else {
							deltaQuat.current.copy(bone.quaternion);
						}
						rotations[name] = {
							x: deltaQuat.current.x,
							y: deltaQuat.current.y,
							z: deltaQuat.current.z,
							w: deltaQuat.current.w,
						};
					}
				});

				if (Object.keys(rotations).length > 0) {
					setCurrentRotations(rotations);
				}

				// Direct bridge dispatch optimization for continuous property streams
				if (nativeViewRef.current?.setNativeProps) {
					nativeViewRef.current.setNativeProps({
						expressions: exprs,
						boneRotations: rotations
					});
				}


				// 3. Sync VRM version so Swift applies the correct bone transform
				const version = vrm.meta?.metaVersion === '0' ? '0' : '1';
				setVrmVersion(version);

				// Sampled debug log
				// @ts-ignore
				if (!window.nativeLogCounter) window.nativeLogCounter = 0;
				// @ts-ignore
				window.nativeLogCounter++;
				// @ts-ignore
				if (window.nativeLogCounter % 120 === 0) {
					console.log(
						`[NativeBridge] Syncing ${Object.keys(exprs).length} exprs, ${Object.keys(rotations).length} bones`,
					);
				}
			}

			rafId = requestAnimationFrame(loop);
		};

		rafId = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(rafId);
	}, [useNative]);

	const handlers = {
		...events,
		onTouchStart: (e: any) => {
			// @ts-ignore
			if (events.onTouchStart) events.onTouchStart(e);
			if (Platform.OS !== 'web') {
				const touch = e.nativeEvent.touches[0];
				touchStartPos.current = { x: touch.pageX, y: touch.pageY };
				touchStartTime.current = Date.now();
			}
		},
		onTouchEnd: (e: any) => {
			// @ts-ignore
			if (events.onTouchEnd) events.onTouchEnd(e);
			if (Platform.OS !== 'web') {
				const startPos = touchStartPos.current;
				const startTime = touchStartTime.current;
				if (startPos && startTime) {
					const touch = e.nativeEvent.changedTouches[0];
					const dx = Math.abs(touch.pageX - startPos.x);
					const dy = Math.abs(touch.pageY - startPos.y);
					const dt = Date.now() - startTime;
					touchStartPos.current = null;
					touchStartTime.current = null;
				}
			}
		},
		onMouseDown: (e: any) => {
			// @ts-ignore
			if (events.onMouseDown) events.onMouseDown(e);
			if (Platform.OS === 'web') {
				touchStartPos.current = { x: e.clientX, y: e.clientY };
				touchStartTime.current = Date.now();
			}
		},
		onMouseUp: (e: any) => {
			// @ts-ignore
			if (events.onMouseUp) events.onMouseUp(e);
			if (Platform.OS === 'web') {
				const startPos = touchStartPos.current;
				const startTime = touchStartTime.current;
				if (startPos && startTime) {
					const dx = Math.abs(e.clientX - startPos.x);
					const dy = Math.abs(e.clientY - startPos.y);
					const dt = Date.now() - startTime;
					touchStartPos.current = null;
					touchStartTime.current = null;
				}
			}
		},
	};

	return (
		<View style={{ flex: 1, backgroundColor: '#6ad6f0' }}>
			<StatusBar barStyle="dark-content" />
			
			{(!useNative || Platform.OS === 'web') && (
				<View {...events} style={{ flex: 1 }}>
					<Canvas
						onCreated={({ gl, camera }) => {
						if (Platform.OS === 'ios' || Platform.OS === 'android') {
							console.log('Configuring WebGL for native mobile build');

							const _gl = gl.getContext();

							const pixelStorei = _gl.pixelStorei.bind(_gl);
							_gl.pixelStorei = function (...args) {
								const [parameter] = args;
								switch (parameter) {
									case _gl.UNPACK_FLIP_Y_WEBGL:
										return pixelStorei(...args);
								}
							};

							// Basic WebGL configuration
							gl.outputColorSpace = THREE.SRGBColorSpace;
							gl.toneMapping = THREE.ACESFilmicToneMapping;
							gl.toneMappingExposure = 1.3;

							// Shadow configuration
							gl.shadowMap.enabled = true;
							gl.shadowMap.type = THREE.PCFShadowMap;

							// Force precision
							gl.capabilities.precision = 'highp';
							gl.capabilities.logarithmicDepthBuffer = false;

							console.log('WebGL Renderer:', _gl.getParameter(_gl.RENDERER));
							console.log('WebGL Version:', _gl.getParameter(_gl.VERSION));
							console.log('WebGL Vendor:', _gl.getParameter(_gl.VENDOR));

							// Log WebGL capabilities
							console.log('Max texture size:', _gl.getParameter(_gl.MAX_TEXTURE_SIZE));
							console.log('Max vertex attributes:', _gl.getParameter(_gl.MAX_VERTEX_ATTRIBS));
							console.log('Supported extensions:', _gl.getSupportedExtensions());

							// Check for required extensions
							const requiredExtensions = ['OES_texture_float', 'OES_element_index_uint'];
							requiredExtensions.forEach(ext => {
								if (!_gl.getExtension(ext)) {
									console.warn(`Missing WebGL extension: ${ext}`);
								}
							});
						}

						// Camera positioning
						if (Platform.OS === "web") {
							camera.position.set(0, 2, 5);
						} else {
							camera.position.set(0, 1.25, 1.85);
						}

						// Set background color
						gl.setClearColor(sceneColor);
					}}
					gl={{
						antialias: Platform.OS === 'web',
						alpha: true,
						powerPreference: "high-performance",
						preserveDrawingBuffer: Platform.OS === 'web',
						...(Platform.OS !== 'web' && {
							stencil: true,
							depth: true,
							precision: 'highp',
						}),
					}}
					shadows
					camera={camera}
				>
					<Lights />
					<Suspense fallback={null}>
						{/* Only show JS Model if not using Native */}
						{!useNative && <Model />}
					</Suspense>
					<Grid />

					{/* Only use JS OrbitControls if not using Native */}
					{!useNative && (
						<OrbitControls
							target={new Vector3(0, 1.2, 0)}
							enableRotate
							enableZoom
							minZoom={Platform.OS === 'web' ? 2 : 1.2}
							maxZoom={Platform.OS === 'web' ? 12 : 8}
							// Vertical rotation limits
							minPolarAngle={Math.PI * 0.1}
							maxPolarAngle={Math.PI * 0.75}
							// Horizontal rotation limits
							minAzimuthAngle={-Math.PI * 0.5}
							maxAzimuthAngle={Math.PI * 0.5}
							// Additional settings
							enablePan={true}
							dampingFactor={0.05}
							rotateSpeed={0.5}
							zoomSpeed={0.8}
							panSpeed={1}
						/>
					)}
					</Canvas>
				</View>
			)}

			{/* 2. Native Character Layer (Overlay) */}
			{useNative && (Platform.OS === 'ios' || Platform.OS === 'android') && (
				<View style={StyleSheet.absoluteFill}>
					<NativeVroidView
						ref={nativeViewRef}
						style={StyleSheet.absoluteFill}
						modelUri={nativeUri ?? undefined}
						showModel={isModelVisible}
						expressions={currentExpressions}
						boneRotations={currentRotations}
						hiddenMeshes={hiddenMeshes}
						headTracker={settings.enableEyeLookAt}
						enableEyeLookAt={settings.enableEyeLookAt}
						minZoom={1.2}
						maxZoom={4.0}
						initialZoom={3.5}
						minPolarAngle={Math.PI * 0.1}
						maxPolarAngle={Math.PI * 0.75}
						minAzimuthAngle={-Math.PI * 0.5}
						maxAzimuthAngle={Math.PI * 0.5}
						vrmVersion={vrmVersion}
					/>
				</View>
			)}

			{/* UI Toggles Layer */}
			<View style={styles.topToolbar} pointerEvents="box-none">
				{(Platform.OS === 'ios') && (
					<TouchableOpacity
						style={[styles.rendererToggle, useNative && styles.rendererToggleActive]}
						onPress={() => setUseNative(!useNative)}
					>
						<MaterialCommunityIcons
							name={useNative ? 'apple-ios' : 'apple'}
							size={20}
							color={useNative ? '#fff' : '#2d3748'}
						/>
						<Text style={[styles.toggleText, useNative && styles.toggleTextActive]}>
							{useNative ? 'Native' : 'JS'}
						</Text>
					</TouchableOpacity>
				)}
				{(Platform.OS === 'android') && (
					<TouchableOpacity
						style={[styles.rendererToggle, useNative && styles.rendererToggleActive]}
						onPress={() => setUseNative(!useNative)}
					>
						<MaterialCommunityIcons
							name={useNative ? 'android' : 'android'}
							size={20}
							color={useNative ? '#fff' : '#2d3748'}
						/>
						<Text style={[styles.toggleText, useNative && styles.toggleTextActive]}>
							{useNative ? 'Native' : 'JS'}
						</Text>
					</TouchableOpacity>
				)}
			</View>

			{/* Loader overlay */}
			{isLoading && (
				<View style={styles.loadingContainer} pointerEvents="none">
					<LottieView
						source={require('../../assets/lotties/loading.json')}
						autoPlay
						loop
						style={styles.loading}
					/>
				</View>
			)}

			<MenusContainer onPreviewPress={onPreviewPress} />
			<ModelSelector />
		</View>
	);
};

const styles = StyleSheet.create({
	loadingContainer: {
		...StyleSheet.absoluteFillObject,
		justifyContent: 'center',
		alignItems: 'center',
	},
	loading: {
		width: 75,
		height: 75,
	},
	topToolbar: {
		position: 'absolute',
		justifyContent: 'center',
		alignItems: 'center',
		left: '25%',
		top: 58,
		right: '25%',
		flexDirection: 'row',
		zIndex: 1000,
	},
	rendererToggle: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: 'rgba(255,255,255,0.9)',
		paddingVertical: 6,
		paddingHorizontal: 12,
		borderRadius: 20,
		gap: 6,
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2
		},
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	rendererToggleActive: {
		backgroundColor: '#4299e1',
	},
	toggleText: {
		fontSize: 12,
		fontWeight: '600',
		color: '#2d3748',
	},
	toggleTextActive: {
		color: '#fff',
	},
});

