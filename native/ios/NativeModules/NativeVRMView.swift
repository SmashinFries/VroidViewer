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
    var loadedIsVRM0: Bool? = nil
    var sceneUpdateCancellable: Cancellable?

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
    
    var lookAtHeadOffset: simd_quatf = .init(ix: 0, iy: 0, iz: 0, r: 1)
    var lookAtNeckOffset: simd_quatf = .init(ix: 0, iy: 0, iz: 0, r: 1)
    var lookAtEyeOffset: simd_quatf = .init(ix: 0, iy: 0, iz: 0, r: 1)
    var lookAtInitialized: Bool = false

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
        didSet {
            if lookAtEnabled { applyLookAt() } else { resetHeadNeckOrientation() }
        }
    }

    @objc var headTracker: Bool = false {
        didSet {
            if headTracker { applyLookAt() } else { resetHeadNeckOrientation() }
        }
    }

    @objc var enableEyeLookAt: Bool = false {
        didSet {
            if enableEyeLookAt { applyLookAt() } else { resetEyeOrientation() }
        }
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
        arView.backgroundColor = .clear
        arView.isOpaque = false
        arView.environment.background = .color(.clear)
        self.addSubview(arView)

        anchorEntity = AnchorEntity(world: .zero)
        arView.scene.addAnchor(anchorEntity)

        setupCamera()
        setupLights()
        setupGestures()
        setupSceneUpdates()
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
        }
    }

    
}
