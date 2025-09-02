# VroidViewer
A React Native demo of [three-vrm](https://github.com/pixiv/three-vrm).

### Platforms
✅ Web  
➖ Android - VRM0 doesn't render properly. Some VRM1 models render black. 
➖ iOS - Not tested.

## Known Issues
- VRM0 models only render some of the head on mobile.
- GLTFLoader progress callback is ignored on mobile.

# To-Do
- Add [WebGPU example](https://github.com/wcandillon/react-native-webgpu)

## Dev Setup
1. Clone this repo
2. Run `bun i` in main directory
3. Run `bun run start` to start dev server

### Animations
If you want to test the extra animations in the demo:  

1. Download the [motion pack](https://vroid.booth.pm/items/5512385).
2. Extract and place the VRMA files in the assets/animations/motion_pack folder.

This works with Expo Go, so building isn't required.