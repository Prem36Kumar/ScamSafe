import { NativeModules, Alert } from 'react-native'

export type SmsMessage = {
  _id: string
  address: string
  body: string
  date: number
}

export async function readRecentSms(days = 7): Promise<SmsMessage[]> {
  const { SmsReaderModule } = NativeModules
  
  // Debug: show what modules are available
  console.log('Available modules:', Object.keys(NativeModules).join(', '))
  
  if (!SmsReaderModule) {
    Alert.alert(
      'Module Error',
      'SmsReaderModule not found. Available: ' + Object.keys(NativeModules).slice(0,5).join(', ')
    )
    return []
  }
  
  try {
    const msgs = await SmsReaderModule.getSms(days)
    return msgs || []
  } catch (e: any) {
    Alert.alert('SMS Error', e?.message || 'Unknown error')
    return []
  }
}
