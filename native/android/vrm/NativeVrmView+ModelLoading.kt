package com.dedicatus.VroidViewer.vrm

import android.net.Uri
import android.util.Log
import com.google.android.filament.gltfio.FilamentAsset
import com.google.android.filament.utils.Quaternion
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.*

/**
 * Model Loading and VRM metadata parsing for NativeVrmView
 */

private const val TAG = "NativeVrmView+Loading"

fun NativeVrmView.loadModel(uriString: String) {
    destroyModel()

    val fileLocation = resolveFileLocation(uriString)
    if (fileLocation.isNullOrBlank()) {
        Log.e(TAG, "Failed to resolve model uri: $uriString")
        return
    }

    Log.d(TAG, "Loading model from: $fileLocation")
    try {
        val data = File(fileLocation).readBytes()
        val vrmJson = parseVrmBoneMap(data)
        vrmMetadata = vrmJson
        vrmBoneNodeNames.clear()
        vrmBoneNodeNames.putAll(extractBoneMapping(vrmJson))

        val buffer = ByteBuffer.allocateDirect(data.size).order(ByteOrder.nativeOrder())
        buffer.put(data)
        buffer.flip()

        asset = assetLoader.createAsset(buffer)
        if (asset == null) {
            Log.e(TAG, "Failed to create Filament asset for: $fileLocation")
            return
        }
        instance = asset?.instance
        asset?.let { loaded ->
            resourceLoader.loadResources(loaded)
            loaded.releaseSourceData()
            scene.addEntities(loaded.entities)
        }

        cacheEntities()
        applyModelVisibility()
        frameModel()
        fixEyeMaterialsIfNeeded()
        applyExpressions()
        applyBoneRotations()
        
        // Android specific: trigger MToon logic
        applyMToonMaterials()
        
    } catch (error: Exception) {
        Log.e(TAG, "Failed to load model: $fileLocation", error)
    }
}

fun NativeVrmView.resolveFileLocation(uriString: String): String? {
    return when {
        uriString.startsWith("content://") -> {
            val uri = Uri.parse(uriString)
            copyContentToCache(uri)
        }
        uriString.startsWith("file://") -> {
            Uri.parse(uriString).path ?: uriString
        }
        uriString.startsWith("/") -> File(uriString).absolutePath
        else -> uriString
    }
}

fun NativeVrmView.copyContentToCache(uri: Uri): String? {
    return try {
        val fileName = uri.lastPathSegment?.replace("/", "_") ?: "vrm_model.glb"
        val outFile = File(context.cacheDir, "vrm_${System.currentTimeMillis()}_$fileName")
        context.contentResolver.openInputStream(uri).use { input ->
            if (input == null) return null
            writeStreamToFile(input, outFile)
        }
        outFile.absolutePath
    } catch (error: Exception) {
        Log.e(TAG, "Failed to copy content uri: $uri", error)
        null
    }
}

fun NativeVrmView.writeStreamToFile(input: InputStream, outFile: File) {
    FileOutputStream(outFile).use { output ->
        val buffer = ByteArray(8 * 1024)
        while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            output.write(buffer, 0, read)
        }
        output.flush()
    }
}

fun NativeVrmView.parseVrmBoneMap(data: ByteArray): JSONObject? {
    if (data.size < 20) return null
    return try {
        val buffer = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
        val magic = buffer.int
        if (magic != 0x46546C67) return null
        buffer.int // version
        val length = buffer.int
        var jsonObject: JSONObject? = null
        while (buffer.position() < length && buffer.remaining() >= 8) {
            val chunkLength = buffer.int
            val chunkType = buffer.int
            if (chunkLength <= 0 || buffer.remaining() < chunkLength) break
            if (chunkType == 0x4E4F534A) { // JSON
                val jsonBytes = ByteArray(chunkLength)
                buffer.get(jsonBytes)
                jsonObject = JSONObject(String(jsonBytes, Charsets.UTF_8))
                break
            } else {
                buffer.position(buffer.position() + chunkLength)
            }
        }
        jsonObject
    } catch (error: Exception) {
        Log.w(TAG, "Failed to parse VRM metadata", error)
        null
    }
}

fun NativeVrmView.extractBoneMapping(json: JSONObject?): Map<String, String> {
    if (json == null) return emptyMap()
    val nodeNames = mutableListOf<String>()
    val nodesArray: JSONArray? = json.optJSONArray("nodes")
    if (nodesArray != null) {
        for (i in 0 until nodesArray.length()) {
            val node = nodesArray.optJSONObject(i)
            val name = node?.optString("name", "") ?: ""
            nodeNames.add(name.lowercase())
        }
    }

    val result = mutableMapOf<String, String>()
    val extensions = json.optJSONObject("extensions")

    val vrm0 = extensions?.optJSONObject("VRM")
    val humanBones0 = vrm0?.optJSONObject("humanoid")?.optJSONArray("humanBones")
    if (humanBones0 != null) {
        for (i in 0 until humanBones0.length()) {
            val bone = humanBones0.optJSONObject(i) ?: continue
            val boneName = bone.optString("bone", "").lowercase()
            val nodeIndex = bone.optInt("node", -1)
            if (boneName.isNotBlank() && nodeIndex in nodeNames.indices) {
                val nodeName = nodeNames[nodeIndex]
                if (nodeName.isNotBlank()) {
                    result[boneName] = nodeName
                }
            }
        }
    }

    val vrm1 = extensions?.optJSONObject("VRMC_vrm")
    val humanBones1 = vrm1?.optJSONObject("humanoid")?.optJSONObject("humanBones")
    if (humanBones1 != null) {
        val keys = humanBones1.keys()
        while (keys.hasNext()) {
            val boneKey = keys.next()
            val bone = humanBones1.optJSONObject(boneKey) ?: continue
            val nodeIndex = bone.optInt("node", -1)
            if (nodeIndex in nodeNames.indices) {
                val nodeName = nodeNames[nodeIndex]
                if (nodeName.isNotBlank()) {
                    result[boneKey.lowercase()] = nodeName
                }
            }
        }
    }
    return result
}

fun NativeVrmView.frameModel() {
    val model = asset ?: return
    val box = model.boundingBox
    val center = box.center
    val half = box.halfExtent
    val sizeX = half[0] * 2f
    val sizeY = half[1] * 2f
    val sizeZ = half[2] * 2f
    val maxDim = max(sizeX, max(sizeY, sizeZ))

    val baseDistance = maxDim * 1.9f
    val targetY = center[1] + sizeY * 0.18f
    orbitTarget = floatArrayOf(center[0], targetY, center[2])
    val desiredDistance = initialZoom ?: baseDistance
    val elevation = sizeY * 0.12f
    currentDistance = sqrt(desiredDistance * desiredDistance + elevation * elevation)
    currentDistance = clampedDistance(currentDistance)
    polarAngle = clampedPolar(acos((elevation / currentDistance).coerceIn(-1.0f, 1.0f)))
    azimuthAngle = clampedAzimuth(0.0f)
    targetDistance = currentDistance
    targetPolarAngle = polarAngle
    targetAzimuthAngle = azimuthAngle

    // Apply root rotation for VRM0 to face camera
    if (vrmVersion.startsWith("0")) {
        val rootEntity = model.root
        if (transformManager.hasComponent(rootEntity)) {
            val rootInstance = transformManager.getInstance(rootEntity)
            val rest = restTransforms[rootEntity]
            val rot = toColumnMajor(Quaternion(0f, 1f, 0f, 0f).toMatrix().toFloatArray())
            val result = if (rest != null) multiplyMat4(rest, rot) else rot
            transformManager.setTransform(rootInstance, result)
        }
    }

    updateCamera()
}
