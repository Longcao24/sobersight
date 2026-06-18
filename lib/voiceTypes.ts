// Data schema for the In-Vehicle Voice Command task. One VoiceSession per
// participant run: 10 rounds (groups in the participant's rotated order), each
// round = 5 task pages with one audio recording.

import type { TaskType } from './voiceTasks';

export interface VoiceTaskLog {
  taskCode: string; // R1, N1, ...
  type: TaskType;
  shownAt: string; // ISO8601 — when the task page was first shown
  leftAt: string | null; // ISO8601 — when the participant left the page
}

export interface VoiceRoundLog {
  round: number; // 1..10 (round 1 = sober baseline)
  group: number; // group id 1..10
  audioStartedAt: string | null; // ISO8601 — recording start
  audioStoppedAt: string | null; // ISO8601 — recording stop
  audioUri: string | null; // permanent file uri of the round recording
  tasks: VoiceTaskLog[];
}

export interface VoiceSession {
  kind: 'voice_command';
  session_id: string;
  participant: number; // participant number entered at setup
  group_sequence: number[]; // group ids in round order, length 10
  started_at: string; // ISO8601
  ended_at: string | null; // ISO8601
  completed: boolean; // all 10 rounds finished
  rounds: VoiceRoundLog[];
}
