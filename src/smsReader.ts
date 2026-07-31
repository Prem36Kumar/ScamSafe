import { NativeModules } from 'react-native'

export type SmsMessage = {
  _id: string
  address: string
  body: string
  date: number
}

export async function readRecentSms(days = 7): Promise<SmsMessage[]> {
  try {
    const { SmsReaderModule } = NativeModules
    if (!SmsReaderModule) {
      console.warn('SmsReaderModule not available')
      return []
    }
    const msgs = await SmsReaderModule.getSms(days)
    return msgs || []
  } catch (e) {
    console.error('SMS read error:', e)
    return []
  }
}
