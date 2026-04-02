package com.dedicatus.VroidViewer.vrm

import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.GestureDetector
import com.google.android.filament.Camera
import com.google.android.filament.Viewport
import kotlin.math.*

/**
 * Camera and Gesture Handling for NativeVrmView
 */

internal fun NativeVrmView.clampedDistance(value: Float): Float = min(max(value, minZoom), maxZoom)
internal fun NativeVrmView.clampedPolar(value: Float): Float = min(max(value, minPolarAngle), maxPolarAngle)
internal fun NativeVrmView.clampedAzimuth(value: Float): Float = min(max(value, minAzimuthAngle), maxAzimuthAngle)

fun NativeVrmView.updateCameraProjection(width: Int, height: Int) {
    if (width <= 0 || height <= 0) return
    val aspect = width.toDouble() / height.toDouble()
    camera.setProjection(45.0, aspect, 0.05, 1000.0, Camera.Fov.VERTICAL)
}

fun NativeVrmView.updateCameraWithDamping() {
    val distanceDelta = targetDistance - currentDistance
    val polarDelta = targetPolarAngle - polarAngle
    val azimuthDelta = targetAzimuthAngle - azimuthAngle

    if (abs(distanceDelta) < 0.0001f &&
        abs(polarDelta) < 0.0001f &&
        abs(azimuthDelta) < 0.0001f
    ) {
        return
    }

    currentDistance += distanceDelta * dampingFactor
    polarAngle += polarDelta * dampingFactor
    azimuthAngle += azimuthDelta * dampingFactor
    updateCamera()
}

fun NativeVrmView.updateCamera() {
    val x = currentDistance * sin(polarAngle) * sin(azimuthAngle)
    val y = currentDistance * cos(polarAngle)
    val z = currentDistance * sin(polarAngle) * cos(azimuthAngle)
    val eyeX = orbitTarget[0] + x
    val eyeY = orbitTarget[1] + y
    val eyeZ = orbitTarget[2] + z
    camera.lookAt(
        eyeX.toDouble(), eyeY.toDouble(), eyeZ.toDouble(),
        orbitTarget[0].toDouble(), orbitTarget[1].toDouble(), orbitTarget[2].toDouble(),
        0.0, 1.0, 0.0
    )
}

// Gesture Setup logic is still in init of NativeVrmView, but we can expose helper methods if needed.
