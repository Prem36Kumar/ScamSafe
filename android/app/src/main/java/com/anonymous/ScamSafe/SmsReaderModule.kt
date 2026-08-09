package com.anonymous.ScamSafe

import android.net.Uri
import com.facebook.react.bridge.*

class SmsReaderModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "SmsReaderModule"

  @ReactMethod
  fun getSms(sinceDays: Int, promise: Promise) {
    try {
      val since = System.currentTimeMillis() - sinceDays * 24L * 60 * 60 * 1000
      val list  = mutableListOf<WritableMap>()
      val cursor = ctx.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        "date > ?", arrayOf(since.toString()), "date DESC"
      )
      cursor?.use {
        val iId   = it.getColumnIndex("_id")
        val iAddr = it.getColumnIndex("address")
        val iBody = it.getColumnIndex("body")
        val iDate = it.getColumnIndex("date")
        var count = 0
        while (it.moveToNext() && count < 10) { // MAX 10 only
          val m = Arguments.createMap()
          m.putString("_id",     it.getString(iId)   ?: "")
          m.putString("address", it.getString(iAddr) ?: "")
          m.putString("body",    it.getString(iBody) ?: "")
          m.putDouble("date",    it.getString(iDate)?.toDoubleOrNull() ?: 0.0)
          list.add(m); count++
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
