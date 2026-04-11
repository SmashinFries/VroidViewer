package com.dedicatus.VroidViewer.vrm

import android.util.Log
import com.google.android.filament.Material
import com.google.android.filament.MaterialInstance
import kotlin.math.min
import kotlin.math.pow

private const val TAG = "NativeVrmView+Materials"

internal fun NativeVrmView.applyMToonMaterialsIfNeeded() {
    if (renderableEntities.isEmpty()) return
    if (mtoonMaterialsByName.isEmpty() && vrm0MaterialsByName.isEmpty()) return

    var touchedCount = 0
    for (entity in renderableEntities) {
        val rm = renderableManager ?: continue
        val instance = rm.getInstance(entity)
        if (instance == 0) continue
        val primitiveCount = rm.getPrimitiveCount(instance)
        var touchedEntity = false

        for (i in 0 until primitiveCount) {
            val materialInstance = rm.getMaterialInstanceAt(instance, i) ?: continue
            val materialName =
                (materialInstance.name ?: materialInstance.material.name ?: "").lowercase()

            val mtoon = mtoonMaterialsByName[materialName]
            val vrm0 = vrm0MaterialsByName[materialName]?.takeIf {
                it.shader.lowercase().contains("mtoon")
            }
            if (mtoon == null && vrm0 == null) continue

            val baseFallback = floatArrayOf(1f, 1f, 1f, 1f)
            val baseRaw = color4From(
                mtoon?.baseColor ?: vrm0?.vectorProps?.get("_Color"),
                baseFallback
            )
            val shadeRaw = color3From(
                mtoon?.shadeColor ?: vrm0?.vectorProps?.get("_ShadeColor")
            )

            val shadingShift = mtoon?.shadingShift
                ?: vrm0?.floatProps?.get("_ShadingShift")
                ?: 0f
            val shadingToony = mtoon?.shadingToony
                ?: vrm0?.floatProps?.get("_ShadingToony")
                ?: 0f

            // Convert to linear for Filament
            val base = sRGBToLinear(baseRaw)
            val shade = shadeRaw?.let { sRGBToLinear(it) }

            val finalColor = if (shade != null) {
                mixToonColor(base, shade, shadingToony, shadingShift)
            } else {
                base
            }

            trySetColorParameter(materialInstance, "baseColorFactor", finalColor)
            trySetFloatParameter(materialInstance, "metallicFactor", 0f)
            trySetFloatParameter(materialInstance, "roughnessFactor", 1f)
            trySetFloatParameter(materialInstance, "clearcoatFactor", 0f)
            trySetFloatParameter(materialInstance, "reflectance", 0.1f)

            val doubleSided = mtoon?.doubleSided
                ?: ((vrm0?.floatProps?.get("_CullMode") ?: 1f) <= 0.5f)
            if (doubleSided) {
                materialInstance.setDoubleSided(true)
                materialInstance.setCullingMode(Material.CullingMode.NONE)
                touchedEntity = true
            }

            val alphaMode = mtoon?.alphaMode ?: ""
            val alphaCutoff = mtoon?.alphaCutoff
                ?: vrm0?.floatProps?.get("_Cutoff")
            val alphaTest = alphaMode.equals("MASK", ignoreCase = true) ||
                (vrm0?.keywordMap?.get("_ALPHATEST_ON") == true)
            if (alphaTest && alphaCutoff != null) {
                trySetFloatParameter(materialInstance, "alphaCutoff", alphaCutoff)
            }

            val blendRequested = alphaMode.equals("BLEND", ignoreCase = true) ||
                (vrm0?.keywordMap?.get("_ALPHABLEND_ON") == true) ||
                (vrm0?.keywordMap?.get("_ALPHAPREMULTIPLY_ON") == true)
            if (mtoon?.transparentWithZWrite == true || blendRequested) {
                materialInstance.setDepthWrite(mtoon?.transparentWithZWrite == true)
                materialInstance.setColorWrite(true)
                touchedEntity = true
            }

            val queueOffset = mtoon?.renderQueueOffset ?: 0
            if (queueOffset != 0) {
                rm.setGlobalBlendOrderEnabledAt(instance, i, true)
                rm.setBlendOrderAt(instance, i, queueOffset)
                touchedEntity = true
            }

            touchedCount++
        }

        if (touchedEntity) {
            rm.setCulling(instance, false)
        }
    }

    if (touchedCount > 0) {
        Log.d(TAG, "Applied MToon material approximations: $touchedCount primitives")
    }
}

internal fun NativeVrmView.color4From(color: FloatArray?, fallback: FloatArray): FloatArray {
    if (color == null || color.isEmpty()) return fallback
    val r = color.getOrNull(0) ?: fallback[0]
    val g = color.getOrNull(1) ?: fallback[1]
    val b = color.getOrNull(2) ?: fallback[2]
    val a = color.getOrNull(3) ?: fallback[3]
    return floatArrayOf(r, g, b, a)
}

internal fun NativeVrmView.color3From(color: FloatArray?): FloatArray? {
    if (color == null || color.size < 3) return null
    return floatArrayOf(color[0], color[1], color[2])
}

internal fun NativeVrmView.mixToonColor(base: FloatArray, shade: FloatArray, shadingToony: Float, shadingShift: Float): FloatArray {
    val toony = shadingToony.coerceIn(0f, 1f)
    val shift = shadingShift.coerceIn(-1f, 1f)
    // Reduced mix factor (0.35 -> 0.25) to make the shade more subtle and allow dynamic shadows to be more distinguishable
    val mix = (0.25f + (toony * 0.35f) + (shift * 0.15f)).coerceIn(0f, 1f)
    val inv = 1f - mix
    return floatArrayOf(
        base[0] * inv + shade[0] * mix,
        base[1] * inv + shade[1] * mix,
        base[2] * inv + shade[2] * mix,
        base[3]
    )
}

private fun sRGBToLinearScalar(c: Float): Float {
    val base = ((c + 0.055f) / 1.055f).toDouble()
    return if (c <= 0.04045f) c / 12.92f else base.pow(2.4).toFloat()
}

internal fun NativeVrmView.sRGBToLinear(color: FloatArray): FloatArray {
    val res = color.copyOf()
    for (i in 0 until min(3, res.size)) {
        res[i] = sRGBToLinearScalar(res[i])
    }
    return res
}

internal fun NativeVrmView.trySetFloatParameter(materialInstance: MaterialInstance, name: String, value: Float) {
    val param = materialInstance.material.parameters.firstOrNull { it.name == name } ?: return
    if (param.type == Material.Parameter.Type.FLOAT) {
        materialInstance.setParameter(name, value)
    }
}

internal fun NativeVrmView.trySetColorParameter(materialInstance: MaterialInstance, name: String, color: FloatArray) {
    val param = materialInstance.material.parameters.firstOrNull { it.name == name } ?: return
    when (param.type) {
        Material.Parameter.Type.FLOAT4 -> {
            materialInstance.setParameter(name, color[0], color[1], color[2], color[3])
        }
        Material.Parameter.Type.FLOAT3 -> {
            materialInstance.setParameter(name, color[0], color[1], color[2])
        }
        else -> Unit
    }
}

internal fun NativeVrmView.fixEyeMaterialsIfNeeded() {
    if (renderableEntities.isEmpty()) return
    val patterns = listOf("eye", "iris", "pupil", "sclera", "cornea", "lash", "eyelash")
    var adjusted = 0
    val rm = renderableManager ?: return
    for (entity in renderableEntities) {
        val instance = rm.getInstance(entity)
        val primitiveCount = rm.getPrimitiveCount(instance)
        var touched = false
        for (i in 0 until primitiveCount) {
            val materialInstance = rm.getMaterialInstanceAt(instance, i) ?: continue
            val name = materialInstance.name?.lowercase() ?: ""
            if (patterns.any { name.contains(it) }) {
                materialInstance.setDoubleSided(true)
                materialInstance.setCullingMode(Material.CullingMode.NONE)
                materialInstance.setDepthWrite(true)
                materialInstance.setColorWrite(true)
                rm.setGlobalBlendOrderEnabledAt(instance, i, true)
                rm.setBlendOrderAt(instance, i, 10)
                adjusted++
                touched = true
            }
        }
        if (touched) {
            rm.setCulling(instance, false)
        }
    }
    if (adjusted > 0) {
        Log.d(TAG, "Adjusted $adjusted eye material primitives")
    }
}
