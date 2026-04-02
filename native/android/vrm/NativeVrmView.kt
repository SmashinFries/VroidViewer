package com.dedicatus.VroidViewer.vrm

import android.content.Context
import android.graphics.Color
import android.util.AttributeSet
import android.view.Choreographer
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.TextureView
import android.widget.FrameLayout
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableArray
import com.google.android.filament.*
import com.google.android.filament.android.DisplayHelper
import com.google.android.filament.android.UiHelper
import com.google.android.filament.gltfio.*
import org.json.JSONObject

private const val TAG = "NativeVrmView"

class NativeVrmView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : FrameLayout(context, attrs) {

    internal val textureView = TextureView(context)
    internal val engine: Engine by lazy {
        Filament.init()
        Gltfio.init()
        Engine.create()
    }
    internal val uiHelper = UiHelper(UiHelper.ContextErrorPolicy.DONT_CHECK)
    internal val renderer = engine.createRenderer()
    internal val scene: Scene = engine.createScene()
    internal val view: View = engine.createView()
    internal val camera: Camera = engine.createCamera(EntityManager.get().create())
    internal val displayHelper = DisplayHelper(context)
    internal val materialProvider = UbershaderProvider(engine)
    internal val assetLoader = AssetLoader(engine, materialProvider, EntityManager.get())
    internal val resourceLoader = ResourceLoader(engine, true)
    internal var swapChain: SwapChain? = null
    internal var lightEntity: Int = 0
    internal var asset: FilamentAsset? = null
    internal var instance: FilamentInstance? = null

    internal val transformManager = engine.transformManager
    internal val renderableManager = engine.renderableManager

    internal var vrmMetadata: JSONObject? = null
    internal var currentModelUri: String? = null
    internal var vrmVersion: String = "1"
    internal var pendingExpressions: ReadableMap? = null
    internal var pendingBoneRotations: ReadableMap? = null
    internal var hiddenMeshNames: Set<String> = emptySet()
    internal var showModel: Boolean = false
    internal val renderableNameIndex: MutableMap<String, MutableSet<Int>> = mutableMapOf()
    internal val hiddenRenderables: MutableSet<Int> = mutableSetOf()

    internal fun wardrobeKey(value: String?): String {
        if (value.isNullOrBlank()) return ""
        val lowered = value.lowercase()
        val sb = StringBuilder(lowered.length)
        for (ch in lowered) {
            if (ch.isLetterOrDigit()) sb.append(ch)
        }
        return sb.toString()
    }

    // Orbit camera state
    internal var orbitTarget = floatArrayOf(0f, 1f, 0f)
    internal var currentDistance = 2.5f
    internal var polarAngle = (Math.PI * 0.38).toFloat()
    internal var azimuthAngle = 0.0f
    internal var targetDistance = currentDistance
    internal var targetPolarAngle = polarAngle
    internal var targetAzimuthAngle = azimuthAngle
    internal val dampingFactor = 0.05f

    internal var minZoom = 1.0f
    internal var maxZoom = 6.0f
    internal var initialZoom: Float? = null
    internal var minPolarAngle = (Math.PI * 0.1).toFloat()
    internal var maxPolarAngle = (Math.PI * 0.75).toFloat()
    internal var minAzimuthAngle = (-Math.PI * 0.5).toFloat()
    internal var maxAzimuthAngle = (Math.PI * 0.5).toFloat()

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
            val rotateSpeed = 0.005f
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
            updateCameraWithDamping()
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
        view.blendMode = View.BlendMode.TRANSLUCENT
        camera.setExposure(16.0f, 0.008f, 100.0f)

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
            .castShadows(false)
            .build(engine, lightEntity)
        scene.addEntity(lightEntity)
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
    }

    internal fun renderFrame(frameTimeNanos: Long) {
        if (!uiHelper.isReadyToRender) return
        val activeSwapChain = swapChain ?: return
        if (renderer.beginFrame(activeSwapChain, frameTimeNanos)) {
            renderer.render(view)
            renderer.endFrame()
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
        morphWeightsByRenderable = morphTargetNamesByRenderable
            .map { FloatArray(it.size) }
            .toMutableList()

        for (entity in renderableEntities) {
            val entityName = wardrobeKey(model.getName(entity))
            if (entityName.isNotBlank()) {
                renderableNameIndex.getOrPut(entityName) { mutableSetOf() }.add(entity)
            }
            if (renderableManager.hasComponent(entity)) {
                val instance = renderableManager.getInstance(entity)
                val primitiveCount = renderableManager.getPrimitiveCount(instance)
                for (i in 0 until primitiveCount) {
                    val materialInstance = renderableManager.getMaterialInstanceAt(instance, i)
                    val materialName = wardrobeKey(materialInstance?.name)
                    if (materialName.isNotBlank()) {
                        renderableNameIndex.getOrPut(materialName) { mutableSetOf() }.add(entity)
                    }
                }
            }
        }
        applyHiddenMeshes()
    }

    // --- React Props API ---

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
            frameModel()
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

    internal fun applyModelVisibility() {
        if (renderableEntities.isEmpty()) return
        val visibleMask = if (showModel) 0xFF else 0x00
        for (entity in renderableEntities) {
            if (!renderableManager.hasComponent(entity)) continue
            val instance = renderableManager.getInstance(entity)
            renderableManager.setLayerMask(instance, 0xFF, visibleMask)
        }
    }
}