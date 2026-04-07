import RealityKit
import ARKit
import VRMKit
import VRMRealityKit
import React
import Combine

@available(iOS 18.0, *)
@objc(NativeVRMView)
class NativeVRMView: UIView {
    var arView: ARView!
    var isLoadingModel = false

    // VRM Entities
    var vrmEntity: VRMEntity?
    var anchorEntity: AnchorEntity!
    var groundEntity: ModelEntity?
    var loadedIsVRM0: Bool? = nil
    var sceneUpdateCancellable: Cancellable?
    var springBones: NativeVRMSpringBones?

    // Configuration storage for materials
    var mtoonMaterialsByName: [String: MToonMaterialConfig] = [:]
    var vrm0MaterialsByName: [String: VRM0MaterialConfig] = [:]

    // Camera Entity
    var cameraEntity: Entity!

    // Lighting
    var mainLight: DirectionalLight!

    // Camera Orbit State
    var orbitTarget: SIMD3<Float> = [0, 1.2, 0]
    var currentDistance: Float = 2.5
    var polarAngle: Float = .pi * 0.4
    var azimuthAngle: Float = 0
    var lastPanPos: CGPoint = .zero
    
    var lookAtYawDeg: Float = 0
    var lookAtPitchDeg: Float = 0
    var lookAtSmoothing: Float = 0.08
    var lookAtConfig: LookAtConfig?
    var lookAtInitialized: Bool = false
    var restBoneOrientations: [Humanoid.Bones: simd_quatf] = [:]

    var nativeLipSyncEnabled: Bool = false
    var visemeKeys: [String] = ["aa", "ih", "ou", "ee", "oh"]

    // MARK: - Reactive Props

    @objc var minZoom: CGFloat = 0.8
    @objc var maxZoom: CGFloat = 5.0
    @objc var initialZoom: CGFloat = 2.5 {
        didSet {
            currentDistance = Float(initialZoom)
            updateCamera()
        }
    }

    @objc var minPolarAngle: CGFloat = .pi * 0.1
    @objc var maxPolarAngle: CGFloat = .pi * 0.75
    @objc var minAzimuthAngle: CGFloat = -.pi * 0.5
    @objc var maxAzimuthAngle: CGFloat = .pi * 0.5

    @objc var modelUri: String? {
        didSet {
            // Always hide while a new model is being loaded.
            showModel = false
            if let uri = modelUri { loadModel(from: uri) }
        }
    }

    @objc var expressions: [String: Any]? {
        didSet { applyExpressions() }
    }

    @objc var boneRotations: [String: Any]? {
        didSet { applyBoneRotations() }
    }

    @objc var vrmVersion: String? {
        didSet { applyModelOrientation() }
    }

    @objc var lookAtEnabled: Bool = false {
        didSet { updateLookAtState() }
    }

    @objc var headTracker: Bool = false {
        didSet { updateLookAtState() }
    }

    @objc var enableEyeLookAt: Bool = false {
        didSet { updateLookAtState() }
    }

    @objc var showModel: Bool = false {
        didSet { applyModelVisibility() }
    }

    // MARK: - Initialization

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    func setupView() {
        backgroundColor = .clear
        isOpaque = false

        arView = ARView(frame: self.bounds, cameraMode: .nonAR, automaticallyConfigureSession: false)
        arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        arView.environment.background = .color(.clear)
        
        // Ensure the scene starts completely empty before we add anchors/ground
        arView.scene.anchors.removeAll()
        
        print("DEBUG: NativeVRMView setup complete. Background set to BLUE. Anchors cleared.")
        
        self.addSubview(arView)

        anchorEntity = AnchorEntity(world: .zero)
        arView.scene.addAnchor(anchorEntity)

        setupGround()
        setupCamera()
        setupLights()
        setupGestures()
        setupSceneUpdates()
    }

    func setupGround() {
        let groundSize: Float = 20.0

        // Use a true plane for a perfectly flat ground surface (no dunes/elevation).
        let mesh = MeshResource.generatePlane(width: groundSize, depth: groundSize)

        // Subtle grey material that receives shadows nicely
        let material = SimpleMaterial(color: .init(white: 0.5, alpha: 1.0), roughness: 0.9, isMetallic: false)

        let ground = ModelEntity(mesh: mesh, materials: [material])

        // Keep the entire surface at y = 0
        ground.position = [0, 0, 0]

        groundEntity = ground
        anchorEntity.addChild(ground)
    }

    func setupCamera() {
        cameraEntity = Entity()
        var camera = PerspectiveCameraComponent()
        camera.fieldOfViewInDegrees = 45
        cameraEntity.components.set(camera)

        let cameraAnchor = AnchorEntity(world: .zero)
        cameraAnchor.addChild(cameraEntity)
        arView.scene.addAnchor(cameraAnchor)

        updateCamera()
    }

    func setupLights() {
        mainLight = DirectionalLight()
        mainLight.light.intensity = 2000
        mainLight.shadow = DirectionalLightComponent.Shadow()
        mainLight.look(at: [0, 1, 0], from: [1, 5, 2], relativeTo: nil)
        anchorEntity.addChild(mainLight)
    }

    func setupSceneUpdates() {
        sceneUpdateCancellable = arView.scene.subscribe(to: SceneEvents.Update.self) { [weak self] event in
            guard let self = self else { return }
            self.vrmEntity?.update(at: event.deltaTime)
            self.springBones?.update(deltaTime: Float(event.deltaTime))
        }
    }

    

}

// MARK: - Material Configurations

@available(iOS 18.0, *)
struct MToonMaterialConfig {
    let doubleSided: Bool
    let shadeColor: SIMD4<Float>?
    let shadingToony: Float
    let shadingShift: Float
}

@available(iOS 18.0, *)
struct VRM0MaterialConfig {
    let shader: String
    var floatProps: [String: Float] = [:]
    var vectorProps: [String: [Float]] = [:]
    var keywordMap: [String: Bool] = [:]
}

// MARK: - Look-At Configurations

@available(iOS 18.0, *)
enum LookAtType: String {
    case bone
    case expression
}

@available(iOS 18.0, *)
struct LookAtRangeMap {
    let inputMax: Float
    let outputScale: Float
    
    func map(_ valDeg: Float) -> Float {
        let ratio = max(0, min(1, valDeg / inputMax))
        return ratio * outputScale
    }
}

@available(iOS 18.0, *)
struct LookAtConfig {
    let type: LookAtType
    let horizInner: LookAtRangeMap
    let horizOuter: LookAtRangeMap
    let vertDown: LookAtRangeMap
    let vertUp: LookAtRangeMap
}
