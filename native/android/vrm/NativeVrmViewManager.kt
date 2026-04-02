package com.dedicatus.VroidViewer.vrm

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap

class NativeVrmViewManager : SimpleViewManager<NativeVrmView>() {
    override fun getName(): String = "NativeVRMView"

    override fun createViewInstance(reactContext: ThemedReactContext): NativeVrmView {
        return NativeVrmView(reactContext)
    }

    @ReactProp(name = "modelUri")
    fun setModelUri(view: NativeVrmView, uri: String?) {
        view.setModelUri(uri)
    }

    @ReactProp(name = "showModel", defaultBoolean = false)
    fun setShowModel(view: NativeVrmView, value: Boolean) {
        view.setShowModel(value)
    }

    @ReactProp(name = "expressions")
    fun setExpressions(view: NativeVrmView, value: ReadableMap?) {
        view.setExpressions(value)
    }

    @ReactProp(name = "boneRotations")
    fun setBoneRotations(view: NativeVrmView, value: ReadableMap?) {
        view.setBoneRotations(value)
    }

    @ReactProp(name = "hiddenMeshes")
    fun setHiddenMeshes(view: NativeVrmView, value: ReadableArray?) {
        view.setHiddenMeshes(value)
    }

    @ReactProp(name = "vrmVersion")
    fun setVrmVersion(view: NativeVrmView, value: String?) {
        view.setVrmVersion(value)
    }

    @ReactProp(name = "minZoom", defaultFloat = 1.0f)
    fun setMinZoom(view: NativeVrmView, value: Float) {
        view.setMinZoom(value)
    }

    @ReactProp(name = "maxZoom", defaultFloat = 6.0f)
    fun setMaxZoom(view: NativeVrmView, value: Float) {
        view.setMaxZoom(value)
    }

    @ReactProp(name = "initialZoom", defaultFloat = 0.0f)
    fun setInitialZoom(view: NativeVrmView, value: Float) {
        if (value > 0f) {
            view.setInitialZoom(value)
        }
    }

    @ReactProp(name = "minPolarAngle", defaultFloat = 0.0f)
    fun setMinPolarAngle(view: NativeVrmView, value: Float) {
        view.setMinPolarAngle(value)
    }

    @ReactProp(name = "maxPolarAngle", defaultFloat = 0.0f)
    fun setMaxPolarAngle(view: NativeVrmView, value: Float) {
        view.setMaxPolarAngle(value)
    }

    @ReactProp(name = "minAzimuthAngle", defaultFloat = 0.0f)
    fun setMinAzimuthAngle(view: NativeVrmView, value: Float) {
        view.setMinAzimuthAngle(value)
    }

    @ReactProp(name = "maxAzimuthAngle", defaultFloat = 0.0f)
    fun setMaxAzimuthAngle(view: NativeVrmView, value: Float) {
        view.setMaxAzimuthAngle(value)
    }
}