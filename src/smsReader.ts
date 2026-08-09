import { NativeModules, Alert } from 'react-native'

export type SmsMessage = {
  _id: string
  address: string
  body: string
  date: number
}

export async function readRecentSms(): Promise<SmsMessage[]> {
  const { SmsReaderModule } = NativeModules
  if (!SmsReaderModule) {
    Alert.alert('Error', 'SMS module not loaded. Please reinstall the app.')
    return []
  }
  try {
    const msgs = await SmsReaderModule.getSms(1) // only last 1 day
    return (msgs || []).slice(0, 10) // max 10 messages only
  } catch (e: any) {
    Alert.alert('SMS Error', e?.message || 'Could not read SMS')
    return []
  }
}
