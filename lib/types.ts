// Data schema for Sober Sight. One Run record per protocol execution.

export type Protocol = 'PLR' | 'horizontal_gaze';

// --- PLR ---
export type PLRPhase = 'dark_pre' | 'flash' | 'dark_post';

export interface PLRTrial {
  trial_number: number; // 1..3
  start_time: string; // ISO8601 (ms precision)
  flash_started_at: string | null; // ISO8601
  flash_ended_at: string | null; // ISO8601
  end_time: string | null; // ISO8601
}

// --- Horizontal gaze (examiner finger-tracking) ---
// Examiner moves a raised finger; participant follows with their eyes while the
// rear camera records one eye. One GazeTrial per movement phase. Phase names
// encode the side, so no separate direction field is needed.
//   center             — finger held at center (lead-in, once)
//   move_right         — center → participant's right (3s)
//   hold_right         — held on the right (1s)
//   center_from_right  — right → center
//   move_left          — center → participant's left (3s)
//   hold_left          — held on the left (1s)
//   center_from_left   — left → center
export type GazePhase =
  | 'center'
  | 'move_right'
  | 'hold_right'
  | 'center_from_right'
  | 'move_left'
  | 'hold_left'
  | 'center_from_left';

export interface GazeTrial {
  phase: GazePhase;
  rep: number; // 0 = lead-in center; 1..3 = repetitions
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
  video_started_at: string | null; // ISO8601 when recording began — t=0 of the video timeline
  video_stopped_at: string | null; // ISO8601 when recording stopped — end of the video timeline
}

export const PROTOCOL_LABEL: Record<Protocol, string> = {
  PLR: 'PLR',
  horizontal_gaze: 'Horizontal Gaze',
};
