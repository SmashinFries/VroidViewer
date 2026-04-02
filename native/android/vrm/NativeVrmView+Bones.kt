package com.dedicatus.VroidViewer.vrm

import com.google.android.filament.utils.Quaternion

/**
 * Bone and Transformation logic for NativeVrmView
 */

fun NativeVrmView.applyBoneRotations() {
    val rotations = pendingBoneRotations ?: return
    val iterator = rotations.keySetIterator()
    transformManager.openLocalTransformTransaction()
    while (iterator.hasNextKey()) {
        val boneName = iterator.nextKey()
        val quatMap = rotations.getMap(boneName) ?: continue
        val x = quatMap.getDouble("x").toFloat()
        val y = quatMap.getDouble("y").toFloat()
        val z = quatMap.getDouble("z").toFloat()
        val w = quatMap.getDouble("w").toFloat()
        val entity = findBoneEntity(boneName) ?: continue
        val instance = transformManager.getInstance(entity)
        val rest = restTransforms[entity]
        val delta = Quaternion(x, y, z, w)
        val deltaMat = toColumnMajor(delta.toMatrix().toFloatArray())
        // Apply delta in local space: rest * delta
        val result = if (rest != null) multiplyMat4(rest, deltaMat) else deltaMat
        transformManager.setTransform(instance, result)
    }
    transformManager.commitLocalTransformTransaction()
    instance?.animator?.updateBoneMatrices()
}

fun NativeVrmView.findBoneEntity(name: String): Int? {
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

internal fun NativeVrmView.multiplyMat4(a: FloatArray, b: FloatArray): FloatArray {
    val result = FloatArray(16)
    var row = 0
    while (row < 4) {
        var col = 0
        while (col < 4) {
            var sum = 0f
            var i = 0
            while (i < 4) {
                sum += a[row + i * 4] * b[i + col * 4]
                i++
            }
            result[row + col * 4] = sum
            col++
        }
        row++
    }
    return result
}

internal fun NativeVrmView.toColumnMajor(rowMajor: FloatArray): FloatArray {
    if (rowMajor.size != 16) return rowMajor
    return floatArrayOf(
        rowMajor[0], rowMajor[4], rowMajor[8], rowMajor[12],
        rowMajor[1], rowMajor[5], rowMajor[9], rowMajor[13],
        rowMajor[2], rowMajor[6], rowMajor[10], rowMajor[14],
        rowMajor[3], rowMajor[7], rowMajor[11], rowMajor[15]
    )
}

internal val fallbackBonePatterns: Map<String, List<String>> = mapOf(
    "hips" to listOf("hips", "pelvis"),
    "spine" to listOf("spine"),
    "chest" to listOf("chest"),
    "upperchest" to listOf("upperchest", "upper_chest"),
    "neck" to listOf("neck"),
    "head" to listOf("head"),
    "lefteye" to listOf("lefteye", "eye_l", "eye.l"),
    "righteye" to listOf("righteye", "eye_r", "eye.r"),
    "leftshoulder" to listOf("leftshoulder", "shoulder_l"),
    "rightshoulder" to listOf("rightshoulder", "shoulder_r"),
    "leftupperarm" to listOf("_l_upperarm", "leftupperarm", "upperarm_l"),
    "rightupperarm" to listOf("_r_upperarm", "rightupperarm", "upperarm_r"),
    "leftlowerarm" to listOf("_l_lowerarm", "leftlowerarm", "lowerarm_l"),
    "rightlowerarm" to listOf("_r_lowerarm", "rightlowerarm", "lowerarm_r"),
    "lefthand" to listOf("_l_hand", "lefthand", "hand_l"),
    "righthand" to listOf("_r_hand", "righthand", "hand_r"),
    "leftthumbmetacarpal" to listOf("leftthumbmetacarpal", "l_thumb1", "thumb1_l", "thumb_01_l"),
    "leftthumbproximal" to listOf("leftthumbproximal", "l_thumb2", "thumb2_l", "thumb_02_l"),
    "leftthumbdistal" to listOf("leftthumbdistal", "l_thumb3", "thumb3_l", "thumb_03_l"),
    "leftindexproximal" to listOf("leftindexproximal", "l_index1", "index1_l", "index_01_l"),
    "leftindexintermediate" to listOf("leftindexintermediate", "l_index2", "index2_l", "index_02_l"),
    "leftindexdistal" to listOf("leftindexdistal", "l_index3", "index3_l", "index_03_l"),
    "leftmiddleproximal" to listOf("leftmiddleproximal", "l_middle1", "middle1_l", "middle_01_l"),
    "leftmiddleintermediate" to listOf("leftmiddleintermediate", "l_middle2", "middle2_l", "middle_02_l"),
    "leftmiddledistal" to listOf("leftmiddledistal", "l_middle3", "middle3_l", "middle_03_l"),
    "leftringproximal" to listOf("leftringproximal", "l_ring1", "ring1_l", "ring_01_l"),
    "leftringintermediate" to listOf("leftringintermediate", "l_ring2", "ring2_l", "ring_02_l"),
    "leftringdistal" to listOf("leftringdistal", "l_ring3", "ring3_l", "ring_03_l"),
    "leftlittleproximal" to listOf("leftlittleproximal", "leftpinkyproximal", "l_pinky1", "pinky1_l", "little1_l", "little_01_l"),
    "leftlittleintermediate" to listOf("leftlittleintermediate", "leftpinkyintermediate", "l_pinky2", "pinky2_l", "little2_l", "little_02_l"),
    "leftlittledistal" to listOf("leftlittledistal", "leftpinkydistal", "l_pinky3", "pinky3_l", "little3_l", "little_03_l"),
    "rightthumbmetacarpal" to listOf("rightthumbmetacarpal", "r_thumb1", "thumb1_r", "thumb_01_r"),
    "rightthumbproximal" to listOf("rightthumbproximal", "r_thumb2", "thumb2_r", "thumb_02_r"),
    "rightthumbdistal" to listOf("rightthumbdistal", "r_thumb3", "thumb3_r", "thumb_03_r"),
    "rightindexproximal" to listOf("rightindexproximal", "r_index1", "index1_r", "index_01_r"),
    "rightindexintermediate" to listOf("rightindexintermediate", "r_index2", "index2_r", "index_02_r"),
    "rightindexdistal" to listOf("rightindexdistal", "r_index3", "index3_r", "index_03_r"),
    "rightmiddleproximal" to listOf("rightmiddleproximal", "r_middle1", "middle1_r", "middle_01_r"),
    "rightmiddleintermediate" to listOf("rightmiddleintermediate", "r_middle2", "middle2_r", "middle_02_r"),
    "rightmiddledistal" to listOf("rightmiddledistal", "r_middle3", "middle3_r", "middle_03_r"),
    "rightringproximal" to listOf("rightringproximal", "r_ring1", "ring1_r", "ring_01_r"),
    "rightringintermediate" to listOf("rightringintermediate", "r_ring2", "ring2_r", "ring_02_r"),
    "rightringdistal" to listOf("rightringdistal", "r_ring3", "ring3_r", "ring_03_r"),
    "rightlittleproximal" to listOf("rightlittleproximal", "rightpinkyproximal", "r_pinky1", "pinky1_r", "little1_r", "little_01_r"),
    "rightlittleintermediate" to listOf("rightlittleintermediate", "rightpinkyintermediate", "r_pinky2", "pinky2_r", "little2_r", "little_02_r"),
    "rightlittledistal" to listOf("rightlittledistal", "rightpinkydistal", "r_pinky3", "pinky3_r", "little3_r", "little_03_r"),
    "leftupperleg" to listOf("_l_upperleg", "leftupperleg", "upperleg_l"),
    "rightupperleg" to listOf("_r_upperleg", "rightupperleg", "upperleg_r"),
    "leftlowerleg" to listOf("_l_lowerleg", "leftlowerleg", "lowerleg_l"),
    "rightlowerleg" to listOf("_r_lowerleg", "rightlowerleg", "lowerleg_r"),
    "leftfoot" to listOf("_l_foot", "leftfoot", "foot_l"),
    "rightfoot" to listOf("_r_foot", "rightfoot", "foot_r"),
)
