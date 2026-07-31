import SmsAndroid from 'react-native-get-sms-android'

export type SmsMessage = {
  _id: string
  address: string
  body: string
  date: number
}

export function readRecentSms(days = 7): Promise<SmsMessage[]> {
  return new Promise((resolve) => {
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    SmsAndroid.list(
      JSON.stringify({
        box: 'inbox',
        minDate: since,
        maxCount: 200,
        indexFrom: 0,
      }),
      (fail: string) => {
        console.log('SMS read failed:', fail)
        resolve([])
      },
      (count: number, smsList: string) => {
        try {
          const messages = JSON.parse(smsList)
          resolve(messages)
        } catch { resolve([]) }
      }
    )
  })
}
