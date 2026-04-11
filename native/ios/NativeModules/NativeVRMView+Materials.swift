import RealityKit
import simd
import VRMKit
import VRMRealityKit
import UIKit
import Foundation

// MARK: - Material System

@available(iOS 18.0, *)
extension NativeVRMView {

    func fixEyeMaterialsIfNeeded() {
        // VRM 1.x eyes often rely on MToon/unlit or alpha setup not supported in RealityKit.
        // As a pragmatic fix, adjust eye-related materials conservatively.
        guard loadedIsVRM0 == false, let root = vrmEntity?.entity else { return }

        let patterns = ["eye", "eyelash", "iris", "pupil", "cornea", "sclera", "lash", "eyeball"]
        var stack: [Entity] = [root]
        while let entity = stack.popLast() {
            stack.append(contentsOf: entity.children)
            let name = entity.name.lowercased()
            guard var model = (entity as? ModelEntity)?.model else { continue }

            var newMaterials: [Material] = []
            newMaterials.reserveCapacity(model.materials.count)
            var touched = false
            for material in model.materials {
                let materialName = material.name?.lowercased() ?? ""
                let matches = patterns.contains(where: { name.contains($0) || materialName.contains($0) })
                if let pbr = material as? PhysicallyBasedMaterial {
                    let isOpaque: Bool
                    switch pbr.blending {
                    case .opaque:
                        isOpaque = true
                    default:
                        isOpaque = false
                    }
                    let isTransparent = !isOpaque || pbr.opacityThreshold != nil
                    if matches || isTransparent {
                        var fixed = pbr
                        fixed.faceCulling = .none
                        if fixed.opacityThreshold == nil, !isOpaque {
                            fixed.opacityThreshold = 0.01
                        }
                        newMaterials.append(fixed)
                        touched = true
                    } else {
                        newMaterials.append(material)
                    }
                } else if var unlit = material as? UnlitMaterial {
                    let isOpaque: Bool
                    switch unlit.blending {
                    case .opaque:
                        isOpaque = true
                    default:
                        isOpaque = false
                    }
                    let isTransparent = !isOpaque || unlit.opacityThreshold != nil
                    if matches || isTransparent {
                        unlit.faceCulling = .none
                        if unlit.opacityThreshold == nil, !isOpaque {
                            unlit.opacityThreshold = 0.01
                        }
                        touched = true
                    }
                    newMaterials.append(unlit)
                } else {
                    newMaterials.append(material)
                }
            }
            if touched {
                model.materials = newMaterials
                (entity as? ModelEntity)?.model = model
            }
        }
    }

    func applyMToonMaterialsIfNeeded() {
        guard let root = vrmEntity?.entity else { return }
        guard !mtoonMaterialsByName.isEmpty else { return }

        var stack: [Entity] = [root]
        while let entity = stack.popLast() {
            stack.append(contentsOf: entity.children)
            guard var model = (entity as? ModelEntity)?.model else { continue }

            var updated: [Material] = []
            updated.reserveCapacity(model.materials.count)

            var touched = false
            for material in model.materials {
                let name = (material.name ?? "").lowercased()
                guard let config = mtoonMaterialsByName[name] else {
                    updated.append(material)
                    continue
                }

                if var pbr = material as? PhysicallyBasedMaterial {
                    // Approximate MToon with low specular response.
                    pbr.metallic = .init(floatLiteral: 0.0)
                    pbr.roughness = .init(floatLiteral: 1.0)

                    if config.doubleSided {
                        pbr.faceCulling = .none
                    }

                    if let shade = config.shadeColor {
                        var base = pbr.baseColor
                        let baseTint = base.tint
                        let baseRGBA = rgba(from: baseTint)
                        let toony = max(0, min(1, config.shadingToony))
                        let shift = max(-1, min(1, config.shadingShift))
                        let mix = max(0, min(1, 0.35 + (toony * 0.35) + (shift * 0.15)))

                        let finalTint = UIColor(
                            red: CGFloat(baseRGBA.x) * (1 - CGFloat(mix)) + CGFloat(shade.x) * CGFloat(mix),
                            green: CGFloat(baseRGBA.y) * (1 - CGFloat(mix)) + CGFloat(shade.y) * CGFloat(mix),
                            blue: CGFloat(baseRGBA.z) * (1 - CGFloat(mix)) + CGFloat(shade.z) * CGFloat(mix),
                            alpha: CGFloat(baseRGBA.w)
                        )
                        base.tint = finalTint
                        pbr.baseColor = base
                    }

                    updated.append(pbr)
                    touched = true
                } else if var unlit = material as? UnlitMaterial {
                    if config.doubleSided {
                        unlit.faceCulling = .none
                    }
                    updated.append(unlit)
                    touched = true
                } else {
                    updated.append(material)
                }
            }

            if touched {
                model.materials = updated
                (entity as? ModelEntity)?.model = model
            }
        }
    }

    func applyVRM0MaterialsIfNeeded() {
        guard let root = vrmEntity?.entity else { return }
        guard !vrm0MaterialsByName.isEmpty else { return }

        var stack: [Entity] = [root]
        while let entity = stack.popLast() {
            stack.append(contentsOf: entity.children)
            guard var model = (entity as? ModelEntity)?.model else { continue }

            var updated: [Material] = []
            updated.reserveCapacity(model.materials.count)
            var touched = false

            for material in model.materials {
                let name = (material.name ?? "").lowercased()
                guard let config = vrm0MaterialsByName[name] else {
                    if let pbr = material as? PhysicallyBasedMaterial {
                        // Prefer unlit for VRM0 to keep the flatter, anime-like look.
                        var unlit = makeUnlitFromPBR(pbr)
                        updated.append(unlit)
                        touched = true
                    } else {
                        updated.append(material)
                    }
                    continue
                }

                let shader = config.shader.lowercased()

                if shader.contains("unlit") {
                    if let pbr = material as? PhysicallyBasedMaterial {
                        var unlit = UnlitMaterial()
                        unlit.color = pbr.baseColor
                        applyVRM0UnlitConfig(&unlit, config: config, shader: shader)
                        updated.append(unlit)
                        touched = true
                    } else if var unlit = material as? UnlitMaterial {
                        applyVRM0UnlitConfig(&unlit, config: config, shader: shader)
                        updated.append(unlit)
                        touched = true
                    } else {
                        updated.append(material)
                    }
                    continue
                }

        if shader.contains("mtoon") {
            // Prefer unlit for VRM0 MToon to match the flatter (anime-like) look
            // historically seen with SceneKit rendering.
            if let pbr = material as? PhysicallyBasedMaterial {
                var unlit = UnlitMaterial()
                unlit.color = pbr.baseColor
                applyVRM0MToonUnlitConfig(&unlit, config: config)
                updated.append(unlit)
                touched = true
            } else if var unlit = material as? UnlitMaterial {
                applyVRM0MToonUnlitConfig(&unlit, config: config)
                updated.append(unlit)
                touched = true
            } else {
                if let pbr = material as? PhysicallyBasedMaterial {
                    var unlit = makeUnlitFromPBR(pbr)
                    applyVRM0UnlitConfig(&unlit, config: config, shader: shader)
                    updated.append(unlit)
                    touched = true
                } else {
                    updated.append(material)
                }
            }
            continue
        }

                updated.append(material)
            }

            if touched {
                model.materials = updated
                (entity as? ModelEntity)?.model = model
            }
        }
    }

    func applyVRM0UnlitConfig(_ material: inout UnlitMaterial, config: VRM0MaterialConfig, shader: String) {
        if let color = vrm0Color(config, key: "_Color") {
            material.color.tint = UIColor(
                red: CGFloat(color.x),
                green: CGFloat(color.y),
                blue: CGFloat(color.z),
                alpha: CGFloat(color.w)
            )
        }

        if shader.contains("cutout") {
            let cutoff = vrm0Float(config, key: "_Cutoff", defaultValue: 0.5)
            material.opacityThreshold = cutoff
        } else if shader.contains("transparent") {
            material.blending = transparentBlending()
            if shader.contains("zwrite") {
                material.opacityThreshold = material.opacityThreshold ?? 0.01
            }
        }
    }

    func applyVRM0MToonConfig(_ material: inout PhysicallyBasedMaterial, config: VRM0MaterialConfig) {
        material.metallic = .init(floatLiteral: 0.0)
        material.roughness = .init(floatLiteral: 1.0)

        if let base = vrm0Color(config, key: "_Color") {
            material.baseColor.tint = UIColor(
                red: CGFloat(base.x),
                green: CGFloat(base.y),
                blue: CGFloat(base.z),
                alpha: CGFloat(base.w)
            )
        }

        if let shade = vrm0Color(config, key: "_ShadeColor") {
            let baseRGBA = rgba(from: material.baseColor.tint)
            let toony = max(0, min(1, vrm0Float(config, key: "_ShadingToony", defaultValue: 0)))
            let shift = max(-1, min(1, vrm0Float(config, key: "_ShadingShift", defaultValue: 0)))
            let mix = max(0, min(1, 0.35 + (toony * 0.35) + (shift * 0.15)))

            let finalTint = UIColor(
                red: CGFloat(baseRGBA.x) * (1 - CGFloat(mix)) + CGFloat(shade.x) * CGFloat(mix),
                green: CGFloat(baseRGBA.y) * (1 - CGFloat(mix)) + CGFloat(shade.y) * CGFloat(mix),
                blue: CGFloat(baseRGBA.z) * (1 - CGFloat(mix)) + CGFloat(shade.z) * CGFloat(mix),
                alpha: CGFloat(baseRGBA.w)
            )
            material.baseColor.tint = finalTint
        }

        if config.keywordMap["_ALPHATEST_ON"] == true {
            material.opacityThreshold = vrm0Float(config, key: "_Cutoff", defaultValue: 0.5)
        } else if config.keywordMap["_ALPHABLEND_ON"] == true || config.keywordMap["_ALPHAPREMULTIPLY_ON"] == true {
            material.blending = transparentBlending()
        }

        if let cull = config.floatProps["_CullMode"], cull <= 0.5 {
            material.faceCulling = .none
        }
    }

    func applyVRM0MToonUnlitConfig(_ material: inout UnlitMaterial, config: VRM0MaterialConfig) {
        if let base = vrm0Color(config, key: "_Color") {
            material.color.tint = UIColor(
                red: CGFloat(base.x),
                green: CGFloat(base.y),
                blue: CGFloat(base.z),
                alpha: CGFloat(base.w)
            )
        }

        if let shade = vrm0Color(config, key: "_ShadeColor") {
            let baseRGBA = rgba(from: material.color.tint)
            let toony = max(0, min(1, vrm0Float(config, key: "_ShadingToony", defaultValue: 0)))
            let shift = max(-1, min(1, vrm0Float(config, key: "_ShadingShift", defaultValue: 0)))
            let mix = max(0, min(1, 0.35 + (toony * 0.35) + (shift * 0.15)))

            let finalTint = UIColor(
                red: CGFloat(baseRGBA.x) * (1 - CGFloat(mix)) + CGFloat(shade.x) * CGFloat(mix),
                green: CGFloat(baseRGBA.y) * (1 - CGFloat(mix)) + CGFloat(shade.y) * CGFloat(mix),
                blue: CGFloat(baseRGBA.z) * (1 - CGFloat(mix)) + CGFloat(shade.z) * CGFloat(mix),
                alpha: CGFloat(baseRGBA.w)
            )
            material.color.tint = finalTint
        }

        if config.keywordMap["_ALPHATEST_ON"] == true {
            material.opacityThreshold = vrm0Float(config, key: "_Cutoff", defaultValue: 0.5)
        } else if config.keywordMap["_ALPHABLEND_ON"] == true || config.keywordMap["_ALPHAPREMULTIPLY_ON"] == true {
            material.blending = transparentBlending()
        }

        if let cull = config.floatProps["_CullMode"], cull <= 0.5 {
            material.faceCulling = .none
        }
    }

    func makeUnlitFromPBR(_ pbr: PhysicallyBasedMaterial) -> UnlitMaterial {
        var unlit = UnlitMaterial()
        unlit.color = pbr.baseColor
        unlit.faceCulling = pbr.faceCulling

        if let threshold = pbr.opacityThreshold {
            unlit.opacityThreshold = threshold
        }

        let isOpaque: Bool
        switch pbr.blending {
        case .opaque:
            isOpaque = true
        default:
            isOpaque = false
        }
        if !isOpaque {
            unlit.blending = transparentBlending()
        }

        return unlit
    }

    func vrm0Float(_ config: VRM0MaterialConfig, key: String, defaultValue: Float) -> Float {
        return config.floatProps[key] ?? defaultValue
    }

    func vrm0Color(_ config: VRM0MaterialConfig, key: String) -> SIMD4<Float>? {
        guard let v = config.vectorProps[key], v.count >= 4 else { return nil }
        return SIMD4<Float>(v[0], v[1], v[2], v[3])
    }

    func rgba(from color: UIColor) -> SIMD4<Float> {
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var a: CGFloat = 1
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        return SIMD4<Float>(Float(r), Float(g), Float(b), Float(a))
    }

    func transparentBlending() -> PhysicallyBasedMaterial.Blending {
        return .transparent(opacity: .init(floatLiteral: 1.0))
    }
}
