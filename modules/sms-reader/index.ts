import { requireOptionalNativeModule } from "expo-modules-core";

export type SmsMessage = {
  id: string;
  address: string;
  body: string;
  date: number;
};

type SmsReaderNativeModule = {
  getSms(sinceDays: number, limit: number): Promise<SmsMessage[]>;
};

/**
 * Returns null instead of throwing when the native side is missing
 * (Expo Go, web, iOS), so callers can show a friendly message.
 */
const SmsReader = requireOptionalNativeModule<SmsReaderNativeModule>("SmsReader");

export const isSmsReaderAvailable = SmsReader != null;

export default SmsReader;
