// Local persistence + JSON export. Fully offline.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { GazeTrial, PLRTrial, Run } from './types';
import { buildEvents } from './events';

const KEY = 'sobersight_runs_v1';

const ms = (iso: string) => new Date(iso).getTime();

// Local-time folder stamp: YYYY-MM-DD_HH-mm-ss (matches the guideline format).
function localStamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function lastEnd(run: Run): string {
  const last = [...run.trials].reverse().find((t) => t.end_time)?.end_time;
  return last ?? run.timestamp;
}

// Build the guideline event-based session.json (TinnitusResearch format).
function buildSessionJson(run: Run, videoPath: string | null, audiogramPath: string) {
  const endIso = lastEnd(run);
  const events = buildEvents(run);
  const isPLR = run.protocol === 'PLR';
  return {
    id: `session_${ms(endIso)}`,
    protocol: run.protocol,
    soundMode: null,
    selectedSound: null,
    tag: run.tag,
    startTime: ms(run.timestamp),
    endTime: ms(endIso),
    videoStartedAt: run.video_started_at ? ms(run.video_started_at) : null,
    completed: run.completed,
    events,
    videoPath,
    audiogramPath,
  };
}

// Build the raw timestamp JSON for the horizontal gaze test. Pure data
// collection — no scoring or interpretation. The video timeline is the
// reference clock: t=0 is the moment recording started, and every movement
// phase is reported in milliseconds from that point.
function buildGazeRawJson(run: Run, videoPath: string | null) {
  // Base = recording start. Fall back to the run start if recording never began.
  const base = ms(run.video_started_at ?? run.timestamp);
  const endIso = run.video_stopped_at ?? lastEnd(run);
  const rel = (iso: string) => ms(iso) - base;
  return {
    protocol: run.protocol,
    tag: run.tag,
    completed: run.completed,
    video_path: videoPath,
    video_started_at: run.video_started_at,
    video_ended_at: run.video_stopped_at,
    // Video timeline (milliseconds): the video begins at 0.
    video_start_ms: 0,
    video_end_ms: Math.max(0, ms(endIso) - base),
    phases: (run.trials as GazeTrial[]).map((t) => ({
      phase: t.phase,
      rep: t.rep,
      start_ms: rel(t.start_time),
      end_ms: t.end_time ? rel(t.end_time) : null,
    })),
  };
}

// Persist a finished run to disk in a retrievable per-session folder:
//   Documents/SoberSight/YYYY-MM-DD_HH-mm-ss/<protocol>/{session.json, video.<ext>}
// Also copies the recorded video out of the cache and indexes the run in
// AsyncStorage. Mutates run.video_uri to the permanent path. Returns the run.
export async function persistRun(run: Run, rawVideoUri: string | null): Promise<Run> {
  // Trial data is critical. Export the human-readable files to the visible
  // Documents folder BEST-EFFORT, then ALWAYS index the run in AsyncStorage so
  // a disk/file error can never lose the structured data. This function never
  // throws — the caller can rely on the run being saved.
  //
  // One session = up to 3 protocols, grouped on disk under a single folder:
  //   Documents/SoberSight/YYYY-MM-DD_HH-mm-ss/<protocol>/{session.json, video.<ext>}
  // The folder stamp is the SESSION start so all protocols share one folder.
  try {
    const base = new Directory(Paths.document, 'SoberSight');
    if (!base.exists) base.create();
    const sessionDir = new Directory(base, localStamp(run.session_started_at));
    if (!sessionDir.exists) sessionDir.create();
    const dir = new Directory(sessionDir, run.protocol);
    if (!dir.exists) dir.create();

    let videoPath: string | null = null;
    if (rawVideoUri) {
      try {
        const ext = (rawVideoUri.split('.').pop() || 'mov').split('?')[0];
        const vf = new File(dir, `video.${ext}`);
        if (vf.exists) vf.delete();
        new File(rawVideoUri).copy(vf);
        run.video_uri = vf.uri;
        videoPath = vf.uri;
      } catch {
        run.video_uri = rawVideoUri; // fall back to the cache uri
        videoPath = rawVideoUri;
      }
    }

    // Horizontal gaze gets the simple raw-timestamp JSON (video-relative ms);
    // PLR keeps the existing event-based session.json.
    const session =
      run.protocol === 'horizontal_gaze'
        ? buildGazeRawJson(run, videoPath)
        : buildSessionJson(run, videoPath, dir.uri);
    const jf = new File(dir, 'session.json');
    if (jf.exists) jf.delete();
    jf.create();
    jf.write(JSON.stringify(session, null, 2));
  } catch (e) {
    // Files unavailable — keep the cache video uri (if any) so it's still
    // playable, and fall through to the durable AsyncStorage save below.
    console.warn('persistRun: file export failed, data kept in AsyncStorage', e);
    if (rawVideoUri && !run.video_uri) run.video_uri = rawVideoUri;
  }

  await saveRun(run); // durable index for in-app history (richer Run schema)
  return run;
}

// Share a recorded session video file.
export async function shareVideo(uri: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { dialogTitle: 'Export session video' });
  }
}

export async function loadRuns(): Promise<Run[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Run[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Prepend newest run.
export async function saveRun(run: Run): Promise<void> {
  const runs = await loadRuns();
  runs.unshift(run);
  await AsyncStorage.setItem(KEY, JSON.stringify(runs));
}

export async function clearRuns(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

// Write all runs to a JSON file and open the share sheet. Returns the file uri.
export async function exportRuns(): Promise<string> {
  const runs = await loadRuns();
  const json = JSON.stringify(runs, null, 2);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = new File(Paths.cache, `sobersight_export_${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Export Sober Sight sessions',
    });
  }
  return file.uri;
}
