import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { useGLTF, SpotLight } from '@react-three/drei/native';
import { useLoader, Canvas, useThree } from '@react-three/fiber/native';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Object3D, Vector3 } from 'three';
import { GLTF, GLTFLoader } from 'three-stdlib';
import useControls from 'r3f-native-orbitcontrols';
import { ActivityIndicator, View } from 'react-native';

const useAvatar = () => {
    const [modelUrl, setModelUrl] = useState<string>(
        'https://github.com/SmashinFries/rn-vrm-viewer/raw/master/assets/vrm/default.vrm',
    );
    const [gltf, setGltf] = useState<GLTF>();
    const [loading, setLoading] = useState(true);

    const avatar = useRef<VRM>();
    const loader = new GLTFLoader();
    loader.crossOrigin = 'anonymous';
    loader.register((parser) => {
        return new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true });
    });

    const updateLoading = (state: boolean) => {
        setLoading(state);
    };

    const updateGLTF = (gltf: GLTF) => {
        setGltf(gltf);
    };

    const changeModelUrl = (url: string) => {
        setModelUrl(url);
    };

    return { modelUrl, loader, gltf, updateGLTF, avatar, loading, updateLoading, changeModelUrl };
};

const Avatar = ({ OrbitControls }: { OrbitControls: React.JSX.Element }) => {
    const { scene, camera } = useThree();
    // https://github.com/SmashinFries/rn-vrm-viewer/raw/master/assets/vrm/default2.vrm
    // https://github.com/SmashinFries/rn-vrm-viewer/raw/master/assets/vrm/default.vrm

    const [gltf, setGltf] = useState<GLTF>();
    const [loading, setLoading] = useState(true);
    const avatar = useRef<VRM>();
    const loader = new GLTFLoader();
    loader.crossOrigin = 'anonymous';

    const loadVRM = () => {
        loader.load(
            'https://github.com/SmashinFries/rn-vrm-viewer/raw/master/assets/vrm/default.vrm',
            (gltf) => {
                setGltf(gltf);
                const vrm = gltf.userData.vrm as VRM;
                avatar.current = vrm;
                if (vrm.lookAt) {
                    console.log('Set lookAt to camera');
                    vrm.lookAt.target = camera;
                }
                console.log('VRM:', vrm?.meta ?? 'None');
                VRMUtils.deepDispose(vrm.scene);
                VRMUtils.removeUnnecessaryJoints(gltf.scene);

                VRMUtils.rotateVRM0(vrm);

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

                setLoading(false);
            },
            (progress) => {
                console.log((progress.loaded / progress.total) * 100 + '%');
            },
            (error) => {},
        );
    };

    useEffect(() => {
        loadVRM();
    }, [scene, camera]);

    return gltf && !loading ? (
        <>
            {OrbitControls}
            <primitive castShadow receiveShadow position={[0, 0, 0]} object={gltf.scene} />
        </>
    ) : null;
};

const Avatar2 = ({
    OrbitControls,
    loader,
    modelUrl,
    avatar,
    gltf,
    updateLoading,
    updateGLTF,
}: {
    OrbitControls: React.JSX.Element;
    loader: GLTFLoader;
    gltf: GLTF | undefined;
    modelUrl: string;
    avatar: React.MutableRefObject<VRM | undefined>;
    updateLoading: (state: boolean) => void;
    updateGLTF: (gltf: GLTF) => void;
}) => {
    const { scene, camera } = useThree();
    // https://github.com/SmashinFries/rn-vrm-viewer/raw/master/assets/vrm/default2.vrm
    // https://github.com/SmashinFries/rn-vrm-viewer/raw/master/assets/vrm/default.vrm

    const loadVRM = () => {
        loader.load(
            modelUrl,
            (gltf) => {
                updateGLTF(gltf);
                const vrm = gltf.userData.vrm as VRM;
                avatar.current = vrm;
                if (vrm.lookAt) {
                    console.log('Set lookAt to camera');
                    vrm.lookAt.target = camera;
                }
                console.log('VRM:', vrm?.meta ?? 'None');
                VRMUtils.deepDispose(vrm.scene);
                VRMUtils.removeUnnecessaryJoints(gltf.scene);

                VRMUtils.rotateVRM0(vrm);

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

                updateLoading(false);
            },
            (progress) => {
                console.log((progress.loaded / progress.total) * 100 + '%');
            },
            (error) => {},
        );
    };

    useEffect(() => {
        loadVRM();
    }, [scene, camera]);

    return gltf ? (
        <>
            {OrbitControls}
            <primitive castShadow receiveShadow position={[0, 0, 0]} object={gltf.scene} />
        </>
    ) : null;
};

export const Test2 = () => {
    const { avatar, modelUrl, loader, gltf, loading, updateLoading, updateGLTF } = useAvatar();
    const [OrbitControls, events] = useControls();
    return (
        <View style={{ flex: 1 }} {...events}>
            <Canvas
                camera={{ position: [0, 1.3, 0.6] }}
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
                <directionalLight position={[1.0, 1.0, 1.0]} />
                <spotLight position={[0, 2, -1]} intensity={0.4} />
                <ambientLight intensity={0.65} />
                <spotLight position={[0, 2, -1]} intensity={0.4} />
                <ambientLight intensity={0.65} />
                <Suspense fallback={null}>
                    {/* <Avatar OrbitControls={<OrbitControls enablePan={false} target={new Vector3(0, 1.3, 0)} />} /> */}
                    <Avatar2
                        OrbitControls={
                            <OrbitControls enablePan={false} target={new Vector3(0, 1.3, 0)} />
                        }
                        loader={loader}
                        modelUrl={modelUrl}
                        avatar={avatar}
                        gltf={gltf}
                        updateLoading={updateLoading}
                        updateGLTF={updateGLTF}
                    />
                </Suspense>
            </Canvas>
            {loading && (
                <View
                    style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <ActivityIndicator size="large" color="#0000ff" />
                </View>
            )}
        </View>
    );
};
