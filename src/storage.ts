import AsyncStorage from '@react-native-async-storage/async-storage'
import { Result } from './api'

export type Entry = Result & {
  id: string
  text: string
  sender: string
  time: number
  pinned: boolean
  autoDeleted: boolean
}

const KEY = 'scamsafe_v1'

export const getAll   = async (): Promise<Entry[]>      => { try { return JSON.parse(await AsyncStorage.getItem(KEY) || '[]') } catch { return [] } }
export const saveAll  = async (e: Entry[])              => AsyncStorage.setItem(KEY, JSON.stringify(e.slice(0, 500)))
export const addEntry = async (e: Entry)                => { const all = await getAll(); const i = all.findIndex(x=>x.id===e.id); if(i>=0) all[i]=e; else all.unshift(e); await saveAll(all) }
export const pinToggle= async (id: string)              => { const all = await getAll(); const e = all.find(x=>x.id===id); if(e){e.pinned=!e.pinned; await saveAll(all)} }
export const remove   = async (id: string)              => { const all = await getAll(); await saveAll(all.filter(x=>x.id!==id)) }
export const clearAll = async ()                        => AsyncStorage.removeItem(KEY)
