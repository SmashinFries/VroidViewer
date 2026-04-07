package com.dedicatus.VroidViewer.vrm

import android.net.Uri
import android.util.Log
import com.google.android.filament.gltfio.FilamentAsset
import dev.romainguy.kotlin.math.Float3
import dev.romainguy.kotlin.math.Quaternion
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

private fun hasExtension(json: JSONObject?, name: String): Boolean {
    if (json == null) return false
    val extensions = json.optJSONObject("extensions")
    if (extensions?.has(name) == true) return true
    val used = json.optJSONArray("extensionsUsed")
    if (used != null) {
        for (i in 0 until used.length()) {
            if (name == used.optString(i)) return true
        }
    }
    val required = json.optJSONArray("extensionsRequired")
    if (required != null) {
        for (i in 0 until required.length()) {
            if (name == required.optString(i)) return true
        }
    }
    return false
}

private fun detectVrmVersion(json: JSONObject?): String? {
    // Prefer explicit VRM 1.x extension when available.
    return when {
        hasExtension(json, "VRMC_vrm") -> "1"
        hasExtension(json, "VRM") -> "0"
        else -> null
    }
}

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
        
        // Auto-detect VRM version from extension keys (extensions/used/required)
        val detectedVersion = detectVrmVersion(vrmJson)
        if (detectedVersion != null) {
            vrmVersion = detectedVersion
            Log.d(TAG, "Auto-detected VRM version: $vrmVersion")
        }

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
        
        parseMaterialMetadata(vrmJson)
        
        applyModelVisibility()
        frameModel()
        updateModelOrientation() 
        fixEyeMaterialsIfNeeded()
        applyExpressions()
        applyBoneRotations()
        
        applyMToonMaterialsIfNeeded()
        configureSpringBones()
        
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

fun NativeVrmView.parseMaterialMetadata(json: JSONObject?) {
    mtoonMaterialsByName.clear()
    vrm0MaterialsByName.clear()
    if (json == null) return

    val extensions = json.optJSONObject("extensions") ?: JSONObject()
    
    val vrm0 = extensions.optJSONObject("VRM")
    val materialProps = vrm0?.optJSONArray("materialProperties")
    if (materialProps != null) {
        for (i in 0 until materialProps.length()) {
            val prop = materialProps.optJSONObject(i) ?: continue
            val name = prop.optString("name").lowercase()
            val shader = prop.optString("shader")
            
            val floatProps = mutableMapOf<String, Float>()
            val fObj = prop.optJSONObject("floatProperties")
            if (fObj != null) {
                val keys = fObj.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    floatProps[k] = fObj.optDouble(k).toFloat()
                }
            }
            
            val vectorProps = mutableMapOf<String, FloatArray>()
            val vObj = prop.optJSONObject("vectorProperties")
            if (vObj != null) {
                val keys = vObj.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    val arr = vObj.optJSONArray(k)
                    if (arr != null) {
                        val fa = FloatArray(arr.length())
                        for (j in 0 until arr.length()) fa[j] = arr.optDouble(j).toFloat()
                        vectorProps[k] = fa
                    }
                }
            }
            
            val keywordMap = mutableMapOf<String, Boolean>()
            val kObj = prop.optJSONObject("keywordMap")
            if (kObj != null) {
                val keys = kObj.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    keywordMap[k] = kObj.optBoolean(k)
                }
            }
            
            val config = VRM0MaterialConfig(name, shader, floatProps, vectorProps, keywordMap)
            vrm0MaterialsByName[name] = config
            
            if (shader.lowercase().contains("mtoon")) {
                val mtoon = MToonMaterial(
                    name = name,
                    baseColor = vectorProps["_Color"],
                    shadeColor = vectorProps["_ShadeColor"],
                    shadingShift = floatProps["_ShadingShift"] ?: 0f,
                    shadingToony = floatProps["_ShadingToony"] ?: 0f,
                    doubleSided = (floatProps["_CullMode"] ?: 2f) <= 0.5f,
                    alphaMode = if (keywordMap["_ALPHATEST_ON"] == true) "MASK" else if (keywordMap["_ALPHABLEND_ON"] == true) "BLEND" else "OPAQUE",
                    alphaCutoff = floatProps["_Cutoff"],
                    transparentWithZWrite = floatProps["_ZWrite"]?.toInt() == 1 && keywordMap["_ALPHABLEND_ON"] == true
                )
                mtoonMaterialsByName[name] = mtoon
            }
        }
    }
    
    val materials = json.optJSONArray("materials")
    if (materials != null) {
        for (i in 0 until materials.length()) {
            val mat = materials.optJSONObject(i) ?: continue
            val name = mat.optString("name").lowercase()
            val matExtensions = mat.optJSONObject("extensions") ?: JSONObject()
            val mToon1 = matExtensions.optJSONObject("VRMC_materials_mtoon")
            
            if (mToon1 != null) {
                val pbr = mat.optJSONObject("pbrMetallicRoughness")
                val baseColor = if (pbr != null) {
                    val arr = pbr.optJSONArray("baseColorFactor")
                    if (arr != null) {
                        floatArrayOf(arr.optDouble(0).toFloat(), arr.optDouble(1).toFloat(), arr.optDouble(2).toFloat(), arr.optDouble(3).toFloat())
                    } else null
                } else null
                
                val shadeArr = mToon1.optJSONArray("shadeColorFactor")
                val shadeColor = if (shadeArr != null) {
                    floatArrayOf(shadeArr.optDouble(0).toFloat(), shadeArr.optDouble(1).toFloat(), shadeArr.optDouble(2).toFloat())
                } else null
                
                val mtoon = MToonMaterial(
                    name = name,
                    baseColor = baseColor,
                    shadeColor = shadeColor,
                    shadingShift = mToon1.optDouble("shadingShiftFactor", 0.0).toFloat(),
                    shadingToony = mToon1.optDouble("shadingToonyFactor", 0.0).toFloat(),
                    doubleSided = mat.optBoolean("doubleSided", false),
                    alphaMode = mat.optString("alphaMode", "OPAQUE"),
                    alphaCutoff = mat.optDouble("alphaCutoff", 0.5).toFloat(),
                    transparentWithZWrite = mToon1.optBoolean("transparentWithZWrite", false),
                    renderQueueOffset = matExtensions.optJSONObject("VRMC_vrm")?.optInt("renderQueueOffsetNumber", 0) ?: 0
                )
                mtoonMaterialsByName[name] = mtoon
            }
        }
    }
}

fun NativeVrmView.configureSpringBones() {
    val json = vrmMetadata ?: return
    val colliders = mutableListOf<ParsedSpringBoneCollider>()
    val springs = mutableListOf<ParsedSpringBone>()
    val extensions = json.optJSONObject("extensions") ?: JSONObject()

    val vrm0 = extensions.optJSONObject("VRM")
    val secAnim0 = vrm0?.optJSONObject("secondaryAnimation")
    if (secAnim0 != null) {
        val colliderGroups = secAnim0.optJSONArray("colliderGroups")
        if (colliderGroups != null) {
            for (i in 0 until colliderGroups.length()) {
                val group = colliderGroups.optJSONObject(i) ?: continue
                val nodeIndex = group.optInt("node", -1)
                val nodeName = nodeNameForIndex(json, nodeIndex) ?: continue
                val colls = group.optJSONArray("colliders")
                if (colls != null) {
                    for (j in 0 until colls.length()) {
                        val col = colls.optJSONObject(j) ?: continue
                        val offsetObj = col.optJSONObject("offset")
                        val offset = if (offsetObj != null) {
                            dev.romainguy.kotlin.math.Float3(
                                offsetObj.optDouble("x", 0.0).toFloat(),
                                offsetObj.optDouble("y", 0.0).toFloat(),
                                offsetObj.optDouble("z", 0.0).toFloat()
                            )
                        } else dev.romainguy.kotlin.math.Float3(0f, 0f, 0f)
                        val radius = col.optDouble("radius", 0.1).toFloat()
                        colliders.add(ParsedSpringBoneCollider(nodeName, SpringBoneColliderShape.Sphere(offset, radius)))
                    }
                }
            }
        }

        val boneGroups = secAnim0.optJSONArray("boneGroups")
        if (boneGroups != null) {
            for (i in 0 until boneGroups.length()) {
                val group = boneGroups.optJSONObject(i) ?: continue
                val comment = group.optString("comment", "spring_$i")
                val centerIndex = group.optInt("center", -1)
                val centerName = nodeNameForIndex(json, centerIndex)
                val colliderIndices = mutableListOf<Int>()
                val colIdxArray = group.optJSONArray("colliderGroups")
                if (colIdxArray != null) {
                    for (j in 0 until colIdxArray.length()) colliderIndices.add(colIdxArray.getInt(j))
                }

                val stiffness = group.optDouble("stiffnessForce", 1.0).toFloat()
                val gravityPower = group.optDouble("gravityPower", 0.0).toFloat()
                val gravDirObj = group.optJSONObject("gravityDir")
                val gravDir = if (gravDirObj != null) {
                    dev.romainguy.kotlin.math.Float3(
                        gravDirObj.optDouble("x", 0.0).toFloat(),
                        gravDirObj.optDouble("y", -1.0).toFloat(),
                        gravDirObj.optDouble("z", 0.0).toFloat()
                    )
                } else dev.romainguy.kotlin.math.Float3(0f, -1f, 0f)
                val dragForce = group.optDouble("dragForce", 0.4).toFloat()

                val joints = mutableListOf<ParsedSpringBoneJoint>()
                val bones = group.optJSONArray("bones")
                if (bones != null) {
                    for (j in 0 until bones.length()) {
                        val nodeIndex = bones.getInt(j)
                        val nodeName = nodeNameForIndex(json, nodeIndex) ?: continue
                        joints.add(ParsedSpringBoneJoint(
                            nodeName, 0.05f * stiffness, stiffness, gravityPower, gravDir, dragForce
                        ))
                    }
                }
                springs.add(ParsedSpringBone(comment, centerName, joints, colliderIndices))
            }
        }
    }

    if (springs.isNotEmpty()) {
        Log.d("NativeVrmView", "Initializing SpringBones with ${springs.size} springs and ${colliders.size} colliders")
        springBones = NativeVrmSpringBones(transformManager, boneEntities, ParsedSpringBoneData(colliders, springs))
    }
}

private fun NativeVrmView.nodeNameForIndex(json: JSONObject, index: Int): String? {
    if (index < 0) return null
    val nodes = json.optJSONArray("nodes") ?: return null
    if (index >= nodes.length()) return null
    return nodes.optJSONObject(index)?.optString("name")
}

fun NativeVrmView.frameModel() {
    val model = asset ?: return
    val box = model.boundingBox
    val center = box.center
    val half = box.halfExtent
    val sizeY = half[1] * 2f
    val maxDim = max(half[0] * 2f, max(sizeY, half[2] * 2f))

    val baseDistance = maxDim * 1.9f
    orbitTarget = floatArrayOf(center[0], center[1] + sizeY * 0.18f, center[2])
    
    val desiredDistance = initialZoom ?: baseDistance
    currentDistance = clampedDistance(desiredDistance)
    polarAngle = clampedPolar((PI * 0.38).toFloat())
    azimuthAngle = clampedAzimuth(0.0f)
    
    targetDistance = currentDistance
    targetPolarAngle = polarAngle
    targetAzimuthAngle = azimuthAngle
    
    updateCamera()
}

fun NativeVrmView.updateModelOrientation() {
    val model = asset ?: return
    val rootEntity = model.root
    if (!transformManager.hasComponent(rootEntity)) return
    
    val rootInstance = transformManager.getInstance(rootEntity)
    val rest = restTransforms[rootEntity] ?: run {
        // Root may not be part of model.entities; cache its rest transform explicitly.
        val base = FloatArray(16)
        transformManager.getTransform(rootInstance, base)
        restTransforms[rootEntity] = base
        base
    }
    
    // VRM 0.x models face -Z. Camera is at +Z. 
    // To face camera, they NEED 180 degrees (PI).
    // VRM 1.x models already face +Z.
    val detected = detectVrmVersion(vrmMetadata)
    val rotateVrm0 = detected?.startsWith("0") ?: vrmVersion.startsWith("0")
    val rotationAngle = if (rotateVrm0) PI.toFloat() else 0f
    
    Log.d("NativeVrmOrientation", "Correcting orientation: detected=$detected, version=$vrmVersion, angle=$rotationAngle")
    
    val half = rotationAngle * 0.5f
    val q = Quaternion(0f, sin(half), 0f, cos(half))
    val rotMat = toMatrixFloatArray(q)
    
    // IMPORTANT: We must multiply with the original rest transform to preserve scale and initial pose
    val result = multiplyMat4(rest, rotMat)
    transformManager.setTransform(rootInstance, result)
}
