import { VRMCore, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin, VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import { Platform } from 'react-native';
import { AnimationMixer, PerspectiveCamera, Scene } from 'three';
import { GLTFLoader } from 'three-stdlib';
import { create } from 'zustand';
import { getVrmThumbnail } from '../utils/vrm';

export const MODELS = {
    vrm0: require('../../assets/models/vrm0.vrm'),
    vrm1: require('../../assets/models/vrm1.vrm')
};
export const ANIMS = {
    idle: require('../../assets/animations/idle_loop.vrma'),
    full_body: require('../../assets/animations/motion_pack/VRMA_01.vrma'),
    greeting: require('../../assets/animations/motion_pack/VRMA_02.vrma'),
    peace_sign: require('../../assets/animations/motion_pack/VRMA_03.vrma'),
    shoot: require('../../assets/animations/motion_pack/VRMA_04.vrma'),
    spin: require('../../assets/animations/motion_pack/VRMA_05.vrma'),
    model_pose: require('../../assets/animations/motion_pack/VRMA_06.vrma'),
    squat: require('../../assets/animations/motion_pack/VRMA_07.vrma'),
}
type ModelName = keyof typeof MODELS;
type AnimName = keyof typeof ANIMS;

type ModelSettings = {
    enableEyeLookAt: boolean;
};

export type ModelState = {
    modelName: ModelName;
    modelUri: string;
    thumbnail: string | null;
    animationName: AnimName;
    vrm: VRMCore | null;
    mixer: AnimationMixer | null;
    isLoading: boolean;
    loadProgress: number;
    settings: ModelSettings;
    camera: PerspectiveCamera;
};

export type ModelAction = {
    changeModel: (name: ModelName) => void;
    loadModel: (uri: string, scene: Scene) => Promise<void>;
    updateModelSettings: (params: Partial<ModelSettings>) => void;
    loadAnimation: (name: AnimName) => Promise<void>;
};

export const useModelStore = create<ModelState & ModelAction>()((set, get) => ({
    modelName: 'vrm1',
    modelUri: MODELS.vrm1,
    thumbnail: null,
    vrm: null,
    mixer: null,
    animationName: 'idle',
    camera: Platform.OS === 'web' ? new PerspectiveCamera(30, undefined, 0.1, 20) : new PerspectiveCamera(70, undefined, 0.1, 2000),
    isLoading: true,
    loadProgress: 0,
    settings: {
        enableEyeLookAt: true
    },
    updateModelSettings(params) {
        if (params.enableEyeLookAt) {
            get().vrm!.lookAt!.target = get().camera
        } else {
            get().vrm!.lookAt!.target = null;
        }
        set((state) => ({ ...state, settings: { ...state.settings, ...params } }))
    },
    changeModel: (name) => {
        set({ modelName: name, modelUri: MODELS[name], thumbnail: null })
    },
    loadModel: async (uri: string, scene: Scene) => {
        const currentVrm = get().vrm;
        const loader = new GLTFLoader();
        // @ts-expect-error
        loader.register((parser) => {
            // @ts-expect-error
            return new VRMLoaderPlugin(parser);
        });

        loader.load(uri, (gltfVrm) => {
            const vrm = gltfVrm.userData.vrm as VRMCore;
            // Optimization
            VRMUtils.removeUnnecessaryVertices(gltfVrm.scene);
            VRMUtils.combineSkeletons(gltfVrm.scene);
            VRMUtils.combineMorphs(vrm);

            if (vrm.meta.metaVersion === '0') {
                VRMUtils.rotateVRM0(vrm);
            }

            // Remove old VRM
            if (currentVrm) {
                console.log('Removing old model')
                scene.remove(currentVrm.scene);
                VRMUtils.deepDispose(currentVrm.scene)
            }

            const lookAtQuatProxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
            lookAtQuatProxy.name = 'lookAtQuaternionProxy';
            vrm.scene.add(lookAtQuatProxy);

            // Disable frustumCulled (from three-vrm example)
            vrm.scene.traverse((obj) => {
                obj.frustumCulled = false;
            });

            getVrmThumbnail(gltfVrm.parser, vrm.meta.metaVersion).then((thumbnail) => {
                if (thumbnail?.data.localUri) {
                    set({ thumbnail: thumbnail.data.localUri })
                }
            })

            scene.add(vrm.scene);
            set({ vrm })

            if (get().settings.enableEyeLookAt) {
                vrm!.lookAt!.target = get().camera
            }

            get().loadAnimation('idle');
        }, (event) => {
            const isSuccess = event.loaded === event.total;
            console.log((100 * (event.loaded / event.total)).toFixed(1) + '%');
            set({ isLoading: !isSuccess, loadProgress: Number((100 * (event.loaded / event.total)).toFixed(0)) })
        }, (error) => { console.log(error) })
    },
    loadAnimation: async (name) => {
        const vrm = get().vrm;
        if (!vrm) return;

        const loader = new GLTFLoader();

        // @ts-expect-error
        loader.register((parser) => {
            // @ts-expect-error
            return new VRMAnimationLoaderPlugin(parser)
        });

        // Load VRMA
        const gltfVrma = await loader.loadAsync(ANIMS[name]);
        const vrmAnim = gltfVrma.userData.vrmAnimations[0];

        // Create clip
        const clip = createVRMAnimationClip(vrmAnim, vrm);

        // Play animation
        const mixer = new AnimationMixer(vrm.scene);
        mixer.clipAction(clip).play()
        set({ mixer: mixer, animationName: name });
    },
})
);
