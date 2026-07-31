const API = 'https://upi-fraud-detector-10.vercel.app/api/check'

export type Result = {
  risk_level: 'High' | 'Medium' | 'Low'
  risk_score: number
  scam_type: string
  explanation: string
  scam_signals: string[]
  recommended_action: string
  confidence: number
  if_already_sent?: string
}

export async function analyzeMessage(message: string): Promise<Result | null> {
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    const json = await res.json()
    return json.success ? json.data : null
  } catch { return null }
}
