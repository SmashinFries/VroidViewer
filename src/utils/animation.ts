import { VRMHumanBoneName } from '@pixiv/three-vrm';
import { VRM } from '@pixiv/three-vrm/types/VRM';
import {
    AnimationClip,
    AnimationMixer,
    Quaternion,
    QuaternionKeyframeTrack,
    Vector3,
    VectorKeyframeTrack,
} from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const mixamoVRMRigMap: {
    [key: string]: VRMHumanBoneName;
} = {
    mixamorigHips: 'hips',
    mixamorigSpine: 'spine',
    mixamorigSpine1: 'chest',
    mixamorigSpine2: 'upperChest',
    mixamorigNeck: 'neck',
    mixamorigHead: 'head',
    mixamorigLeftShoulder: 'leftShoulder',
    mixamorigLeftArm: 'leftUpperArm',
    mixamorigLeftForeArm: 'leftLowerArm',
    mixamorigLeftHand: 'leftHand',
    mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
    mixamorigLeftHandThumb2: 'leftThumbProximal',
    mixamorigLeftHandThumb3: 'leftThumbDistal',
    mixamorigLeftHandIndex1: 'leftIndexProximal',
    mixamorigLeftHandIndex2: 'leftIndexIntermediate',
    mixamorigLeftHandIndex3: 'leftIndexDistal',
    mixamorigLeftHandMiddle1: 'leftMiddleProximal',
    mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
    mixamorigLeftHandMiddle3: 'leftMiddleDistal',
    mixamorigLeftHandRing1: 'leftRingProximal',
    mixamorigLeftHandRing2: 'leftRingIntermediate',
    mixamorigLeftHandRing3: 'leftRingDistal',
    mixamorigLeftHandPinky1: 'leftLittleProximal',
    mixamorigLeftHandPinky2: 'leftLittleIntermediate',
    mixamorigLeftHandPinky3: 'leftLittleDistal',
    mixamorigRightShoulder: 'rightShoulder',
    mixamorigRightArm: 'rightUpperArm',
    mixamorigRightForeArm: 'rightLowerArm',
    mixamorigRightHand: 'rightHand',
    mixamorigRightHandPinky1: 'rightLittleProximal',
    mixamorigRightHandPinky2: 'rightLittleIntermediate',
    mixamorigRightHandPinky3: 'rightLittleDistal',
    mixamorigRightHandRing1: 'rightRingProximal',
    mixamorigRightHandRing2: 'rightRingIntermediate',
    mixamorigRightHandRing3: 'rightRingDistal',
    mixamorigRightHandMiddle1: 'rightMiddleProximal',
    mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
    mixamorigRightHandMiddle3: 'rightMiddleDistal',
    mixamorigRightHandIndex1: 'rightIndexProximal',
    mixamorigRightHandIndex2: 'rightIndexIntermediate',
    mixamorigRightHandIndex3: 'rightIndexDistal',
    mixamorigRightHandThumb1: 'rightThumbMetacarpal',
    mixamorigRightHandThumb2: 'rightThumbProximal',
    mixamorigRightHandThumb3: 'rightThumbDistal',
    mixamorigLeftUpLeg: 'leftUpperLeg',
    mixamorigLeftLeg: 'leftLowerLeg',
    mixamorigLeftFoot: 'leftFoot',
    mixamorigLeftToeBase: 'leftToes',
    mixamorigRightUpLeg: 'rightUpperLeg',
    mixamorigRightLeg: 'rightLowerLeg',
    mixamorigRightFoot: 'rightFoot',
    mixamorigRightToeBase: 'rightToes',
};

export const loadMixamoAnimation = (url: string, vrm: VRM) => {
    const loader = new FBXLoader(); // A loader which loads FBX
    return loader.loadAsync(url).then((asset) => {
        if (!asset) return null;
        const clip = AnimationClip.findByName(asset.animations, 'mixamo.com'); // extract the AnimationClip

        const tracks: QuaternionKeyframeTrack[] = []; // KeyframeTracks compatible with VRM will be added here

        const restRotationInverse = new Quaternion();
        const parentRestWorldRotation = new Quaternion();
        const _quatA = new Quaternion();
        const _vec3 = new Vector3();

        // Adjust with reference to hips height.
        const motionHipsHeight = asset.getObjectByName('mixamorigHips')?.position.y ?? 0;
        const vrmHipsY = vrm.humanoid?.getNormalizedBoneNode('hips')?.getWorldPosition(_vec3).y;
        const vrmRootY = vrm.scene.getWorldPosition(_vec3).y;
        const vrmHipsHeight = Math.abs((vrmHipsY ?? 0) - vrmRootY);
        const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

        clip.tracks.forEach((track) => {
            // Convert each tracks for VRM use, and push to `tracks`
            const trackSplitted = track.name.split('.');
            const mixamoRigName = trackSplitted[0];
            const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
            const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
            const mixamoRigNode = asset.getObjectByName(mixamoRigName);

            if (vrmNodeName != null) {
                const propertyName = trackSplitted[1];

                // Store rotations of rest-pose.
                if (mixamoRigNode) {
                    mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
                    mixamoRigNode.parent?.getWorldQuaternion(parentRestWorldRotation);
                }
                if (track instanceof QuaternionKeyframeTrack) {
                    // Retarget rotation of mixamoRig to NormalizedBone.
                    for (let i = 0; i < track.values.length; i += 4) {
                        const flatQuaternion = track.values.slice(i, i + 4);

                        _quatA.fromArray(flatQuaternion);

                        // 親のレスト時ワールド回転 * トラックの回転 * レスト時ワールド回転の逆
                        _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);

                        _quatA.toArray(flatQuaternion);

                        flatQuaternion.forEach((v, index) => {
                            track.values[index + i] = v;
                        });
                    }

                    tracks.push(
                        new QuaternionKeyframeTrack(
                            `${vrmNodeName}.${propertyName}`,
                            track.times,
                            track.values.map((v, i) =>
                                vrm.meta?.metaVersion === '0' && i % 2 === 0 ? -v : v,
                            ),
                        ),
                    );
                } else if (track instanceof VectorKeyframeTrack) {
                    const value = track.values.map(
                        (v, i) =>
                            (vrm.meta?.metaVersion === '0' && i % 3 !== 1 ? -v : v) *
                            hipsPositionScale,
                    );
                    tracks.push(
                        new VectorKeyframeTrack(
                            `${vrmNodeName}.${propertyName}`,
                            track.times,
                            value,
                        ),
                    );
                }
            }
        });

        return new AnimationClip('vrmAnimation', clip.duration, tracks);
    });
};

export const loadFBX = (currentMixer: AnimationMixer, currentVrm: VRM, animation: string) => {
    // create AnimationMixer for VRM
    currentMixer = new AnimationMixer(currentVrm.scene);

    // Load animation
    loadMixamoAnimation(animation, currentVrm).then((clip) => {
        // Apply the loaded animation to mixer and play
        if (!clip) return;
        currentMixer.clipAction(clip).play();
        currentMixer.timeScale = 1;
    });
};
