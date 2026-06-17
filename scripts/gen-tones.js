// Regenerate assets/audio/tones/ as AUDIBLE tones that PRESERVE the manifest's
// relative levels (including the 3000 Hz −8 dB correction). The loudest tone
// (15 dB, no correction) maps to digital full scale, i.e. every tone is boosted
// by +106 dB vs the original calibration baseline (121 dB ref − 15 dB loudest).
//
//   encoded_spl_db = target_spl_db + phone_correction_db   (3000 Hz: −8, else 0)
//   amplitude      = 10 ^ ((encoded_spl_db - 15) / 20)     (15 dB enc → 1.0)
//
// Operator playback volume (player.volume, 0..1) attenuates from here and is
// logged per trial. Original calibrated 24-bit files remain in /Sound.
// 16-bit is safe now (min amplitude ≈ 0.07 ≫ one quantization step).

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'audio', 'tones');
const SR = 44100;
const DUR = 2;
const N = SR * DUR;
const FADE = Math.round(SR * 0.01);

const FREQS = [500, 3000, 5000, 7000];
const LEVELS = [0, 3, 5, 10, 15];
const correction = (f) => (f === 3000 ? -8 : 0);
const ampFor = (f, lvl) => Math.pow(10, (lvl + correction(f) - 15) / 20);

function writeWav(file, freq, amp) {
  const data = Buffer.alloc(N * 2);
  for (let i = 0; i < N; i++) {
    let s = Math.sin((2 * Math.PI * freq * i) / SR) * amp;
    if (i < FADE) s *= i / FADE;
    else if (i > N - FADE) s *= (N - i) / FADE;
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

let count = 0;
for (const f of FREQS) for (const lvl of LEVELS) {
  writeWav(path.join(OUT, `tone_${lvl}dB_${f}Hz.wav`), f, ampFor(f, lvl));
  count++;
}
console.log(`Wrote ${count} audible (relative-calibrated) tones to ${OUT}`);
