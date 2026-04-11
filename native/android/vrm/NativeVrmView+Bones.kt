package com.dedicatus.VroidViewer.vrm

import android.util.Log
import com.facebook.react.bridge.ReadableMapKeySetIterator
import dev.romainguy.kotlin.math.Float3
import dev.romainguy.kotlin.math.Quaternion
import kotlin.math.min
import com.google.android.filament.*

/**
 * Bone Rotations and Expressions for NativeVrmView
 */

internal fun NativeVrmView.applyExpressions() {
    val model = asset ?: return
    val expressions = pendingExpressions ?: return
    if (renderableEntities.isEmpty()) return

    // Reset morph weights
    for (renderableIndex in renderableEntities.indices) {
        val weights = morphWeightsByRenderable[renderableIndex]
        for (i in weights.indices) weights[i] = 0f
    }

    val iterator: ReadableMapKeySetIterator = expressions.keySetIterator()
    while (iterator.hasNextKey()) {
        val key = iterator.nextKey()
        val weight = expressions.getDouble(key).toFloat()
        val lowerKey = key.lowercase()
        
        if (nativeLipSyncEnabled && visemeMappings.containsKey(lowerKey)) {
            continue
        }
        
        val possibleNames = expressionMapping[lowerKey] ?: listOf(lowerKey)

        for (renderableIndex in renderableEntities.indices) {
            val names = morphTargetNamesByRenderable[renderableIndex]
            val weights = morphWeightsByRenderable[renderableIndex]
            val limit = min(names.size, weights.size)
            for (i in 0 until limit) {
                val targetNameLower = names[i].lowercase()
                
                if (possibleNames.any { targetNameLower.contains(it.lowercase()) }) {
                    weights[i] = weight
                }
            }
        }
    }

    for (renderableIndex in renderableEntities.indices) {
        val entity = renderableEntities[renderableIndex]
        val rm = renderableManager ?: continue
        val instance = rm.getInstance(entity)
        val weights = morphWeightsByRenderable[renderableIndex]
        rm.setMorphWeights(instance, weights, 0)
    }
}

internal fun NativeVrmView.applyBoneRotations() {
    val rotations = pendingBoneRotations ?: return
    val iterator = rotations.keySetIterator()
    val tm = transformManager ?: return
    tm.openLocalTransformTransaction()
    while (iterator.hasNextKey()) {
        val boneName = iterator.nextKey()
        val quatMap = rotations.getMap(boneName) ?: continue
        val x = quatMap.getDouble("x").toFloat()
        val y = quatMap.getDouble("y").toFloat()
        val z = quatMap.getDouble("z").toFloat()
        val w = quatMap.getDouble("w").toFloat()
        val entity = findBoneEntity(boneName) ?: continue
        val instance = tm.getInstance(entity)
        val rest = restTransforms[entity]
        
        val delta = Quaternion(x, y, z, w)
        // delta.toMatrix() is a Mat4 which is already column-major.
        // We defined a custom toMatrixFloatArray that doesn't transpose.
        val deltaMat = toMatrixFloatArray(delta)
        
        // Apply delta in local space: rest * delta
        val result = if (rest != null) multiplyMat4(rest, deltaMat) else deltaMat
        tm.setTransform(instance, result)
    }
    tm.commitLocalTransformTransaction()
    this.instance?.animator?.updateBoneMatrices()
}

internal fun NativeVrmView.applyHiddenMeshes() {
    if (renderableEntities.isEmpty()) return
    
    // Clear previously hidden renderables
    if (hiddenRenderables.isNotEmpty()) {
        val s = scene ?: return
        for (entity in hiddenRenderables) {
            s.addEntity(entity)
        }
        hiddenRenderables.clear()
    }

    if (hiddenMeshNames.isEmpty()) return

    for (name in hiddenMeshNames) {
        val key = wardrobeKey(name)
        if (key.isBlank()) continue
        val entities = renderableNameIndex[key] ?: continue
        for (entity in entities) {
            if (hiddenRenderables.contains(entity)) continue
            scene?.removeEntity(entity)
            hiddenRenderables.add(entity)
        }
    }
}

internal fun NativeVrmView.findBoneEntity(name: String): Int? {
    val lowerName = name.lowercase()
    vrmBoneEntityOverrides[lowerName]?.let { return it }
    boneEntities[lowerName]?.let { return it }
    
    fallbackBonePatterns[lowerName]?.let { patterns ->
        for ((cachedName, entity) in boneEntities) {
            if (patterns.any { cachedName.contains(it) }) {
                return entity
            }
        }
    }
    
    for ((cachedName, entity) in boneEntities) {
        if (cachedName.contains(lowerName)) return entity
    }
    return null
}

// Matrix multiplication for Column-Major FloatArrays (16 floats)
internal fun NativeVrmView.multiplyMat4(a: FloatArray, b: FloatArray): FloatArray {
    val result = FloatArray(16)
    for (row in 0..3) {
        for (col in 0..3) {
            var sum = 0f
            for (i in 0..3) {
                // Column-major indexing: [row + col * 4]
                sum += a[row + i * 4] * b[i + col * 4]
            }
            result[row + col * 4] = sum
        }
    }
    return result
}

// Convert dev.romainguy.kotlin.math.Quaternion to a Column-Major FloatArray
internal fun NativeVrmView.toMatrixFloatArray(q: Quaternion): FloatArray {
    val m = q.toMatrix()
    return floatArrayOf(
        m.x.x, m.x.y, m.x.z, m.x.w,
        m.y.x, m.y.y, m.y.z, m.y.w,
        m.z.x, m.z.y, m.z.z, m.z.w,
        m.w.x, m.w.y, m.w.z, m.w.w
    )
}

internal fun NativeVrmView.applyLookAt() {
    // Look-at implementation using bone entities
    val headEntity = boneEntities["head"] ?: return
    val headPos = worldPositionOf(headEntity) ?: return

    // Target relative to head
    val dx = orbitTarget[0] - headPos[0]
    val dy = orbitTarget[1] - headPos[1]
    val dz = orbitTarget[2] - headPos[2]

    val yaw = Math.atan2(dx.toDouble(), dz.toDouble()).toFloat()
    val pitch = Math.atan2(-dy.toDouble(), Math.sqrt((dx * dx + dz * dz).toDouble())).toFloat()

    var yawDeg = (yaw * 180f / Math.PI.toFloat())
    var pitchDeg = (pitch * 180f / Math.PI.toFloat())

    // Normalize yaw to [-180, 180]
    while (yawDeg > 180f) yawDeg -= 360f
    while (yawDeg < -180f) yawDeg += 360f

    if (vrmVersion.startsWith("0")) {
        yawDeg = -yawDeg
    }

    // Basic smoothing and application
    setBoneRotationDeg(headEntity, pitchDeg * 0.3f, yawDeg * 0.4f, 0f)
    findBoneEntity("neck")?.let {
        setBoneRotationDeg(it, pitchDeg * 0.1f, yawDeg * 0.1f, 0f)
    }
}

internal fun NativeVrmView.setBoneRotationDeg(entity: Int, pitch: Float, yaw: Float, roll: Float) {
    val tm = transformManager ?: return
    val instance = tm.getInstance(entity)
    if (instance == 0) return

    val p = (pitch * Math.PI / 180.0).toFloat()
    val y = (yaw * Math.PI / 180.0).toFloat()
    val r = (roll * Math.PI / 180.0).toFloat()

    val q = Quaternion.fromEuler(Float3(p, y, r))
    val deltaMat = toMatrixFloatArray(q)
    val rest = restTransforms[entity]

    val result = if (rest != null) multiplyMat4(rest, deltaMat) else deltaMat
    tm.setTransform(instance, result)
}

internal fun NativeVrmView.worldPositionOf(entity: Int): FloatArray? {
    val tm = transformManager ?: return null
    if (!tm.hasComponent(entity)) return null
    val instance = tm.getInstance(entity)
    val matrix = FloatArray(16)
    tm.getWorldTransform(instance, matrix)
    return floatArrayOf(matrix[12], matrix[13], matrix[14])
}
