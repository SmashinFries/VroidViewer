import Foundation
import React

@objc(NativeVRMViewManager)
class NativeVRMViewManager: RCTViewManager {
  
  override func view() -> UIView! {
    if #available(iOS 18.0, *) {
      return NativeVRMView()
    } else {
      // Fallback on earlier versions
      return UIView()
    }
  }
  
  override static func requiresMainQueueSetup() -> Bool {
    return true
  }
}
