import Foundation
import VRMKit

@available(iOS 18.0, *)
enum VRMShimUtils {
// MARK: - VRM 1.x Compatibility Shim

    //
    // VRMKit 0.7.1 has VRM1SceneLoader but it has no loadScene() —
    // VRM 1.x rendering is incomplete in the library. As a workaround we
    // inject a minimal VRM 0.x "VRM" extension into the GLTF JSON blob
    // inside the binary GLTF container, mapping the VRM1 humanoid bone
    // indices into the VRM 0.x humanBones array format.
    // VRMEntityLoader then loads the entity using:
    //   - GLTF geometry/skin data  (unchanged, works for both VRM versions)
    //   - PBR materials            (VRM 1.x provides pbrMetallicRoughness)
    //   - Injected humanoid bones  (correct node indices from VRM1 humanoid)

    static func patchVRM1ForDecode(data: Data) throws -> Data {
        return try mutateGLBJson(data: data) { jsonObj in
            if var nodes = jsonObj["nodes"] as? [[String: Any]] {
                var nodesChanged = false
                for i in 0..<nodes.count {
                    if var nodeExts = nodes[i]["extensions"] as? [String: Any], nodeExts["VRMC_node_constraint"] != nil {
                        nodeExts.removeValue(forKey: "VRMC_node_constraint")
                        nodes[i]["extensions"] = nodeExts
                        nodesChanged = true
                    }
                }
                if nodesChanged {
                    jsonObj["nodes"] = nodes
                }
            }

            guard var extensions = jsonObj["extensions"] as? [String: Any],
                  var vrm = extensions["VRMC_vrm"] as? [String: Any] else {
                return
            }

            if var firstPerson = vrm["firstPerson"] as? [String: Any] {
                let hasMeshAnnotations = !(firstPerson["meshAnnotations"] is NSNull) && firstPerson["meshAnnotations"] != nil
                if !hasMeshAnnotations {
                    firstPerson["meshAnnotations"] = [[String: Any]]()
                    vrm["firstPerson"] = firstPerson
                    extensions["VRMC_vrm"] = vrm
                    jsonObj["extensions"] = extensions
                }
            } else if vrm.keys.contains("firstPerson") {
                // firstPerson exists but isn't a dictionary (e.g., null). Provide a minimal object.
                vrm["firstPerson"] = ["meshAnnotations": [[String: Any]]()]
                extensions["VRMC_vrm"] = vrm
                jsonObj["extensions"] = extensions
            }

            // Ensure expressions.preset has all required keys (VRMKit expects them non-optional).
            let requiredPresets = [
                "happy", "angry", "sad", "relaxed", "surprised",
                "aa", "ih", "ou", "ee", "oh",
                "blink", "blinkLeft", "blinkRight",
                "lookUp", "lookDown", "lookLeft", "lookRight",
                "neutral"
            ]

            if var expressions = vrm["expressions"] as? [String: Any] {
                if var preset = expressions["preset"] as? [String: Any] {
                    var changed = false
                    for key in requiredPresets {
                        let isMissing = preset[key] == nil || preset[key] is NSNull
                        if isMissing {
                            preset[key] = [String: Any]() // empty Expression object
                            changed = true
                        }
                    }
                    if changed {
                        expressions["preset"] = preset
                        vrm["expressions"] = expressions
                        extensions["VRMC_vrm"] = vrm
                        jsonObj["extensions"] = extensions
                    }
                } else {
                    var preset: [String: Any] = [:]
                    for key in requiredPresets { preset[key] = [String: Any]() }
                    expressions["preset"] = preset
                    vrm["expressions"] = expressions
                    extensions["VRMC_vrm"] = vrm
                    jsonObj["extensions"] = extensions
                }
            } else if vrm.keys.contains("expressions") {
                // expressions exists but isn't a dictionary (e.g., null). Provide a minimal preset.
                var preset: [String: Any] = [:]
                for key in requiredPresets { preset[key] = [String: Any]() }
                vrm["expressions"] = ["preset": preset]
                extensions["VRMC_vrm"] = vrm
                jsonObj["extensions"] = extensions
            }

            // Ensure VRMC_springBone joints include required fields (VRMKit expects them non-optional).
            if var springBone = extensions["VRMC_springBone"] as? [String: Any],
               var springs = springBone["springs"] as? [[String: Any]] {
                var springsChanged = false
                for sIndex in 0..<springs.count {
                    guard var spring = springs[sIndex] as? [String: Any],
                          var joints = spring["joints"] as? [[String: Any]] else {
                        continue
                    }
                    var jointsChanged = false
                    for jIndex in 0..<joints.count {
                        var joint = joints[jIndex]
                        // Only fill missing fields; preserve authoring when present.
                        if joint["hitRadius"] == nil || joint["hitRadius"] is NSNull {
                            joint["hitRadius"] = 0.0
                            jointsChanged = true
                        }
                        if joint["stiffness"] == nil || joint["stiffness"] is NSNull {
                            joint["stiffness"] = 1.0
                            jointsChanged = true
                        }
                        if joint["gravityPower"] == nil || joint["gravityPower"] is NSNull {
                            joint["gravityPower"] = 0.0
                            jointsChanged = true
                        }
                        if joint["gravityDir"] == nil || joint["gravityDir"] is NSNull {
                            joint["gravityDir"] = [0.0, -1.0, 0.0]
                            jointsChanged = true
                        }
                        if joint["dragForce"] == nil || joint["dragForce"] is NSNull {
                            joint["dragForce"] = 0.0
                            jointsChanged = true
                        }
                        if jointsChanged {
                            joints[jIndex] = joint
                        }
                    }
                    if jointsChanged {
                        spring["joints"] = joints
                        springs[sIndex] = spring
                        springsChanged = true
                    }
                }
                if springsChanged {
                    springBone["springs"] = springs
                    extensions["VRMC_springBone"] = springBone
                    jsonObj["extensions"] = extensions
                }
            }
        }
    }

    static func patchVRM1ForLoader(data: Data, vrm1: VRM1) throws -> Data {
        return try mutateGLBJson(data: data) { jsonObj in
            let nodeToMesh = buildNodeToMeshMap(jsonObj)
            let blendShapeGroups = buildVRM0BlendShapeGroups(vrm1, nodeToMesh: nodeToMesh)
            let materialProperties = buildVRM0MaterialProperties(jsonObj)

            // Build VRM 0.x humanBones from VRM1 humanoid (same GLTF node indices)
            let humanBones = buildVRM0HumanBones(vrm1)

            // Inject a minimal "VRM" extension so VRMLoader().load() succeeds.
            // materialProperties is empty → VRMEntityLoader uses PBR from GLTF data.
            let vrmExt: [String: Any] = [
                "meta":   [String: Any](),
                "version": "0.0",
                "materialProperties": materialProperties,
                "humanoid": [
                    "armStretch": 0.05, "feetSpacing": 0.0, "hasTranslationDoF": false,
                    "legStretch": 0.05, "lowerArmTwist": 0.5, "lowerLegTwist": 0.5,
                    "upperArmTwist": 0.5, "upperLegTwist": 0.5,
                    "humanBones": humanBones
                ],
                "blendShapeMaster": ["blendShapeGroups": blendShapeGroups],
                "firstPerson": [
                    "firstPersonBone": -1,
                    "firstPersonBoneOffset": ["x": 0.0, "y": 0.06, "z": 0.0],
                    "meshAnnotations": [[String: Any]](),
                    "lookAtTypeName": "Bone",
                    "lookAtHorizontalInner": ["curve": [0,0,0,1,1,1,1,0], "xRange": 90.0, "yRange": 10.0],
                    "lookAtHorizontalOuter": ["curve": [0,0,0,1,1,1,1,0], "xRange": 90.0, "yRange": 10.0],
                    "lookAtVerticalDown":    ["curve": [0,0,0,1,1,1,1,0], "xRange": 90.0, "yRange": 10.0],
                    "lookAtVerticalUp":      ["curve": [0,0,0,1,1,1,1,0], "xRange": 90.0, "yRange": 10.0]
                ],
                "secondaryAnimation": [
                    "boneGroups":    [[String: Any]](),
                    "colliderGroups": [[String: Any]]()
                ]
            ]

            var exts = jsonObj["extensions"] as? [String: Any] ?? [:]
            exts["VRM"] = vrmExt
            jsonObj["extensions"] = exts
        }
    }

    static func mutateGLBJson(data: Data, mutate: (inout [String: Any]) throws -> Void) throws -> Data {
        // GLB binary layout:
        //   [12 B header][8+N JSON chunk][8+M BIN chunk]
        guard data.count >= 20 else {
            throw NSError(domain: "VRMPatch", code: 1, userInfo: [NSLocalizedDescriptionKey: "GLB too short"])
        }

        // Verify magic "glTF" = 0x46546C67 (little-endian)
        guard readLE32(data, at: 0) == 0x46546C67 else {
            throw NSError(domain: "VRMPatch", code: 2, userInfo: [NSLocalizedDescriptionKey: "Not a GLB file"])
        }

        let jsonChunkLen = Int(readLE32(data, at: 12))
        guard readLE32(data, at: 16) == 0x4E4F534A else {   // JSON chunk type
            throw NSError(domain: "VRMPatch", code: 3, userInfo: [NSLocalizedDescriptionKey: "First chunk is not JSON"])
        }
        let jsonStart = 20
        let jsonEnd   = jsonStart + jsonChunkLen
        guard jsonEnd <= data.count else {
            throw NSError(domain: "VRMPatch", code: 4, userInfo: [NSLocalizedDescriptionKey: "JSON chunk overruns file"])
        }

        // Parse the JSON chunk
        guard var jsonObj = try? JSONSerialization.jsonObject(with: data[jsonStart..<jsonEnd]) as? [String: Any] else {
            throw NSError(domain: "VRMPatch", code: 5, userInfo: [NSLocalizedDescriptionKey: "JSON parse failed"])
        }

        try mutate(&jsonObj)

        // Re-serialise JSON, pad to 4-byte boundary with spaces (0x20 per GLB spec)
        var newJson = try JSONSerialization.data(withJSONObject: jsonObj)
        let pad = (4 - newJson.count % 4) % 4
        if pad > 0 { newJson.append(contentsOf: Array(repeating: UInt8(0x20), count: pad)) }

        // Reassemble the GLB
        var out = Data(capacity: 12 + 8 + newJson.count + max(0, data.count - jsonEnd))

        func w32(_ v: UInt32) {
            out.append(UInt8(v & 0xFF))
            out.append(UInt8((v >> 8)  & 0xFF))
            out.append(UInt8((v >> 16) & 0xFF))
            out.append(UInt8((v >> 24) & 0xFF))
        }

        w32(0x46546C67)              // magic  "glTF"
        w32(2)                        // version
        w32(0)                        // total length – filled in below
        w32(UInt32(newJson.count))    // JSON chunk length
        w32(0x4E4F534A)              // JSON chunk type
        out.append(newJson)

        // Append the binary chunk(s) unchanged
        if jsonEnd < data.count {
            out.append(data[jsonEnd...])
        }

        // Patch total length field
        let totalLen = UInt32(out.count)
        out[8]  = UInt8(totalLen & 0xFF)
        out[9]  = UInt8((totalLen >> 8)  & 0xFF)
        out[10] = UInt8((totalLen >> 16) & 0xFF)
        out[11] = UInt8((totalLen >> 24) & 0xFF)

        return out
    }

    static func readLE32(_ data: Data, at offset: Int) -> UInt32 {
        let i = data.startIndex + offset
        return UInt32(data[i]) |
               UInt32(data[i + 1]) << 8 |
               UInt32(data[i + 2]) << 16 |
               UInt32(data[i + 3]) << 24
    }

    static func buildVRM0HumanBones(_ vrm1: VRM1) -> [[String: Any]] {
        let b = vrm1.humanoid.humanBones
        var result = [[String: Any]]()

        func add(_ name: String, _ node: Int) {
            result.append(["bone": name, "node": node, "useDefaultValues": true])
        }
        func addOpt(_ name: String, _ bone: VRM1.Humanoid.HumanBones.HumanBone?) {
            guard let bone else { return }
            add(name, bone.node)
        }

        add("hips",          b.hips.node)
        add("spine",         b.spine.node)
        addOpt("chest",      b.chest)
        addOpt("upperChest", b.upperChest)
        addOpt("neck",       b.neck)
        add("head",          b.head.node)
        addOpt("leftEye",    b.leftEye)
        addOpt("rightEye",   b.rightEye)
        addOpt("leftShoulder",  b.leftShoulder)
        add("leftUpperArm",  b.leftUpperArm.node)
        add("leftLowerArm",  b.leftLowerArm.node)
        add("leftHand",      b.leftHand.node)
        addOpt("rightShoulder", b.rightShoulder)
        add("rightUpperArm", b.rightUpperArm.node)
        add("rightLowerArm", b.rightLowerArm.node)
        add("rightHand",     b.rightHand.node)
        add("leftUpperLeg",  b.leftUpperLeg.node)
        add("leftLowerLeg",  b.leftLowerLeg.node)
        add("leftFoot",      b.leftFoot.node)
        addOpt("leftToes",   b.leftToes)
        add("rightUpperLeg", b.rightUpperLeg.node)
        add("rightLowerLeg", b.rightLowerLeg.node)
        add("rightFoot",     b.rightFoot.node)
        addOpt("rightToes",  b.rightToes)

        return result
    }

    static func buildNodeToMeshMap(_ jsonObj: [String: Any]) -> [Int: Int] {
        guard let nodes = jsonObj["nodes"] as? [[String: Any]] else { return [:] }
        var map: [Int: Int] = [:]
        for (idx, node) in nodes.enumerated() {
            if let mesh = node["mesh"] as? Int {
                map[idx] = mesh
            }
        }
        return map
    }

    static func buildVRM0BlendShapeGroups(_ vrm1: VRM1, nodeToMesh: [Int: Int]) -> [[String: Any]] {
        guard let preset = vrm1.expressions?.preset else { return [] }
        var groups: [[String: Any]] = []

        func addGroup(name: String, presetName: String, expression: VRM1.Expressions.Expression) {
            guard let binds = expression.morphTargetBinds, !binds.isEmpty else { return }
            var vrm0Binds = [[String: Any]]()
            vrm0Binds.reserveCapacity(binds.count)
            for bind in binds {
                guard let meshIndex = nodeToMesh[bind.node] else { continue }
                // VRM0 uses 0-100 weight; VRM1 uses 0-1.
                let weight = bind.weight * 100.0
                vrm0Binds.append([
                    "mesh": meshIndex,
                    "index": bind.index,
                    "weight": weight
                ])
            }
            guard !vrm0Binds.isEmpty else { return }
            var group: [String: Any] = [
                "name": name,
                "presetName": presetName,
                "binds": vrm0Binds
            ]
            if expression.isBinary == true {
                group["isBinary"] = true
            }
            groups.append(group)
        }

        addGroup(name: "happy", presetName: "joy", expression: preset.happy)
        addGroup(name: "angry", presetName: "angry", expression: preset.angry)
        addGroup(name: "sad", presetName: "sorrow", expression: preset.sad)
        addGroup(name: "relaxed", presetName: "relaxed", expression: preset.relaxed)
        addGroup(name: "surprised", presetName: "fun", expression: preset.surprised)

        addGroup(name: "aa", presetName: "a", expression: preset.aa)
        addGroup(name: "ih", presetName: "i", expression: preset.ih)
        addGroup(name: "ou", presetName: "u", expression: preset.ou)
        addGroup(name: "ee", presetName: "e", expression: preset.ee)
        addGroup(name: "oh", presetName: "o", expression: preset.oh)

        addGroup(name: "blink", presetName: "blink", expression: preset.blink)
        addGroup(name: "blinkLeft", presetName: "blink_l", expression: preset.blinkLeft)
        addGroup(name: "blinkRight", presetName: "blink_r", expression: preset.blinkRight)

        addGroup(name: "lookUp", presetName: "lookup", expression: preset.lookUp)
        addGroup(name: "lookDown", presetName: "lookdown", expression: preset.lookDown)
        addGroup(name: "lookLeft", presetName: "lookleft", expression: preset.lookLeft)
        addGroup(name: "lookRight", presetName: "lookright", expression: preset.lookRight)

        addGroup(name: "neutral", presetName: "neutral", expression: preset.neutral)

        return groups
    }

    static func buildVRM0MaterialProperties(_ jsonObj: [String: Any]) -> [[String: Any]] {
        guard let materials = jsonObj["materials"] as? [[String: Any]] else { return [] }
        var result = [[String: Any]]()
        for material in materials {
            guard let name = material["name"] as? String else { continue }
            guard let extensions = material["extensions"] as? [String: Any],
                  extensions["KHR_materials_unlit"] != nil else {
                continue
            }
            result.append([
                "name": name,
                "shader": "Unlit",
                "renderQueue": 2000,
                "floatProperties": [String: Any](),
                "keywordMap": [String: Bool](),
                "tagMap": [String: String](),
                "textureProperties": [String: Int](),
                "vectorProperties": [String: Any]()
            ])
        }
        return result
    }

    
}
