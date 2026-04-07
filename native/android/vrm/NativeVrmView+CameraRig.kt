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

internal fun NativeVrmView.clampedDistance(value: Float): Float = value.coerceIn(minZoom, maxZoom)
internal fun NativeVrmView.clampedPolar(value: Float): Float = value.coerceIn(minPolarAngle, maxPolarAngle)
internal fun NativeVrmView.clampedAzimuth(value: Float): Float = value.coerceIn(minAzimuthAngle, maxAzimuthAngle)

fun NativeVrmView.updateCameraProjection(width: Int, height: Int) {
    if (width <= 0 || height <= 0) return
    camera.setProjection(45.0, width.toDouble() / height.toDouble(), 0.05, 1000.0, Camera.Fov.VERTICAL)
}

fun NativeVrmView.updateCameraWithDamping(dt: Float) {
    if (dt <= 0f) return
    val lerpFactor = 1.0f - exp(-dampingFactor * dt)
    
    currentDistance += (targetDistance - currentDistance) * lerpFactor
    polarAngle += (targetPolarAngle - polarAngle) * lerpFactor
    azimuthAngle += (targetAzimuthAngle - azimuthAngle) * lerpFactor
    
    updateCamera()
}

fun NativeVrmView.updateCamera() {
    val x = currentDistance * sin(polarAngle) * sin(azimuthAngle)
    val y = currentDistance * cos(polarAngle)
    val z = currentDistance * sin(polarAngle) * cos(azimuthAngle)
    
    camera.lookAt(
        (orbitTarget[0] + x).toDouble(), (orbitTarget[1] + y).toDouble(), (orbitTarget[2] + z).toDouble(),
        orbitTarget[0].toDouble(), orbitTarget[1].toDouble(), orbitTarget[2].toDouble(),
        0.0, 1.0, 0.0
    )
}
