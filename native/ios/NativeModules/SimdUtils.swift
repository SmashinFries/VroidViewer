import Foundation
import simd
import RealityKit

struct SimdUtils {
    static func multiply(_ q1: simd_quatf, _ q2: simd_quatf) -> simd_quatf {
        return q1 * q2
    }
    
    static func rotateX(angle: Float) -> simd_quatf {
        return simd_quaternion(angle, simd_make_float3(1, 0, 0))
    }
    
    static func rotateY(angle: Float) -> simd_quatf {
        return simd_quaternion(angle, simd_make_float3(0, 1, 0))
    }
}
