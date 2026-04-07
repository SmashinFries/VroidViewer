import RealityKit
import simd
import VRMKit
import VRMRealityKit

@available(iOS 18.0, *)
extension NativeVRMView {
    
    func configureSpringBones(vrm: VRM) {
        print("💡 NativeVRMView: Configuring spring bones…")
        
        guard let vrmEntity = self.vrmEntity else {
            print("⚠️ NativeVRMView: Cannot configure spring bones, vrmEntity is nil")
            return
        }
        
        // 1. Build a map of node names (or indices) to Entity
        let entitiesByName = buildEntitiesByNameMap(root: vrmEntity.entity)
        
        // 2. Extract physics data from VRM
        let physicsData = extractSpringBoneData(vrm: vrm)
        
        // 3. Initialize the physics engine
        let engine = NativeVRMSpringBones(entitiesByName: entitiesByName, data: physicsData)
        engine.setup()
        
        self.springBones = engine
        print("✅ NativeVRMView: Spring bones configured with \(physicsData.springs.count) groups")
    }
    
    private func buildEntitiesByNameMap(root: Entity) -> [String: Entity] {
        var map: [String: Entity] = [:]
        
        func traverse(_ entity: Entity) {
            // VRMEntityLoader typically names entities by their GLTF node name.
            // We also index them by name for the physics engine to find.
            map[entity.name] = entity
            for child in entity.children {
                traverse(child)
            }
        }
        
        traverse(root)
        return map
    }
    
    private func extractSpringBoneData(vrm: VRM) -> ParsedSpringBoneData {
        var colliders: [ParsedSpringBoneCollider] = []
        var springs: [ParsedSpringBone] = []
        
        // Helper closure to get node name for an index.
        // Since we cannot rely on internal structure, fallback to "node_<index>".
        let nodeName: (Int) -> String = { index in
            return "node_\(index)"
        }
        
        // 1. Parse Colliders
        for colGroup in vrm.secondaryAnimation.colliderGroups {
            let nodeName = nodeName(colGroup.node)
            
            for col in colGroup.colliders {
                let parsed = ParsedSpringBoneCollider(
                    nodeName: nodeName,
                    offset: SIMD3<Float>(Float(col.offset.x), Float(col.offset.y), Float(col.offset.z)),
                    radius: Float(col.radius),
                    tail: nil // VRM 0.x colliders are usually just spheres
                )
                colliders.append(parsed)
            }
        }
        
        // 2. Parse Springs (BoneGroups)
        for group in vrm.secondaryAnimation.boneGroups {
            var parsedJoints: [ParsedSpringBoneJoint] = []
            
            for boneIdx in group.bones {
                let nodeName = nodeName(boneIdx)
                
                let joint = ParsedSpringBoneJoint(
                    nodeName: nodeName,
                    hitRadius: Float(group.hitRadius),
                    stiffness: Float(group.stiffiness),
                    gravityPower: Float(group.gravityPower),
                    gravityDir: SIMD3<Float>(Float(group.gravityDir.x), Float(group.gravityDir.y), Float(group.gravityDir.z)),
                    dragForce: Float(group.dragForce)
                )
                parsedJoints.append(joint)
            }
            
            let centerNodeName = group.center >= 0 ? nodeName(group.center) : nil
            
            let spring = ParsedSpringBone(
                name: group.comment ?? "SpringGroup",
                centerNodeName: centerNodeName,
                joints: parsedJoints,
                colliderIndices: group.colliderGroups // These indices match the VRM0 colliderGroups array
            )
            springs.append(spring)
        }
        
        return ParsedSpringBoneData(colliders: colliders, springs: springs)
    }
}

// Helper for safe array access
extension Array {
    subscript(safe index: Int) -> Element? {
        return indices.contains(index) ? self[index] : nil
    }
}
