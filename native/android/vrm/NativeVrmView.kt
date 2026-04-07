package com.dedicatus.VroidViewer.vrm

import android.content.Context
import android.graphics.Color
import android.util.AttributeSet
import android.util.Log
import android.view.Choreographer
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.TextureView
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.android.filament.*
import com.google.android.filament.android.DisplayHelper
import com.google.android.filament.android.UiHelper
import com.google.android.filament.gltfio.*
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.*

private const val TAG = "NativeVrmView"

internal data class VisemeBindSpec(
    val morphIndex: Int,
    val weight: Float
)

internal data class MToonMaterial(
    val name: String,
    val baseColor: FloatArray? = null,
    val shadeColor: FloatArray? = null,
    val shadingShift: Float = 0f,
    val shadingToony: Float = 0f,
    val transparentWithZWrite: Boolean = false,
    val renderQueueOffset: Int = 0,
    val doubleSided: Boolean = false,
    val alphaMode: String = "OPAQUE",
    val alphaCutoff: Float? = null
)

internal data class VRM0MaterialConfig(
    val name: String,
    val shader: String,
    val floatProps: Map<String, Float> = emptyMap(),
    val vectorProps: Map<String, FloatArray> = emptyMap(),
    val keywordMap: Map<String, Boolean> = emptyMap(),
    val tagMap: Map<String, String> = emptyMap()
)

internal data class LookAtRangeMap(
    val inputMax: Float,
    val outputScale: Float
) {
    fun map(value: Float): Float {
        if (inputMax <= 0f) return 0f
        val t = (value / inputMax).coerceIn(0f, 1f)
        return outputScale * t
    }
}

internal data class LookAtConfig(
    val type: String = "BONE", // "BONE" or "EXPRESSION"
    val horizInner: LookAtRangeMap = LookAtRangeMap(90f, 10f),
    val horizOuter: LookAtRangeMap = LookAtRangeMap(90f, 10f),
    val vertDown: LookAtRangeMap = LookAtRangeMap(90f, 10f),
    val vertUp: LookAtRangeMap = LookAtRangeMap(90f, 10f)
)

class NativeVrmView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : FrameLayout(context, attrs) {

    internal val textureView = TextureView(context)
    internal val engine: Engine by lazy {
        initFilament()
        Engine.create()
    }
    internal val uiHelper = UiHelper(UiHelper.ContextErrorPolicy.DONT_CHECK)
    internal val renderer by lazy { engine.createRenderer() }
    internal val scene: Scene by lazy { engine.createScene() }
    internal val view: com.google.android.filament.View by lazy { engine.createView() }
    internal val camera: Camera by lazy { engine.createCamera(EntityManager.get().create()) }
    internal val displayHelper = DisplayHelper(context)
    internal val materialProvider by lazy { UbershaderProvider(engine) }
    internal val assetLoader by lazy { AssetLoader(engine, materialProvider, EntityManager.get()) }
    internal val resourceLoader by lazy { ResourceLoader(engine, true) }
    internal var swapChain: SwapChain? = null
    internal var lightEntity: Int = 0
    internal var asset: FilamentAsset? = null
    internal var instance: FilamentInstance? = null

    internal val transformManager: TransformManager get() = engine.transformManager
    internal val renderableManager: RenderableManager get() = engine.renderableManager

    internal var currentModelUri: String? = null
    internal var vrmVersion: String = "1"
    internal var vrmMetadata: JSONObject? = null
    internal var pendingExpressions: ReadableMap? = null
    internal var pendingBoneRotations: ReadableMap? = null
    internal var hiddenMeshNames: Set<String> = emptySet()
    internal var showModel: Boolean = false
    
    @Volatile internal var nativeLipSyncEnabled: Boolean = false
    internal val renderableNameIndex: MutableMap<String, MutableSet<Int>> = mutableMapOf()
    internal val hiddenRenderables: MutableSet<Int> = mutableSetOf()
    internal var springBones: NativeVrmSpringBones? = null
    internal val mtoonMaterialsByName: MutableMap<String, MToonMaterial> = mutableMapOf()
    internal val vrm0MaterialsByName: MutableMap<String, VRM0MaterialConfig> = mutableMapOf()
    
    // Audio / Lip Sync state
    internal var audioTrack: android.media.AudioTrack? = null
    internal var smoothedRms = 0f
    internal var currentVisemeValue = 0f
    internal val noiseFloor = 0.004f
    internal val visemeSmoothing = 0.55f
    internal val visemeGain = 1.75f
    
    internal val materialLoader by lazy { MaterialLoader(engine, materialProvider) }

    // Orbit camera state
    internal var orbitTarget = floatArrayOf(0f, 1f, 0f)
    internal var currentDistance = 2.5f
    internal var polarAngle = (PI * 0.38).toFloat()
    internal var azimuthAngle = 0.0f
    internal var targetDistance = currentDistance
    internal var targetPolarAngle = polarAngle
    internal var targetAzimuthAngle = azimuthAngle
    internal val dampingFactor = 15.0f
    internal var lastFrameTimeNanos: Long = 0

    internal var minZoom = 1.0f
    internal var maxZoom = 6.0f
    internal var initialZoom: Float? = null
    internal var minPolarAngle = (PI * 0.1).toFloat()
    internal var maxPolarAngle = (PI * 0.75).toFloat()
    internal var minAzimuthAngle = (-PI * 0.5).toFloat()
    internal var maxAzimuthAngle = (PI * 0.5).toFloat()

    internal var lookAtYawDeg: Float = 0f
    internal var lookAtPitchDeg: Float = 0f
    internal var lookAtInitialized: Boolean = false
    internal var lookAtConfig: LookAtConfig? = null
    internal var lookAtEnabled: Boolean = false
    internal var headTracker: Boolean = false
    internal var enableEyeLookAt: Boolean = false
    internal var lastPanPos = android.graphics.PointF()

    internal val boneEntities: MutableMap<String, Int> = mutableMapOf()
    internal val vrmBoneNodeNames: MutableMap<String, String> = mutableMapOf()
    internal val vrmBoneEntityOverrides: MutableMap<String, Int> = mutableMapOf()
    internal val restTransforms: MutableMap<Int, FloatArray> = mutableMapOf()
    internal var renderableEntities: IntArray = intArrayOf()
    internal var morphTargetNamesByRenderable: List<List<String>> = emptyList()
    internal var morphWeightsByRenderable: MutableList<FloatArray> = mutableListOf()

    private val gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onDown(e: MotionEvent): Boolean = true
        override fun onScroll(e1: MotionEvent?, e2: MotionEvent, distanceX: Float, distanceY: Float): Boolean {
            if (e2.pointerCount > 1) return false
            val rotateSpeed = 0.007f
            targetAzimuthAngle = clampedAzimuth(targetAzimuthAngle - distanceX * rotateSpeed)
            targetPolarAngle = clampedPolar(targetPolarAngle - distanceY * rotateSpeed)
            return true
        }
    })

    private val scaleGestureDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(detector: ScaleGestureDetector): Boolean {
            targetDistance = clampedDistance(targetDistance / detector.scaleFactor)
            return true
        }
    })

    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            val deltaTimeNanos = if (lastFrameTimeNanos == 0L) 0L else frameTimeNanos - lastFrameTimeNanos
            lastFrameTimeNanos = frameTimeNanos
            val dt = if (deltaTimeNanos > 0) deltaTimeNanos / 1_000_000_000f else 1f / 60f
            
            updateCameraWithDamping(dt)
            renderFrame(frameTimeNanos)
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    init {
        setBackgroundColor(Color.TRANSPARENT)
        textureView.isOpaque = false
        uiHelper.setOpaque(false)
        uiHelper.setMediaOverlay(true)
        uiHelper.setRenderCallback(object : UiHelper.RendererCallback {
            override fun onNativeWindowChanged(surface: android.view.Surface) {
                swapChain?.let { engine.destroySwapChain(it) }
                swapChain = engine.createSwapChain(surface)
                displayHelper.attach(renderer, textureView.display)
            }
            override fun onDetachedFromSurface() {
                displayHelper.detach()
                swapChain?.let {
                    engine.destroySwapChain(it)
                    engine.flushAndWait()
                    swapChain = null
                }
            }
            override fun onResized(width: Int, height: Int) {
                view.viewport = Viewport(0, 0, width, height)
                updateCameraProjection(width, height)
            }
        })
        uiHelper.attachTo(textureView)
        addView(textureView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        view.scene = scene
        view.camera = camera
        view.blendMode = com.google.android.filament.View.BlendMode.TRANSLUCENT
        camera.setExposure(16.0f, 0.008f, 100.0f)
        enableShadowingOnView()

        renderer.setClearOptions(Renderer.ClearOptions().apply {
            clear = true
            discard = true
            clearColor = floatArrayOf(0f, 0f, 0f, 0f)
        })

        scene.skybox = null
        setupLights()

        setOnTouchListener { _, event ->
            scaleGestureDetector.onTouchEvent(event)
            gestureDetector.onTouchEvent(event)
            true
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        updateCameraProjection(textureView.width, textureView.height)
        Choreographer.getInstance().postFrameCallback(frameCallback)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        Choreographer.getInstance().removeFrameCallback(frameCallback)
        destroyModel()
        uiHelper.detach()
    }

    internal fun setupLights() {
        if (lightEntity != 0) return
        lightEntity = EntityManager.get().create()
        val rgb = Colors.cct(6500.0f)
        LightManager.Builder(LightManager.Type.DIRECTIONAL)
            .color(rgb[0], rgb[1], rgb[2])
            .intensity(100000.0f)
            .direction(0.0f, -1.0f, -0.3f)
            .castShadows(true)
            .build(engine, lightEntity)
        scene.addEntity(lightEntity)

        val fillLightEntity = EntityManager.get().create()
        LightManager.Builder(LightManager.Type.DIRECTIONAL)
            .color(rgb[0], rgb[1], rgb[2])
            .intensity(15000.0f)
            .direction(0.4f, -0.9f, 0.5f)
            .castShadows(false)
            .build(engine, fillLightEntity)
        scene.addEntity(fillLightEntity)
        
        val sh = FloatArray(27) { 0.3f }
        val indirectLight = com.google.android.filament.IndirectLight.Builder()
            .irradiance(3, sh)
            .intensity(30000.0f)
            .build(engine)
        scene.indirectLight = indirectLight
    }

    internal fun destroyModel() {
        asset?.let { loaded ->
            scene.removeEntities(loaded.entities)
            assetLoader.destroyAsset(loaded)
        }
        asset = null
        instance = null
        renderableEntities = intArrayOf()
        morphTargetNamesByRenderable = emptyList()
        morphWeightsByRenderable.clear()
        boneEntities.clear()
        vrmBoneEntityOverrides.clear()
        restTransforms.clear()
        renderableNameIndex.clear()
        hiddenRenderables.clear()
        springBones = null
        lastFrameTimeNanos = 0
    }

    internal fun renderFrame(frameTimeNanos: Long) {
        if (!uiHelper.isReadyToRender) return
        val activeSwapChain = swapChain ?: return
        
        applyNativeLipSyncFrame()

        if (renderer.beginFrame(activeSwapChain, frameTimeNanos)) {
            renderer.render(view)
            renderer.endFrame()
        }
    }

    internal fun applyNativeLipSyncFrame() {
        if (!nativeLipSyncEnabled) return
        val currentRms = smoothedRms
        val targetVisemeWeight = if (currentRms > noiseFloor) {
            ((currentRms - noiseFloor) * visemeGain).coerceIn(0f, 1f)
        } else 0f
        
        currentVisemeValue += (targetVisemeWeight - currentVisemeValue) * visemeSmoothing
        val weight = currentVisemeValue
        val visemePatterns = listOf("aa", "fcl_mth_a", "mth_a", "mouth_a", "vowel_a", "jawOpen", "viseme_aa", "vowelA")
        
        for (ri in renderableEntities.indices) {
            val entity = renderableEntities[ri]
            val targets = morphTargetNamesByRenderable[ri]
            val weights = morphWeightsByRenderable[ri]
            var changed = false
            for (ti in targets.indices) {
                if (visemePatterns.any { targets[ti].contains(it, ignoreCase = true) }) {
                    weights[ti] = weight
                    changed = true
                }
            }
            if (changed) {
                renderableManager.setMorphWeights(renderableManager.getInstance(entity), weights, 0)
            }
        }
    }

    internal fun cacheEntities() {
        val model = asset ?: return
        boneEntities.clear()
        vrmBoneEntityOverrides.clear()
        restTransforms.clear()
        renderableEntities = model.renderableEntities
        renderableNameIndex.clear()

        val entities = model.entities
        for (entity in entities) {
            val name = model.getName(entity)?.lowercase()
            if (!name.isNullOrBlank()) {
                boneEntities[name] = entity
            }
            if (transformManager.hasComponent(entity)) {
                val instance = transformManager.getInstance(entity)
                val matrix = FloatArray(16)
                transformManager.getTransform(instance, matrix)
                restTransforms[entity] = matrix
            }
        }

        for ((boneName, nodeName) in vrmBoneNodeNames) {
            boneEntities[nodeName]?.let { vrmBoneEntityOverrides[boneName] = it }
        }

        morphTargetNamesByRenderable = renderableEntities.map { entity ->
            model.getMorphTargetNames(entity)?.mapNotNull { it?.lowercase() } ?: emptyList()
        }
        morphWeightsByRenderable = morphTargetNamesByRenderable.map { FloatArray(it.size) }.toMutableList()

        for (entity in renderableEntities) {
            val entityName = wardrobeKey(model.getName(entity))
            if (entityName.isNotBlank()) {
                renderableNameIndex.getOrPut(entityName) { mutableSetOf() }.add(entity)
            }
        }
        enableShadowsForRenderables()
        applyHiddenMeshes()
        fireModelLoadedEvent()
    }

    private fun fireModelLoadedEvent() {
        val event = Arguments.createMap()
        event.putString("status", "ready")
        val reactContext = context as? ReactContext ?: return
        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
            id,
            "onModelLoaded",
            event
        )
    }

    fun setModelUri(uriString: String?) {
        if (uriString.isNullOrBlank() || uriString == currentModelUri) return
        currentModelUri = uriString
        loadModel(uriString)
    }

    fun setExpressions(value: ReadableMap?) {
        pendingExpressions = value
        applyExpressions()
    }

    fun setShowModel(value: Boolean) {
        if (showModel == value) return
        showModel = value
        applyModelVisibility()
    }

    fun setBoneRotations(value: ReadableMap?) {
        pendingBoneRotations = value
        applyBoneRotations()
    }

    fun setHiddenMeshes(value: ReadableArray?) {
        val result = mutableSetOf<String>()
        if (value != null) {
            for (i in 0 until value.size()) {
                val entry = wardrobeKey(value.getString(i))
                if (entry.isNotBlank()) result.add(entry)
            }
        }
        hiddenMeshNames = result
        applyHiddenMeshes()
    }

    fun setVrmVersion(value: String?) {
        if (value.isNullOrBlank()) return
        val changed = vrmVersion != value
        vrmVersion = value
        if (changed && asset != null) {
            updateModelOrientation()
            applyBoneRotations()
        }
    }

    fun setMinZoom(value: Float) { minZoom = value; updateCamera() }
    fun setMaxZoom(value: Float) { maxZoom = value; updateCamera() }
    fun setInitialZoom(value: Float) { initialZoom = value; currentDistance = clampedDistance(value); targetDistance = currentDistance; updateCamera() }
    fun setMinPolarAngle(value: Float) { minPolarAngle = value; updateCamera() }
    fun setMaxPolarAngle(value: Float) { maxPolarAngle = value; updateCamera() }
    fun setMinAzimuthAngle(value: Float) { minAzimuthAngle = value; updateCamera() }
    fun setMaxAzimuthAngle(value: Float) { maxAzimuthAngle = value; updateCamera() }
    fun setLookAtEnabled(value: Boolean) { lookAtEnabled = value }
    fun setHeadTracker(value: Boolean) { headTracker = value }
    fun setEnableEyeLookAt(value: Boolean) { enableEyeLookAt = value }

    internal fun applyModelVisibility() {
        if (renderableEntities.isEmpty()) return
        val visibleMask = if (showModel) 0xFF else 0x00
        for (entity in renderableEntities) {
            if (!renderableManager.hasComponent(entity)) continue
            val instance = renderableManager.getInstance(entity)
            renderableManager.setLayerMask(instance, 0xFF, visibleMask)
        }
    }
    
    internal fun wardrobeKey(value: String?): String {
        if (value.isNullOrBlank()) return ""
        val lowered = value.lowercase()
        val sb = StringBuilder(lowered.length)
        for (ch in lowered) {
            if (ch.isLetterOrDigit()) sb.append(ch)
        }
        return sb.toString()
    }



    internal fun smoothstep(edge0: Float, edge1: Float, value: Float): Float {
        if (edge0 == edge1) return if (value < edge0) 0f else 1f
        val t = ((value - edge0) / (edge1 - edge0)).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }

    inner class MaterialLoader(val engine: Engine, internal val provider: UbershaderProvider) {
        fun createColorInstance(color: dev.romainguy.kotlin.math.Float4, metallic: Float, roughness: Float, reflectance: Float, emissive: Float = 0.0f): MaterialInstance? {
            val key = MaterialProvider.MaterialKey()
            val material = provider.getMaterial(key, intArrayOf(), null as String?)
            val instance = material?.createInstance() ?: return null
            setFloat4IfPresent(instance, "baseColorFactor", color.x, color.y, color.z, color.w)
            setFloat4IfPresent(instance, "baseColor", color.x, color.y, color.z, color.w)
            setFloat4IfPresent(instance, "color", color.x, color.y, color.z, color.w)
            setFloatIfPresent(instance, "metallicFactor", metallic)
            setFloatIfPresent(instance, "metallic", metallic)
            setFloatIfPresent(instance, "roughnessFactor", roughness)
            setFloatIfPresent(instance, "roughness", roughness)
            setFloatIfPresent(instance, "reflectance", reflectance)
            if (emissive > 0.0f) {
                try {
                    instance.setParameter("emissiveFactor", color.x * emissive, color.y * emissive, color.z * emissive)
                } catch (t: Throwable) {
                    setFloat4IfPresent(instance, "emissiveFactor", color.x * emissive, color.y * emissive, color.z * emissive, 1.0f)
                }
            }
            return instance
        }
        fun destroyMaterialInstance(instance: MaterialInstance) { engine.destroyMaterialInstance(instance) }
    }

    companion object {
        private var isFilamentInitialized = false
        fun initFilament() {
            if (!isFilamentInitialized) {
                Filament.init()
                Gltfio.init()
                isFilamentInitialized = true
            }
        }
    }

    internal fun setFloatIfPresent(materialInstance: MaterialInstance, name: String, value: Float): Boolean {
        return try {
            if (!materialInstance.material.hasParameter(name)) return false
            materialInstance.setParameter(name, value)
            true
        } catch (t: Throwable) { false }
    }

    internal fun setFloat4IfPresent(materialInstance: MaterialInstance, name: String, x: Float, y: Float, z: Float, w: Float): Boolean {
        return try {
            if (!materialInstance.material.hasParameter(name)) return false
            materialInstance.setParameter(name, x, y, z, w)
            true
        } catch (t: Throwable) { false }
    }

    private fun enableShadowingOnView() {
        try {
            val method = view.javaClass.getMethod("setShadowingEnabled", Boolean::class.javaPrimitiveType)
            method.invoke(view, true)
        } catch (t: Throwable) { }
    }

    internal fun enableShadowsForRenderables() {
        for (entity in renderableEntities) {
            if (!renderableManager.hasComponent(entity)) continue
            val instance = renderableManager.getInstance(entity)
            setRenderableShadowFlag("setCastShadows", instance, true)
            setRenderableShadowFlag("setReceiveShadows", instance, true)
        }
    }

    private fun setRenderableShadowFlag(methodName: String, instance: Int, enabled: Boolean) {
        try {
            val method = renderableManager.javaClass.getMethod(methodName, Int::class.javaPrimitiveType, Boolean::class.javaPrimitiveType)
            method.invoke(renderableManager, instance, enabled)
        } catch (t: Throwable) { }
    }
}
