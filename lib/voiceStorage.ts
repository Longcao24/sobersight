// Local persistence + on-disk export for the In-Vehicle Voice Command task.
// Fully offline. Mirrors lib/storage.ts: durable AsyncStorage index plus a
// human-readable folder tree under Documents.
//
//   Documents/SoberSight/{session-start-stamp}/voice_command/
//     session.json
//     voice_command_audio.m4a
//
//   Documents/SoberSight/voice_command_sessions.json

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { VoiceSession } from './voiceTypes';

const KEY = 'sobersight_voice_v1';
const ROOT_DIR = 'SoberSight';
const VOICE_DIR = 'voice_command';
const VOICE_INDEX_FILE = 'voice_command_sessions.json';

function localStamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function rootDir(): Directory {
  const base = new Directory(Paths.document, ROOT_DIR);
  if (!base.exists) base.create();
  return base;
}

// Per-session folder. Stable for the whole run so the JSON and final audio land
// together beside eye-tracking protocol folders in Documents/SoberSight.
function sessionDir(session: VoiceSession): Directory {
  const sessionRoot = new Directory(rootDir(), localStamp(session.started_at));
  if (!sessionRoot.exists) sessionRoot.create();
  const dir = new Directory(sessionRoot, VOICE_DIR);
  if (!dir.exists) dir.create();
  return dir;
}

export function voiceSessionFolderName(session: VoiceSession): string {
  return `${localStamp(session.started_at)}/${VOICE_DIR}`;
}

export function voiceSessionJsonPath(session: VoiceSession): string {
  return `Documents/${ROOT_DIR}/${voiceSessionFolderName(session)}/session.json`;
}

export function voiceSessionsIndexPath(): string {
  return `Documents/${ROOT_DIR}/${VOICE_INDEX_FILE}`;
}

function writeVoiceSessionsIndex(sessions: VoiceSession[]): void {
  try {
    const file = new File(rootDir(), VOICE_INDEX_FILE);
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(sessions, null, 2));
  } catch (e) {
    console.warn('writeVoiceSessionsIndex: failed', e);
  }
}

// Copy the freshly recorded whole-test audio file out of the cache into the session
// folder. Returns the permanent uri, or the raw uri if the copy fails (so the
// recording is never lost). Best-effort: never throws.
export function copySessionAudio(session: VoiceSession, rawUri: string): string {
  try {
    const dir = sessionDir(session);
    const ext = (rawUri.split('.').pop() || 'm4a').split('?')[0];
    const af = new File(dir, `voice_command_audio.${ext}`);
    if (af.exists) af.delete();
    new File(rawUri).copy(af);
    return af.uri;
  } catch (e) {
    console.warn('copySessionAudio: failed, keeping cache uri', e);
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
    session.jsonUri = jf.uri;
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
  writeVoiceSessionsIndex(next);
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
    await Sharing.shareAsync(uri, { dialogTitle: 'Export voice-command test audio' });
  }
}

// Write every voice session log to a single JSON file and open the share sheet.
export async function exportVoiceSessions(): Promise<string> {
  const sessions = await loadVoiceSessions();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = new File(Paths.cache, `sobersight_voice_${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(sessions, null, 2));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Export voice command sessions',
    });
  }
  return file.uri;
}
