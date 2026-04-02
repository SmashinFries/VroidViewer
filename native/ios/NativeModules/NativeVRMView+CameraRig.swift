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

    // MARK: - Expressions & Bones

    func applyExpressions() {
        guard let vrm = vrmEntity, let expressions = expressions else { return }

        for (key, value) in expressions {
            guard let weight = value as? NSNumber else { continue }
            let fWeight = Float(weight.floatValue)

            let preset: BlendShapePreset?
            switch key.lowercased() {
            case "aa":        preset = .a
            case "ih":        preset = .i
            case "ou":        preset = .u
            case "ee":        preset = .e
            case "oh":        preset = .o
            case "blink":     preset = .blink
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
            let quat = simd_quaternion(
                Float(q["x"]?.floatValue ?? 0),
                Float(q["y"]?.floatValue ?? 0),
                Float(q["z"]?.floatValue ?? 0),
                Float(q["w"]?.floatValue ?? 1)
            )
            let converted = convertQuaternionFromJS(quat)
            if let bone = findHumanBone(name: boneName) {
                vrm.humanoid.node(for: bone)?.orientation = converted
            }
        }
        
        applyCombinedRotations()
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
        default:              return nil
        }
    }

    // MARK: - Look-At (model head/eyes track the orbit camera)

    func applyLookAt() {
        guard let vrm = vrmEntity else { return }
        guard lookAtEnabled || headTracker || enableEyeLookAt else { return }

        // Use the orbitTarget (or head position) as reference
        let hr = cameraEntity.position(relativeTo: nil) - orbitTarget
        let dy = hr.y

        // Compute horizontal distance
        let distH = max(0.001, sqrt(hr.x * hr.x + hr.z * hr.z))
        let trackingSpeed: Float = lookAtInitialized ? 0.08 : 1.0

        if lookAtEnabled || headTracker {
            // Pitch (up/down) and Yaw (left/right) mapping based on camera relative position
            var cp = atan2(-dy, distH)
            var cy = atan2(hr.x, hr.z)

            // VRM 1.x faces +Z, VRM 0.x faces -Z
            let is180 = isUsing180Rotation()
            if is180 { cy = atan2(-hr.x, -hr.z) }
            
            cy = max(-.pi/3, min(.pi/3, cy))
            cp = max(-.pi/4, min(.pi/4, cp))

            let qHead = simd_quaternion(Float(cy) * 0.7, SIMD3<Float>(0, 1, 0))
                      * simd_quaternion(Float(cp) * 0.7, SIMD3<Float>(1, 0, 0))
            let qNeck = simd_quaternion(Float(cy) * 0.3, SIMD3<Float>(0, 1, 0))
                      * simd_quaternion(Float(cp) * 0.3, SIMD3<Float>(1, 0, 0))

            lookAtHeadOffset = simd_slerp(lookAtHeadOffset, qHead, trackingSpeed)
            lookAtNeckOffset = simd_slerp(lookAtNeckOffset, qNeck, trackingSpeed)
        }

        if enableEyeLookAt {
            var cp = atan2(-dy, distH)
            var cy = atan2(hr.x, hr.z)

            let is180 = isUsing180Rotation()
            if is180 { cy = atan2(-hr.x, -hr.z) }

            let y = max(-.pi/12, min(.pi/12, Float(cy) * 0.3))
            let p = max(-.pi/15, min(.pi/15, Float(cp) * 0.3))

            let qEye = simd_quaternion(Float(y), SIMD3<Float>(0, 1, 0)) * simd_quaternion(Float(p), SIMD3<Float>(1, 0, 0))
            lookAtEyeOffset = simd_slerp(lookAtEyeOffset, qEye, trackingSpeed)
        }

        lookAtInitialized = true
        applyCombinedRotations()
    }

    func applyCombinedRotations() {
        guard let vrm = vrmEntity else { return }

        // Start by pulling the JS base data directly out of the bone storage (or default to Identity)
        if (lookAtEnabled || headTracker), let head = vrm.humanoid.node(for: .head) {
             let base = extractJSRotation(for: "head")
             head.orientation = base * lookAtHeadOffset
        }
        if (lookAtEnabled || headTracker), let neck = vrm.humanoid.node(for: .neck) {
             let base = extractJSRotation(for: "neck")
             neck.orientation = base * lookAtNeckOffset
        }

        if enableEyeLookAt {
            if let leftEye = vrm.humanoid.node(for: .leftEye) {
                let base = extractJSRotation(for: "lefteye")
                leftEye.orientation = base * lookAtEyeOffset
            }
            if let rightEye = vrm.humanoid.node(for: .rightEye) {
                let base = extractJSRotation(for: "righteye")
                rightEye.orientation = base * lookAtEyeOffset
            }
        }
    }

    func extractJSRotation(for boneName: String) -> simd_quatf {
        guard let rotations = boneRotations, let value = rotations[boneName] as? [String: NSNumber] else {
            return simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
        }
        let quat = simd_quaternion(
            Float(value["x"]?.floatValue ?? 0),
            Float(value["y"]?.floatValue ?? 0),
            Float(value["z"]?.floatValue ?? 0),
            Float(value["w"]?.floatValue ?? 1)
        )
        return convertQuaternionFromJS(quat)
    }

    func resetHeadNeckOrientation() {
        lookAtHeadOffset = simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
        lookAtNeckOffset = simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
        applyCombinedRotations()
    }

    func resetEyeOrientation() {
        lookAtEyeOffset = simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
        applyCombinedRotations()
    }

    func isUsing180Rotation() -> Bool {
        if let loadedIsVRM0 { return loadedIsVRM0 }
        if let vrmVersion { return vrmVersion == "0" }
        // Preserve legacy behavior if we don't know.
        return true
    }

    func convertQuaternionFromJS(_ q: simd_quatf) -> simd_quatf {
        // Since both RealityKit and Three.js apply the 180 root rotation to VRM 0.x
        // and we compute the deltaQuat relative to T-Pose, we can just pass
        // the rotation along perfectly mapped to identical coordinate spaces.
        return q
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
