export const MODELS = {
	cheongsam: require('../../../assets/models/cheongsam.vrm'),
	vrm0: require('../../../assets/models/vrm0.glb'),
	vrm1: require('../../../assets/models/vrm1.glb'),
	Sonya: require('../../../assets/models/Sonya_Sinclair.vrm'),
	custom: 'custom',
} as const;

export const ANIMS = {
	idle: require('../../../assets/animations/idle_loop.vrma'),
	happy_synthesizer: require('../../../assets/animations/Happy_Synthesizer.vrma'),
} as const;

export const MIXAMO_ANIMS = {
	salute: require('../../../assets/animations/Salute.fbx'),
	hello: require('../../../assets/animations/Idle.fbx'),
} as const;

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
