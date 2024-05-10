import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Suspense, useEffect, useState } from 'react';
import { VRM } from '@pixiv/three-vrm';
import useControls from 'r3f-native-orbitcontrols';
import { useVrm } from './src/hooks/useVrm';
import { Canvas } from '@react-three/fiber/native';

const LoadingView = () => {
	return (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
			<ActivityIndicator size="large" color="#0000ff" />
		</View>
	);
};

type DefaultModelProps = {
	onVRMReady: (vrm: VRM) => void;
};
const DefaultModel = ({ onVRMReady }: DefaultModelProps) => {
	const defaultVRM = require('../../assets/vrm_samples/default.vrm');
	const { vrm, gltf, bones, changeModelUrl } = useVrm(defaultVRM);

	useEffect(() => {
		if (vrm) {
			// onVRMReady(vrm);
			console.log('Got VRM:', vrm?.meta);
		} else {
			console.log('No VRM :(');
		}
	}, [vrm]);

	// using vrm doesnt let the model render :(
	return <primitive castShadow receiveShadow position={[0, 0, 0]} object={gltf.scene} />;
};

export default function App() {
	const [vrmData, setVrmData] = useState<VRM | null>(null);
	const [OrbitControls, events] = useControls();
	return (
		<View style={styles.container}>
			<View style={{ flex: 1 }} {...events}>
				<View style={{ position: 'absolute', bottom: 22, left: 22 }}>
					<Text>Meta Version: {vrmData?.meta.metaVersion ?? 'N/A'}</Text>
				</View>
				<Suspense fallback={<LoadingView />}>
					<Canvas
						camera={{ position: [-1.5, 1, 5.5], fov: 45, near: 1, far: 20 }}
						gl={{ logarithmicDepthBuffer: true }}
						shadows
						onCreated={(state) => {
							const _gl = state.gl.getContext();

							const pixelStorei = _gl.pixelStorei.bind(_gl);
							_gl.pixelStorei = function (...args) {
								const [parameter] = args;

								switch (parameter) {
									// expo-gl only supports the flipY param
									case _gl.UNPACK_FLIP_Y_WEBGL:
										return pixelStorei(...args);
								}
							};
						}}
					>
						<OrbitControls />
						<ambientLight />
						<gridHelper args={[10, 10]} />
						<DefaultModel onVRMReady={(vrm) => setVrmData(vrm)} />
					</Canvas>
				</Suspense>
			</View>
			<StatusBar style="auto" />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		height: '100%',
		width: '100%',
	},
});
