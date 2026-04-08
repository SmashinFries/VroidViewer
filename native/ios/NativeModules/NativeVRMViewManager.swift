import Foundation
import React

@available(iOS 18.0, *)
@objc(NativeVRMViewManager)
class NativeVRMViewManager: RCTViewManager {

  // Weak reference to the most recently created NativeVRMView.
  // Safe because the view is retained by the UIKit hierarchy.
  weak var activeView: NativeVRMView?

  override func view() -> UIView! {
    if #available(iOS 18.0, *) {
      let v = NativeVRMView()
      activeView = v
      return v
    } else {
      return UIView()
    }
  }
  
  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc func playAudio(_ node: NSNumber, assetName: String) {
    print("DEBUG: NativeVRMViewManager.playAudio called, node=\(node), assetName=\(assetName)")
    DispatchQueue.main.async {
      if #available(iOS 18.0, *) {
        if let view = self.activeView {
          print("DEBUG: Calling view.playAudio on active view")
          view.playAudio(assetName: assetName)
        } else {
          print("ERROR: activeView is nil — NativeVRMView not yet created")
        }
      }
    }
  }
}

