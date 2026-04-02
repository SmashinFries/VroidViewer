#include <metal_stdlib>
#include <RealityKit/RealityKit.h>

using namespace metal;

// MToon Surface Shader
[[visible]]
void mToonSurfaceShader(realitykit::surface_parameters params) {
    auto surface = params.surface();
    auto texture_coords = params.geometry().uv0();
    
    // 1. Get Lit and Shade Colors
    // We map MToon properties into RealityKit's CustomMaterial properties:
    // Base Color -> Lit Color
    // Emissive Color -> Shade Color
    // Roughness -> Shading Shift (0.0 to 1.0)
    // Metallic -> Shading Toony (0.0 to 1.0)
    // Specular -> Rim Intensity
    
    half3 baseColor = surface.base_color();
    half3 shadeColor = surface.emissive_color(); // Use emissive as shade color storage
    
    half shadingShift = half(surface.roughness()); // Mapping Shading Shift Factor
    half shadingToony = half(surface.metallic());  // Mapping Shading Toony Factor
    
    // 2. Sample Textures (if any)
    // RealityKit combines the base color texture automatically, but we might want to manually sample
    // if we want full MToon texture support. For now, we'll use baseColor.
    
    // 3. Simple Lighting Calculation
    // We compute the Dot(N, L). RealityKit's light parameters are available in the lighting model 
    // but for a surface shader, we often use a default direction or calculate it manually.
    // If we want it to react to the 'main light', we'd use unlit model and do all calculations here.
    
    // For MToon, the "v" parameter is Dot(N, L).
    half3 normal = half3(params.geometry().normal());
    half3 lightDir = normalize(half3(0.5, 1.0, 0.5)); // Default light dir
    half v = dot(normal, lightDir);
    
    // MToon Shading Logic
    half val = (v + shadingShift);
    val = saturate(val * (1.0h / (1.0001h - shadingToony)));
    
    // Mix Lit and Shade colors
    half3 finalColor = mix(shadeColor, baseColor, val);
    
    // 4. Rim Lighting
    // Intensity is in 'specular' component
    half rimIntensity = half(surface.specular());
    half3 viewDir = half3(params.geometry().view_direction());
    half rim = 1.0h - saturate(dot(normal, viewDir));
    rim = pow(rim, 4.0h) * rimIntensity;
    
    half3 rimCol = half3(1.0h, 1.0h, 1.0h); // Default white rim
    finalColor += rimCol * rim;
    
    surface.set_base_color(finalColor);
}
