import RealityKit
import ARKit
import VRMKit
import VRMRealityKit
import React
import Combine
import AVFoundation

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

    @objc var nativeLipSyncEnabled: Bool = false
    var visemeKeys: [String] = ["aa", "ih", "ou", "ee", "oh"]
    
    // Audio Playback for Lip Sync
    private var audioPlayer: AVAudioPlayer?
    private var currentRMS: Float = 0.0
    private var smoothedRMS: Float = 0.0

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
            self.applyNativeLipSyncFrame()
        }
    }

    func playAudio(assetName: String) {
        print("DEBUG: playAudio called with: \(assetName)")
        
        // Resolve URL
        var finalUrl: URL?
        if assetName.contains("://") {
            finalUrl = URL(string: assetName)
        } else if assetName.starts(with: "/") {
            finalUrl = URL(fileURLWithPath: assetName)
        } else {
            let cleanName = assetName.replacingOccurrences(of: ".mp3", with: "")
            finalUrl = Bundle.main.url(forResource: cleanName, withExtension: "mp3") ??
                       Bundle.main.url(forResource: "assets/audios/\(cleanName)", withExtension: "mp3")
        }
        
        guard let url = finalUrl else {
            print("ERROR: Could not resolve audio URL for: \(assetName)")
            return
        }
        
        print("DEBUG: Resolved final audio URL: \(url)")
        
        do {
            // Use .mixWithOthers so we coexist with RealityKit / ARKit audio session
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
            print("DEBUG: AVAudioSession activated")
            
            audioPlayer?.stop()
            audioPlayer = try AVAudioPlayer(contentsOf: url)
            audioPlayer?.isMeteringEnabled = true  // required for averagePower metering
            audioPlayer?.volume = 1.0
            let started = audioPlayer?.play() ?? false
            print("DEBUG: AVAudioPlayer.play() returned: \(started)")
        } catch {
            print("ERROR: Failed to play audio: \(error)")
        }
    }

    func applyNativeLipSyncFrame() {
        guard nativeLipSyncEnabled else { return }
        
        // Update metering if player is active
        var rms: Float = 0.0
        if let player = audioPlayer, player.isPlaying {
            player.updateMeters()
            // averagePower returns dB; convert to linear [0..1]
            let dB = player.averagePower(forChannel: 0)
            let minDb: Float = -60.0
            rms = dB <= minDb ? 0.0 : pow(10.0, dB / 20.0)
        }
        
        let noiseFloor: Float = 0.01
        let gain: Float = 4.0
        let smoothing: Float = 0.5
        
        let targetRMS = rms > noiseFloor ? min(1.0, (rms - noiseFloor) * gain) : 0.0
        smoothedRMS = smoothedRMS + (targetRMS - smoothedRMS) * (1.0 - smoothing)
        
        // Drive visemes via VRMRealityKit setBlendShape
        vrmEntity?.setBlendShape(value: CGFloat(smoothedRMS), for: .preset(.a))
    }

    @objc var nativeLipSyncEnabledProp: Bool = false {
        didSet {
            self.nativeLipSyncEnabled = nativeLipSyncEnabledProp
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
