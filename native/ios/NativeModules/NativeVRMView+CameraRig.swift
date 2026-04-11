import RealityKit
import ARKit
import VRMKit
import VRMRealityKit
import React

@available(iOS 18.0, *)
extension NativeVRMView {
// MARK: - Gestures & Camera Update

    func setupGestures() {
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        self.addGestureRecognizer(pan)

        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
        self.addGestureRecognizer(pinch)
    }

    @objc func handlePan(_ gesture: UIPanGestureRecognizer) {
        let loc = gesture.location(in: self)
        if gesture.state == .began { lastPanPos = loc; return }

        let dx = Float(loc.x - lastPanPos.x) * 0.005
        let dy = Float(loc.y - lastPanPos.y) * 0.005
        lastPanPos = loc

        azimuthAngle -= dx
        polarAngle   += dy

        polarAngle   = max(Float(minPolarAngle),   min(Float(maxPolarAngle),   polarAngle))
        azimuthAngle = max(Float(minAzimuthAngle), min(Float(maxAzimuthAngle), azimuthAngle))

        updateCamera()
    }

    @objc func handlePinch(_ gesture: UIPinchGestureRecognizer) {
        if gesture.state == .changed {
            let scale = Float(gesture.scale)
            currentDistance /= scale
            gesture.scale = 1.0
            currentDistance = max(Float(minZoom), min(Float(maxZoom), currentDistance))
            updateCamera()
        }
    }

    func updateCamera() {
        let x = currentDistance * sin(polarAngle) * sin(azimuthAngle)
        let y = currentDistance * cos(polarAngle)
        let z = currentDistance * sin(polarAngle) * cos(azimuthAngle)

        let pos = orbitTarget + SIMD3<Float>(x, y, z)
        cameraEntity.position = pos
        cameraEntity.look(at: orbitTarget, from: pos, relativeTo: nil)

        if lookAtEnabled || headTracker || enableEyeLookAt {
            applyLookAt()
        }
    }

    // MARK: - Expressions, Bones & Look-At

    func applyExpressions() {
        guard let vrm = vrmEntity, let expressions = expressions else { return }

        for (key, value) in expressions {
            guard let weight = value as? NSNumber else { continue }
            let fWeight = Float(weight.floatValue)
            let lower = key.lowercased()

            if nativeLipSyncEnabled && visemeKeys.contains(lower) {
                continue
            }

            let preset: BlendShapePreset?
            switch lower {
            case "aa":        preset = .a
            case "ih":        preset = .i
            case "ou":        preset = .u
            case "ee":        preset = .e
            case "oh":        preset = .o
            case "blink":     preset = .blink
            case "joy":       preset = .joy
            case "happy":     preset = .joy
            case "angry":     preset = .angry
            case "sad":       preset = .sorrow
            case "surprised": preset = .fun
            default:          preset = nil
            }

            if let p = preset {
                vrm.setBlendShape(value: CGFloat(fWeight), for: .preset(p))
            } else {
                vrm.setBlendShape(value: CGFloat(fWeight), for: .custom(key))
            }
        }
    }

    func applyBoneRotations() {
        guard let vrm = vrmEntity, let rotations = boneRotations else { return }

        for (boneName, value) in rotations {
            guard let q = value as? [String: NSNumber] else { continue }
            let delta = simd_quaternion(
                Float(q["x"]?.floatValue ?? 0),
                Float(q["y"]?.floatValue ?? 0),
                Float(q["z"]?.floatValue ?? 0),
                Float(q["w"]?.floatValue ?? 1)
            )
            let converted = convertQuaternionFromJS(delta)
            if let bone = findHumanBone(name: boneName) {
                applyDeltaOrientation(bone: bone, delta: converted, vrm: vrm)
            }
        }

        if lookAtEnabled || headTracker || enableEyeLookAt {
            applyLookAt()
        }
    }

    func findHumanBone(name: String) -> Humanoid.Bones? {
        switch name.lowercased() {
        case "hips":          return .hips
        case "spine":         return .spine
        case "neck":          return .neck
        case "head":          return .head
        case "lefteye":       return .leftEye
        case "righteye":      return .rightEye
        case "leftshoulder":  return .leftShoulder
        case "rightshoulder": return .rightShoulder
        case "leftupperarm":  return .leftUpperArm
        case "rightupperarm": return .rightUpperArm
        case "leftlowerarm":  return .leftLowerArm
        case "rightlowerarm": return .rightLowerArm
        case "lefthand":      return .leftHand
        case "righthand":     return .rightHand
        case "leftupperleg":  return .leftUpperLeg
        case "rightupperleg": return .rightUpperLeg
        case "leftlowerleg":  return .leftLowerLeg
        case "rightlowerleg": return .rightLowerLeg
        case "leftfoot":      return .leftFoot
        case "rightfoot":     return .rightFoot
        case "upperchest":    return .upperChest
        case "leftthumbproximal":      return .leftThumbProximal
        case "leftthumbdistal":        return .leftThumbDistal
        case "leftindexproximal":      return .leftIndexProximal
        case "leftindexintermediate":  return .leftIndexIntermediate
        case "leftindexdistal":        return .leftIndexDistal
        case "leftmiddleproximal":     return .leftMiddleProximal
        case "leftmiddleintermediate": return .leftMiddleIntermediate
        case "leftmiddledistal":       return .leftMiddleDistal
        case "leftringproximal":       return .leftRingProximal
        case "leftringintermediate":   return .leftRingIntermediate
        case "leftringdistal":         return .leftRingDistal
        case "leftlittleproximal":     return .leftLittleProximal
        case "leftlittleintermediate": return .leftLittleIntermediate
        case "leftlittledistal":       return .leftLittleDistal
        case "rightthumbproximal":      return .rightThumbProximal
        case "rightthumbdistal":        return .rightThumbDistal
        case "rightindexproximal":      return .rightIndexProximal
        case "rightindexintermediate":  return .rightIndexIntermediate
        case "rightindexdistal":        return .rightIndexDistal
        case "rightmiddleproximal":     return .rightMiddleProximal
        case "rightmiddleintermediate": return .rightMiddleIntermediate
        case "rightmiddledistal":       return .rightMiddleDistal
        case "rightringproximal":       return .rightRingProximal
        case "rightringintermediate":   return .rightRingIntermediate
        case "rightringdistal":         return .rightRingDistal
        case "rightlittleproximal":     return .rightLittleProximal
        case "rightlittleintermediate": return .rightLittleIntermediate
        case "rightlittledistal":       return .rightLittleDistal
        default:              return nil
        }
    }

    func updateLookAtState() {
        if lookAtEnabled || headTracker || enableEyeLookAt {
            applyLookAt()
        } else {
            lookAtInitialized = false
            resetHeadNeckOrientation()
        }

        if !(enableEyeLookAt || lookAtEnabled) {
            resetEyeOrientation()
            if let vrm = vrmEntity, resolvedLookAtConfig().type == .expression {
                applyLookAtExpressions(yawDeg: 0, pitchDeg: 0, config: resolvedLookAtConfig(), vrm: vrm)
            }
        }
    }

    func resolvedLookAtConfig() -> LookAtConfig {
        if let config = lookAtConfig {
            return config
        }

        let isVrm0 = loadedIsVRM0 ?? (vrmVersion == "0")
        let type: LookAtType = isVrm0 ? .bone : .expression
        let defaultOutput: Float = type == .expression ? 1.0 : 10.0
        let map = LookAtRangeMap(inputMax: 90.0, outputScale: defaultOutput)
        return LookAtConfig(
            type: type,
            horizInner: map,
            horizOuter: map,
            vertDown: map,
            vertUp: map
        )
    }

    // MARK: - Look-At (model head/eyes track the orbit camera)

    func applyLookAt() {
        guard let vrm = vrmEntity else { return }
        guard lookAtEnabled || headTracker || enableEyeLookAt else { return }
        guard let headNode = vrm.humanoid.node(for: .head) else { return }

        let neckNode   = vrm.humanoid.node(for: .neck)
        let headParent: Entity = neckNode?.parent ?? headNode.parent ?? anchorEntity
        let cameraWorldPos = cameraEntity.position(relativeTo: nil)

        guard let headAngles = computeYawPitch(
            bone: .head,
            boneNode: headNode,
            parent: headParent,
            cameraWorldPos: cameraWorldPos
        ) else {
            return
        }
        let (yaw, pitch) = headAngles
        let radToDeg: Float = 180.0 / .pi
        let degToRad: Float = .pi / 180.0

        let targetYawDeg = yaw * radToDeg
        let targetPitchDeg = pitch * radToDeg
        if !lookAtInitialized {
            lookAtYawDeg = targetYawDeg
            lookAtPitchDeg = targetPitchDeg
            lookAtInitialized = true
        } else {
            lookAtYawDeg += (targetYawDeg - lookAtYawDeg) * lookAtSmoothing
            lookAtPitchDeg += (targetPitchDeg - lookAtPitchDeg) * lookAtSmoothing
        }

        let yawDeg = lookAtYawDeg
        let pitchDeg = lookAtPitchDeg

        let maxHeadYawDeg:   Float = 45.0
        let maxHeadPitchDeg: Float = 30.0
        let cy = max(-maxHeadYawDeg,   min(maxHeadYawDeg,   yawDeg)) * degToRad
        let cp = max(-maxHeadPitchDeg, min(maxHeadPitchDeg, pitchDeg)) * degToRad

        // Treat enableEyeLookAt as the primary toggle (JS only exposes this),
        // and allow it to also drive head/neck subtly for stability.
        let enableHead = lookAtEnabled || headTracker || enableEyeLookAt
        let enableEyes = lookAtEnabled || enableEyeLookAt
        let config = resolvedLookAtConfig()

        if enableHead {
            let qHead = simd_quaternion(cy * 0.7, SIMD3<Float>(0, 1, 0))
                      * simd_quaternion(cp * 0.7, SIMD3<Float>(1, 0, 0))
            let qNeck = simd_quaternion(cy * 0.3, SIMD3<Float>(0, 1, 0))
                      * simd_quaternion(cp * 0.3, SIMD3<Float>(1, 0, 0))
            applyDeltaOrientation(bone: .head, delta: qHead, vrm: vrm)
            if neckNode != nil {
                applyDeltaOrientation(bone: .neck, delta: qNeck, vrm: vrm)
            }
        }

        if enableEyes {
            switch config.type {
            case .expression:
                applyLookAtExpressions(yawDeg: yawDeg, pitchDeg: pitchDeg, config: config, vrm: vrm)
            case .bone:
                let leftYawDeg = yawDeg < 0 ? -config.horizInner.map(-yawDeg) : config.horizOuter.map(yawDeg)
                let rightYawDeg = yawDeg < 0 ? -config.horizOuter.map(-yawDeg) : config.horizInner.map(yawDeg)
                let pitchMappedDeg = pitchDeg < 0 ? -config.vertDown.map(-pitchDeg) : config.vertUp.map(pitchDeg)

                let qLeft = simd_quaternion(leftYawDeg * degToRad, SIMD3<Float>(0, 1, 0))
                          * simd_quaternion(pitchMappedDeg * degToRad, SIMD3<Float>(1, 0, 0))
                let qRight = simd_quaternion(rightYawDeg * degToRad, SIMD3<Float>(0, 1, 0))
                           * simd_quaternion(pitchMappedDeg * degToRad, SIMD3<Float>(1, 0, 0))
                applyDeltaOrientation(bone: .leftEye, delta: qLeft, vrm: vrm)
                applyDeltaOrientation(bone: .rightEye, delta: qRight, vrm: vrm)
            }
        }
    }

    func computeYawPitch(
        bone: Humanoid.Bones,
        boneNode: Entity,
        parent: Entity,
        cameraWorldPos: SIMD3<Float>
    ) -> (Float, Float)? {
        let cameraInParent = parent.convert(position: cameraWorldPos, from: nil)
        let boneInParent = boneNode.position
        let dirParent = cameraInParent - boneInParent
        let len = simd_length(dirParent)
        if len < 1e-5 { return nil }
        var dir = dirParent / len
        if let rest = restBoneOrientations[bone] {
            dir = simd_act(rest.inverse, dir)
        }
        let forwardZ = dir.z
        let yaw = atan2(dir.x, forwardZ)
        let pitch = atan2(dir.y, sqrt(dir.x * dir.x + forwardZ * forwardZ))
        return (yaw, pitch)
    }

    func applyLookAtExpressions(yawDeg: Float, pitchDeg: Float, config: LookAtConfig, vrm: VRMEntity) {
        let yawWeight = config.horizOuter.map(abs(yawDeg))
        let pitchWeightDown = config.vertDown.map(abs(pitchDeg))
        let pitchWeightUp = config.vertUp.map(abs(pitchDeg))

        let lookLeft = yawDeg < 0 ? yawWeight : 0.0
        let lookRight = yawDeg > 0 ? yawWeight : 0.0
        let lookDown = pitchDeg < 0 ? pitchWeightDown : 0.0
        let lookUp = pitchDeg > 0 ? pitchWeightUp : 0.0

        vrm.setBlendShape(value: CGFloat(lookLeft), for: .custom("lookLeft"))
        vrm.setBlendShape(value: CGFloat(lookRight), for: .custom("lookRight"))
        vrm.setBlendShape(value: CGFloat(lookUp), for: .custom("lookUp"))
        vrm.setBlendShape(value: CGFloat(lookDown), for: .custom("lookDown"))
    }

    func resetHeadNeckOrientation() {
        guard let vrm = vrmEntity else { return }
        restoreRestOrientation(bone: .head, vrm: vrm)
        restoreRestOrientation(bone: .neck, vrm: vrm)
    }

    func resetEyeOrientation() {
        guard let vrm = vrmEntity else { return }
        restoreRestOrientation(bone: .leftEye, vrm: vrm)
        restoreRestOrientation(bone: .rightEye, vrm: vrm)
    }

    func isUsing180Rotation() -> Bool {
        if let loadedIsVRM0 { return loadedIsVRM0 }
        if let vrmVersion { return vrmVersion == "0" }
        // Preserve legacy behavior if we don't know.
        return true
    }

    func convertQuaternionFromJS(_ q: simd_quatf) -> simd_quatf {
        // RealityKit's coordinate system differs from Three.js/SceneKit along Z.
        // However, we handle the root 180-degree rotation of VRM 0.x in applyModelOrientation(),
        // so bone rotations from Three.js can be passed raw.
        return q
    }

    func cacheRestPose() {
        restBoneOrientations.removeAll()
        guard let vrm = vrmEntity else { return }
        let bones: [Humanoid.Bones] = [
            .hips, .spine, .neck, .head,
            .leftShoulder, .rightShoulder,
            .leftUpperArm, .rightUpperArm,
            .leftLowerArm, .rightLowerArm,
            .leftHand, .rightHand,
            .leftThumbProximal, .leftThumbDistal,
            .leftIndexProximal, .leftIndexIntermediate, .leftIndexDistal,
            .leftMiddleProximal, .leftMiddleIntermediate, .leftMiddleDistal,
            .leftRingProximal, .leftRingIntermediate, .leftRingDistal,
            .leftLittleProximal, .leftLittleIntermediate, .leftLittleDistal,
            .rightThumbProximal, .rightThumbDistal,
            .rightIndexProximal, .rightIndexIntermediate, .rightIndexDistal,
            .rightMiddleProximal, .rightMiddleIntermediate, .rightMiddleDistal,
            .rightRingProximal, .rightRingIntermediate, .rightRingDistal,
            .rightLittleProximal, .rightLittleIntermediate, .rightLittleDistal,
            .leftUpperLeg, .rightUpperLeg,
            .leftLowerLeg, .rightLowerLeg,
            .leftFoot, .rightFoot,
            .leftEye, .rightEye,
            .upperChest,
            .leftThumbProximal, .leftThumbDistal,
            .leftIndexProximal, .leftIndexIntermediate, .leftIndexDistal,
            .leftMiddleProximal, .leftMiddleIntermediate, .leftMiddleDistal,
            .leftRingProximal, .leftRingIntermediate, .leftRingDistal,
            .leftLittleProximal, .leftLittleIntermediate, .leftLittleDistal,
            .rightThumbProximal, .rightThumbDistal,
            .rightIndexProximal, .rightIndexIntermediate, .rightIndexDistal,
            .rightMiddleProximal, .rightMiddleIntermediate, .rightMiddleDistal,
            .rightRingProximal, .rightRingIntermediate, .rightRingDistal,
            .rightLittleProximal, .rightLittleIntermediate, .rightLittleDistal
        ]
        for bone in bones {
            if let node = vrm.humanoid.node(for: bone) {
                restBoneOrientations[bone] = node.orientation
            }
        }
    }

    func applyDeltaOrientation(bone: Humanoid.Bones, delta: simd_quatf, vrm: VRMEntity) {
        guard let node = vrm.humanoid.node(for: bone) else { return }
        if let rest = restBoneOrientations[bone] {
            node.orientation = rest * delta
        } else {
            node.orientation = delta
        }
    }

    func restoreRestOrientation(bone: Humanoid.Bones, vrm: VRMEntity) {
        guard let node = vrm.humanoid.node(for: bone) else { return }
        if let rest = restBoneOrientations[bone] {
            node.orientation = rest
        } else {
            node.orientation = simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
        }
    }

    func applyModelOrientation() {
        guard let entity = vrmEntity?.entity else { return }
        if isUsing180Rotation() {
            // VRM 0.x: JS applies rotateVRM0, so mirror the same orientation in native.
            // Also matches the +Z-forward VRM convention to RealityKit's -Z camera.
            entity.orientation = simd_quaternion(Float.pi, SIMD3<Float>(0, 1, 0))
        } else {
            entity.orientation = simd_quaternion(0, SIMD3<Float>(0, 1, 0))
        }
    }
}
