package com.scamsafe
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
class SmsReaderPackage : ReactPackage {
  override fun createNativeModules(ctx: ReactApplicationContext) = listOf(SmsReaderModule(ctx))
  override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*,*>> = emptyList()
}
