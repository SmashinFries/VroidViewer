import { VRM, VRMCore, VRMHumanBoneName, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { useGLTF } from '@react-three/drei/native';
import { PrimitiveProps, useFrame } from '@react-three/fiber/native';
import { useRef, useState } from 'react';
import { Bone, Object3D, Object3DEventMap } from 'three';

type BonesStore = {
	head: Object3D<Object3DEventMap> | null;
	neck: Object3D<Object3DEventMap> | null;
	hips: Object3D<Object3DEventMap> | null;
	spine: Object3D<Object3DEventMap> | null;
	upperChest: Object3D<Object3DEventMap> | null;
	leftArm: Object3D<Object3DEventMap> | null;
	rightArm: Object3D<Object3DEventMap> | null;
};

export const VRMAvatar = (props?: any) => {
	const defaultVRM = require('../../../assets/vrm_samples/default.vrm');
	const vrmRef = useRef<VRM>();
	const [vrm, setVrm] = useState<VRMCore | null>(null);
	const [bones, setBones] = useState<BonesStore | null>(null);
	// const {} = useLoader(GLTFLoader, vrm_file);
	const gltf = useGLTF(defaultVRM, undefined, undefined, (loader) => {
		loader.crossOrigin = 'anonymous';
		loader.register((parser) => {
			return new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true });
		});
		loader
			.loadAsync(defaultVRM, (progress) => {
				console.log((progress.loaded / progress.total) * 100 + '%');
			})
			.then(
				(gltf) => {
					const vrm = gltf.userData.vrm as VRM;
					VRMUtils.deepDispose(vrm.scene);
					VRMUtils.removeUnnecessaryJoints(gltf.scene);
					VRMUtils.removeUnnecessaryVertices(gltf.scene);
					VRMUtils.rotateVRM0(vrm);
					setVrm(vrm);

					const bones: BonesStore = {
						head: vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head),
						neck: vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Neck),
						hips: vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Hips),
						spine: vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Spine),
						upperChest: vrm.humanoid.getRawBoneNode(VRMHumanBoneName.UpperChest),
						leftArm: vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm),
						rightArm: vrm.humanoid.getNormalizedBoneNode(
							VRMHumanBoneName.RightUpperArm,
						),
					};
					setBones(bones);

					console.log('VRM:', vrm?.meta ?? 'None');

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

	// useFrame(() => (gltf.scene.rotation.y += 0.01))

	return { vrm, bones };
	// return(<>{vrm && <primitive {...props} object={vrm.scene} />}</>);
};
