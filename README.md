# VroidViewer
A React Native demo of [three-vrm](https://github.com/pixiv/three-vrm).

### Platforms
✅ Web  
✅ Android (native renderer via Filament + gltfio, Android 12+)
✅ iOS (native renderer via VRMKit + RealityKit, iOS 18+)

### Credits
- VRMKit by @tattn: https://github.com/tattn/VRMKit

### Why VRMKit
VRMKit provides a native loader and renderer for VRM on Apple platforms. We use it to render on iOS with RealityKit while keeping the Three.js pipeline for web and as the source of animation data.

Current VRMKit version: **0.7.1** (Swift Package Manager).

## How iOS Rendering Works
The native renderer lives in:
- `ios/NativeModules/NativeVRMView.swift`
- `ios/NativeModules/NativeVRMViewManager.swift`
- `ios/NativeModules/NativeVRMViewManager.m`

### Model Loading Flow
1. **VRM 0.x**
    - Load via `VRMLoader().load(withData:)`.
    - Build a `VRMEntity` with `VRMEntityLoader`.

2. **VRM 1.x** (temporary shim)
    - VRMKit 0.7.1 lacks a full VRM 1.x RealityKit loader.
    - We inject a minimal **VRM 0.x extension** into the GLB JSON and map:
        - `VRMC_vrm.humanoid` → `VRM.humanoid.humanBones`
        - `VRMC_vrm.expressions` → `VRM.blendShapeMaster`
        - `KHR_materials_unlit` → minimal `VRM.materialProperties` (for proper unlit hair/materials)
    - We also patch missing optional VRM 1.x fields (e.g. `firstPerson.meshAnnotations`, `expressions.preset.*`, spring bone joint fields) to prevent decoding failures.

### Orientation Rules
- VRM 0.x models are rotated `180°` on Y to match the JS pipeline (`VRMUtils.rotateVRM0`).
- VRM 1.x models are not rotated.

## How Android Rendering Works
The native renderer lives in:
- `android/app/src/main/java/com/dedicatus/VroidViewer/vrm/NativeVrmView.kt`
- `android/app/src/main/java/com/dedicatus/VroidViewer/vrm/NativeVrmViewManager.kt`
- `android/app/src/main/java/com/dedicatus/VroidViewer/vrm/NativeVrmPackage.kt`

### Rendering Stack
- Uses **Filament + gltfio** to load and render GLB/VRM assets.
- Renders into a transparent `TextureView` using `UiHelper` + `SwapChain`.
- A `Choreographer` callback drives the render loop.

### Model Loading + VRM Mapping
- `modelUri` supports `content://`, `file://`, and absolute paths (content URIs are copied to cache first).
- The GLB is loaded as a `FilamentAsset`, resources are resolved via `ResourceLoader`, and entities are cached.
- A humanoid bone map is parsed directly from the GLB JSON:
    - `extensions.VRM.humanoid.humanBones` (VRM 0.x)
    - `extensions.VRMC_vrm.humanoid.humanBones` (VRM 1.x)
- Rest transforms are cached so bone rotations can be applied as deltas.

### Expressions (Morph Targets)
- The `expressions` prop maps to morph targets by name (best‑effort matching).
- We set morph weights across renderables with `RenderableManager.setMorphWeights`.

### Bone Rotations
- The `boneRotations` prop contains per‑bone quaternions from JS.
- We apply deltas on top of each bone’s rest transform (local space).
- VRM 0.x mirrors X/Z to match the JS `VRMUtils.rotateVRM0` orientation.

### Camera + Controls
- Orbit‑style camera (rotate + pinch‑to‑zoom) with damping.
- Zoom and angle limits are configurable via props from `NativeVroidView`.

### Material Fixups
- Eye materials are forced double‑sided and culling is disabled to avoid clipping.

### JS Integration
- React Native wrapper: `src/components/NativeVroidView.tsx`
- Usage + prop wiring: `src/features/fiberCanvas.tsx`
- Animations still run in JS; Android receives per‑frame `expressions` + `boneRotations`.

## JS → Native Bridge (Temporary Animation Support)
VRMKit doesn’t yet support **VRMA** or **FBX** animation playback on iOS.  
To keep animation parity, we drive animation in JS and stream bone + expression data to native each frame.

### Data Flow
1. **JS animation playback**
    - We use `three-vrm` + `three-vrm-animation` in `src/store/useModelStore.ts`.
    - Animations (VRMA/FBX/Mixamo) play on the JS VRM model.

2. **Per‑frame sync loop**
    - `src/features/fiberCanvas.tsx` runs a `requestAnimationFrame` loop.
    - On each tick:
        - `useModelStore.updateAnimationFrame(delta)` advances the JS animation mixer.
        - Expression weights are read from `vrm.expressionManager`.
        - Bone quaternions are read from `vrm.humanoid.getNormalizedBoneNode(...)`.
    - Those values are passed to `<NativeVroidView />` as props:
        - `expressions`
        - `boneRotations`

3. **Native application**
    - `NativeVRMView` applies:
        - Expressions using `vrm.setBlendShape(...)`
        - Bone rotations via `vrm.humanoid.node(for:)`
    - RealityKit skinning + spring bones are updated each frame using `SceneEvents.Update`.

---

## Known Issues when using directly pixiv/three-vrm to render the models

➖ See the below issues while using pixiv/three-vrm directly on iOS and Android.

### Android
- You can see the result on an Android Emulator:
  
  <img src="./assets/images/Android_emulator.png" width="300"/>

The model is rendered correctly for **VRM1_Constraint_Twist_Sample.vrm**

- As for any other models, we have issues with the textures.
    - vrm 0.x models:

      <img src="./assets/images/Android_issue_vrm0.png" width="300"/>
    - vrm 1 models:

      <img src="./assets/images/Android_issue_vrm1.png" width="300"/>

## iOS
- As for the iOS, it was tested on a development build directly on a physical device (iPhone 11) and an iOS Simulator (iPhone 17 Pro Max):

  <img src="./assets/images/iOS_real_device.png" width="300"/>  <img src="./assets/images/iOS_simulator.png" width="300"/>

The model is also rendered correctly for **VRM1_Constraint_Twist_Sample.vrm**

- Like with Android, we have issues with the textures on any other models.
    - vrm 0.x models:

      <img src="./assets/images/iOS_issue_vrm0.png" width="300"/>
    - vrm 1 models:

      <img src="./assets/images/iOS_issue_vrm1.png" width="300"/>

- For some reasons, the max texture size on iOS Simulator are "4096", and causes the model to display only after a while or not display at all

## Dev Setup
1. Clone this repo
2. Run `bun i` in main directory
3. Run `bun run start` to start dev server

### Animations
If you want to test the extra animations in the demo:

1. Download the [motion pack](https://vroid.booth.pm/items/5512385).
2. Extract and place the VRMA files in the assets/animations/motion_pack folder.

### Mixamo Animations
If you want to test the more animations, you can:

1. Go to [Mixamo](https://www.mixamo.com/):
2. Choose an animation you like
3. Download it as FBX without skin, with 30 fps
   
   <img src="./assets/images/Mixamo.png" width="300"/>

This works with Expo Go 53, so building isn't required.

---

## IMPORTANT NOTE
The NativeVRMView component doesn't work in Expo Go as it requires a native build.

