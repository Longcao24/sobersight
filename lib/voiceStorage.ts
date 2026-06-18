// Local persistence + on-disk export for the In-Vehicle Voice Command task.
// Fully offline. Mirrors lib/storage.ts: durable AsyncStorage index plus a
// human-readable folder tree under Documents.
//
//   Documents/SoberSightVoice/P{participant}_{stamp}/
//     session.json
//     round01_G{group}/audio.m4a
//     round02_G{group}/audio.m4a
//     ...

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { VoiceSession } from './voiceTypes';

const KEY = 'sobersight_voice_v1';

function localStamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// Per-session folder: P{participant}_{session-start-stamp}. Stable for the whole
// run so every round lands in the same place.
function sessionDir(session: VoiceSession): Directory {
  const base = new Directory(Paths.document, 'SoberSightVoice');
  if (!base.exists) base.create();
  const dir = new Directory(base, `P${session.participant}_${localStamp(session.started_at)}`);
  if (!dir.exists) dir.create();
  return dir;
}

// Copy a freshly recorded round audio file out of the cache into the session
// folder. Returns the permanent uri, or the raw uri if the copy fails (so the
// recording is never lost). Best-effort: never throws.
export function copyRoundAudio(session: VoiceSession, round: number, group: number, rawUri: string): string {
  try {
    const dir = new Directory(sessionDir(session), `round${String(round).padStart(2, '0')}_G${group}`);
    if (!dir.exists) dir.create();
    const ext = (rawUri.split('.').pop() || 'm4a').split('?')[0];
    const af = new File(dir, `audio.${ext}`);
    if (af.exists) af.delete();
    new File(rawUri).copy(af);
    return af.uri;
  } catch (e) {
    console.warn('copyRoundAudio: failed, keeping cache uri', e);
    return rawUri;
  }
}

// Write/refresh the session.json at the session folder root. Best-effort.
export function writeVoiceSessionJson(session: VoiceSession): void {
  try {
    const dir = sessionDir(session);
    const jf = new File(dir, 'session.json');
    if (jf.exists) jf.delete();
    jf.create();
    jf.write(JSON.stringify(session, null, 2));
  } catch (e) {
    console.warn('writeVoiceSessionJson: failed', e);
  }
}

export async function loadVoiceSessions(): Promise<VoiceSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VoiceSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Upsert by session_id (newest first). Durable index — independent of the file
// export so a disk error can never lose the structured log.
export async function saveVoiceSession(session: VoiceSession): Promise<void> {
  const all = await loadVoiceSessions();
  const next = all.filter((s) => s.session_id !== session.session_id);
  next.unshift(session);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

// Persist a session everywhere: AsyncStorage index + Documents session.json.
// Never throws — structured data is always saved.
export async function persistVoiceSession(session: VoiceSession): Promise<void> {
  writeVoiceSessionJson(session);
  await saveVoiceSession(session);
}

export async function clearVoiceSessions(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export async function shareVoiceAudio(uri: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { dialogTitle: 'Export round audio' });
  }
}
