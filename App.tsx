import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, StatusBar, RefreshControl, ActivityIndicator,
  Alert, PermissionsAndroid, NativeModules, Animated, Platform,
  Image,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { analyzeMessage } from './src/api'
import { getAll, addEntry, pinToggle, remove, clearAll, Entry } from './src/storage'

const { SmsModule } = NativeModules

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  bg: '#050508', surface: '#0e1015', s2: '#14171f', s3: '#1c2030',
  border: '#1e2535', accent: '#00e5a0', accentDim: 'rgba(0,229,160,0.12)',
  text: '#f0f4ff', t2: '#8899bb', t3: '#445566',
  High:   { bg:'rgba(239,68,68,0.1)',   border:'rgba(239,68,68,0.6)',   chip:'rgba(239,68,68,0.2)',   txt:'#fca5a5', dot:'#ef4444' },
  Medium: { bg:'rgba(245,158,11,0.1)',  border:'rgba(245,158,11,0.6)',  chip:'rgba(245,158,11,0.2)',  txt:'#fcd34d', dot:'#f59e0b' },
  Low:    { bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.5)', chip:'rgba(16,185,129,0.15)', txt:'#6ee7b7', dot:'#10b981' },
}

type Tab = 'scan' | 'history' | 'pinned'

// ── Risk label helpers ────────────────────────────────────────────────────────
const riskLabel = (l: string) => l==='High' ? '⚠ HIGH RISK' : l==='Medium' ? '◈ SUSPICIOUS' : '✓ SAFE'

// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]           = useState<Tab>('scan')
  const [entries, setEntries]   = useState<Entry[]>([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ done:0, total:0 })
  const [text, setText]         = useState('')
  const [manRes, setManRes]     = useState<Entry|null>(null)
  const [manLoad, setManLoad]   = useState(false)
  const [refreshing, setRefresh]= useState(false)
  const [isDefault, setDefault] = useState(false)
  const fadeAnim                = useRef(new Animated.Value(0)).current

  const reload = useCallback(async () => { setEntries(await getAll()) }, [])

  useEffect(() => {
    requestPerms()
    reload()
    Animated.timing(fadeAnim, { toValue:1, duration:600, useNativeDriver:true }).start()
    // Auto-scan on first launch
    AsyncStorage.getItem('first_launch').then(v => { if(!v){ AsyncStorage.setItem('first_launch','done'); setTimeout(scanSms, 1500) } })
  }, [])

  async function requestPerms() {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ])
    try {
      const def = await new Promise<boolean>(res => SmsModule?.isDefaultSmsApp?.(v => res(v)) || res(false))
      setDefault(def)
    } catch {}
  }

  // ── Core scanner ────────────────────────────────────────────────────────────
  async function scanSms() {
    const ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS)
    if (!ok) {
      Alert.alert('SMS Permission Required', 'Allow SMS access so ScamSafe can protect you.', [
        { text:'Grant', onPress: requestPerms }
      ]); return
    }

    setScanning(true); setProgress({ done:0, total:0 })

    try {
      const since = Date.now() - 7 * 24 * 60 * 60 * 1000 // last 7 days
      const msgs: any[] = await new Promise((res, rej) =>
        SmsModule.getSms(since, (err: any, data: any[]) => err ? rej(new Error(err)) : res(data))
      )

      setProgress({ done:0, total:msgs.length })
      let fraudCount = 0, deletedCount = 0

      for (let i = 0; i < msgs.length; i++) {
        const m   = msgs[i]
        const body = (m.body || '').trim()
        if (body.length < 10) { setProgress({ done:i+1, total:msgs.length }); continue }

        const result = await analyzeMessage(body)
        if (!result) { setProgress({ done:i+1, total:msgs.length }); continue }

        let autoDeleted = false

        // ▶ AUTO-DELETE if score > 90
        if (result.risk_score > 90 && isDefault) {
          try {
            await new Promise((res, rej) => SmsModule.deleteSms(m._id, (err: any) => err ? rej(err) : res(true)))
            autoDeleted = true; deletedCount++
          } catch {}
        }

        const entry: Entry = {
          id: m._id || `sms_${m.date}`,
          text: body.slice(0, 300),
          sender: m.address || 'Unknown',
          time: parseInt(m.date) || Date.now(),
          pinned: result.risk_level === 'High' || result.risk_score > 70, // auto-pin high risk
          autoDeleted,
          ...result,
        }

        if (result.risk_level === 'High') fraudCount++
        await addEntry(entry)
        setProgress({ done:i+1, total:msgs.length })
      }

      await reload()
      Alert.alert(
        '✅ Scan Complete',
        `Scanned ${msgs.length} messages\n🔴 ${fraudCount} fraud alerts\n🗑 ${deletedCount} scams auto-deleted`
      )
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not read SMS messages')
    } finally { setScanning(false) }
  }

  // ── Manual check ────────────────────────────────────────────────────────────
  async function checkManual() {
    if (text.trim().length < 10 || manLoad) return
    setManLoad(true); setManRes(null)
    const result = await analyzeMessage(text.trim())
    if (result) {
      const entry: Entry = {
        id: `manual_${Date.now()}`, text: text.trim().slice(0,300),
        sender: 'Manual check', time: Date.now(), pinned: result.risk_level==='High', autoDeleted:false,
        ...result,
      }
      setManRes(entry); await addEntry(entry); await reload()
    }
    setManLoad(false)
  }

  const pinned = entries.filter(e => e.pinned)
  const stats  = {
    high: entries.filter(e=>e.risk_level==='High').length,
    med:  entries.filter(e=>e.risk_level==='Medium').length,
    safe: entries.filter(e=>e.risk_level==='Low').length,
  }

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Animated.View style={[S.header, { opacity: fadeAnim }]}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
          <View style={S.logoDot} />
          <Text style={S.logoTxt}>ScamSafe</Text>
          <View style={S.betaBadge}><Text style={S.betaTxt}>BETA</Text></View>
        </View>
        <TouchableOpacity onPress={()=>Alert.alert('Default SMS App', isDefault ? 'ScamSafe is your default SMS app ✓' : 'Set ScamSafe as default to enable auto-delete of scam messages.', isDefault ? [{text:'OK'}] : [{text:'Not now'},{text:'Set Default',onPress:()=>SmsModule?.requestDefaultSmsApp?.()}])} style={S.defaultPill}>
          <Text style={{ color: isDefault?C.accent:C.t3, fontSize:10, fontFamily:'monospace' }}>
            {isDefault ? '✓ Default SMS' : '⚡ Set Default'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <View style={S.statsRow}>
        {([['⚠',stats.high,'#ef4444','Fraud'],['◈',stats.med,'#f59e0b','Suspicious'],['✓',stats.safe,'#10b981','Safe']] as const).map(([icon,n,col,lbl])=>(
          <View key={lbl} style={S.statCell}>
            <Text style={[S.statN, { color:col }]}>{n}</Text>
            <Text style={S.statL}>{lbl}</Text>
          </View>
        ))}
      </View>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <View style={S.tabBar}>
        {([['scan','🔍 Scan'],['history',`🕒 History`],['pinned',`📌 Pinned${pinned.length>0?` (${pinned.length})`:''}`]] as [Tab,string][]).map(([id,lbl])=>(
          <TouchableOpacity key={id} onPress={()=>setTab(id)} style={[S.tabBtn, tab===id&&{borderBottomColor:C.accent}]}>
            <Text style={[S.tabTxt, tab===id&&{color:C.accent}]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══ SCAN TAB ══════════════════════════════════════════════════════════ */}
      {tab==='scan' && (
        <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent}>

          {/* Scan card */}
          <View style={S.card}>
            <View style={{ alignItems:'center', paddingVertical:8 }}>
              <Text style={{ fontSize:40, marginBottom:10 }}>📱</Text>
              <Text style={S.cardTitle}>Scan Your SMS</Text>
              <Text style={S.cardSub}>Last 7 days · Auto-pins fraud · Deletes scams with {'>'}90% score</Text>

              {scanning ? (
                <View style={{ alignItems:'center', width:'100%', marginTop:16 }}>
                  <ActivityIndicator color={C.accent} size="large" />
                  <Text style={[S.cardSub, { marginTop:10 }]}>
                    {progress.done} / {progress.total} messages analyzed
                  </Text>
                  <View style={S.progBg}>
                    <View style={[S.progFill, { width: progress.total>0 ? `${(progress.done/progress.total)*100}%` : '0%' }]} />
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={scanSms} style={S.bigBtn}>
                  <Text style={S.bigBtnTxt}>🚀  Scan My Messages</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Manual card */}
          <View style={S.card}>
            <Text style={S.inputLabel}>Or paste any message manually</Text>
            <TextInput
              value={text} onChangeText={setText}
              placeholder="Paste suspicious message here..."
              placeholderTextColor={C.t3} multiline numberOfLines={4}
              style={S.input}
            />
            <TouchableOpacity
              onPress={checkManual}
              disabled={text.trim().length<10||manLoad}
              style={[S.bigBtn, { marginTop:10, opacity: text.trim().length<10?0.35:1 }]}>
              {manLoad
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={S.bigBtnTxt}>Check This Message →</Text>
              }
            </TouchableOpacity>
            {manRes && <RiskCard entry={manRes} onPin={async()=>{await pinToggle(manRes.id);reload()}} onDelete={async()=>{await remove(manRes.id);setManRes(null);reload()}} />}
          </View>

          {!isDefault && (
            <TouchableOpacity onPress={()=>SmsModule?.requestDefaultSmsApp?.()} style={S.bannerCard}>
              <Text style={S.bannerTitle}>⚡ Enable Auto-Delete</Text>
              <Text style={S.bannerSub}>Set ScamSafe as default SMS app to automatically delete scam messages with risk score above 90.</Text>
              <Text style={[S.bannerSub, { color:C.accent, marginTop:6 }]}>Tap to set as default →</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* ══ HISTORY TAB ═══════════════════════════════════════════════════════ */}
      {tab==='history' && (
        <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefresh(true);await reload();setRefresh(false)}} tintColor={C.accent} />}>
          <View style={S.rowBetween}>
            <Text style={S.sectionTitle}>All Scans ({entries.length})</Text>
            {entries.length>0&&<TouchableOpacity onPress={()=>Alert.alert('Clear All?','Delete all scan history?',[{text:'Cancel'},{text:'Clear',style:'destructive',onPress:async()=>{await clearAll();reload()}}])}>
              <Text style={{ color:'#ef4444', fontSize:12, fontFamily:'monospace' }}>Clear all</Text>
            </TouchableOpacity>}
          </View>
          {entries.length===0
            ? <EmptyState icon="🕵️" msg={"No scans yet.\nTap Scan tab to protect yourself."} />
            : entries.map(e=><MsgCard key={e.id} entry={e} onPin={async()=>{await pinToggle(e.id);reload()}} onDelete={async()=>{await remove(e.id);reload()}} />)
          }
        </ScrollView>
      )}

      {/* ══ PINNED TAB ════════════════════════════════════════════════════════ */}
      {tab==='pinned' && (
        <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefresh(true);await reload();setRefresh(false)}} tintColor={C.accent} />}>
          <Text style={[S.sectionTitle, { marginBottom:12 }]}>📌 Pinned Alerts ({pinned.length})</Text>
          {pinned.length===0
            ? <EmptyState icon="📌" msg={"No pinned messages.\nHigh-risk messages are auto-pinned."} />
            : pinned.map(e=><MsgCard key={e.id} entry={e} onPin={async()=>{await pinToggle(e.id);reload()}} onDelete={async()=>{await remove(e.id);reload()}} />)
          }
        </ScrollView>
      )}
    </View>
  )
}

// ── RiskCard (detailed result) ─────────────────────────────────────────────────
function RiskCard({ entry, onPin, onDelete }: { entry:Entry; onPin:()=>void; onDelete:()=>void }) {
  const col = C[entry.risk_level]
  return (
    <View style={[S.riskCard, { borderColor:col.border, backgroundColor:col.bg }]}>
      <View style={S.rowBetween}>
        <View style={[S.chip, { backgroundColor:col.chip }]}>
          <Text style={[S.chipTxt, { color:col.txt }]}>{riskLabel(entry.risk_level)}</Text>
        </View>
        <Text style={S.score}>{entry.risk_score}/100 · {entry.confidence}% sure</Text>
      </View>
      {/* Score bar */}
      <View style={[S.barBg, { marginTop:10 }]}>
        <View style={[S.barFill, { width:`${entry.risk_score}%`, backgroundColor:col.dot }]} />
      </View>
      {entry.scam_type!=='None detected' && (
        <Text style={[S.miniLabel, { marginTop:12 }]}>Scam type: <Text style={{ color:col.txt }}>{entry.scam_type}</Text></Text>
      )}
      <Text style={[S.bodyTxt, { marginTop:8 }]}>{entry.explanation}</Text>
      <View style={[S.actionBox, { backgroundColor:col.chip, borderColor:col.border, marginTop:10 }]}>
        <Text style={[S.bodyTxt, { color:col.txt, fontWeight:'600' }]}>→ {entry.recommended_action}</Text>
      </View>
      {entry.if_already_sent && (
        <View style={[S.actionBox, { backgroundColor:'rgba(234,88,12,0.12)', borderColor:'rgba(234,88,12,0.4)', marginTop:8 }]}>
          <Text style={[S.miniLabel, { marginBottom:4 }]}>If you already sent money:</Text>
          <Text style={[S.bodyTxt, { color:'#fdba74' }]}>{entry.if_already_sent}</Text>
        </View>
      )}
      <View style={[S.rowBetween, { marginTop:12 }]}>
        <TouchableOpacity onPress={onPin} style={S.actionBtn}>
          <Text style={{ color: entry.pinned?C.accent:C.t2, fontSize:13 }}>{entry.pinned?'📌 Pinned':'☆ Pin this'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={S.actionBtn}>
          <Text style={{ color:'#ef4444', fontSize:13 }}>✕ Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── MsgCard (compact list item) ───────────────────────────────────────────────
function MsgCard({ entry, onPin, onDelete }: { entry:Entry; onPin:()=>void; onDelete:()=>void }) {
  const col  = C[entry.risk_level]
  const date = new Date(entry.time).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
  const [expanded, setExpanded] = useState(false)
  return (
    <TouchableOpacity onPress={()=>setExpanded(e=>!e)} activeOpacity={0.85}
      style={[S.msgCard, { borderColor:col.border, backgroundColor:col.bg }]}>
      <View style={S.rowBetween}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:6, flexShrink:1 }}>
          <View style={[S.chip, { backgroundColor:col.chip, paddingVertical:2, paddingHorizontal:8 }]}>
            <Text style={[S.chipTxt, { color:col.txt, fontSize:9 }]}>{entry.risk_level}</Text>
          </View>
          <Text style={[S.score, { fontSize:10 }]}>{entry.risk_score}/100</Text>
          {entry.autoDeleted && <Text style={{ fontSize:9, color:'#ef4444' }}>🗑 Deleted</Text>}
          {entry.pinned      && <Text style={{ fontSize:11 }}>📌</Text>}
        </View>
        <Text style={[S.miniLabel, { marginBottom:0 }]}>{date}</Text>
      </View>

      <Text style={[S.miniLabel, { marginTop:6, marginBottom:2, color:C.t3 }]}>{entry.sender}</Text>
      <Text style={[S.bodyTxt, { fontSize:12 }]} numberOfLines={expanded?undefined:2}>{entry.text}</Text>

      {expanded && (
        <View style={{ marginTop:8 }}>
          <View style={[S.actionBox, { backgroundColor:col.chip, borderColor:col.border }]}>
            <Text style={[S.bodyTxt, { color:col.txt, fontSize:12 }]}>→ {entry.recommended_action}</Text>
          </View>
          <View style={[S.rowBetween, { marginTop:10 }]}>
            <TouchableOpacity onPress={onPin}>
              <Text style={{ color: entry.pinned?C.accent:C.t3, fontSize:12 }}>{entry.pinned?'📌 Unpin':'☆ Pin'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete}>
              <Text style={{ color:'#ef4444', fontSize:12 }}>✕ Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  )
}

function EmptyState({ icon, msg }: { icon:string; msg:string }) {
  return (
    <View style={{ alignItems:'center', paddingVertical:50 }}>
      <Text style={{ fontSize:44, marginBottom:14 }}>{icon}</Text>
      <Text style={[S.bodyTxt, { textAlign:'center', lineHeight:22 }]}>{msg}</Text>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:        { flex:1, backgroundColor:C.bg },
  scroll:      { flex:1 },
  scrollContent:{ padding:14, paddingBottom:30 },
  header:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:16, paddingVertical:14, borderBottomWidth:1, borderColor:C.border },
  logoDot:     { width:9, height:9, borderRadius:5, backgroundColor:C.accent, shadowColor:C.accent, shadowOpacity:0.8, shadowRadius:6, elevation:4 },
  logoTxt:     { fontSize:19, fontWeight:'900', color:C.text, fontFamily:'monospace', letterSpacing:0.5 },
  betaBadge:   { borderWidth:1, borderColor:C.border, borderRadius:10, paddingHorizontal:6, paddingVertical:1 },
  betaTxt:     { fontSize:9, color:C.t3, fontFamily:'monospace' },
  defaultPill: { borderWidth:1, borderColor:C.border, borderRadius:20, paddingHorizontal:10, paddingVertical:5 },
  statsRow:    { flexDirection:'row', borderBottomWidth:1, borderColor:C.border },
  statCell:    { flex:1, alignItems:'center', paddingVertical:12, borderRightWidth:1, borderColor:C.border },
  statN:       { fontSize:24, fontWeight:'900', fontFamily:'monospace' },
  statL:       { fontSize:10, color:C.t3, fontFamily:'monospace', marginTop:2 },
  tabBar:      { flexDirection:'row', backgroundColor:C.surface, borderBottomWidth:1, borderColor:C.border },
  tabBtn:      { flex:1, paddingVertical:12, alignItems:'center', borderBottomWidth:2, borderBottomColor:'transparent' },
  tabTxt:      { fontSize:11, color:C.t3, fontFamily:'monospace', fontWeight:'700' },
  card:        { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:16, padding:16, marginBottom:12 },
  cardTitle:   { fontSize:17, fontWeight:'800', color:C.text, fontFamily:'monospace', marginBottom:6 },
  cardSub:     { fontSize:12, color:C.t2, textAlign:'center', lineHeight:18 },
  bigBtn:      { backgroundColor:C.accent, borderRadius:13, paddingVertical:14, paddingHorizontal:28, alignItems:'center', marginTop:16, width:'100%' },
  bigBtnTxt:   { fontSize:14, fontWeight:'900', color:'#000', fontFamily:'monospace', letterSpacing:0.3 },
  inputLabel:  { fontSize:10, color:C.t3, fontFamily:'monospace', textTransform:'uppercase', letterSpacing:1, marginBottom:8 },
  input:       { backgroundColor:C.s2, borderWidth:1, borderColor:C.border, borderRadius:12, padding:12, color:C.text, fontFamily:'monospace', fontSize:13, textAlignVertical:'top', minHeight:90 },
  bannerCard:  { backgroundColor:'rgba(0,229,160,0.06)', borderWidth:1, borderColor:'rgba(0,229,160,0.2)', borderRadius:14, padding:16, marginBottom:12 },
  bannerTitle: { fontSize:14, fontWeight:'800', color:C.accent, fontFamily:'monospace', marginBottom:6 },
  bannerSub:   { fontSize:12, color:C.t2, lineHeight:18 },
  sectionTitle:{ fontSize:15, fontWeight:'800', color:C.text, fontFamily:'monospace' },
  rowBetween:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  riskCard:    { borderWidth:1, borderRadius:14, padding:14, marginTop:14 },
  chip:        { paddingHorizontal:10, paddingVertical:4, borderRadius:20 },
  chipTxt:     { fontSize:11, fontWeight:'800', fontFamily:'monospace' },
  score:       { fontSize:11, color:C.t3, fontFamily:'monospace' },
  barBg:       { height:5, backgroundColor:C.s3, borderRadius:3, overflow:'hidden' },
  barFill:     { height:'100%', borderRadius:3 },
  miniLabel:   { fontSize:10, color:C.t3, fontFamily:'monospace', marginBottom:4 },
  bodyTxt:     { fontSize:13, color:C.t2, lineHeight:19 },
  actionBox:   { borderWidth:1, borderRadius:10, padding:12 },
  actionBtn:   { paddingVertical:6, paddingHorizontal:4 },
  msgCard:     { borderWidth:1, borderRadius:13, padding:14, marginBottom:10 },
  progBg:      { width:'100%', height:6, backgroundColor:C.s3, borderRadius:3, marginTop:12, overflow:'hidden' },
  progFill:    { height:'100%', backgroundColor:C.accent, borderRadius:3 },
})
