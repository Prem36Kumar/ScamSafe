import SmsReader, { isSmsReaderAvailable, type SmsMessage } from '../modules/sms-reader'

export type { SmsMessage }

export function isSmsScannerAvailable(): boolean {
  return isSmsReaderAvailable
}

/** Reads the most recent inbox messages. Throws so the caller can surface the reason. */
export async function readRecentSms(sinceDays = 7, limit = 10): Promise<SmsMessage[]> {
  if (!SmsReader) {
    throw new Error('SMS scanner is not available in this build.')
  }
  const messages = await SmsReader.getSms(sinceDays, limit)
  return messages ?? []
}
