import { NativeModules, NativeEventEmitter } from 'react-native'

export type SmsMessage = {
  _id: string
  address: string
  body: string
  date: number
}

// Direct Android ContentResolver via expo-modules
export function readRecentSms(days = 7): Promise<SmsMessage[]> {
  return new Promise((resolve) => {
    try {
      const since = Date.now() - days * 24 * 60 * 60 * 1000
      const { RNSmsRetriever } = NativeModules
      if (RNSmsRetriever?.readInboxMessages) {
        RNSmsRetriever.readInboxMessages(since, (msgs: SmsMessage[]) => resolve(msgs || []))
      } else {
        resolve([])
      }
    } catch { resolve([]) }
  })
}
