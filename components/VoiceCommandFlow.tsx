import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Crypto from 'expo-crypto';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { COLORS, MIN_TAP } from '@/lib/theme';
import {
  GROUP_IMAGE,
  groupSequenceFor,
  NUM_GROUPS,
  TASK_TYPE_LABEL,
  tasksForGroup,
  type VoiceTask,
} from '@/lib/voiceTasks';
import { copyRoundAudio, persistVoiceSession } from '@/lib/voiceStorage';
import type { VoiceRoundLog, VoiceSession } from '@/lib/voiceTypes';

type Stage = 'setup' | 'roundIntro' | 'task' | 'done';

const nowISO = () => new Date().toISOString();

export function VoiceCommandFlow() {
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [stage, setStage] = useState<Stage>('setup');
  const [participantText, setParticipantText] = useState('');
  const [micGranted, setMicGranted] = useState(false);

  const [roundIdx, setRoundIdx] = useState(0); // 0..9 — index into the sequence
  const [taskIdx, setTaskIdx] = useState(0); // 0..4 — task within the round
  const [recording, setRecording] = useState(false);

  const sessionRef = useRef<VoiceSession | null>(null);
  const sequence = sessionRef.current?.group_sequence ?? [];

  // ---- permissions ----
  const requestMic = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    setMicGranted(status.granted);
    if (!status.granted) {
      Alert.alert(
        'Microphone needed',
        'Microphone access is required to record the spoken commands. Enable it in Settings if the prompt no longer appears.',
      );
    }
  };

  // ---- session lifecycle ----
  const beginSession = () => {
    const participant = parseInt(participantText.trim(), 10);
    if (!Number.isInteger(participant) || participant < 1) {
      Alert.alert('Participant number', 'Enter a whole participant number (1 or greater).');
      return;
    }
    sessionRef.current = {
      kind: 'voice_command',
      session_id: Crypto.randomUUID(),
      participant,
      group_sequence: groupSequenceFor(participant),
      started_at: nowISO(),
      ended_at: null,
      completed: false,
      rounds: [],
    };
    setRoundIdx(0);
    setStage('roundIntro');
  };

  const currentRoundTasks = (): VoiceTask[] => tasksForGroup(sequence[roundIdx]);

  const stampShown = (rIdx: number, tIdx: number) => {
    const log = sessionRef.current?.rounds[rIdx]?.tasks[tIdx];
    if (log && !log.shownAt) log.shownAt = nowISO();
  };
  const stampLeft = (rIdx: number, tIdx: number) => {
    const log = sessionRef.current?.rounds[rIdx]?.tasks[tIdx];
    if (log) log.leftAt = nowISO();
  };

  const startRound = async (rIdx: number) => {
    const session = sessionRef.current;
    if (!session) return;
    const group = session.group_sequence[rIdx];
    const tasks = tasksForGroup(group);
    const roundLog: VoiceRoundLog = {
      round: rIdx + 1,
      group,
      audioStartedAt: null,
      audioStoppedAt: null,
      audioUri: null,
      tasks: tasks.map((t) => ({ taskCode: t.taskCode, type: t.type, shownAt: '', leftAt: null })),
    };
    session.rounds[rIdx] = roundLog;

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      roundLog.audioStartedAt = nowISO();
      setRecording(true);
    } catch (e) {
      setRecording(false);
      Alert.alert('Recording problem', `Could not start the microphone: ${String(e)}. The round will continue without audio.`);
    }

    setRoundIdx(rIdx);
    setTaskIdx(0);
    stampShown(rIdx, 0);
    setStage('task');
  };

  // Stop recording, copy audio, checkpoint, then advance to the next round (or
  // finish). `complete` is true only when all rounds are done.
  const finishRound = async (early: boolean) => {
    const session = sessionRef.current;
    if (!session) return;
    const rIdx = roundIdx;
    stampLeft(rIdx, taskIdx);

    const roundLog = session.rounds[rIdx];
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri ?? null;
    } catch {
      // keep whatever the recorder produced
    }
    setRecording(false);
    if (roundLog) {
      roundLog.audioStoppedAt = nowISO();
      if (uri) roundLog.audioUri = copyRoundAudio(session, roundLog.round, roundLog.group, uri);
    }

    const isLast = rIdx >= NUM_GROUPS - 1;
    if (early || isLast) {
      session.completed = !early && isLast;
      session.ended_at = nowISO();
    }
    try {
      await persistVoiceSession(session);
    } catch (e) {
      Alert.alert('Save warning', `Could not fully save: ${String(e)}`);
    }

    if (early || isLast) {
      setStage('done');
    } else {
      setRoundIdx(rIdx + 1);
      setStage('roundIntro');
    }
  };

  const confirmEndSession = () => {
    Alert.alert('End session?', 'This stops recording and ends the session early. Completed rounds are saved.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'End session', style: 'destructive', onPress: () => void finishRound(true) },
    ]);
  };

  const goNext = () => {
    const rIdx = roundIdx;
    stampLeft(rIdx, taskIdx);
    if (taskIdx < currentRoundTasks().length - 1) {
      const next = taskIdx + 1;
      setTaskIdx(next);
      stampShown(rIdx, next);
    } else {
      void finishRound(false);
    }
  };

  const goPrev = () => {
    if (taskIdx === 0) return;
    stampLeft(roundIdx, taskIdx);
    setTaskIdx(taskIdx - 1);
  };

  // ============================== RENDER ==============================

  if (stage === 'roundIntro') {
    const round = roundIdx + 1;
    const group = sequence[roundIdx];
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centerBody}>
          <Text style={styles.roundKicker}>ROUND {round} OF {NUM_GROUPS}</Text>
          {round === 1 && <Text style={styles.baseline}>Sober baseline</Text>}
          <Text style={styles.roundTitle}>5 voice commands</Text>
          <Text style={styles.roundSub}>
            For each card: imagine you are driving, then say the command out loud. Audio records for the whole round.
          </Text>
          <View style={styles.metaCard}>
            <Text style={styles.metaText}>Participant {sessionRef.current?.participant} · Group {group}</Text>
          </View>
          <Pressable style={styles.primary} onPress={() => void startRound(roundIdx)}>
            <Text style={styles.primaryText}>Start round  ●</Text>
          </Pressable>
          <Pressable style={styles.ghost} onPress={confirmEndSession}>
            <Text style={styles.ghostText}>End session</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (stage === 'task') {
    const tasks = currentRoundTasks();
    const t = tasks[taskIdx];
    const last = taskIdx === tasks.length - 1;
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.taskHeader}>
          <Text style={styles.crumb}>
            Round {roundIdx + 1}/{NUM_GROUPS} · Task {taskIdx + 1}/{tasks.length}
          </Text>
          <View style={styles.recPill}>
            <View style={[styles.recDot, !recording && styles.recDotOff]} />
            <Text style={[styles.recText, !recording && styles.recTextOff]}>{recording ? 'REC' : 'NO AUDIO'}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.taskBody}>
          <Image source={GROUP_IMAGE[t.group]} style={styles.picture} contentFit="cover" transition={120} />
          <Text style={styles.taskType}>{TASK_TYPE_LABEL[t.type]}</Text>
          <View style={styles.promptCard}>
            {t.promptLines.map((line, i) => (
              <Text key={i} style={[styles.promptLine, i === 0 && styles.promptIntro]}>{line}</Text>
            ))}
          </View>
        </ScrollView>

        <View style={styles.navBar}>
          <Pressable
            style={[styles.navBtn, taskIdx === 0 && styles.navBtnDisabled]}
            onPress={goPrev}
            disabled={taskIdx === 0}
          >
            <Text style={[styles.navText, taskIdx === 0 && styles.navTextDisabled]}>‹ Prev</Text>
          </Pressable>
          <Pressable style={[styles.navBtn, styles.navNext]} onPress={goNext}>
            <Text style={styles.navNextText}>{last ? 'Finish round ✓' : 'Next ›'}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.endStrip} onLongPress={confirmEndSession} delayLongPress={800}>
          <Text style={styles.endStripText}>Hold to end session</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (stage === 'done') {
    const session = sessionRef.current;
    const doneRounds = session?.rounds.length ?? 0;
    const withAudio = session?.rounds.filter((r) => r.audioUri).length ?? 0;
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.centerBody}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.roundTitle}>{session?.completed ? 'Session complete' : 'Session ended'}</Text>
          <Text style={styles.roundSub}>
            Participant {session?.participant} · {doneRounds} round{doneRounds === 1 ? '' : 's'} recorded · {withAudio} with audio
          </Text>
          <Text style={styles.seqLine}>Group order: {session?.group_sequence.join(', ')}</Text>
          <Pressable style={styles.primary} onPress={() => router.replace('/' as any)}>
            <Text style={styles.primaryText}>Done</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- setup ----
  const participant = parseInt(participantText.trim(), 10);
  const preview = Number.isInteger(participant) && participant >= 1 ? groupSequenceFor(participant) : null;
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.setupBody}>
        <Pressable style={styles.backLink} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backLinkText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.bigTitle}>Voice Command Task</Text>
        <Text style={styles.roundSub}>
          {NUM_GROUPS} rounds · 5 spoken commands per round. The group order rotates per participant; round 1 is the
          sober baseline.
        </Text>

        <Text style={styles.fieldLabel}>Participant number</Text>
        <TextInput
          style={styles.input}
          value={participantText}
          onChangeText={setParticipantText}
          placeholder="e.g. 1"
          placeholderTextColor={COLORS.faint}
          keyboardType="number-pad"
          returnKeyType="done"
        />
        {preview && <Text style={styles.seqLine}>Group order: {preview.join(', ')}</Text>}

        <Text style={[styles.permLine, { color: micGranted ? COLORS.ok : COLORS.subtle }]}>
          {micGranted ? '✓ Microphone ready' : 'Microphone permission needed to record'}
        </Text>

        {micGranted ? (
          <Pressable style={styles.primary} onPress={beginSession}>
            <Text style={styles.primaryText}>Begin  →</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primary} onPress={requestMic}>
            <Text style={styles.primaryText}>Grant microphone</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centerBody: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', gap: 12 },
  setupBody: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 40, gap: 12 },
  backLink: { minHeight: 36, justifyContent: 'center' },
  backLinkText: { color: COLORS.accent2, fontSize: 16, fontWeight: '600' },
  bigTitle: { color: COLORS.text, fontSize: 30, fontWeight: '800' },

  // round intro / done
  roundKicker: { color: COLORS.accent2, fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  baseline: { color: COLORS.accent, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  roundTitle: { color: COLORS.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  roundSub: { color: COLORS.subtle, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  metaCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  metaText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  checkmark: { color: COLORS.ok, fontSize: 56, fontWeight: '900' },
  seqLine: { color: COLORS.faint, fontSize: 13, textAlign: 'center' },

  // task page
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  crumb: { color: COLORS.subtle, fontSize: 13, fontWeight: '600' },
  recPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.danger },
  recDotOff: { backgroundColor: COLORS.faint },
  recText: { color: COLORS.danger, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  recTextOff: { color: COLORS.faint },
  taskBody: { paddingHorizontal: 18, paddingBottom: 20, gap: 14 },
  picture: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    backgroundColor: COLORS.card,
  },
  taskType: { color: COLORS.accent2, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  promptCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 18,
    gap: 10,
  },
  promptLine: { color: COLORS.text, fontSize: 18, lineHeight: 26, fontWeight: '600' },
  promptIntro: { color: COLORS.subtle, fontSize: 15, fontWeight: '500' },

  navBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 18 },
  navBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  navBtnDisabled: { opacity: 0.4 },
  navText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  navTextDisabled: { color: COLORS.faint },
  navNext: { flex: 2, backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  navNextText: { color: '#06281F', fontSize: 17, fontWeight: '800' },
  endStrip: { minHeight: MIN_TAP, alignItems: 'center', justifyContent: 'center' },
  endStripText: { color: COLORS.faint, fontSize: 13 },

  // shared
  fieldLabel: { color: COLORS.subtle, fontSize: 13, marginTop: 8 },
  input: {
    minHeight: MIN_TAP,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontSize: 16,
    backgroundColor: COLORS.card,
  },
  permLine: { fontSize: 13, marginTop: 4 },
  primary: {
    minHeight: 56,
    minWidth: 220,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 24,
  },
  primaryText: { color: '#06281F', fontSize: 17, fontWeight: '800' },
  ghost: { minHeight: MIN_TAP, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: COLORS.faint, fontSize: 15 },
});
