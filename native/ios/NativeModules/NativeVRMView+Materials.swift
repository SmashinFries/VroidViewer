import RealityKit
import VRMKit
import VRMRealityKit
import Metal
import UIKit

@available(iOS 18.0, *)
extension NativeVRMView {
    
    func applyMToonMaterials(to entity: Entity, vrm: VRM) {
        guard let device = MTLCreateSystemDefaultDevice(),
              let library = device.makeDefaultLibrary() else {
            print("❌ NativeVRMView: Failed to create Metal library for MToon")
            return
        }
        
        let surfaceShader = CustomMaterial.SurfaceShader(named: "mToonSurfaceShader", in: library)
        
        // Map material names to their properties
        var materialMap: [String: VRM.MaterialProperty] = [:]
        for property in vrm.materialProperties {
            materialMap[property.name] = property
        }
        
        var appliedCount = 0
        
        // Traverse the entity hierarchy
        var queue = [entity]
        while !queue.isEmpty {
            let node = queue.removeFirst()
            queue.append(contentsOf: node.children)
            
            guard var modelComp = node.components[ModelComponent.self] as? ModelComponent else {
                continue
            }
            
            let newMaterials = modelComp.materials.enumerated().map { (index, mat) -> Material in
                // We'll try to find the matching VRM material by name
                // Note: RealityKit doesn't easily expose the original material name from the glTF mesh primitive,
                // but we can try to match by index if names aren't available, or rely on the order.
                // For now, let's assume we can find the name or use the first one available if simple.
                
                // Better approach: Look at the names in the order they appear.
                // This is a bit of a heuristic.
                let matName = mat.name ?? ""
                guard let props = materialMap[matName] ?? materialMap.values.filter({ $0.name.contains(matName) }).first else {
                    return mat
                }
                
                // Only handle MToon materials
                guard props.shader == "VRM/MToon" else {
                    return mat
                }
                
                do {
                    var customMat = try CustomMaterial(surfaceShader: surfaceShader, lightingModel: .unlit)
                    
                    // Lit Color
                    if let vectorProps = props.vectorProperties as? [String: Any],
                       let colorArr = vectorProps["_Color"] as? [Double], colorArr.count >= 3 {
                        customMat.baseColor = .init(tint: UIColor(red: CGFloat(colorArr[0]),
                                                                  green: CGFloat(colorArr[1]),
                                                                  blue: CGFloat(colorArr[2]),
                                                                  alpha: 1.0))
                    }
                    
                    // Shade Color
                    if let vectorProps = props.vectorProperties as? [String: Any],
                       let shadeArr = vectorProps["_ShadeColor"] as? [Double], shadeArr.count >= 3 {
                        customMat.emissiveColor = .init(color: UIColor(red: CGFloat(shadeArr[0]),
                                                                        green: CGFloat(shadeArr[1]),
                                                                        blue: CGFloat(shadeArr[2]),
                                                                        alpha: 1.0))
                    }
                    
                    // Shading Shift Factor -> Roughness
                    if let floatProps = props.floatProperties as? [String: Any],
                       let shift = floatProps["_ShadingShiftFactor"] as? Double {
                        customMat.roughness = .init(floatLiteral: Float(shift))
                    }
                    
                    // Shading Toony Factor -> Metallic
                    if let floatProps = props.floatProperties as? [String: Any],
                       let toony = floatProps["_ShadingToonyFactor"] as? Double {
                        customMat.metallic = .init(floatLiteral: Float(toony))
                    }
                    
                    // Rim Lighting Mix Factor -> Specular
                    if let floatProps = props.floatProperties as? [String: Any],
                       let rimMix = floatProps["_RimLightingMixFactor"] as? Double {
                        customMat.specular = .init(floatLiteral: Float(rimMix))
                    }
                    
                    // Map Base Texture if available
                    if let pbr = mat as? PhysicallyBasedMaterial {
                        customMat.baseColor.texture = pbr.baseColor.texture
                        customMat.opacityThreshold = pbr.opacityThreshold
                    }
                    
                    appliedCount += 1
                    return customMat
                } catch {
                    print("❌ NativeVRMView: Failed to create CustomMaterial for \(matName): \(error)")
                    return mat
                }
            }
            
            modelComp.materials = newMaterials
            node.components.set(modelComp)
        }
        
        print("🎨 NativeVRMView: Applied MToon to \(appliedCount) materials")
    }
}
