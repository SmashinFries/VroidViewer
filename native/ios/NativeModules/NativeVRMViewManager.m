#import <React/RCTViewManager.h>
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeVRMViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(modelUri, NSString)
RCT_EXPORT_VIEW_PROPERTY(showModel, BOOL)
RCT_EXPORT_VIEW_PROPERTY(expressions, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(boneRotations, NSDictionary)

// VRM version ("0" = VRM 0.x, "1" = VRM 1.0)
RCT_EXPORT_VIEW_PROPERTY(vrmVersion, NSString)

// Look-at controls
RCT_EXPORT_VIEW_PROPERTY(lookAtEnabled, BOOL)
RCT_EXPORT_VIEW_PROPERTY(headTracker, BOOL)
RCT_EXPORT_VIEW_PROPERTY(enableEyeLookAt, BOOL)

// Camera zoom
RCT_EXPORT_VIEW_PROPERTY(minZoom, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(maxZoom, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(initialZoom, CGFloat)

// Camera orientation limits (radians)
RCT_EXPORT_VIEW_PROPERTY(minPolarAngle, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(maxPolarAngle, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(minAzimuthAngle, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(maxAzimuthAngle, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(nativeLipSyncEnabled, BOOL)

// View commands (called via UIManager.dispatchViewManagerCommand)
RCT_EXTERN_METHOD(playAudio:(nonnull NSNumber *)node assetName:(NSString *)assetName)

@end
