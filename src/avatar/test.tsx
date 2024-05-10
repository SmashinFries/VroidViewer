import { VRM, VRMMeta, VRMUtils } from '@pixiv/three-vrm';
import { useEffect, useRef, useState } from 'react';
// import { useGLTF } from '@react-three/drei'
import { Asset, useAssets } from 'expo-asset';
import { Canvas } from '@react-three/fiber/native';
import { useGLTF, SpotLight, Box } from '@react-three/drei/native';
import { GLTFLoader } from 'three-stdlib';
import { Text } from 'react-native';

const useVRM = () => {
	const { current: loader } = useRef(new GLTFLoader());
	const [vrm, setVrm] = useState<VRM>();
	const [metadata, setMetadata] = useState<VRMMeta>();

	// const gltf = useGLTF(model_path ?? '')

	// useEffect(() => {
	//     if (gltf.userData.vrm) {
	//         const vrm: VRM = gltf.userData.vrm;
	//         const meta: VRMMeta = gltf.userData.vrmMeta;
	//         setMetadata(meta);
	//         setVrm(vrm);
	//     }
	// },[gltf])

	const loadVrm = async (model_uri: string) => {
		if (loader) {
			loader.load(
				model_uri,
				(gltf) => {
					const vrm: VRM = gltf.userData.vrm;
					const meta: VRMMeta = gltf.userData.vrmMeta;
					console.log(vrm ? vrm : 'No VRM');

					// calling these functions greatly improves the performance
					VRMUtils.removeUnnecessaryVertices(gltf.scene);
					VRMUtils.removeUnnecessaryJoints(gltf.scene);

					setMetadata(meta);
					setVrm(vrm);

					// // if (currentVrm) {
					// //     console.log('removing current vrm');
					// //     scene_alt.remove(currentVrm.scene);
					// //     VRMUtils.deepDispose(currentVrm.scene);
					// // }

					// // vrm.scene.rotateY(Math.PI);
					// // camera.lookAt( vrm.humanoid.humanBones.head.node.position );
					// currentVrm = vrm;
					// scene_alt.add(vrm.scene);

					// // Disable frustum culling
					// vrm.scene.traverse((obj) => {
					//     // obj.rotateY(90);
					//     obj.frustumCulled = false;
					// });

					// currentMixer = new AnimationMixer(currentVrm.scene);
					// // Load animation
					// loadAnimations();

					// VRMUtils.rotateVRM0(vrm);
					// const head = vrm.humanoid.getNormalizedBoneNode('head'); // vrmの頭を参照する
					// camera_alt.position.set(0.0, head.getWorldPosition(new Vector3()).y, 1.3); // カメラを頭が中心に来るように動かす
					// setLoading(false);
					// console.log(vrm);
					// if (lookAtTarget_alt) {
					//     vrm.lookAt.target = lookAtTarget_alt;
					// }
				},
				(xhr) => {
					console.log((xhr.loaded / xhr.total) * 100 + '% loaded');
				},
				(error) => {
					console.log('An error happened', error);
				},
			);
		} else {
			console.log('gltfLoader not loaded');
		}
	};

	return { vrm, metadata, loadVrm };
};

export const VRMViewer = () => {
	const [models] = useAssets([
		require('../../assets/vrm_samples/default.vrm'),
		// require('../../assets/vrm_samples/default2.vrm'),
	]);
	const { vrm, metadata, loadVrm } = useVRM();

	const loadModel = async (uri: string) => {
		console.log('loading vrm');
		await loadVrm(uri);
		console.log('loaded vrm');
	};

	useEffect(() => {
		if (models && models[0]) {
			if (models[0].localUri) {
				loadModel(models[0].localUri);
			}
		}
	}, [models]);

	return (
		<>
			<Text style={{ position: 'absolute', top: 0, left: 0, color: vrm ? 'green' : 'red' }}>
				{vrm ? 'VRM Loaded' : 'Not Loaded'}
			</Text>
			<Canvas>
				<SpotLight position={[0, 0, 50]} />
				{/* <pointLight position={[0, 0, 50]} /> */}
				{vrm && <primitive object={vrm.scene} scale={1} />}
				{/* <ambientLight /> */}
				{/* <pointLight position={[10, 10, 10]} /> */}
				{/* <Box position={[-0.1, 1, 1]} />
                <Box position={[1.2, 0, 0]} /> */}
			</Canvas>
		</>
	);
};
