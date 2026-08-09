package com.scamsafe

import android.net.Uri
import com.facebook.react.bridge.*

class SmsReaderModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "SmsReaderModule"

  @ReactMethod
  fun getSms(sinceDays: Int, promise: Promise) {
    try {
      val since = System.currentTimeMillis() - sinceDays * 24 * 60 * 60 * 1000L
      val list  = mutableListOf<WritableMap>()
      val cursor = ctx.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        "date > ?", arrayOf(since.toString()), "date DESC LIMIT 200"
      )
      cursor?.use {
        val iId   = it.getColumnIndex("_id")
        val iAddr = it.getColumnIndex("address")
        val iBody = it.getColumnIndex("body")
        val iDate = it.getColumnIndex("date")
        while (it.moveToNext()) {
          val m = Arguments.createMap()
          m.putString("_id",     it.getString(iId)   ?: "")
          m.putString("address", it.getString(iAddr) ?: "")
          m.putString("body",    it.getString(iBody) ?: "")
          m.putDouble("date",    it.getString(iDate)?.toDoubleOrNull() ?: 0.0)
          list.add(m)
        }
      }
      val arr = Arguments.createArray()
      list.forEach { arr.pushMap(it) }
      promise.resolve(arr)
    } catch (e: Exception) {
      promise.reject("SMS_ERROR", e.message)
    }
  }
}
