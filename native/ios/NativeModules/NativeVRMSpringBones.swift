import RealityKit
import simd
import Foundation

internal struct ParsedSpringBoneCollider {
    let nodeName: String
    let offset: SIMD3<Float>
    let radius: Float
    let tail: SIMD3<Float>?
}

internal struct ParsedSpringBoneJoint {
    let nodeName: String
    let hitRadius: Float
    let stiffness: Float
    let gravityPower: Float
    let gravityDir: SIMD3<Float>
    let dragForce: Float
}

internal struct ParsedSpringBone {
    let name: String
    let centerNodeName: String?
    let joints: [ParsedSpringBoneJoint]
    let colliderIndices: [Int]
}

internal struct ParsedSpringBoneData {
    let colliders: [ParsedSpringBoneCollider]
    let springs: [ParsedSpringBone]
}

@available(iOS 18.0, *)
internal class NativeVRMSpringBones {
    class RuntimeCollider {
        let entity: Entity
        let offset: SIMD3<Float>
        let radius: Float
        let tail: SIMD3<Float>?
        var worldMatrix: float4x4 = matrix_identity_float4x4

        init(entity: Entity, parsed: ParsedSpringBoneCollider) {
            self.entity = entity
            self.offset = parsed.offset
            self.radius = parsed.radius
            self.tail = parsed.tail
        }
    }

    class RuntimeJoint {
        let entity: Entity
        let hitRadius: Float
        let stiffness: Float
        let gravityPower: Float
        let gravityDir: SIMD3<Float>
        let dragForce: Float
        let centerEntity: Entity?
        let colliders: [RuntimeCollider]

        var parentEntity: Entity?
        var childEntity: Entity?
        var initialTransform: float4x4 = matrix_identity_float4x4
        var localRestRot: simd_quatf = simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
        
        var boneAxis: SIMD3<Float> = SIMD3<Float>(0, -1, 0)
        var boneLength: Float = 0.05
        
        // Verlet state in WORLD space
        var currentTail: SIMD3<Float> = .zero
        var prevTail: SIMD3<Float> = .zero
        
        // Optimization: track motion to skip physics when idle
        var lastParentWorldPos: SIMD3<Float> = .zero
        var lastParentWorldRot: simd_quatf = simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
        var isSettled = false
        var initialized = false

        init(entity: Entity, parsed: ParsedSpringBoneJoint, center: Entity?, colliders: [RuntimeCollider]) {
            self.entity = entity
            self.hitRadius = parsed.hitRadius
            self.stiffness = parsed.stiffness
            self.gravityPower = parsed.gravityPower
            self.gravityDir = parsed.gravityDir
            self.dragForce = parsed.dragForce
            self.centerEntity = center
            self.colliders = colliders
        }
    }

    private var joints: [RuntimeJoint] = []
    private var colliders: [RuntimeCollider] = []
    private var accumulator: Float = 0
    private let fixedDeltaTime: Float = 1.0 / 60.0

    init(entitiesByName: [String: Entity], data: ParsedSpringBoneData) {
        var colliderMap: [Int: RuntimeCollider] = [:]
        for (index, parsedCol) in data.colliders.enumerated() {
            if let entity = entitiesByName[parsedCol.nodeName] {
                let rc = RuntimeCollider(entity: entity, parsed: parsedCol)
                colliders.append(rc)
                colliderMap[index] = rc
            }
        }

        let bodyKeywords = ["hair", "bust", "breast", "tail", "ear", "髪", "胸", "尾", "耳", "頭", "肢"]
        let outfitKeywords = ["skirt", "clothing", "cloth", "dress", "sleeve", "ribbon", "outfit", "accessory", "acc", "coat", "pant", "shirt", "tie", "cape", "apron", "hat", "jacket", "hoodie", "uniform", "waist", "belt", "pocket", "frill", "lace", "cap", "shoes", "boot", "sock", "onepiece", "necktie", "collar", "button", "mesh", "part", "prop", "extra", "wing", "feather", "bow", "ornament", "mantle", "shoulderpad", "armor", "decoration", "decor", "スカート", "服", "衣装", "袖", "リボン", "アクセ", "メッシュ", "羽", "翼", "飾り", "装飾"]

        for spring in data.springs {
            let centerEntity = spring.centerNodeName.flatMap { entitiesByName[$0] }
            let springColliders = spring.colliderIndices.compactMap { colliderMap[$0] }
            
            let lowerGroupName = spring.name.lowercased()
            let groupIsOutfit = outfitKeywords.contains { lowerGroupName.contains($0) }
            let groupIsBody = bodyKeywords.contains { lowerGroupName.contains($0) }

            for var parsedJoint in spring.joints {
                let lowerNodeName = parsedJoint.nodeName.lowercased()
                let nodeIsBody = bodyKeywords.contains { lowerNodeName.contains($0) }
                let nodeIsOutfit = outfitKeywords.contains { lowerNodeName.contains($0) }
                
                var finalIsOutfit = false
                if groupIsOutfit || nodeIsOutfit {
                    finalIsOutfit = true
                }
                // Body/Hair parts should take precedence to keep their gravity (hair points down)
                if groupIsBody || nodeIsBody {
                    finalIsOutfit = false
                }

                if finalIsOutfit {
                    // For outfits, we override the gravityPower to 0 to prevent sagging/drooping.
                    // We also increase dragForce to make them follow the body more rigidly without swinging.
                    let modifiedJoint = ParsedSpringBoneJoint(
                        nodeName: parsedJoint.nodeName,
                        hitRadius: parsedJoint.hitRadius,
                        stiffness: parsedJoint.stiffness * 0.5, // Reduced stiffness for smoother follow
                        gravityPower: 0,
                        gravityDir: parsedJoint.gravityDir,
                        dragForce: max(parsedJoint.dragForce, 0.8) // High drag for stable outfit follow
                    )
                    parsedJoint = modifiedJoint
                }

                if let entity = entitiesByName[parsedJoint.nodeName] {
                    let rj = RuntimeJoint(entity: entity, parsed: parsedJoint, center: centerEntity, colliders: springColliders)
                    joints.append(rj)
                }
            }
        }
    }

    func setup() {
        for joint in joints {
            joint.parentEntity = joint.entity.parent
            joint.childEntity = joint.entity.children.first

            joint.initialTransform = joint.entity.transform.matrix
            joint.localRestRot = joint.entity.transform.rotation

            if let child = joint.childEntity {
                let translation = child.transform.translation
                let len = length(translation)
                if len > 0.001 {
                    joint.boneAxis = normalize(translation)
                    joint.boneLength = len
                } else {
                    joint.boneAxis = SIMD3<Float>(0, -1, 0)
                    joint.boneLength = 0.05
                }
            } else {
                joint.boneAxis = SIMD3<Float>(0, -1, 0)
                joint.boneLength = 0.05
            }

            let worldPos = joint.entity.position(relativeTo: nil)
            let worldRot = joint.entity.orientation(relativeTo: nil)
            
            let localTail = joint.boneAxis * joint.boneLength
            let worldTailPos = worldPos + worldRot.act(localTail)

            joint.currentTail = worldTailPos
            joint.prevTail = worldTailPos
            joint.lastParentWorldPos = worldPos
            joint.lastParentWorldRot = worldRot
            joint.initialized = true
        }
    }

    func update(deltaTime: Float) {
        if deltaTime <= 0 || joints.isEmpty { return }

        // Update colliders
        for col in colliders {
            col.worldMatrix = col.entity.transformMatrix(relativeTo: nil)
        }

        accumulator += deltaTime
        // Limit accumulator to prevent "spiral of death" during lag spikes
        if accumulator > 0.1 { accumulator = 0.1 }

        // Use 2 sub-steps for better stability (120Hz effective physics)
        let subStepDt = fixedDeltaTime * 0.5
        while accumulator >= subStepDt {
            performPhysicsStep(dt: subStepDt)
            accumulator -= subStepDt
        }
    }

    private func performPhysicsStep(dt: Float) {
        for joint in joints {
            guard joint.initialized else { continue }

            let parentTransform = joint.parentEntity?.transformMatrix(relativeTo: nil) ?? matrix_identity_float4x4
            let localPos = joint.initialTransform.columns.3
            let currentParentWorldPos4 = parentTransform * localPos
            let nWorldPos = SIMD3<Float>(currentParentWorldPos4.x, currentParentWorldPos4.y, currentParentWorldPos4.z)
            
            let worldRot = (joint.parentEntity?.orientation(relativeTo: nil) ?? simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)) * joint.localRestRot
            
            // Motion Check with slightly higher epsilon for stability
            let moveDist = length(nWorldPos - joint.lastParentWorldPos)
            let rotDist = length(worldRot.vector - joint.lastParentWorldRot.vector)
            
            if moveDist > 0.0002 || rotDist > 0.0002 {
                joint.isSettled = false
                joint.lastParentWorldPos = nWorldPos
                joint.lastParentWorldRot = worldRot
            }

            let localRestCombined = parentTransform * joint.initialTransform
            let restTailWorldVec4 = localRestCombined * SIMD4<Float>(joint.boneAxis * joint.boneLength, 0.0)
            let restTailWorld = nWorldPos + SIMD3<Float>(restTailWorldVec4.x, restTailWorldVec4.y, restTailWorldVec4.z)

            if joint.isSettled {
                joint.currentTail = restTailWorld
                joint.prevTail = restTailWorld
                continue
            }

            // 1. Verlet Integration
            let inertia = (joint.currentTail - joint.prevTail) * (1.0 - joint.dragForce)
            let gravity = joint.gravityDir * (joint.gravityPower * 9.81 * dt * dt)
            let stiffnessPull = (restTailWorld - joint.currentTail) * (joint.stiffness * dt)

            var nextTail = joint.currentTail + inertia + gravity + stiffnessPull

            // 2. Bone Length Constraint & Velocity Capping
            // Prevents "vibrating" when stiffness is too high or bones are compressed.
            let toNext = nextTail - nWorldPos
            let toNextLen = length(toNext)
            if toNextLen > 0.0001 {
                // Cap the maximum displacement from rest position per step (stability)
                let maxShift = joint.boneLength * 0.25
                let shift = length(nextTail - joint.currentTail)
                if shift > maxShift {
                    nextTail = joint.currentTail + normalize(nextTail - joint.currentTail) * maxShift
                }
                
                // Final length constraint
                nextTail = nWorldPos + normalize(nextTail - nWorldPos) * joint.boneLength
            }

            // 3. Collision
            for col in joint.colliders {
                nextTail = resolveCollision(tail: nextTail, nodePos: nWorldPos, boneLength: joint.boneLength, hitRadius: joint.hitRadius, col: col)
            }

            // 4. Settling Refinement
            let velocity = length(nextTail - joint.currentTail)
            let distFromRest = length(nextTail - restTailWorld)
            // Settling helps stop microscopic oscillations (vibrations)
            if velocity < 0.0005 && distFromRest < 0.001 {
                joint.isSettled = true
            }

            joint.prevTail = joint.currentTail
            joint.currentTail = nextTail

            // 5. Apply Rotation (Stable projection)
            let parentInv = parentTransform.inverse
            let localNextTailParent4 = parentInv * SIMD4<Float>(nextTail.x, nextTail.y, nextTail.z, 1.0)
            let localNextTailParent = SIMD3<Float>(localNextTailParent4.x, localNextTailParent4.y, localNextTailParent4.z)
            
            let localP = SIMD3<Float>(localPos.x, localPos.y, localPos.z)
            let diff = localNextTailParent - localP
            if length(diff) > 0.0001 {
                let toTargetLocal = normalize(diff)
                let boneAxisParentSpace = normalize(joint.localRestRot.act(joint.boneAxis))

                let rotAxis = cross(boneAxisParentSpace, toTargetLocal)
                let rotAxisLen = length(rotAxis)
                let dotP = max(-1.0, min(1.0, dot(boneAxisParentSpace, toTargetLocal)))
                let rotAngle = acos(dotP)

                var localDeltaRot = simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
                if rotAxisLen > 0.0001 && rotAngle > 0.0001 {
                    localDeltaRot = simd_quatf(angle: rotAngle, axis: normalize(rotAxis))
                }
                joint.entity.transform.rotation = localDeltaRot * joint.localRestRot
            }
        }
    }

    private func resolveCollision(tail: SIMD3<Float>, nodePos: SIMD3<Float>, boneLength: Float, hitRadius: Float, col: RuntimeCollider) -> SIMD3<Float> {
        var currentTail = tail
        let m = col.worldMatrix

        if let tailEnd = col.tail {
            let start4 = m * SIMD4<Float>(col.offset.x, col.offset.y, col.offset.z, 1.0)
            let end4 = m * SIMD4<Float>(tailEnd.x, tailEnd.y, tailEnd.z, 1.0)
            let start = SIMD3<Float>(start4.x, start4.y, start4.z)
            let end = SIMD3<Float>(end4.x, end4.y, end4.z)
            let r = col.radius + hitRadius

            let segment = end - start
            let segmentLenSq = dot(segment, segment)
            var t: Float = 0
            if segmentLenSq > 0.0001 {
                t = max(0, min(1, dot(currentTail - start, segment) / segmentLenSq))
            }
            let center = start + segment * t

            let distVec = currentTail - center
            let dist = length(distVec)
            if dist < r && dist > 0.0001 {
                let push = normalize(distVec) * r
                currentTail = center + push
                currentTail = nodePos + normalize(currentTail - nodePos) * boneLength
            }
        } else {
            let center4 = m * SIMD4<Float>(col.offset.x, col.offset.y, col.offset.z, 1.0)
            let center = SIMD3<Float>(center4.x, center4.y, center4.z)
            let r = col.radius + hitRadius
            let distVec = currentTail - center
            let dist = length(distVec)
            if dist < r && dist > 0.0001 {
                let push = normalize(distVec) * r
                currentTail = center + push
                currentTail = nodePos + normalize(currentTail - nodePos) * boneLength
            }
        }

        return currentTail
    }
}
