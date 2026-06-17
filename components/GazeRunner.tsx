import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { StimulusDotAnimated } from '@/components/StimulusDot';
import { COLORS, DOT_SIZE, EDGE_PADDING, MIN_TAP } from '@/lib/theme';
import type { GazeDirection, GazePhase, GazeTrial } from '@/lib/types';

// Phase timing (ms) — fixed durations are the source of truth for the data.
// Each direction: 1s linear move, then 1s stop at the end edge.
const MOVE_MS = 1000;
const STOP_MS = 1000;

const PHASE_LABEL: Record<GazePhase, string> = { hold: 'Hold', move: 'Move', stop: 'Stop' };

const nowISO = () => new Date().toISOString();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Props {
  protocolLabel: string; // "Horizontal Gaze" | "Vertical Gaze"
  axis: 'x' | 'y';
  directions: [GazeDirection, GazeDirection]; // per-rep order, e.g. ['right','left']
  onDone: (trials: GazeTrial[], completed: boolean) => void;
}

export function GazeRunner({ protocolLabel, axis, directions, onDone }: Props) {
  const { width, height } = Dimensions.get('window');

  // Travel endpoints, edge-to-edge with EDGE_PADDING.
  const moveStartEdge = EDGE_PADDING;
  const moveEndEdge = (axis === 'x' ? width : height) - EDGE_PADDING - DOT_SIZE;
  const fixedAxisCenter = (axis === 'x' ? height : width) / 2 - DOT_SIZE / 2;

  // Per direction the dot's start edge; the opposite edge is the move target.
  // Direction name == the ACTUAL eye-movement direction during the move phase.
  // Coords: x → moveStartEdge=left, moveEndEdge=right.  y → moveStartEdge=top, moveEndEdge=bottom.
  //   right: start left   → move right (toward moveEndEdge)
  //   left:  start right   → move left  (toward moveStartEdge)
  //   down:  start top     → move down  (toward moveEndEdge)
  //   up:    start bottom  → move up    (toward moveStartEdge)
  const startEdgeFor = (dir: GazeDirection): number =>
    dir === 'right' || dir === 'down' ? moveStartEdge : moveEndEdge;
  const endEdgeFor = (dir: GazeDirection): number =>
    dir === 'right' || dir === 'down' ? moveEndEdge : moveStartEdge;

  // Animated value drives the moving axis only.
  const moveCoord = useRef(new Animated.Value(startEdgeFor(directions[0]))).current;

  const [progress, setProgress] = useState('');
  const [phaseLabel, setPhaseLabel] = useState('');
  const [remaining, setRemaining] = useState(0); // seconds, display only

  const cancelled = useRef(false);
  const doneGuard = useRef(false);
  const trialsRef = useRef<GazeTrial[]>([]);
  const timers = useRef<{ cancel: () => void }[]>([]);
  const deadline = useRef(0); // ms epoch; 0 = no countdown

  // Cancellable sleep — exit resolves it early.
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = setTimeout(resolve, ms);
      timers.current.push({ cancel: () => { clearTimeout(id); resolve(); } });
    });

  // LINEAR EASING ONLY — constant velocity is critical for nystagmus detection.
  // Do NOT change Easing.linear to any ease-in/out curve.
  const animateLinear = (to: number, ms: number) =>
    new Promise<void>((resolve) => {
      const anim = Animated.timing(moveCoord, {
        toValue: to,
        duration: ms,
        easing: Easing.linear,
        useNativeDriver: true,
      });
      anim.start(() => resolve());
      timers.current.push({ cancel: () => { anim.stop(); resolve(); } });
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

  // Display countdown ticker.
  useEffect(() => {
    const id = setInterval(() => {
      if (deadline.current === 0) { setRemaining(0); return; }
      setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Protocol sequence runner.
  useEffect(() => {
    // Spoken intro — participant relies entirely on voice (cannot see screen).
    Speech.speak('Keep your head still and follow the spoken directions with your eyes.', { rate: 0.92 });

    // Voice-over fully guides the eyes — participant cannot see the screen
    // (back-camera rig). Phrased by the dot's real start position + move direction.
    const VOICE: Record<GazeDirection, { start: string; move: string }> = {
      right: { start: 'far left', move: 'to the right' },
      left: { start: 'far right', move: 'to the left' },
      up: { start: 'down', move: 'up' },
      down: { start: 'up', move: 'down' },
    };

    (async () => {
      // Initial orientation only — get the eyes to the first start position.
      // Not a counted trial; just positions before the timed movements begin.
      moveCoord.setValue(startEdgeFor(directions[0]));
      setProgress(`${protocolLabel} · Get ready`);
      setPhaseLabel('Look ' + VOICE[directions[0]].start);
      Speech.speak(`Look ${VOICE[directions[0]].start} to begin.`, { rate: 0.92 });
      await sleep(2000);
      if (cancelled.current) return finish(false);

      for (let rep = 1; rep <= 2; rep++) {
        for (const dir of directions) {
          // Each direction = 5s linear MOVE, then 1s STOP at the end edge.
          for (const phase of ['move', 'stop'] as GazePhase[]) {
            if (cancelled.current) return finish(false);

            const trial: GazeTrial = { direction: dir, phase, rep, start_time: nowISO(), end_time: null };
            trialsRef.current.push(trial);

            setProgress(`${protocolLabel} · Rep ${rep} of 2 · ${cap(dir)}`);
            setPhaseLabel(PHASE_LABEL[phase]);
            // Haptic at every phase transition; heavier on the moving phase.
            Haptics.impactAsync(
              phase === 'move' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
            ).catch(() => {});
            Speech.speak(
              phase === 'move' ? `Slowly move your eyes ${VOICE[dir].move}.` : 'Stop. Hold still.',
              { rate: 0.92 },
            );

            if (phase === 'move') {
              deadline.current = Date.now() + MOVE_MS;
              await animateLinear(endEdgeFor(dir), MOVE_MS);
            } else {
              deadline.current = 0; // no countdown during stop
              moveCoord.setValue(endEdgeFor(dir));
              await sleep(STOP_MS);
            }

            trial.end_time = nowISO();
          }
        }
      }
      finish(true);
    })();

    return () => { cancelled.current = true; timers.current.forEach((t) => t.cancel()); Speech.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dotStyle =
    axis === 'x'
      ? { transform: [{ translateX: moveCoord }, { translateY: fixedAxisCenter }] }
      : { transform: [{ translateX: fixedAxisCenter }, { translateY: moveCoord }] };

  return (
    <View style={styles.root}>
      <Text style={styles.rec} pointerEvents="none">● REC</Text>
      <Text style={styles.progress}>{progress}</Text>

      <StimulusDotAnimated style={dotStyle} />

      <View style={styles.footer} pointerEvents="none">
        <Text style={styles.phase}>{phaseLabel}</Text>
        {remaining > 0 && <Text style={styles.countdown}>{remaining}</Text>}
      </View>

      <Pressable style={styles.exit} onPress={exit} hitSlop={12}>
        <Text style={styles.exitText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Transparent so the full-screen recording camera shows through as a live
  // preview behind the dot (same path as PLR). Participant uses the eye-mount
  // rig and can't see the screen — this preview is for operator framing.
  root: { flex: 1, backgroundColor: 'transparent' },
  rec: { position: 'absolute', top: 56, right: 18, color: COLORS.danger, fontSize: 13, fontWeight: '800' },
  progress: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: COLORS.subtle,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  phase: { color: COLORS.faint, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  countdown: { color: COLORS.subtle, fontSize: 28, fontWeight: '700', marginTop: 4 },
  exit: {
    position: 'absolute',
    top: 44,
    left: 12,
    width: MIN_TAP,
    height: MIN_TAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitText: { color: COLORS.faint, fontSize: 20 },
});
