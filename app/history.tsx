import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, MIN_TAP } from '@/lib/theme';
import { clearRuns, exportRuns, loadRuns, shareVideo } from '@/lib/storage';
import { PROTOCOL_LABEL, type Run } from '@/lib/types';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

interface Session { sessionId: string; startedAt: string; tag: string; runs: Run[]; }

// Group runs into sessions (newest first), protocols ordered within each.
function groupSessions(runs: Run[]): Session[] {
  const map = new Map<string, Run[]>();
  for (const r of runs) {
    const key = r.session_id || r.run_id; // legacy runs have no session_id
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return [...map.entries()]
    .map(([sessionId, rs]) => {
      const ordered = [...rs].sort((a, b) => (a.session_index ?? 0) - (b.session_index ?? 0));
      return {
        sessionId,
        startedAt: ordered[0].session_started_at || ordered[0].timestamp,
        tag: ordered[0].tag,
        runs: ordered,
      };
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export default function History() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);

  const refresh = useCallback(() => { loadRuns().then(setRuns); }, []);
  useFocusEffect(refresh);

  const onExport = async () => {
    try {
      await exportRuns();
    } catch (e) {
      Alert.alert('Export failed', String(e));
    }
  };

  const onClear = () => {
    Alert.alert('Delete all sessions?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await clearRuns(); refresh(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Session History</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={onExport} disabled={runs.length === 0}>
          <Text style={styles.primaryText}>Export all (JSON)</Text>
        </Pressable>
        <Pressable style={styles.danger} onPress={onClear} disabled={runs.length === 0}>
          <Text style={styles.dangerText}>Delete all</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {runs.length === 0 && <Text style={styles.empty}>No sessions recorded.</Text>}
        {groupSessions(runs).map((s) => (
          <Pressable
            key={s.sessionId}
            style={styles.sessionCard}
            onPress={() => router.push(`/report/${s.sessionId}` as any)}>
            <View style={styles.cardTop}>
              <Text style={styles.cardDate}>{fmt(s.startedAt)}</Text>
              <Text style={styles.sessionCount}>{s.runs.length} test{s.runs.length === 1 ? '' : 's'}</Text>
            </View>
            {!!s.tag && <Text style={styles.cardMeta}>Tag: {s.tag}</Text>}

            {s.runs.map((r) => (
              <View key={r.run_id} style={styles.protoRow}>
                <View style={styles.protoMain}>
                  <Text style={styles.cardProtocol}>{PROTOCOL_LABEL[r.protocol]}</Text>
                  <Text style={styles.protoMeta}>
                    {r.trials.length} trials{r.video_uri ? ' · 🎥' : ' · no video'}
                  </Text>
                </View>
                <Text style={[styles.cardStatus, { color: r.completed ? COLORS.ok : COLORS.danger }]}>
                  {r.completed ? 'Complete' : 'Partial'}
                </Text>
                {!!r.video_uri && (
                  <Pressable
                    style={styles.videoBtn}
                    onPress={() => shareVideo(r.video_uri!).catch((e) => Alert.alert('Share failed', String(e)))}>
                    <Text style={styles.videoBtnText}>Share</Text>
                  </Pressable>
                )}
              </View>
            ))}
            <Text style={styles.openHint}>Tap to open the full session report ›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  back: { minHeight: MIN_TAP, justifyContent: 'center' },
  backText: { color: COLORS.accent, fontSize: 16 },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800', paddingHorizontal: 8 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingVertical: 12 },
  primary: {
    flex: 1,
    minHeight: MIN_TAP,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: COLORS.bg, fontSize: 15, fontWeight: '700' },
  danger: {
    minHeight: MIN_TAP,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { color: COLORS.danger, fontSize: 15, fontWeight: '600' },
  list: { paddingHorizontal: 24, paddingBottom: 32, gap: 12 },
  empty: { color: COLORS.faint, fontSize: 14 },
  sessionCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: 16, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionCount: { color: COLORS.accent2, fontSize: 12, fontWeight: '700' },
  cardProtocol: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  cardStatus: { fontSize: 12, fontWeight: '700' },
  cardDate: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  cardMeta: { color: COLORS.faint, fontSize: 13 },
  protoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.cardBorder,
  },
  protoMain: { flex: 1 },
  protoMeta: { color: COLORS.faint, fontSize: 12, marginTop: 2 },
  videoBtn: {
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 10,
  },
  videoBtnText: { color: COLORS.accent, fontSize: 13, fontWeight: '600' },
  openHint: { color: COLORS.faint, fontSize: 12, marginTop: 6 },
});
