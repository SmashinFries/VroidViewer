package com.dedicatus.VroidViewer.vrm;

import com.google.android.filament.IndexBuffer;

/**
 * A Java bridge to provide access to Filament nested enums that 
 * the Kotlin compiler sometimes fails to resolve in this project.
 */
public class FilamentBridge {
    public static final com.google.android.filament.IndexBuffer.Builder.IndexType IndexType_USHORT = com.google.android.filament.IndexBuffer.Builder.IndexType.USHORT;
    public static final com.google.android.filament.IndexBuffer.Builder.IndexType IndexType_UINT = com.google.android.filament.IndexBuffer.Builder.IndexType.UINT;
}
