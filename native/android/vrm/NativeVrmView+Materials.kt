package com.dedicatus.VroidViewer.vrm

import android.util.Log
import com.facebook.react.bridge.ReadableMapKeySetIterator
import com.google.android.filament.Material
import com.google.android.filament.Texture
import org.json.JSONArray
import org.json.JSONObject
import java.util.Arrays

/**
 * Material Handling and MToon application for NativeVrmView
 */

private const val TAG = "NativeVrmView+Materials"

fun NativeVrmView.applyMToonMaterials() {
    val model = asset ?: return
    val metadata = vrmMetadata ?: return
    val extensions = metadata.optJSONObject("extensions") ?: return
    val vrm0 = extensions.optJSONObject("VRM")
    val materialProps = vrm0?.optJSONArray("materialProperties") ?: return

    Log.d(TAG, "MToon: Applying materials for ${materialProps.length()} entries")

    // Map material names to their index in the VRM materialProperties array
    val materialMap = mutableMapOf<String, JSONObject>()
    for (i in 0 until materialProps.length()) {
        val prop = materialProps.optJSONObject(i) ?: continue
        val name = prop.optString("name")
        if (name.isNotBlank()) {
            materialMap[name] = prop
        }
    }

    for (entity in renderableEntities) {
        val instance = renderableManager.getInstance(entity)
        val primitiveCount = renderableManager.getPrimitiveCount(instance)
        for (i in 0 until primitiveCount) {
            val matInst = renderableManager.getMaterialInstanceAt(instance, i) ?: continue
            val matName = matInst.name ?: ""
            val props = materialMap[matName] ?: continue

            val shader = props.optString("shader")
            if (shader != "VRM/MToon") continue

            // 1. Get MToon Properties
            val vectorProps = props.optJSONObject("vectorProperties")
            val floatProps = props.optJSONObject("floatProperties")
            val keywordMap = props.optJSONObject("keywordMap")

            // Lit Color (_Color)
            val colorArr = vectorProps?.optJSONArray("_Color")
            if (colorArr != null && colorArr.length() >= 3) {
                matInst.setParameter("baseColorFactor", 
                    colorArr.getDouble(0).toFloat(),
                    colorArr.getDouble(1).toFloat(),
                    colorArr.getDouble(2).toFloat(),
                    colorArr.getDouble(3).toFloat()
                )
            }

            // Shade Color (_ShadeColor) - We'll use this to tint emissive for a "flat" look in shadows
            val shadeArr = vectorProps?.optJSONArray("_ShadeColor")
            if (shadeArr != null && shadeArr.length() >= 3) {
                 // In a real MToon shader this would be different, 
                 // but for now we'll set it as a param if the material supports it.
            }

            // Shading Shift / Toony
            val shadingShift = floatProps?.optDouble("_ShadingShiftFactor", 0.0)?.toFloat() ?: 0f
            val shadingToony = floatProps?.optDouble("_ShadingToonyFactor", 0.0)?.toFloat() ?: 0f

            // 2. Adjust Standard PBR for Toon-like look if no custom shader
            // Ensure zero glossiness
            matInst.setParameter("roughnessFactor", 1.0f)
            matInst.setParameter("metallicFactor", 0.0f)

            // 3. Culling / Double Sided
            val cullMode = floatProps?.optInt("_CullMode", 2) ?: 2 // 0: Off, 1: Front, 2: Back
            if (cullMode == 0) {
                matInst.setDoubleSided(true)
                matInst.setCullingMode(Material.CullingMode.NONE)
            }
        }
    }
}

fun NativeVrmView.fixEyeMaterialsIfNeeded() {
    if (renderableEntities.isEmpty()) return
    val patterns = listOf("eye", "iris", "pupil", "sclera", "cornea", "lash", "eyelash")
    var adjusted = 0
    for (entity in renderableEntities) {
        val instance = renderableManager.getInstance(entity)
        val primitiveCount = renderableManager.getPrimitiveCount(instance)
        var touched = false
        for (i in 0 until primitiveCount) {
            val materialInstance = renderableManager.getMaterialInstanceAt(instance, i) ?: continue
            val name = materialInstance.name?.lowercase() ?: ""
            if (patterns.any { name.contains(it) }) {
                materialInstance.setDoubleSided(true)
                materialInstance.setCullingMode(Material.CullingMode.NONE)
                materialInstance.setDepthWrite(true)
                materialInstance.setColorWrite(true)
                renderableManager.setGlobalBlendOrderEnabledAt(instance, i, true)
                renderableManager.setBlendOrderAt(instance, i, 10)
                adjusted++
                touched = true
            }
        }
        if (touched) {
            renderableManager.setCulling(instance, false)
        }
    }
    if (adjusted > 0) {
        Log.d(TAG, "Adjusted $adjusted eye material primitives")
    }
}

fun NativeVrmView.applyExpressions() {
    val model = asset ?: return
    val expressions = pendingExpressions ?: return
    if (renderableEntities.isEmpty()) return

    resetMorphWeights()
    val iterator: ReadableMapKeySetIterator = expressions.keySetIterator()
    while (iterator.hasNextKey()) {
        val key = iterator.nextKey()
        val weight = expressions.getDouble(key).toFloat()
        val lowerKey = key.lowercase()
        val possibleNames = expressionMapping[lowerKey] ?: listOf(lowerKey)

        for (renderableIndex in renderableEntities.indices) {
            val names = morphTargetNamesByRenderable[renderableIndex]
            val weights = morphWeightsByRenderable[renderableIndex]
            for (i in names.indices) {
                val targetName = names[i]
                if (possibleNames.any { targetName.contains(it) }) {
                    weights[i] = weight
                }
            }
        }
    }

    for (renderableIndex in renderableEntities.indices) {
        val entity = renderableEntities[renderableIndex]
        val instance = renderableManager.getInstance(entity)
        val weights = morphWeightsByRenderable[renderableIndex]
        renderableManager.setMorphWeights(instance, weights, weights.size)
    }
}

internal fun NativeVrmView.resetMorphWeights() {
    morphWeightsByRenderable.forEach { weights ->
        Arrays.fill(weights, 0f)
    }
}

internal val expressionMapping: Map<String, List<String>> = mapOf(
    "happy" to listOf("joy", "fun", "happy"),
    "angry" to listOf("angry"),
    "sad" to listOf("sorrow", "sad"),
    "surprised" to listOf("surprised"),
    "relaxed" to listOf("neutral", "relaxed"),
    "blink" to listOf("blink", "close"),
    "aa" to listOf("mth_a", "vowel_a"),
    "ih" to listOf("mth_i", "vowel_i"),
    "ou" to listOf("mth_u", "vowel_u"),
    "ee" to listOf("mth_e", "vowel_e"),
    "oh" to listOf("mth_o", "vowel_o"),
)

fun NativeVrmView.applyHiddenMeshes() {
    val model = asset ?: return
    if (renderableEntities.isEmpty()) return
    
    if (hiddenRenderables.isNotEmpty()) {
        for (entity in hiddenRenderables) {
            scene.addEntity(entity)
        }
        hiddenRenderables.clear()
    }

    if (hiddenMeshNames.isEmpty()) return

    var matchedCount = 0
    for (name in hiddenMeshNames) {
        val key = wardrobeKey(name)
        if (key.isBlank()) continue
        val entities = renderableNameIndex[key] ?: continue
        for (entity in entities) {
            if (hiddenRenderables.contains(entity)) continue
            scene.removeEntity(entity)
            hiddenRenderables.add(entity)
            matchedCount++
        }
    }
    Log.d(TAG, "Wardrobe hidden renderables: $matchedCount")
}
