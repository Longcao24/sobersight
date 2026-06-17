// Flatten a Run into a time-ordered event list (shared by the on-disk
// session.json writer and the in-app session detail / video-alignment view).

import type { GazeTrial, PLRTrial, Run } from './types';

export interface SessionEvent {
  type: string; // dark_pre_begin | dark_pre_end | flash_begin | flash_end | tap_response | <phase>_begin/_end
  timestamp: string; // ISO8601
  repetition?: number;
  reactionTimeMs?: number | null;
  phase?: string;
  direction?: string;
  rep?: number;
}

const ms = (iso: string) => new Date(iso).getTime();

export function buildEvents(run: Run): SessionEvent[] {
  const events: SessionEvent[] = [];

  if (run.protocol === 'PLR') {
    for (const tr of run.trials as PLRTrial[]) {
      events.push({ type: 'dark_pre_begin', timestamp: tr.start_time, repetition: tr.trial_number });
      if (tr.flash_started_at) {
        events.push({ type: 'dark_pre_end', timestamp: tr.flash_started_at, repetition: tr.trial_number });
        events.push({
          type: 'flash_begin',
          timestamp: tr.flash_started_at,
          repetition: tr.trial_number,
        });
      }
      if (tr.flash_ended_at) {
        events.push({ type: 'flash_end', timestamp: tr.flash_ended_at, repetition: tr.trial_number });
        events.push({ type: 'dark_post_begin', timestamp: tr.flash_ended_at, repetition: tr.trial_number });
      }
      if (tr.end_time) events.push({ type: 'dark_post_end', timestamp: tr.end_time, repetition: tr.trial_number });
    }
  } else {
    // Gaze protocols — phase begin/end events. The direction is the ACTUAL
    // eye-movement direction (left/right/up/down) and is encoded into the event
    // type so every direction is explicit in the log, e.g. move_right_begin,
    // move_up_begin. The direction field is also kept for structured queries.
    for (const tr of run.trials as GazeTrial[]) {
      events.push({ type: `${tr.phase}_${tr.direction}_begin`, timestamp: tr.start_time, direction: tr.direction, phase: tr.phase, rep: tr.rep });
      if (tr.end_time) events.push({ type: `${tr.phase}_${tr.direction}_end`, timestamp: tr.end_time, direction: tr.direction, phase: tr.phase, rep: tr.rep });
    }
  }

  return events.sort((a, b) => ms(a.timestamp) - ms(b.timestamp));
}
