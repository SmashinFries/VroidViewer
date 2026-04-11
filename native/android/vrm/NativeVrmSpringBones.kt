package com.dedicatus.VroidViewer.vrm

import android.util.Log
import com.google.android.filament.TransformManager
import dev.romainguy.kotlin.math.*
import kotlin.math.acos

internal fun extractTranslation(m: Mat4): Float3 {
    return Float3(m.w.x, m.w.y, m.w.z)
}

internal fun mulMat4Float4(m: Mat4, v: Float4): Float4 {
    val vx = v.x; val vy = v.y; val vz = v.z; val vw = v.w
    return Float4(
        m.x.x * vx + m.y.x * vy + m.z.x * vz + m.w.x * vw,
        m.x.y * vx + m.y.y * vy + m.z.y * vz + m.w.y * vw,
        m.x.z * vx + m.y.z * vy + m.z.z * vz + m.w.z * vw,
        m.x.w * vx + m.y.w * vy + m.z.w * vz + m.w.w * vw
    )
}

internal fun mulQuatFloat3(q: Quaternion, v: Float3): Float3 {
    val qx = q.x; val qy = q.y; val qz = q.z; val qw = q.w
    val vx = v.x; val vy = v.y; val vz = v.z
    val tx = 2f * (qy * vz - qz * vy)
    val ty = 2f * (qz * vx - qx * vz)
    val tz = 2f * (qx * vy - qy * vx)
    val cx = qy * tz - qz * ty
    val cy = qz * tx - qx * tz
    val cz = qx * ty - qy * tx
    return Float3(
        vx + qw * tx + cx,
        vy + qw * ty + cy,
        vz + qw * tz + cz
    )
}

internal sealed class SpringBoneColliderShape {
    data class Sphere(val offset: Float3, val radius: Float) : SpringBoneColliderShape()
    data class Capsule(val offset: Float3, val radius: Float, val tail: Float3) : SpringBoneColliderShape()
}

internal data class ParsedSpringBoneCollider(
    val nodeName: String,
    val shape: SpringBoneColliderShape
)

internal data class ParsedSpringBoneJoint(
    val nodeName: String,
    val hitRadius: Float,
    val stiffness: Float,
    val gravityPower: Float,
    val gravityDir: Float3,
    val dragForce: Float
)

internal data class ParsedSpringBone(
    val name: String,
    val centerNodeName: String?,
    val joints: List<ParsedSpringBoneJoint>,
    val colliderIndices: List<Int> // Indices pointing into the global ParsedSpringBoneCollider list
)

internal data class ParsedSpringBoneData(
    val colliders: List<ParsedSpringBoneCollider>,
    val springs: List<ParsedSpringBone>
)

internal class NativeVrmSpringBones(
    private val transformManager: TransformManager,
    private val boneEntities: Map<String, Int>,
    val data: ParsedSpringBoneData
) {
    private val joints = mutableListOf<RuntimeJoint>()
    private val colliders = mutableListOf<RuntimeCollider>()

    inner class RuntimeCollider(
        val entity: Int,
        val shape: SpringBoneColliderShape
    ) {
        var worldMatrix: Mat4 = Mat4()
    }

    inner class RuntimeJoint(
        val entity: Int,
        val hitRadius: Float,
        val stiffness: Float,
        val gravityPower: Float,
        val gravityDir: Float3,
        val dragForce: Float,
        val colliders: List<RuntimeCollider>,
        val centerEntity: Int?
    ) {
        var parentInst: Int = 0
        var childInst: Int = 0 
        
        // Verlet state in WORLD space
        var currentTail = Float3()
        var prevTail = Float3()

        // Rest pose state
        var boneAxis = Float3(0f, 1f, 0f)
        var boneLength = 0f
        var localRestRot = Quaternion()
        var initialTransform = Mat4()

        // Optimization: track parent motion to skip physics when idle
        var lastParentWorldPos = Float3()
        var isSettled = false
        var initialized = false
    }

    init {
        val colliderMap = mutableMapOf<Int, RuntimeCollider>()
        data.colliders.forEachIndexed { index, parsedCol ->
            val entity = boneEntities[parsedCol.nodeName]
            if (entity != null) {
                val rc = RuntimeCollider(entity, parsedCol.shape)
                colliders.add(rc)
                colliderMap[index] = rc
            }
        }

        val bodyKeywords = listOf("hair", "bust", "breast", "tail", "ear", "髪", "胸", "尾", "耳")
        val outfitKeywords = listOf("skirt", "clothing", "cloth", "dress", "sleeve", "ribbon", "outfit", "accessory", "acc", "coat", "pant", "shirt", "tie", "cape", "apron", "hat", "jacket", "hoodie", "uniform", "waist", "belt", "pocket", "frill", "lace", "cap", "shoes", "boot", "sock", "onepiece", "necktie", "collar", "button", "スカート", "服", "衣装", "袖", "リボン", "アクセ")

        for (spring in data.springs) {
            val centerEntity = spring.centerNodeName?.let { boneEntities[it] }
            val springColliders = spring.colliderIndices.mapNotNull { colliderMap[it] }

            val lowerGroupName = spring.name.lowercase()
            val groupIsOutfit = outfitKeywords.any { lowerGroupName.contains(it) }
            val groupIsBody = bodyKeywords.any { lowerGroupName.contains(it) }

            for (parsedJoint in spring.joints) {
                val entity = boneEntities[parsedJoint.nodeName] ?: continue
                
                val lowerNodeName = parsedJoint.nodeName.lowercase()
                val nodeIsBody = bodyKeywords.any { lowerNodeName.contains(it) }
                val nodeIsOutfit = outfitKeywords.any { lowerNodeName.contains(it) }

                var finalIsOutfit = false
                if (groupIsOutfit || nodeIsOutfit) {
                    finalIsOutfit = true
                }
                // Body/Hair parts should take precedence to keep their gravity (hair points down)
                if (groupIsBody || nodeIsBody) {
                    finalIsOutfit = false
                }

                // The gravity should affect the body part (hair/bust) but not the outfit.
                // We override the gravityPower to 0 for identified outfits to prevent sagging/drooping.
                val gravityPower = if (finalIsOutfit) 0f else parsedJoint.gravityPower

                val rj = RuntimeJoint(
                    entity = entity,
                    hitRadius = parsedJoint.hitRadius,
                    stiffness = parsedJoint.stiffness,
                    gravityPower = gravityPower,
                    gravityDir = parsedJoint.gravityDir,
                    dragForce = parsedJoint.dragForce,
                    colliders = springColliders,
                    centerEntity = centerEntity
                )
                joints.add(rj)
            }
        }
    }

    private fun safeRotation(m: Mat4): Quaternion {
        val trace = m.x.x + m.y.y + m.z.z
        if (trace > 0.0f) {
            val s = 0.5f / kotlin.math.sqrt(trace + 1.0f)
            return Quaternion(
                (m.y.z - m.z.y) * s,
                (m.z.x - m.x.z) * s,
                (m.x.y - m.y.x) * s,
                0.25f / s
            )
        } else {
            if (m.x.x > m.y.y && m.x.x > m.z.z) {
                val s = 2.0f * kotlin.math.sqrt(1.0f + m.x.x - m.y.y - m.z.z)
                return Quaternion(
                    0.25f * s,
                    (m.x.y + m.y.x) / s,
                    (m.x.z + m.z.x) / s,
                    (m.y.z - m.z.y) / s
                )
            } else if (m.y.y > m.z.z) {
                val s = 2.0f * kotlin.math.sqrt(1.0f + m.y.y - m.x.x - m.z.z)
                return Quaternion(
                    (m.x.y + m.y.x) / s,
                    0.25f * s,
                    (m.y.z + m.z.y) / s,
                    (m.z.x - m.x.z) / s
                )
            } else {
                val s = 2.0f * kotlin.math.sqrt(1.0f + m.z.z - m.x.x - m.y.y)
                return Quaternion(
                    (m.x.z + m.z.x) / s,
                    (m.y.z + m.z.y) / s,
                    0.25f * s,
                    (m.x.y - m.y.x) / s
                )
            }
        }
    }

    fun setup() {
        val tm = transformManager
        Log.i("NativeVrmSpringBones", "Setting up \${joints.size} SpringBone joints...")
        
        for (joint in joints) {
            val inst = tm.getInstance(joint.entity)
            if (inst == 0) continue

            val parentInst = tm.getParent(inst)
            joint.parentInst = parentInst

            val childCount = tm.getChildCount(inst)
            if (childCount > 0) {
                val childrenHolder = IntArray(childCount)
                tm.getChildren(inst, childrenHolder)
                joint.childInst = childrenHolder[0]
            }

            val matArr = FloatArray(16)
            tm.getTransform(inst, matArr)
            joint.initialTransform = Mat4.of(*matArr)
            joint.localRestRot = safeRotation(joint.initialTransform)

            if (joint.childInst != 0) {
                val childInst = joint.childInst
                val childTransformArr = FloatArray(16)
                tm.getTransform(childInst, childTransformArr)
                val tx = extractTranslation(Mat4.of(*childTransformArr))
                val len = length(tx)
                if (len > 0.001f) {
                    joint.boneAxis = normalize(tx)
                    joint.boneLength = len
                } else {
                    joint.boneAxis = Float3(0f, -1f, 0f) // Standard VRM hair points down
                    joint.boneLength = 0.05f
                }
            } else {
                joint.boneAxis = Float3(0f, -1f, 0f)
                joint.boneLength = 0.05f
            }

            val worldTransformArr = FloatArray(16)
            tm.getWorldTransform(inst, worldTransformArr)
            val worldTransform = Mat4.of(*worldTransformArr)
            
            val tailOffset = Float3(joint.boneAxis.x * joint.boneLength, joint.boneAxis.y * joint.boneLength, joint.boneAxis.z * joint.boneLength)
            val wtp4 = mulMat4Float4(worldTransform, Float4(tailOffset.x, tailOffset.y, tailOffset.z, 1f))
            val worldTailPos = Float3(wtp4.x, wtp4.y, wtp4.z)

            joint.currentTail = worldTailPos
            joint.prevTail = worldTailPos
            joint.lastParentWorldPos = extractTranslation(worldTransform)
            joint.initialized = true
        }
    }

    private var accumulator = 0f
    private val fixedDeltaTime = 1f / 60f

    fun update(deltaTime: Float) {
        if (deltaTime <= 0f || joints.isEmpty()) return
        val tm = transformManager

        // Sub-stepping for stability
        accumulator += deltaTime
        if (accumulator > 0.5f) accumulator = 0.5f // Cap to avoid "clock spiral of death"
        
        // Pre-fetch all collider matrices once per update
        for (col in colliders) {
            val inst = tm.getInstance(col.entity)
            if (inst != 0) {
                val floats = FloatArray(16)
                tm.getWorldTransform(inst, floats)
                col.worldMatrix = Mat4.of(*floats)
            }
        }

        while (accumulator >= fixedDeltaTime) {
            performPhysicsStep(fixedDeltaTime)
            accumulator -= fixedDeltaTime
        }
    }

    private fun performPhysicsStep(dt: Float) {
        val tm = transformManager
        
        for (joint in joints) {
            if (!joint.initialized) continue
            val inst = tm.getInstance(joint.entity)
            if (inst == 0) continue
            val parentInst = joint.parentInst

            var parentTransform = Mat4()
            if (parentInst != 0) {
                val pFloats = FloatArray(16)
                tm.getWorldTransform(parentInst, pFloats)
                parentTransform = Mat4.of(*pFloats)
            }

            val itTrans = extractTranslation(joint.initialTransform)
            val cpwp4 = mulMat4Float4(parentTransform, Float4(itTrans.x, itTrans.y, itTrans.z, 1f))
            val currentParentWorldPos = Float3(cpwp4.x, cpwp4.y, cpwp4.z)
            
            // Motion Check
            val diffP = Float3(currentParentWorldPos.x - joint.lastParentWorldPos.x, currentParentWorldPos.y - joint.lastParentWorldPos.y, currentParentWorldPos.z - joint.lastParentWorldPos.z)
            val moveDist = length(diffP)
            
            if (moveDist > 0.0001f) {
                joint.isSettled = false
                joint.lastParentWorldPos = currentParentWorldPos
            }

            // Calculate rest pose in world space
            val localRestCombined = parentTransform * joint.initialTransform
            val baScale = Float3(joint.boneAxis.x * joint.boneLength, joint.boneAxis.y * joint.boneLength, joint.boneAxis.z * joint.boneLength)
            val rtw4 = mulMat4Float4(localRestCombined, Float4(baScale.x, baScale.y, baScale.z, 1f))
            val restTailWorld = Float3(rtw4.x, rtw4.y, rtw4.z)

            if (joint.isSettled) {
                joint.currentTail = restTailWorld
                joint.prevTail = restTailWorld
                continue 
            }

            // 1. Verlet Integration
            val dragScale = 1.0f - joint.dragForce
            val diffPrev = Float3(joint.currentTail.x - joint.prevTail.x, joint.currentTail.y - joint.prevTail.y, joint.currentTail.z - joint.prevTail.z)
            val inertia = Float3(diffPrev.x * dragScale, diffPrev.y * dragScale, diffPrev.z * dragScale)

            val gScaled = joint.gravityPower * 9.81f * dt * dt
            val gravityVector = Float3(joint.gravityDir.x * gScaled, joint.gravityDir.y * gScaled, joint.gravityDir.z * gScaled)

            val stiffScale = joint.stiffness * dt
            val diffStiff = Float3(restTailWorld.x - joint.currentTail.x, restTailWorld.y - joint.currentTail.y, restTailWorld.z - joint.currentTail.z)
            val stiffness = Float3(diffStiff.x * stiffScale, diffStiff.y * stiffScale, diffStiff.z * stiffScale)

            var nextTail = Float3(
                joint.currentTail.x + inertia.x + gravityVector.x + stiffness.x,
                joint.currentTail.y + inertia.y + gravityVector.y + stiffness.y,
                joint.currentTail.z + inertia.z + gravityVector.z + stiffness.z
            )

            // 2. Bone Length Constraint
            val toNext = Float3(nextTail.x - currentParentWorldPos.x, nextTail.y - currentParentWorldPos.y, nextTail.z - currentParentWorldPos.z)
            val toNextLen = length(toNext)
            if (toNextLen > 0.0001f) {
                val dirX = toNext.x / toNextLen
                val dirY = toNext.y / toNextLen
                val dirZ = toNext.z / toNextLen
                nextTail = Float3(
                    currentParentWorldPos.x + dirX * joint.boneLength,
                    currentParentWorldPos.y + dirY * joint.boneLength,
                    currentParentWorldPos.z + dirZ * joint.boneLength
                )
            }

            // 3. Collision Resolution
            for (col in joint.colliders) {
                nextTail = resolveCollision(nextTail, currentParentWorldPos, joint.boneLength, joint.hitRadius, col)
            }

            // 4. Settling Logic
            val velVec = Float3(nextTail.x - joint.currentTail.x, nextTail.y - joint.currentTail.y, nextTail.z - joint.currentTail.z)
            val velocity = length(velVec)
            val distRestVec = Float3(nextTail.x - restTailWorld.x, nextTail.y - restTailWorld.y, nextTail.z - restTailWorld.z)
            val distFromRest = length(distRestVec)
            if (velocity < 0.0001f && distFromRest < 0.001f) {
                joint.isSettled = true
            }

            joint.prevTail = joint.currentTail
            joint.currentTail = nextTail

            // 5. Apply Rotation back to Filament
            val lntp4 = mulMat4Float4(inverse(parentTransform), Float4(nextTail.x, nextTail.y, nextTail.z, 1f))
            val lntp3 = Float3(lntp4.x, lntp4.y, lntp4.z)
            val tj = extractTranslation(joint.initialTransform)
            val diffTLocal = Float3(lntp3.x - tj.x, lntp3.y - tj.y, lntp3.z - tj.z)
            val toTargetLocal = normalize(diffTLocal)
            val boneAxisParentSpace = normalize(mulQuatFloat3(joint.localRestRot, joint.boneAxis))
            
            val rotAxis = normalize(cross(boneAxisParentSpace, toTargetLocal))
            val dotP = clamp(dot(boneAxisParentSpace, toTargetLocal), -1f, 1f)
            val rotAngle = acos(dotP)
            
            var localDeltaRot = Quaternion()
            if (length(rotAxis) > 0.001f && rotAngle > 0.001f) {
                val halfAngle = rotAngle * 0.5f
                val s = kotlin.math.sin(halfAngle)
                localDeltaRot = Quaternion(rotAxis.x * s, rotAxis.y * s, rotAxis.z * s, kotlin.math.cos(halfAngle))
            }

            val finalRot = localDeltaRot * joint.localRestRot
            val matR = finalRot.toMatrix()
            val matT = translation(tj)
            val newTx = matT * matR // scale is 1f
            tm.setTransform(inst, newTx.toFloatArray())
        }
    }

    private fun resolveCollision(
        tail: Float3, 
        nodePos: Float3, 
        boneLength: Float, 
        hitRadius: Float,
        col: RuntimeCollider
    ): Float3 {
        var currentTail = tail
        val m = col.worldMatrix

        when (val s = col.shape) {
            is SpringBoneColliderShape.Sphere -> {
                val c4 = mulMat4Float4(m, Float4(s.offset.x, s.offset.y, s.offset.z, 1f))
                val center = Float3(c4.x, c4.y, c4.z)
                val r = s.radius + hitRadius
                val distVec = Float3(currentTail.x - center.x, currentTail.y - center.y, currentTail.z - center.z)
                val dist = length(distVec)
                if (dist < r && dist > 0.0001f) {
                    val pushDir = normalize(distVec)
                    val push = Float3(pushDir.x * r, pushDir.y * r, pushDir.z * r)
                    currentTail = Float3(center.x + push.x, center.y + push.y, center.z + push.z)
                    // Re-enforce bone length after pushing out
                    val diff = Float3(currentTail.x - nodePos.x, currentTail.y - nodePos.y, currentTail.z - nodePos.z)
                    val diffDir = normalize(diff)
                    currentTail = Float3(nodePos.x + diffDir.x * boneLength, nodePos.y + diffDir.y * boneLength, nodePos.z + diffDir.z * boneLength)
                }
            }
            is SpringBoneColliderShape.Capsule -> {
                val st4 = mulMat4Float4(m, Float4(s.offset.x, s.offset.y, s.offset.z, 1f))
                val start = Float3(st4.x, st4.y, st4.z)
                val end4 = mulMat4Float4(m, Float4(s.tail.x, s.tail.y, s.tail.z, 1f))
                val end = Float3(end4.x, end4.y, end4.z)
                val r = s.radius + hitRadius

                // Line segment projection
                val segment = Float3(end.x - start.x, end.y - start.y, end.z - start.z)
                val segmentLenSq = dot(segment, segment)
                var t = 0f
                if (segmentLenSq > 0.0001f) {
                    val diffC = Float3(currentTail.x - start.x, currentTail.y - start.y, currentTail.z - start.z)
                    t = clamp(dot(diffC, segment) / segmentLenSq, 0f, 1f)
                }
                val center = Float3(start.x + segment.x * t, start.y + segment.y * t, start.z + segment.z * t)

                val distVec = Float3(currentTail.x - center.x, currentTail.y - center.y, currentTail.z - center.z)
                val dist = length(distVec)
                if (dist < r && dist > 0.0001f) {
                    val pushDir = normalize(distVec)
                    val push = Float3(pushDir.x * r, pushDir.y * r, pushDir.z * r)
                    currentTail = Float3(center.x + push.x, center.y + push.y, center.z + push.z)
                    val diff = Float3(currentTail.x - nodePos.x, currentTail.y - nodePos.y, currentTail.z - nodePos.z)
                    val diffDir = normalize(diff)
                    currentTail = Float3(nodePos.x + diffDir.x * boneLength, nodePos.y + diffDir.y * boneLength, nodePos.z + diffDir.z * boneLength)
                }
            }
        }

        return currentTail
    }
}
