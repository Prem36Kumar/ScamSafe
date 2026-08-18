package expo.modules.smsreader

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MissingSmsPermission :
  CodedException("READ_SMS permission has not been granted")

class SmsReadFailed(cause: Throwable) :
  CodedException("Could not read the SMS inbox: ${cause.message}", cause)

class SmsReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    AsyncFunction("getSms") { sinceDays: Int, limit: Int ->
      val context = appContext.reactContext
        ?: throw SmsReadFailed(IllegalStateException("No Android context available"))

      if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS)
        != PackageManager.PERMISSION_GRANTED
      ) {
        throw MissingSmsPermission()
      }

      val since = System.currentTimeMillis() - sinceDays.coerceAtLeast(1) * 24L * 60 * 60 * 1000
      val max = limit.coerceIn(1, 200)
      val messages = mutableListOf<Map<String, Any>>()

      try {
        context.contentResolver.query(
          Uri.parse("content://sms/inbox"),
          arrayOf("_id", "address", "body", "date"),
          "date > ?",
          arrayOf(since.toString()),
          "date DESC"
        )?.use { cursor ->
          val idIndex = cursor.getColumnIndex("_id")
          val addressIndex = cursor.getColumnIndex("address")
          val bodyIndex = cursor.getColumnIndex("body")
          val dateIndex = cursor.getColumnIndex("date")

          while (cursor.moveToNext() && messages.size < max) {
            messages.add(
              mapOf(
                "id" to (cursor.getString(idIndex) ?: ""),
                "address" to (cursor.getString(addressIndex) ?: "Unknown"),
                "body" to (cursor.getString(bodyIndex) ?: ""),
                "date" to (cursor.getString(dateIndex)?.toDoubleOrNull() ?: 0.0)
              )
            )
          }
        }
      } catch (e: Exception) {
        throw SmsReadFailed(e)
      }

      messages
    }
  }
}
