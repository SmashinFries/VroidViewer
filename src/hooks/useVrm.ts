import { VRM, VRMCore, VRMHumanBoneName, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { useGLTF } from '@react-three/drei/native';
import { useRef, useState } from 'react';
import { Object3D, Object3DEventMap } from 'three';

type BonesStore = {
	head: Object3D<Object3DEventMap> | null;
	neck: Object3D<Object3DEventMap> | null;
	hips: Object3D<Object3DEventMap> | null;
	spine: Object3D<Object3DEventMap> | null;
	upperChest: Object3D<Object3DEventMap> | null;
	leftArm: Object3D<Object3DEventMap> | null;
	rightArm: Object3D<Object3DEventMap> | null;
};
//   const defaultVRM = require('../../../assets/vrm_samples/default.vrm');
export const useVrm = (default_model: string) => {
	const [modelUrl, setModelUrl] = useState<string>(default_model);
	const [vrm, setVrm] = useState<VRM | null>(null);
	const vrmRef = useRef<VRM>();
	const [bones, setBones] = useState<BonesStore | null>(null);
	// const {} = useLoader(GLTFLoader, vrm_file);
	const gltf = useGLTF(modelUrl, undefined, undefined, (loader) => {
		loader.crossOrigin = 'anonymous';
		loader.register((parser) => {
			return new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true });
		});
		loader.load(
			modelUrl,
			(gltf) => {
				const vrm = gltf.userData.vrm as VRM;
				vrmRef.current = gltf.userData.vrm as VRM;
				setVrm(vrm);
				VRMUtils.removeUnnecessaryJoints(vrm.scene);
				VRMUtils.removeUnnecessaryVertices(vrm.scene);
				VRMUtils.rotateVRM0(vrm);

				const bones: BonesStore = {
					head: vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head),
					neck: vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Neck),
					hips: vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Hips),
					spine: vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Spine),
					upperChest: vrm.humanoid.getRawBoneNode(VRMHumanBoneName.UpperChest),
					leftArm: vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm),
					rightArm: vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm),
				};
				setBones(bones);

				const expressionNames = vrm.expressionManager?.expressions.map(
					(expression) => expression.expressionName,
				);
				console.log(expressionNames);

				vrm.scene.traverse((obj) => {
					obj.frustumCulled = false;
				});

				if (vrm) {
					vrm.scene.children.forEach((mesh, i) => {
						mesh.castShadow = true;
						mesh.receiveShadow = true;
					});
				}
			},
			(error) => {
				console.log('ERROR:', error);
			},
		);
	});

	const changeModelUrl = (url: string) => setModelUrl(url);

	// useFrame(() => (gltf.scene.rotation.y += 0.01))

	return { vrmRef, vrm, gltf, bones, changeModelUrl };
	// return(<>{vrm && <primitive {...props} object={vrm.scene} />}</>);
};
