import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { COLORS } from '@/lib/theme';
import type { GazePhase, GazeTrial } from '@/lib/types';

// Examiner-guided horizontal gaze. The EXAMINER reads these on-screen cues and
// moves a raised finger; the participant follows the finger with their eyes
// while the rear camera records one eye. Raw data collection only — no scoring.
//
// Movement sequence (repeated REPS times):
//   center → move RIGHT (3s) → hold RIGHT (1s) → back to center (3s)
//          → move LEFT  (3s) → hold LEFT  (1s) → back to center (3s)
// A lead-in center hold ensures recording is already running before the first
// movement begins.

const MOVE_MS = 3000;
const HOLD_MS = 1000;
const LEAD_IN_MS = 3000; // initial center hold before the first movement
const REPS = 3;

const nowISO = () => new Date().toISOString();

// One phase of the on-screen guide. `arrow` drives the big direction indicator.
interface PhaseDef {
  phase: GazePhase;
  ms: number;
  title: string; // big examiner instruction
  voice: string; // spoken cue
  arrow: '◀' | '▶' | '●';
}

function repPhases(): PhaseDef[] {
  return [
    { phase: 'move_right', ms: MOVE_MS, title: "Move to participant's RIGHT", voice: "Move your finger slowly to the participant's right.", arrow: '▶' },
    { phase: 'hold_right', ms: HOLD_MS, title: 'Hold RIGHT', voice: 'Hold.', arrow: '▶' },
    { phase: 'center_from_right', ms: MOVE_MS, title: 'Back to CENTER', voice: 'Move back to center.', arrow: '●' },
    { phase: 'move_left', ms: MOVE_MS, title: "Move to participant's LEFT", voice: "Move your finger slowly to the participant's left.", arrow: '◀' },
    { phase: 'hold_left', ms: HOLD_MS, title: 'Hold LEFT', voice: 'Hold.', arrow: '◀' },
    { phase: 'center_from_left', ms: MOVE_MS, title: 'Back to CENTER', voice: 'Move back to center.', arrow: '●' },
  ];
}

interface Props {
  onDone: (trials: GazeTrial[], completed: boolean) => void;
}

export function GazeRunner({ onDone }: Props) {
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('Get ready');
  const [arrow, setArrow] = useState<'◀' | '▶' | '●'>('●');
  const [repLabel, setRepLabel] = useState('');
  const [remaining, setRemaining] = useState(0); // seconds, display only

  const cancelled = useRef(false);
  const doneGuard = useRef(false);
  const trialsRef = useRef<GazeTrial[]>([]);
  const timers = useRef<{ cancel: () => void }[]>([]);
  const deadline = useRef(0); // ms epoch; 0 = no countdown

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = setTimeout(resolve, ms);
      timers.current.push({ cancel: () => { clearTimeout(id); resolve(); } });
    });

  const finish = (completed: boolean) => {
    if (doneGuard.current) return;
    doneGuard.current = true;
    deadline.current = 0;
    onDone(trialsRef.current, completed);
  };

  const exit = () => {
    cancelled.current = true;
    timers.current.forEach((t) => t.cancel());
  };

  // Run one timed phase: log its start/end and drive the on-screen guide.
  const runPhase = async (def: PhaseDef, rep: number, countdown: boolean) => {
    const trial: GazeTrial = { phase: def.phase, rep, start_time: nowISO(), end_time: null };
    trialsRef.current.push(trial);

    setTitle(def.title);
    setArrow(def.arrow);
    Haptics.impactAsync(
      def.arrow === '●' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy,
    ).catch(() => {});
    Speech.speak(def.voice, { rate: 0.95 });

    deadline.current = countdown ? Date.now() + def.ms : 0;
    await sleep(def.ms);
    trial.end_time = nowISO();
  };

  // Display countdown ticker.
  useEffect(() => {
    const id = setInterval(() => {
      if (deadline.current === 0) { setRemaining(0); return; }
      setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Phase sequence runner.
  useEffect(() => {
    (async () => {
      // Lead-in center hold — recording is already rolling; gets the finger and
      // the participant's eyes centered before the first movement.
      setRepLabel('Setup');
      await runPhase(
        { phase: 'center', ms: LEAD_IN_MS, title: 'Hold finger at CENTER', voice: "Hold your finger at the center and have the participant look at it.", arrow: '●' },
        0,
        true,
      );
      if (cancelled.current) return finish(false);

      for (let rep = 1; rep <= REPS; rep++) {
        setRepLabel(`Sequence ${rep} of ${REPS}`);
        for (const def of repPhases()) {
          if (cancelled.current) return finish(false);
          await runPhase(def, rep, true);
        }
      }
      finish(true);
    })();

    return () => {
      cancelled.current = true;
      timers.current.forEach((t) => t.cancel());
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      {/* Top bar — operator-facing (rear camera points at the participant's eye) */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="none">
        <Text style={styles.rec}>● REC</Text>
        <Text style={styles.repLabel}>{repLabel}</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>GAZE</Text></View>
      </View>

      <View style={styles.center} pointerEvents="none">
        <Text style={styles.arrow}>{arrow}</Text>
        <Text style={styles.title}>{title}</Text>
        {remaining > 0 && <Text style={styles.countdown}>{remaining}</Text>}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
        <Text style={styles.hint} pointerEvents="none">
          Keep the rear camera on one eye · participant follows your finger · head still
        </Text>
        <Pressable style={styles.endBtn} onLongPress={exit} delayLongPress={900}>
          <Text style={styles.endText}>■ Hold to End Session</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  rec: { color: COLORS.danger, fontSize: 13, fontWeight: '800', width: 70 },
  repLabel: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  badge: { width: 70, alignItems: 'flex-end' },
  badgeText: {
    color: COLORS.accent2,
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: COLORS.accent2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  arrow: { color: COLORS.accent2, fontSize: 96, fontWeight: '900' },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  countdown: { color: COLORS.subtle, fontSize: 40, fontWeight: '700', marginTop: 12, fontVariant: ['tabular-nums'] },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 10,
  },
  hint: { color: COLORS.subtle, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  endBtn: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.danger,
    backgroundColor: 'rgba(229,72,77,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endText: { color: COLORS.danger, fontSize: 16, fontWeight: '800' },
});
