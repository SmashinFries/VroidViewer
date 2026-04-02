import RealityKit
import ARKit
import VRMKit
import VRMRealityKit
import React

@available(iOS 18.0, *)
extension NativeVRMView {
    // MARK: - Model Loading

    func loadModel(from uriString: String) {
        guard !isLoadingModel else { return }

        let url: URL
        if uriString.hasPrefix("file://") {
            guard let fileUrl = URL(string: uriString) else { return }
            url = fileUrl
        } else {
            url = URL(fileURLWithPath: uriString)
        }

        isLoadingModel = true
        self.vrmEntity?.entity.isEnabled = false
        print("🚀 NativeVRMView: Loading model from \(uriString)")

        // Read file data on background thread.
        // VRMEntityLoader is @MainActor and MUST be called on the main thread —
        // calling it on a background queue causes EXC_BREAKPOINT.
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                let data = try Data(contentsOf: url)

                // --- VRM 0.x path ---
                if let vrm0 = try? VRMLoader().load(withData: data) {
                    print("✅ NativeVRMView: VRM 0.x format detected")
                    DispatchQueue.main.async {
                        self?.loadedIsVRM0 = true
                        self?.createEntity(from: vrm0)
                    }
                    return
                }

                // --- VRM 1.x path ---
                // VRMRealityKit 0.7.1 has no VRM1EntityLoader, so we inject a minimal
                // VRM 0.x "VRM" extension into the GLTF JSON, preserving the VRM1
                // humanoid bone indices. VRMEntityLoader then loads it correctly using
                // the GLTF geometry data and the injected bone map.
                do {
                    // Some VRM 1.x files omit required fields (e.g. firstPerson.meshAnnotations).
                    // Patch the JSON for decoding tolerance before using VRMLoader(VRM1).
                    let decodeData = (try? VRMShimUtils.patchVRM1ForDecode(data: data)) ?? data
                    let vrm1 = try VRMLoader().load(VRM1.self, withData: decodeData)
                    print("✅ NativeVRMView: VRM 1.x format detected, building compatibility shim…")
                    let patched = try VRMShimUtils.patchVRM1ForLoader(data: decodeData, vrm1: vrm1)
                    let vrm0 = try VRMLoader().load(withData: patched)
                    print("✅ NativeVRMView: VRM 1.x compatibility shim ready")
                    DispatchQueue.main.async {
                        self?.loadedIsVRM0 = false
                        self?.createEntity(from: vrm0)
                    }
                } catch {
                    print("❌ NativeVRMView: VRM 1.x shim failed: \(error)")
                    DispatchQueue.main.async { self?.isLoadingModel = false }
                }

            } catch {
                print("❌ NativeVRMView: File read failed: \(error)")
                DispatchQueue.main.async { self?.isLoadingModel = false }
            }
        }
    }

    func createEntity(from vrm: VRM) {
        do {
            let loader = VRMEntityLoader(vrm: vrm)
            let entity = try loader.loadEntity()
            isLoadingModel = false
            integrateLoadedEntity(entity, vrm: vrm)
        } catch {
            print("❌ NativeVRMView: VRMEntityLoader failed: \(error)")
            isLoadingModel = false
        }
    }

    func integrateLoadedEntity(_ entity: VRMEntity, vrm: VRM) {
        print("🛠 NativeVRMView: Integrating entity…")

        vrmEntity?.entity.removeFromParent()
        self.vrmEntity = entity
        lookAtInitialized = false
        entity.entity.isEnabled = false
        anchorEntity.addChild(entity.entity)

        applyModelVisibility()
        applyModelOrientation()
        applyExpressions()
        applyBoneRotations()
        
        // Apply MToon Materials
        applyMToonMaterials(to: entity.entity, vrm: vrm)
        
        applyModelVisibility()

        if let leftEye = entity.humanoid.node(for: .leftEye),
            let rightEye = entity.humanoid.node(for: .rightEye)
        {
            let lpos = leftEye.position(relativeTo: nil)
            let rpos = rightEye.position(relativeTo: nil)
            orbitTarget = (lpos + rpos) * 0.5
        } else if let head = entity.humanoid.node(for: .head) {
            orbitTarget = head.position(relativeTo: nil)
        }

        updateCamera()
    }

    func applyModelVisibility() {
        vrmEntity?.entity.isEnabled = showModel
    }


}
