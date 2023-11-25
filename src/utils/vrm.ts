import { ExpoWebGLRenderingContext } from 'expo-gl';
import {
    ColorRepresentation,
    CubeTextureLoader,
    DirectionalLight,
    Mesh,
    MeshLambertMaterial,
    Object3D,
    PerspectiveCamera,
    Scene,
} from 'three';
import { Asset } from 'expo-asset';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry';
import { Font } from 'three/examples/jsm/loaders/FontLoader';

export const setupLookAtTarget = (camera: PerspectiveCamera) => {
    const lookAtTarget = new Object3D();
    camera.add(lookAtTarget);
    return lookAtTarget;
};

export const setupLighting = (gl: ExpoWebGLRenderingContext, scene: Scene) => {
    const light = new DirectionalLight(0xffffff, 1.0);
    light.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(light);
    return light;
};

export const setupCamera = (gl: ExpoWebGLRenderingContext, scene: Scene) => {
    const camera = new PerspectiveCamera(
        30.0,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.1,
        20.0,
    );
    camera.position.set(0.0, 1.5, 1.3); // Third value controls distance to model (like zoom). Decrease to zoom in.
    scene.add(camera);
    return camera;
};

export const createText = (font: Font, text: string, color: ColorRepresentation = 'gold') => {
    const text3d = new TextGeometry(text, {
        font: font,
        size: 2,
        height: 1,
        curveSegments: 12,
    });
    const weirdMaterial = new MeshLambertMaterial({ color: color });
    const textMesh = new Mesh(text3d, weirdMaterial);

    textMesh.geometry.center();

    return textMesh;
};

export const setupSkybox = (scene: Scene, images: Asset[]) => {
    const materialArray = [
        images[0].localUri, //front
        images[1].localUri, //back
        images[2].localUri, //top
        images[3].localUri, //bottom
        images[4].localUri, //left
        images[5].localUri, //right
    ];
    const loader = new CubeTextureLoader();
    const texture = loader.load(materialArray);

    scene.background = texture;
};
