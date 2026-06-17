// Data schema for Sober Sight. One Run record per protocol execution.

export type Protocol = 'PLR' | 'horizontal_gaze' | 'vertical_gaze';

// --- PLR ---
export type PLRPhase = 'dark_pre' | 'flash' | 'dark_post';

export interface PLRTrial {
  trial_number: number; // 1..3
  start_time: string; // ISO8601 (ms precision)
  flash_started_at: string | null; // ISO8601
  flash_ended_at: string | null; // ISO8601
  end_time: string | null; // ISO8601
}

// --- Gaze (horizontal + vertical) ---
export type GazeDirection = 'right' | 'left' | 'up' | 'down';
export type GazePhase = 'hold' | 'move' | 'stop';

export interface GazeTrial {
  direction: GazeDirection;
  phase: GazePhase;
  rep: number; // 1..2
  start_time: string; // ISO8601
  end_time: string | null; // ISO8601
}

export type AnyTrial = PLRTrial | GazeTrial;

export interface Run {
  run_id: string;
  session_id: string; // groups the protocols run back-to-back in one session
  session_index: number; // order within the session (0 = first protocol)
  session_started_at: string; // ISO8601 — when the whole session began
  protocol: Protocol;
  timestamp: string; // ISO8601 — when this protocol run started
  tag: string;
  trials: AnyTrial[];
  completed: boolean;
  video_uri: string | null; // local file uri of the session recording, if captured
  video_started_at: string | null; // ISO8601 when recording began — for event↔video alignment
}

export const PROTOCOL_LABEL: Record<Protocol, string> = {
  PLR: 'PLR',
  horizontal_gaze: 'Horizontal Gaze',
  vertical_gaze: 'Vertical Gaze',
};
