import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { COLORS } from '@/lib/theme';
import type { GazePhase, GazeTrial } from '@/lib/types';

// Self-test horizontal gaze. The participant holds the phone with the
// rear-camera attachment recording one eye while the other eye follows their
// own raised finger target. Raw data collection only — no scoring.
//
// Movement sequence (repeated REPS times):
//   center → move RIGHT (3s) → hold RIGHT (1s) → back to center (3s)
//          → move LEFT  (3s) → hold LEFT  (1s) → back to center (3s)
// A lead-in center hold ensures recording is already running before the first
// movement begins.

const MOVE_MS = 3000;
const HOLD_MS = 1000;
const LEAD_IN_MS = 3000; // initial center hold before the first movement
const SETUP_MAX_MS = 30000; // safety cap for spoken setup before timed sequence
const REPS = 3;

const nowISO = () => new Date().toISOString();

// One phase of the on-screen guide. `arrow` drives the big direction indicator.
interface PhaseDef {
  phase: GazePhase;
  ms: number;
  title: string; // big self-test instruction
  detail: string;
  voice: string; // spoken cue
  arrow: '◀' | '▶' | '●';
}

function repPhases(): PhaseDef[] {
  return [
    {
      phase: 'move_right',
      ms: MOVE_MS,
      title: 'Move target RIGHT',
      detail: 'Move your raised finger from center to your right over 3 seconds.',
      voice: 'Move your finger from center to your right side over three seconds.',
      arrow: '▶',
    },
    {
      phase: 'hold_right',
      ms: HOLD_MS,
      title: 'Hold RIGHT',
      detail: 'Hold your finger still on the right side.',
      voice: 'Hold on the right side.',
      arrow: '▶',
    },
    {
      phase: 'center_from_right',
      ms: MOVE_MS,
      title: 'Return to CENTER',
      detail: 'Move your finger smoothly back to center.',
      voice: 'Move your finger back to center.',
      arrow: '●',
    },
    {
      phase: 'move_left',
      ms: MOVE_MS,
      title: 'Move target LEFT',
      detail: 'Move your raised finger from center to your left, almost out of view.',
      voice: 'Move your finger slowly from center to your left side, almost out of visible range.',
      arrow: '◀',
    },
    {
      phase: 'hold_left',
      ms: HOLD_MS,
      title: 'Hold LEFT',
      detail: 'Hold your finger still on the left side.',
      voice: 'Hold on the left side.',
      arrow: '◀',
    },
    {
      phase: 'center_from_left',
      ms: MOVE_MS,
      title: 'Return to CENTER',
      detail: 'Move your finger smoothly back to center.',
      voice: 'Move your finger back to center.',
      arrow: '●',
    },
  ];
}

const SETUP_VOICE =
  'Horizontal gaze setup. Hold the phone so the rear camera attachment records one eye. Keep your head still. Use your other eye to look at your own finger. With your free hand, extend your arm straight out in front of you, make a fist, and raise only one finger as the target. Start with your finger at the center position.';

interface Props {
  onDone: (trials: GazeTrial[], completed: boolean) => void;
}

export function GazeRunner({ onDone }: Props) {
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('Get ready');
  const [detail, setDetail] = useState('');
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

  const speakAsync = (text: string, rate = 0.95) =>
    new Promise<void>((resolve) => {
      Speech.speak(text, {
        rate,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
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

  const runSetup = async () => {
    setTitle('Gaze setup');
    setDetail('Hold the phone to record one eye. Use your free hand as the finger target for the other eye.');
    setArrow('●');
    deadline.current = Date.now() + SETUP_MAX_MS;
    await Promise.race([speakAsync(SETUP_VOICE, 0.9), sleep(SETUP_MAX_MS)]);
    deadline.current = 0;
  };

  // Run one timed phase: log its start/end and drive the on-screen guide.
  const runPhase = async (def: PhaseDef, rep: number, countdown: boolean) => {
    const trial: GazeTrial = { phase: def.phase, rep, start_time: nowISO(), end_time: null };
    trialsRef.current.push(trial);

    setTitle(def.title);
    setDetail(def.detail);
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
    const activeTimers = timers.current;

    (async () => {
      setRepLabel('Setup');
      await runSetup();
      if (cancelled.current) return finish(false);

      // Lead-in center hold — recording is already rolling before the first
      // movement cue.
      setRepLabel('Setup');
      await runPhase(
        {
          phase: 'center',
          ms: LEAD_IN_MS,
          title: 'Start at CENTER',
          detail: 'Hold your raised finger at center in front of you.',
          voice: 'Start at the center position in front of you.',
          arrow: '●',
        },
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
      activeTimers.forEach((t) => t.cancel());
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="none">
        <Text style={styles.rec}>● REC</Text>
        <Text style={styles.repLabel}>{repLabel}</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>GAZE</Text></View>
      </View>

      <View style={styles.center} pointerEvents="none">
        <Text style={styles.arrow}>{arrow}</Text>
        <Text style={styles.title}>{title}</Text>
        {!!detail && <Text style={styles.detail}>{detail}</Text>}
        {remaining > 0 && <Text style={styles.countdown}>{remaining}</Text>}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
        <Text style={styles.hint} pointerEvents="none">
          Keep head still · other eye follows your finger · 3 cycles
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
  detail: { color: COLORS.subtle, fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 10 },
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
