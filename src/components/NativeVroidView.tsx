import React from 'react';
import {
    requireNativeComponent,
    ViewProps,
    Platform,
    View,
    Text,
    StyleSheet,
    UIManager,
    findNodeHandle,
    NativeModules,
} from 'react-native';

export interface NativeVRMViewProps extends ViewProps {
    modelUri?: string;
    showModel?: boolean;
    expressions?: Record<string, number>;
    boneRotations?: Record<string, { x: number; y: number; z: number; w: number }>;
    hiddenMeshes?: string[];
    headTracker?: boolean;
    enableEyeLookAt?: boolean;
    // Camera zoom
    minZoom?: number;
    maxZoom?: number;
    initialZoom?: number;
    // Camera orientation limits (in radians, matching OrbitControls)
    minPolarAngle?: number;
    maxPolarAngle?: number;
    minAzimuthAngle?: number;
    maxAzimuthAngle?: number;
    vrmVersion?: string;
    nativeLipSyncEnabled?: boolean;
}

export type NativeVroidViewHandle = {
    setNativeProps: (props: Partial<NativeVRMViewProps>) => void;
    playAudio: (assetName: string) => void;
};

const NativeVRMView =
    Platform.OS === 'ios' || Platform.OS === 'android'
        ? (() => {
              const nativeName = 'NativeVRMView';
              const hasViewConfig =
                  typeof UIManager.getViewManagerConfig === 'function'
                      ? !!UIManager.getViewManagerConfig(nativeName)
                      : // Older RN fallback
                        !!(UIManager as any)[nativeName];

              if (!hasViewConfig) return null;

              try {
                  return requireNativeComponent<NativeVRMViewProps>(nativeName);
              } catch (error) {
                  console.warn(
                      '[NativeVroidView] NativeVRMView is unavailable. Ensure the iOS/Android view manager is linked and compiled.',
                      error,
                  );
                  return null;
              }
          })()
        : null;

export const NativeVroidView = React.forwardRef<NativeVroidViewHandle, NativeVRMViewProps>(
    (props, ref) => {
        React.useImperativeHandle(ref, () => ({
            setNativeProps: (props: Partial<NativeVRMViewProps>) => {
                // If we need manual prop updates
            },
        playAudio: (assetName: string) => {
                if (!NativeVRMView) return;
                const handle = findNodeHandle(nativeRef.current);
                if (!handle) return;

                if (Platform.OS === 'ios') {
                    // On iOS, playAudio is an RCT_EXTERN_METHOD (module method), so
                    // we call it directly via NativeModules rather than UIManager dispatch.
                    if (NativeModules.NativeVRMViewManager?.playAudio) {
                        console.log('[NativeVroidView] iOS direct call: playAudio', assetName);
                        NativeModules.NativeVRMViewManager.playAudio(handle, assetName);
                    } else {
                        console.warn('[NativeVroidView] NativeVRMViewManager.playAudio not found in NativeModules');
                    }
                } else {
                    // On Android, playAudio is registered via getCommandsMap as a view command.
                    const command =
                        UIManager.getViewManagerConfig('NativeVRMView')?.Commands?.playAudio;
                    if (command !== undefined) {
                        UIManager.dispatchViewManagerCommand(handle, command, [assetName]);
                    } else {
                        console.warn('[NativeVroidView] playAudio command not found in UIManager');
                    }
                }
            },
        }));

        const nativeRef = React.useRef(null);

        if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || !NativeVRMView) {
            return (
                <View style={[styles.fallback, props.style]}>
                    <Text style={styles.text}>
                        Native VRM View is not available in this build.
                    </Text>
                </View>
            );
        }

        return <NativeVRMView {...props} ref={nativeRef} />;
    },
);

NativeVroidView.displayName = 'NativeVroidView';

const styles = StyleSheet.create({
    fallback: {
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        color: 'white',
        fontSize: 16,
    },
});
