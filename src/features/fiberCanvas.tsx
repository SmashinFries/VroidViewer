import { Grid } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import { View } from 'react-native';
import { Vector3 } from 'three';
import { useModelStore } from '../store/useModelStore';
import { ModelSelector } from '../components/selector';
import useControls from 'r3f-native-orbitcontrols';
import { MenusContainer } from '../components/menus';

const sceneColor = 0x6ad6f0;
// const sceneColor = 0x000000;

const Lights = () => {
	return (
		<>
			<ambientLight intensity={0.4} />
			<directionalLight position={[1, 1, 1]} intensity={1.5} />
		</>
	);
};

const Model = () => {
	const { modelUri, vrm, mixer, loadModel } = useModelStore();
	const { scene } = useThree();

	useFrame((state, delta) => {
		vrm && vrm.update(delta);
		mixer && mixer.update(delta);
	});

	useEffect(() => {
		console.log('loading model!');
		loadModel(modelUri, scene);
	}, [modelUri]);

	return null;
};

export const FiberCanvas = () => {
	const [OrbitControls, events] = useControls();
	const camera = useModelStore((state) => state.camera);
	return (
		<View style={{ flex: 1 }}>
			<View {...events} style={{ flex: 1 }}>
				<Canvas
					onCreated={({ gl, scene, camera, controls }) => {
						// This prevents the "EXGL: gl.pixelStorei() doesn't support this parameter yet!" log from spamming
						const _gl = gl.getContext();
						const pixelStorei = _gl.pixelStorei.bind(_gl);
						_gl.pixelStorei = function (...args) {
							const [parameter] = args;
							switch (parameter) {
								case _gl.UNPACK_FLIP_Y_WEBGL:
									return pixelStorei(...args);
							}
						};

						camera.position.set(0, 2, 5);

						// Set background color
						gl.setClearColor(sceneColor);
					}}
					gl={{ antialias: true }}
					shadows
					camera={camera}
				>
					<Lights />
					<Suspense fallback={null}>
						<Model />
					</Suspense>
					<Grid />
					<OrbitControls target={new Vector3(0, 1, 0)} enableRotate enableZoom />
				</Canvas>
			</View>
			<MenusContainer />
			<ModelSelector />
		</View>
	);
};
