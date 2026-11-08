// ScreenPress meeting notes – the speech, speaker and Word-minutes functions shared with CaptionPress (no DOM).
const NC = (() => {
// ---------- CaptionPress core: pure functions (no DOM) ----------
const SR = 16000; // Whisper sample rate

// "_timestamped" exports can time every single word, which keeps subtitles in sync with the speech.
const MODELS = {
  fast: { id: 'onnx-community/whisper-tiny_timestamped', name: 'Fast', size: '≈ 80 MB', pro: false },
  accurate: { id: 'onnx-community/whisper-base_timestamped', name: 'Accurate', size: '≈ 150 MB', pro: true },
  best: { id: 'onnx-community/whisper-small_timestamped', name: 'Very accurate', size: '≈ 500 MB', pro: true },
  turbo: { id: 'onnx-community/whisper-large-v3-turbo_timestamped', name: 'Most accurate, all languages (needs a graphics card)', size: '≈ 750 MB', pro: true, gpu: true },
};

const LANGS = [
  ['', 'Detect automatically'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
  ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ru', 'Russian'], ['uk', 'Ukrainian'],
  ['pl', 'Polish'], ['tr', 'Turkish'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['ja', 'Japanese'],
  ['ko', 'Korean'], ['zh', 'Chinese'], ['vi', 'Vietnamese'], ['id', 'Indonesian'], ['th', 'Thai'],
  ['ms', 'Malay'], ['tl', 'Filipino (Tagalog)'], ['sv', 'Swedish'], ['da', 'Danish'], ['no', 'Norwegian'],
  ['fi', 'Finnish'], ['cs', 'Czech'], ['ro', 'Romanian'], ['hu', 'Hungarian'], ['el', 'Greek'], ['he', 'Hebrew'],
];


// ---- AI voices (Piper, open-source). [id, label] grouped by language code used in LANGS ----
const VOICES = {
  en: [['en_US-lessac-medium', 'Lessac – US, female'], ['en_US-ryan-medium', 'Ryan – US, male'], ['en_US-amy-medium', 'Amy – US, female'], ['en_US-joe-medium', 'Joe – US, male'], ['en_US-kristin-medium', 'Kristin – US, female'], ['en_GB-alan-medium', 'Alan – British, male'], ['en_GB-jenny_dioco-medium', 'Jenny – British, female']],
  vi: [['vi_VN-vais1000-medium', 'Vais – Vietnamese, female'], ['vi_VN-25hours_single-low', '25hours – Vietnamese'], ['vi_VN-vivos-x_low', 'Vivos – Vietnamese']],
  es: [['es_ES-davefx-medium', 'Dave – Spain, male'], ['es_ES-sharvard-medium', 'Sharvard – Spain'], ['es_MX-claude-high', 'Claude – Mexico']],
  fr: [['fr_FR-siwis-medium', 'Siwis – female'], ['fr_FR-tom-medium', 'Tom – male'], ['fr_FR-upmc-medium', 'UPMC']],
  de: [['de_DE-thorsten-medium', 'Thorsten – male'], ['de_DE-kerstin-low', 'Kerstin – female'], ['de_DE-eva_k-x_low', 'Eva – female']],
  it: [['it_IT-riccardo-x_low', 'Riccardo – male']],
  pt: [['pt_BR-faber-medium', 'Faber – Brazil, male'], ['pt_PT-tugão-medium', 'Tugão – Portugal']],
  nl: [['nl_BE-nathalie-medium', 'Nathalie – female'], ['nl_NL-mls-medium', 'MLS – Netherlands']],
  ru: [['ru_RU-irina-medium', 'Irina – female'], ['ru_RU-dmitri-medium', 'Dmitri – male'], ['ru_RU-denis-medium', 'Denis – male']],
  uk: [['uk_UA-ukrainian_tts-medium', 'Ukrainian TTS']],
  pl: [['pl_PL-gosia-medium', 'Gosia – female'], ['pl_PL-darkman-medium', 'Darkman – male']],
  tr: [['tr_TR-fettah-medium', 'Fettah – male'], ['tr_TR-dfki-medium', 'DFKI']],
  ar: [['ar_JO-kareem-medium', 'Kareem – male']],
  zh: [['zh_CN-huayan-medium', 'Huayan – female']],
  sv: [['sv_SE-nst-medium', 'NST']], da: [['da_DK-talesyntese-medium', 'Talesyntese']], no: [['no_NO-talesyntese-medium', 'Talesyntese']],
  fi: [['fi_FI-harri-medium', 'Harri – male']], cs: [['cs_CZ-jirka-medium', 'Jirka – male']], ro: [['ro_RO-mihai-medium', 'Mihai – male']],
  hu: [['hu_HU-anna-medium', 'Anna – female']], el: [['el_GR-rapunzelina-low', 'Rapunzelina – female']],
};
const SAMPLE_LINE = {
  en: 'Hello! This is how your video will sound with this voice.', vi: 'Xin chào! Đây là giọng đọc cho video của bạn.',
  es: '¡Hola! Así sonará tu vídeo con esta voz.', fr: 'Bonjour ! Voici comment votre vidéo sonnera avec cette voix.',
  de: 'Hallo! So klingt dein Video mit dieser Stimme.', it: 'Ciao! Ecco come suonerà il tuo video con questa voce.',
  pt: 'Olá! É assim que o seu vídeo vai soar com esta voz.', ru: 'Привет! Так будет звучать ваше видео с этим голосом.',
};
const langOfVoice = (id) => String(id || '').slice(0, 2);
// Fit each spoken clip into its subtitle time: speed it up a little when it is too long for the gap.
function planVoice(cues, clips, total) {
  return cues.map((c, i) => {
    const clip = clips[i];
    if (!clip) return null;
    const next = cues[i + 1] ? cues[i + 1].start : total;
    const room = Math.max(0.3, next - c.start);
    const len = clip.length / clip.sampleRate;
    const rate = len > room ? Math.min(1.35, len / room) : 1;
    return { start: c.start, rate };
  });
}


// ---- translation (English subtitles -> another language, Opus-MT models, open-source) ----
const TR_LANGS = [
  ['vi', 'Vietnamese', 'Xenova/opus-mt-en-vi'], ['es', 'Spanish', 'Xenova/opus-mt-en-es'], ['fr', 'French', 'Xenova/opus-mt-en-fr'],
  ['de', 'German', 'Xenova/opus-mt-en-de'], ['it', 'Italian', 'Xenova/opus-mt-en-it'], ['zh', 'Chinese', 'Xenova/opus-mt-en-zh'],
  ['ja', 'Japanese', 'Xenova/opus-mt-en-jap'], ['ru', 'Russian', 'Xenova/opus-mt-en-ru'], ['uk', 'Ukrainian', 'Xenova/opus-mt-en-uk'],
  ['id', 'Indonesian', 'Xenova/opus-mt-en-id'], ['hi', 'Hindi', 'Xenova/opus-mt-en-hi'], ['ar', 'Arabic', 'Xenova/opus-mt-en-ar'],
  ['nl', 'Dutch', 'Xenova/opus-mt-en-nl'], ['sv', 'Swedish', 'Xenova/opus-mt-en-sv'], ['da', 'Danish', 'Xenova/opus-mt-en-da'],
  ['fi', 'Finnish', 'Xenova/opus-mt-en-fi'], ['cs', 'Czech', 'Xenova/opus-mt-en-cs'], ['ro', 'Romanian', 'Xenova/opus-mt-en-ro'],
  ['hu', 'Hungarian', 'Xenova/opus-mt-en-hu'],
];
// Join neighbouring lines into whole sentences so the translation has context. Returns [{from, to, text}]
function sentenceGroups(cues, maxLines) {
  maxLines = maxLines || 4;
  const groups = [];
  let cur = null;
  cues.forEach((c, i) => {
    const t = cleanText(c.text.replace(/\n/g, ' '));
    if (!cur) cur = { from: i, to: i, text: t };
    else { cur.to = i; cur.text += ' ' + t; }
    const ends = /[.!?…。！？]["')\]]?$/.test(t);
    const gap = cues[i + 1] ? cues[i + 1].start - c.end : 99;
    if (ends || gap > 1.2 || cur.to - cur.from + 1 >= maxLines || i === cues.length - 1) { groups.push(cur); cur = null; }
  });
  return groups;
}
// Split translated text over n lines in proportion to the original line lengths, cutting at spaces.
function distribute(text, weights) {
  const t = cleanText(text);
  const n = weights.length;
  if (n <= 1) return [t];
  const total = weights.reduce((a, b) => a + b, 0) || n;
  const out = [];
  let rest = t;
  let restW = total;
  for (let k = 0; k < n - 1; k++) {
    const target = Math.round(rest.length * (weights[k] / restW));
    let cut = -1, best = Infinity;
    for (let i = 1; i < rest.length; i++) {
      if (rest[i] !== ' ') continue;
      const d = Math.abs(i - target) - (/[,.;:!?]/.test(rest[i - 1]) ? 4 : 0);
      if (d < best) { best = d; cut = i; }
    }
    if (cut < 0) cut = Math.max(1, Math.min(rest.length - 1, target)); // no spaces (e.g. Chinese)
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
    restW -= weights[k];
  }
  out.push(rest);
  return out.map((x) => x || '…');
}

// ---- time ----
function fmtTime(sec, sep) {
  sep = sep || ',';
  if (!isFinite(sec) || sec < 0) sec = 0;
  let ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000); ms -= m * 60000;
  const s = Math.floor(ms / 1000); ms -= s * 1000;
  const p = (n, w) => String(n).padStart(w, '0');
  return `${p(h, 2)}:${p(m, 2)}:${p(s, 2)}${sep}${p(ms, 3)}`;
}
// "1:02.3" style used in the editor
function fmtShort(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const t = Math.round(sec * 10) / 10;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const ss = s.toFixed(1).padStart(4, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
function fmtClock(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
// accepts 01:02:03,456 · 1:02.3 · 62.5 · 62
function parseTime(str) {
  if (typeof str === 'number') return str;
  const s = String(str || '').trim().replace(',', '.');
  if (!s) return NaN;
  if (!/^[\d:.]+$/.test(s)) return NaN;
  const parts = s.split(':');
  if (parts.length > 3) return NaN;
  let total = 0;
  for (const p of parts) {
    if (p === '' || isNaN(Number(p))) return NaN;
    total = total * 60 + Number(p);
  }
  return total;
}

// ---- text ----
function cleanText(t) {
  return String(t || '').replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim();
}
// Break into at most two balanced lines no longer than maxChars when possible.
function wrapText(text, maxChars) {
  maxChars = maxChars || 42;
  const t = cleanText(text);
  if (t.length <= maxChars) return t;
  const words = t.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const over = Math.max(0, a.length - maxChars) + Math.max(0, b.length - maxChars);
    const score = over * 100 + Math.abs(a.length - b.length);
    if (!best || score < best.score) best = { score, a, b };
  }
  return best ? best.a + '\n' + best.b : t;
}

// Split long text into balanced pieces of at most `limit` characters, preferring sentence ends, then commas, then spaces.
function splitText(text, limit) {
  const t = cleanText(text);
  if (t.length <= limit) return t ? [t] : [];
  const out = [];
  let rest = t;
  while (rest.length > limit) {
    const n = Math.ceil(rest.length / limit);
    const target = rest.length / n;
    const lo = Math.floor(target * 0.6), hi = Math.min(limit, rest.length - 1);
    let best = -1, bestScore = Infinity;
    for (let i = lo; i <= hi; i++) {
      const ch = rest[i - 1], next = rest[i];
      let rank;
      if (/[.!?…。！？]/.test(ch) && (next === ' ' || next === undefined || /[^\w]/.test(next))) rank = 0;
      else if (/[,;:，、]/.test(ch) && next === ' ') rank = 1;
      else if (next === ' ') rank = 2;
      else continue;
      const score = rank * limit * 0.25 + Math.abs(i - target);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) best = Math.round(target); // no spaces (e.g. Chinese/Japanese)
    out.push(rest.slice(0, best).trim());
    rest = rest.slice(best).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

// Whisper segments -> subtitle cues: split long segments (time shared by length), wrap into 2 lines.
function segmentsToCues(segs, maxChars) {
  maxChars = maxChars || 42;
  const cues = [];
  for (const s of segs) {
    const text = cleanText(s.text);
    if (!text) continue;
    const start = s.start, end = Math.max(s.end, s.start + 0.3);
    const parts = splitText(text, maxChars * 2);
    const total = parts.reduce((n, p) => n + p.length, 0) || 1;
    let t = start;
    parts.forEach((p, i) => {
      const d = (end - start) * (p.length / total);
      const e = i === parts.length - 1 ? end : t + d;
      cues.push({ start: round3(t), end: round3(e), text: wrapText(p, maxChars) });
      t = e;
    });
  }
  return tidy(cues);
}
const round3 = (x) => Math.round(x * 1000) / 1000;

// Whisper word timestamps (relative to the window) -> subtitle cues.
// A new line starts after a sentence, after a pause, or when the line gets too long or too slow to read.
function wordsToCues(chunks, offset, windowEnd, maxChars, samples) {
  maxChars = maxChars || 42;
  const limit = maxChars * 2;
  const words = recWords(chunks, offset, windowEnd, samples);
  return groupWords(words, maxChars, limit);
}
// Whisper word chunks (relative to the window) -> [{s, e, t}] in seconds, with starts moved onto the speech.
function recWords(chunks, offset, windowEnd, samples) {
  const words = [];
  let last = 0;
  for (const c of chunks || []) {
    const ts = c.timestamp || [];
    let s = ts[0], e = ts[1];
    if (s == null || !isFinite(s)) s = last;
    s = Math.max(0, Math.min(s, windowEnd - offset - 0.1)); // Whisper sometimes gives a time past the end of the window
    if (e == null || !isFinite(e) || e < s) e = s + 0.3;
    e = Math.min(e, windowEnd - offset);
    last = e;
    if (!String(c.text || '').trim()) continue;
    words.push({ s: offset + s, e: offset + Math.max(e, s), t: String(c.text) });
  }
  if (samples && samples.length) {
    // A word that starts in silence is moved to where the speech actually starts (before the next word).
    for (let i = 0; i < words.length; i++) {
      const w = words[i], nextS = i + 1 < words.length ? words[i + 1].s : w.e + 3;
      const lim = Math.min(nextS, w.s + 3);
      let peak = 0;
      for (let t = w.s; t < lim; t += 0.02) peak = Math.max(peak, rms(samples, t * SR, t * SR + SR / 50));
      const thr = Math.max(0.004, peak * 0.1);
      const loud = (t) => rms(samples, t * SR, t * SR + SR / 20) >= thr;
      if (loud(w.s)) continue;
      let t = w.s;
      while (t < lim && !loud(t)) t += 0.02;
      if (t >= lim) continue;
      const len = Math.max(0.15, w.e - w.s);
      w.s = Math.max(w.s, t - 0.05);
      if (w.e < w.s + 0.15) w.e = Math.min(w.s + len, i + 1 < words.length ? Math.max(w.s + 0.15, words[i + 1].s) : w.s + len);
    }
  }
  fixLongWords(words, samples);
  // onsets are looked for in the voice band of this window (a kick drum or bass note is not a word start)
  const env = samples && samples.length ? vocalEnvelope(samples.subarray(Math.max(0, Math.floor(offset * SR)), Math.min(samples.length, Math.ceil(windowEnd * SR)))) : null;
  snapOnsets(words, samples, env, offset);
  return words;
}
// ---- word timing for songs ----
const isPunctEnd = (t) => /[.!?…,;:。！？，、]["'”’)\]]?$/.test(String(t || '').trim());
// Whisper often gives the word before or after a pause or an instrumental break the whole break, so a line would
// stay on screen during the break, or the next line would start (and be highlighted) seconds too early.
// Where the sound shows where the voice is, the word is cut to it; otherwise the usual Whisper pattern is assumed:
// the first word after a pause starts too early, the last word before a pause ends too late.
function fixLongWords(words, samples) {
  if (!words.length) return words;
  const durs = words.map((w) => w.e - w.s).filter((d) => d > 0).sort((a, b) => a - b);
  const med = durs.length ? durs[durs.length >> 1] : 0.4;
  const maxD = Math.max(0.6, Math.min(0.7, med) * 2); // a normal long word
  const long = Math.max(1.2, maxD * 1.5);
  const step = 0.05;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.e - w.s <= long) continue;
    const prev = words[i - 1], next = words[i + 1];
    let fixed = false;
    if (samples && samples.length) {
      const lv = [];
      for (let t = w.s; t < w.e - 1e-6; t += step) lv.push(rms(samples, t * SR, (t + step) * SR));
      const sorted = lv.slice().sort((a, b) => a - b);
      const lo = sorted[Math.floor(sorted.length * 0.1)], hi = sorted[Math.max(0, sorted.length - 3)]; // the voice may be a short part
      if (hi > 0.004 && hi > lo * 1.6) {
        const thr = lo + (hi - lo) * 0.5;
        const loud = lv.map((v) => v >= thr);
        for (let k = 1; k < loud.length; k++) if (!loud[k]) { let j = k; while (j < loud.length && !loud[j]) j++; if (j < loud.length && j - k <= 3) for (let m = k; m < j; m++) loud[m] = true; k = j; }
        let ra = -1, rb = -1;
        for (let k = 0; k < loud.length; k++) if (loud[k]) { let j = k; while (j < loud.length && loud[j]) j++; if (j - k > rb - ra) { ra = k; rb = j; } k = j; }
        const quiet = (a, b) => { let sum = 0; for (let k = a; k < b; k++) sum += lv[k]; return b > a && sum / (b - a) <= lo + (hi - lo) * 0.25; };
        if (ra >= 0) {
          const s0 = w.s;
          if (ra * step >= 0.3 && quiet(0, ra)) { w.s = round3(s0 + ra * step - 0.03); fixed = true; }
          if ((lv.length - rb) * step >= 0.8 && quiet(rb, lv.length)) { w.e = round3(Math.min(w.e, s0 + rb * step + 0.15)); fixed = true; }
        }
      }
    }
    if (fixed) continue;
    const startSus = !prev || prev.e <= w.s - 0.25 || isPunctEnd(prev.t);
    const endSus = !next || next.s >= w.e + 0.25 || isPunctEnd(w.t);
    if (endSus && !startSus) w.e = w.s + Math.min(w.e - w.s, Math.max(maxD, 2.5)); // a held note is fine, a whole break is not
    else if (startSus || w.e - w.s > 4) w.s = w.e - maxD;
  }
  return words;
}
// Whisper's word starts tend to come a little before the voice (often still in the end of the word before).
// When the sound clearly dips and rises again (an onset) within 0.3 s after the start, the word starts there.
function snapOnsets(words, samples, env, off) {
  if (!samples || !samples.length) return words;
  // env: voice-band loudness every 10 ms starting at `off` seconds (see vocalEnvelope); without it, plain loudness
  const lvl = env && env.length
    ? (a, b) => { let x = 0, n = 0; for (let k = Math.max(0, Math.round((a - off) * 100)); k < Math.min(env.length, Math.round((b - off) * 100)); k++) { x += env[k] * env[k]; n++; } return n ? Math.sqrt(x / n) : 0; }
    : (a, b) => rms(samples, a * SR, b * SR);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.e - w.s < 0.2) continue;
    let peak = 0;
    for (let t = w.s; t < w.e; t += 0.02) peak = Math.max(peak, lvl(t, t + 0.04));
    if (peak < (env ? 1e-4 : 0.004)) continue;
    const hi = Math.min(w.s + 0.3, w.e - 0.12);
    let best = -1, bestR = 2;
    for (let t = w.s - 0.03; t <= hi; t += 0.01) {
      const after = lvl(t, t + 0.06), before = lvl(t - 0.06, t);
      const r = after / (before + (env ? peak * 0.03 : 0.002));
      if (after >= peak * 0.4 && r > bestR) { bestR = r; best = t; }
    }
    if (best > w.s + 0.015) { w.s0 = w.s; w.s = round3(best); }
  }
  return words;
}
// recognised words -> one time per matching token (the units scriptTokens makes)
function tokTimes(words) {
  const out = [];
  for (const w of words || []) {
    const tk = scriptTokens(cleanText(w.t)), n = tk.length;
    tk.forEach((_, k) => out.push({ s: w.s + (w.e - w.s) * k / n, e: w.s + (w.e - w.s) * (k + 1) / n }));
  }
  return out;
}
// Store the time of every word of a subtitle line (relative to its start) so animated captions follow the real
// singing. Returns null when the words and times do not match up.
function attachWt(cue, toks) {
  const ws = capWords(cue.text);
  if (!ws.length || !toks || !toks.length) return null;
  const dur = Math.max(0.05, cue.end - cue.start);
  const out = [];
  let k = 0, last = cue.start;
  for (const o of ws) {
    const n = scriptTokens(o.w).length;
    if (!n) { out.push([last, last]); continue; }
    if (k + n > toks.length) return null;
    const s = toks[k].s, e = toks[k + n - 1].e;
    k += n; out.push([s, e]); last = e;
  }
  if (k !== toks.length) return null;
  return out.map(([s, e]) => { const a = Math.min(dur, Math.max(0, s - cue.start)); return [round3(a), round3(Math.min(dur, Math.max(a, e - cue.start)))]; });
}
// for every drawn word: was it heard (matched a recognised word)? Used once, right after the alignment.
function wmask(text, toks) {
  let k = 0;
  return capWords(text).map((o) => { const n = scriptTokens(o.w).length, m = toks.slice(k, k + n).some((t) => t && t.sure); k += n; return m ? 1 : 0; });
}
const validWt = (c) => !!c && Array.isArray(c.wt) && c.wt.length > 0 && c.wt.every((p) => Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]) && p[0] >= 0 && p[1] >= p[0]);
function groupWords(words, maxChars, limit) {
  const out = [];
  let cur = null;
  const flush = () => { if (cur) { const text = cleanText(cur.t); if (text) out.push({ start: cur.s, end: cur.e, text, w0e: cur.w0e, wLs: cur.wLs, words: cur.ws }); } cur = null; };
  for (const w of words) {
    if (cur) {
      const gap = (w.s0 != null ? w.s0 : w.s) - cur.e; // where Whisper put the word: moving it onto the voice must not split lines
      const curText = cleanText(cur.t);
      const tail = curText.slice(-2);
      const sentence = /[.!?…。！？]["'”’)\]]?$/.test(tail);
      const clause = /[,;:，、]$/.test(tail);
      const nextLen = cleanText(cur.t + w.t).length;
      if (gap > 0.5 || nextLen > limit || w.e - cur.s > 7 ||
          (sentence && (curText.length >= 12 || gap > 0.25)) ||
          (clause && curText.length >= maxChars * 1.3)) flush();
    }
    if (!cur) cur = { s: w.s, e: w.e, t: w.t.replace(/^\s+/, ''), w0e: w.e, wLs: w.s, ws: [w] };
    else { cur.t += w.t; cur.e = w.e; cur.wLs = w.s; cur.ws.push(w); }
  }
  flush();
  return out;
}

// ---- lyrics / script alignment ----
// The user already has the exact words (song lyrics, a script). Speech recognition is only used for the timing:
// the recognised words are matched to the user's words, and every line of the text becomes one subtitle.
const normWord = (w) => String(w || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const bareWord = (w) => normWord(w).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
function scriptLines(text) {
  return String(text || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^\[.*\]$/.test(l)); // skip "[Chorus]"-style headings
}
// Split a text into units for matching: words, or single characters for languages written without spaces.
function scriptTokens(line) {
  const out = [];
  for (const piece of line.split(' ')) {
    if (/[぀-ヿ㐀-鿿가-힯฀-๿]/.test(piece) && normWord(piece).length > 1) {
      for (const ch of normWord(piece)) out.push(ch);
    } else if (normWord(piece)) out.push(normWord(piece));
  }
  return out;
}
// Banded global alignment of the user's tokens (a) to the recognised tokens (b). Returns, for every token of a,
// the index in b it matched (or -1).
// pb (optional): where in the song (0…1) each recognised token was heard. It gently prefers matching a word to the
// copy of it that is at about the same place in the text – songs repeat the chorus, and without it the heard words
// of one chorus could be given to another chorus, leaving the lines in between with no time at all.
const PRIOR = 1;
function alignTokens(a, b, pb) {
  const n = a.length, m = b.length;
  const map = new Int32Array(n).fill(-1);
  if (!n || !m) return map;
  const band = Math.max(60, Math.ceil(Math.abs(n - m) * 1.2) + 60);
  const W = 2 * band + 1;
  const ab = a.map(bareWord), bb = b.map(bareWord);
  const word = (i, j) => (a[i] === b[j] ? 0 : ab[i] === bb[j] ? 0.3 : 1.2);
  const cost = pb ? (i, j) => word(i, j) + PRIOR * Math.abs(i / n - pb[j]) : word;
  const GAP = 0.9;
  const center = (i) => Math.round(i * m / n);
  const D = new Float32Array((n + 1) * W).fill(Infinity);
  const P = new Uint8Array((n + 1) * W); // 1 = diagonal, 2 = up (skip a word of a), 3 = left (skip a word of b)
  const at = (i, j) => { const k = j - center(i) + band; return k >= 0 && k < W ? i * W + k : -1; };
  for (let i = 0; i <= n; i++) {
    const c = center(i);
    for (let j = Math.max(0, c - band); j <= Math.min(m, c + band); j++) {
      const k = at(i, j);
      if (i === 0 && j === 0) { D[k] = 0; continue; }
      let best = Infinity, from = 0, x;
      if (i > 0 && j > 0 && (x = at(i - 1, j - 1)) >= 0 && D[x] + cost(i - 1, j - 1) < best) { best = D[x] + cost(i - 1, j - 1); from = 1; }
      if (i > 0 && (x = at(i - 1, j)) >= 0 && D[x] + GAP < best) { best = D[x] + GAP; from = 2; }
      if (j > 0 && (x = at(i, j - 1)) >= 0 && D[x] + GAP * (i === 0 || i === n ? 0.6 : 1) < best) { best = D[x] + GAP * (i === 0 || i === n ? 0.6 : 1); from = 3; }
      D[k] = best; P[k] = from;
    }
  }
  let i = n, j = m;
  if (at(n, m) < 0 || !isFinite(D[at(n, m)])) return map;
  while (i > 0 || j > 0) {
    const k = at(i, j);
    if (k < 0) break;
    const f = P[k];
    if (f === 1) { if (a[i - 1] && word(i - 1, j - 1) < 1) map[i - 1] = j - 1; else map[i - 1] = -2 - (j - 1); i--; j--; }
    else if (f === 2) i--;
    else if (f === 3) j--;
    else break;
  }
  return map;
}
// Whisper's well-known made-up sentences on music (each window is heard on its own, so these are generic phrases)
const JUNK_PHRASES = ['hãy subscribe cho kênh ghiền mì gõ để không bỏ lỡ những video hấp dẫn', 'hãy đăng ký kênh để xem thêm video', 'đăng ký kênh và bấm chuông thông báo',
  'cảm ơn các bạn đã theo dõi và hẹn gặp lại', 'hẹn gặp lại các bạn trong những video tiếp theo', 'chúc các bạn ngon miệng', 'các bạn hãy like share và subscribe',
  'thanks for watching', 'please subscribe to my channel', 'subtitles by the amara org community', 'thank you for watching and see you next time'].map((p) => p.split(' ').map(bareWord));
// indexes of words piled up at one moment (3 or more, each with almost no length): Whisper did not know their time
function pileWords(words) {
  const out = [];
  for (let i = 0; i < words.length;) {
    let j = i; while (j + 1 < words.length && Math.abs(words[j + 1].s - words[i].s) < 0.03) j++;
    if (j - i >= 2) for (let k = i; k <= j; k++) if (words[k].e - words[k].s <= 0.2) out.push(k);
    i = j + 1;
  }
  return out;
}
function dropJunkWords(words, lyricToks, lines) {
  const bt = words.map((w) => scriptTokens(cleanText(w.t)).map(bareWord).join(''));
  const lyr = ' ' + (lyricToks || []).map(bareWord).join(' ') + ' ';
  const bad = new Uint8Array(words.length);
  words.forEach((w, i) => { if (JUNK.test(cleanText(w.t)) || !bt[i]) bad[i] = 1; });
  // Words Whisper could not place in time: three or more piled up at one moment with (almost) no length – mostly
  // at the start of a listening window, or at the very end of the song. Their time is not real, so they are not used
  // (their lines are placed between their neighbours instead of being pulled to that moment).
  for (const k of pileWords(words)) bad[k] = 1;
  for (const ph of JUNK_PHRASES) {
    for (let i = 0; i < words.length; i++) {
      for (let p = 0; p < ph.length; p++) {
        let n = 0;
        while (i + n < words.length && p + n < ph.length && bt[i + n] === ph[p + n]) n++;
        if (n >= 3 && !lyr.includes(' ' + ph.slice(p, p + n).join(' ') + ' ')) { for (let k = 0; k < n; k++) bad[i + k] = 1; break; }
      }
    }
  }
  // "la la la", "ừ ừ ừ …": Whisper's loops on music (unless the lyrics have them too)
  for (let i = 0; i < words.length; i++) {
    let j = i; while (j + 1 < words.length && bt[j + 1] === bt[i]) j++;
    if (j - i >= 2 && !lyr.includes(' ' + [bt[i], bt[i], bt[i]].join(' ') + ' ')) for (let k = i; k <= j; k++) bad[k] = 1;
    i = j;
  }
  // Outro echo: after the singing stops Whisper often "hears" the last line again in the music. A run of words
  // after a pause of 4 s or more at the very end that repeats what was heard just before is dropped – unless the
  // lyrics themselves end with that line repeated.
  const lcs = (a, b) => { const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0)); for (let x = 1; x <= a.length; x++) for (let y = 1; y <= b.length; y++) d[x][y] = a[x - 1] === b[y - 1] ? d[x - 1][y - 1] + 1 : Math.max(d[x - 1][y], d[x][y - 1]); return d[a.length][b.length]; };
  const L = (lines || []).map((l) => scriptTokens(l).map(bareWord).join(' '));
  const endsRepeated = L.length >= 2 && L.slice(-3, -1).includes(L[L.length - 1]);
  for (let pass = 0; pass < 3 && !endsRepeated; pass++) { // the echo can come more than once
    const keep = words.map((_, i) => i).filter((i) => !bad[i]);
    let r = keep.length - 1;
    while (r > 0 && words[keep[r]].s - words[keep[r - 1]].e < 4) r--;
    if (!(r > 0 && keep.length - r >= 3 && keep.length - r <= 16)) break;
    // only a short run (about one line) that repeats the words heard right before the pause
    const tail = keep.slice(r).map((i) => bt[i]);
    const before = keep.slice(Math.max(0, r - tail.length - 3), r).map((i) => bt[i]);
    // … or it is the last lyric line again, and that line was already heard just before the pause
    const lastL = L.length ? L[L.length - 1].split(' ') : [];
    const echo = lcs(tail, before) >= tail.length * 0.5 || (lastL.length >= 3 && lcs(tail, lastL) >= lastL.length * 0.7 && lcs(before, lastL) >= lastL.length * 0.4);
    if (!echo) break;
    for (const i of keep.slice(r)) bad[i] = 1;
  }
  return words.filter((_, i) => !bad[i]);
}
const LINE_BREAK = 3; // seconds of quiet inside a line that mean "this word does not belong here"
const MAX_HOLD = 3; // longest time the last word of a line is held (unless the voice is still heard)
const MAX_HOLD_HEARD = 8; // a held note the voice band still shows can last up to this
const FIRST_WORD_MAX = 1.2, FIRST_WORD_HELD = 0.45; // a line's first word heard longer than this took the pause before it
const SHOW_BEFORE = 0.2, SHOW_AFTER = 0.35; // a lyrics line appears just before its first word and goes shortly after its last
// words: recognised [{s, e, t}] in time order. Returns cues, one per line of the text (long lines split).
function alignScript(text, words, maxChars, maxSec, dur) {
  maxChars = maxChars || 42;
  const lines = scriptLines(text);
  const toks = [], owner = [];
  lines.forEach((l, li) => scriptTokens(l).forEach((t) => { toks.push(t); owner.push(li); }));
  const recT = [], recW = [];
  for (const w of dropJunkWords(words || [], toks, lines)) {
    const tk = scriptTokens(cleanText(w.t)), n = tk.length;
    tk.forEach((t, k) => { recT.push(t); recW.push({ s: w.s + (w.e - w.s) * k / n, e: w.s + (w.e - w.s) * (k + 1) / n }); });
  }
  // place of each heard word between the first heard word and the end of the song
  const t0 = recW.length ? recW[0].s : 0, t1 = Math.max(dur || 0, recW.length ? recW[recW.length - 1].e : 0, t0 + 1);
  const map = alignTokens(toks, recT, recW.map((w) => Math.max(0, Math.min(1, (w.s - t0) / (t1 - t0)))));
  // time for each token: exact/near match -> that word; substitution -> that word (less sure); gaps -> interpolate
  const ts = new Array(toks.length).fill(null);
  for (let i = 0; i < toks.length; i++) {
    const v = map[i];
    if (v >= 0) ts[i] = { s: recW[v].s, e: recW[v].e, sure: true, exact: toks[i] === recT[v] };
    else if (v <= -2) ts[i] = { s: recW[-2 - v].s, e: recW[-2 - v].e, sure: false };
  }
  // drop "unsure" times that go backwards
  let lastS = -Infinity;
  for (let i = 0; i < ts.length; i++) { if (ts[i]) { if (ts[i].s < lastS - 0.05) ts[i] = null; else lastS = ts[i].s; } }
  const byLine = lines.map(() => []);
  owner.forEach((o, k) => byLine[o].push(k));
  // A line is sung in one go: words of a line that are timed far away from the rest of it (a word heard in an
  // instrumental break matched to the first or last word of the line) are dropped and placed next to their line again.
  for (const idx of byLine) {
    const timed = idx.filter((k) => ts[k]);
    if (timed.length < 2) continue;
    const groups = [[timed[0]]];
    for (let j = 1; j < timed.length; j++) {
      if (ts[timed[j]].s - ts[timed[j - 1]].e > LINE_BREAK + 0.4 * (timed[j] - timed[j - 1] - 1)) groups.push([]);
      groups[groups.length - 1].push(timed[j]);
    }
    if (groups.length < 2) continue;
    const score = (g) => g.reduce((n, k) => n + (ts[k].exact ? 1 : ts[k].sure ? 0.6 : 0.3), 0);
    const keep = groups.reduce((x, g) => (score(g) > score(x) ? g : x));
    for (const g of groups) if (g !== keep) for (const k of g) ts[k] = null;
  }
  // Whisper gives the first word after a pause (a breath, the music between two lines) the whole pause: it "starts"
  // where the word before ended. A first word that long is really sung at the end of that time – the karaoke colour
  // would otherwise start running seconds before the singer does.
  for (const idx of byLine) {
    const k = idx.find((x) => ts[x]);
    if (k == null || k !== idx[0]) continue;
    const t = ts[k];
    if (t.e - t.s > FIRST_WORD_MAX) t.s = t.e - FIRST_WORD_HELD;
    // … or it is put right after the line before, and the rest of its line only comes after a long silence: then it
    // is sung just before the second word
    const k2 = idx[1] != null && ts[idx[1]] ? idx[1] : null;
    if (k2 != null && ts[k2].s - t.e > FIRST_WORD_MAX) { const e = ts[k2].s - 0.05; t.s = Math.max(t.s, e - FIRST_WORD_HELD); t.e = e; }
  }
  // a line that only "matched" misheard words (no word really the same) is placed like an unheard line
  for (const idx of byLine) if (idx.some((k) => ts[k]) && !idx.some((k) => ts[k] && ts[k].sure)) for (const k of idx) ts[k] = null;
  // Lines between two timed lines must fit in the time between them. When they cannot be sung that fast, one of the
  // two was matched to the wrong place (a repeated chorus line heard elsewhere): the one with empty time on its far
  // side is let go and placed again like an unheard line.
  {
    const lS = (li) => Math.min(...byLine[li].filter((k) => ts[k]).map((k) => ts[k].s));
    const lE = (li) => Math.max(...byLine[li].filter((k) => ts[k]).map((k) => ts[k].e));
    const need = (p, q) => { let x = 0; for (let l = p + 1; l < q; l++) x += byLine[l].length * 0.3 + 0.6; return x; };
    const end = Math.max(dur || 0, recW.length ? recW[recW.length - 1].e : 0);
    for (let iter = 0; iter < lines.length; iter++) {
      const A = byLine.map((idx, li) => (idx.some((k) => ts[k]) ? li : -1)).filter((x) => x >= 0);
      let drop = -1;
      for (let k = 0; k + 1 < A.length; k++) {
        const p = A[k], q = A[k + 1];
        if (q - p < 2 || need(p, q) <= lS(q) - lE(p) + 1.5) continue;
        const o = A[k - 1], r = A[k + 2];
        const slackP = lS(p) - (o != null ? lE(o) : 0) - need(o != null ? o : -1, p);
        const slackQ = (r != null ? lS(r) : end) - lE(q) - need(q, r != null ? r : lines.length);
        drop = slackP >= slackQ ? p : q;
        break;
      }
      if (drop < 0) break;
      for (const k of byLine[drop]) ts[k] = null;
    }
  }
  const perWord = 0.35;
  // which recognised words are already used – the others show where something was sung that did not match
  const used = new Uint8Array(recT.length);
  for (let i = 0; i < toks.length; i++) if (ts[i]) { const v = map[i]; used[v >= 0 ? v : -2 - v] = 1; }
  const free = [], freeB = [];
  recW.forEach((w, j) => { if (!used[j]) { free.push(w.s); freeB.push(bareWord(recT[j])); } });
  const freeIn = (a, b) => free.filter((x) => x > a && x < b);
  const piles = [...new Set(pileWords(words || []).map((k) => words[k].s))];
  // Heard words after / before time t, in runs (no gap longer than CHAIN_GAP). A word heard on its own (noise, an
  // instrument in the intro or outro) does not count; a run of words (singing Whisper did not understand) does.
  const CHAIN_GAP = 4;
  const runs = (f) => { const out = []; for (const x of f) { const r = out[out.length - 1]; if (r && x - r[r.length - 1] <= CHAIN_GAP) r.push(x); else out.push([x]); } return out; };
  const chainOn = (f, t) => { let last = null; runs(f).forEach((r, k) => { if (r.length >= 2 || (k === 0 && r[0] - t <= CHAIN_GAP)) last = r[r.length - 1]; }); return last; };
  const chainBack = (f, t) => { const rs = runs(f); let first = null; rs.forEach((r, k) => { if (first == null && (r.length >= 2 || (k === rs.length - 1 && t - r[r.length - 1] <= CHAIN_GAP))) first = r[0]; }); return first; };
  // heard-but-unmatched words in (a, b) that look like words of these lines (and not of the lines around them)
  const likeIn = (a, b, want, not) => free.reduce((n, x, k) => n + (x > a && x < b && want.has(freeB[k]) && !not.has(freeB[k]) ? 1 : 0), 0);
  // Words without a time, run by run between two timed words
  for (let a = 0; a < ts.length; a++) {
    if (ts[a]) continue;
    let b = a;
    while (b + 1 < ts.length && !ts[b + 1]) b++;
    const prev = a > 0 ? a - 1 : null, next = b + 1 < ts.length ? b + 1 : null, n = b - a + 1;
    let T0 = prev != null ? ts[prev].e : null, T1 = next != null ? ts[next].s : null;
    if (T0 == null && T1 == null) { const f = free.length ? free : [0]; T0 = f[0]; T1 = Math.max(f[f.length - 1] + perWord, T0 + n * perWord); }
    else if (T0 == null) {
      // lines before the first word that was understood: back over what Whisper heard just before it – a word
      // heard alone far away in the intro (noise, an instrument) does not pull the first line there
      const f = chainBack(freeIn(-1, T1), T1), pace = n * 0.45 + (owner[b] - owner[a] + 1) * 1.0;
      T0 = Math.max(0, Math.min(T1 - n * perWord, f != null ? f : T1 - pace));
    }
    else if (T1 == null) {
      // lines after the last word that was understood: as far as Whisper kept hearing something right after it,
      // at least at a normal singing pace (a word heard alone in the outro does not stretch the last lines)
      const f = chainOn(freeIn(T0, Infinity), T0), pace = n * 0.45 + (owner[b] - owner[a] + 1) * 1.0;
      T1 = Math.max(T0 + pace, f != null ? f + perWord : 0);
      if (dur > 0) T1 = Math.max(T0 + n * perWord, Math.min(T1, dur - 0.2));
    }
    const span = T1 - T0;
    const head = [], tail = [], mid = [];
    for (let i = a; i <= b; i++) {
      if (prev != null && owner[i] === owner[prev]) head.push(i);
      else if (next != null && owner[i] === owner[next]) tail.push(i);
      else mid.push(i);
    }
    if (span <= (n + 1) * perWord * 2 + 1.5 || (!mid.length && (!head.length || !tail.length) && prev != null && next != null && owner[prev] === owner[next])) {
      // no pause here: the words fill the time between their neighbours one after the other, each by its
      // syllable length (vowels are what is held when singing)
      const wl = (i) => 1 + 0.1 * toks[i].length + 0.25 * (toks[i].match(/[aăâeêioôơuưyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]+/g) || []).length;
      // between two lines the singer breathes: that pause is kept out of the words
      const GAP = 3;
      const gapBefore = (i) => (i === a ? prev != null && owner[prev] !== owner[i] : owner[i - 1] !== owner[i]) ? GAP : 0;
      const gapAfterRun = next != null && owner[next] !== owner[b] ? GAP : 0;
      let W = gapAfterRun; for (let i = a; i <= b; i++) W += wl(i) + gapBefore(i);
      const lead = prev != null ? Math.min(0.05, span * 0.05) : 0, room = Math.max(0.05, span - lead);
      let acc = 0;
      for (let i = a; i <= b; i++) { acc += gapBefore(i); const st = T0 + lead + room * acc / W; acc += wl(i); ts[i] = { s: st, e: Math.max(st + 0.05, T0 + lead + room * acc / W - 0.02) }; }
      continue;
    }
    // A pause, an instrumental break or a stretch Whisper did not understand. The rest of the line before it stays
    // with that line, the start of the line after it stays with that line – never spread over the break …
    head.forEach((i, k) => { const st = T0 + k * perWord; ts[i] = { s: st, e: st + perWord }; });
    tail.forEach((i, k) => { const st = T1 - (tail.length - k) * perWord; ts[i] = { s: st, e: st + perWord }; });
    if (!mid.length) continue;
    // … and whole lines that were not recognised are spread over the time between, following any words Whisper
    // heard there, so every line still gets its own time on screen.
    const M0 = head.length ? T0 + head.length * perWord + 0.4 : prev != null ? T0 + 0.3 : T0;
    const M1 = Math.max(M0 + mid.length * perWord, tail.length ? T1 - tail.length * perWord - 0.4 : next != null ? T1 - 0.3 : T1);
    const m = mid.length;
    let A = M0, B = M1;
    // far more time than these lines need: there is a break in it. The lines go to the side where Whisper heard
    // something (the singing it did not understand); when nothing tells, they are spread over the whole time.
    const need = m * 0.45 + (owner[mid[m - 1]] - owner[mid[0]] + 1) * 1.0;
    if (M1 - M0 > need * 2 + 6) {
      const want = new Set(mid.map((i) => bareWord(toks[i]))), not = new Set(head.concat(tail).map((i) => bareWord(toks[i])));
      if (prev != null) byLine[owner[prev]].forEach((i) => not.add(bareWord(toks[i])));
      if (next != null) byLine[owner[next]].forEach((i) => not.add(bareWord(toks[i])));
      const win = Math.max(need + 2, (M1 - M0) / 3);
      let nA = likeIn(M0 - 0.01, M0 + win, want, not), nB = likeIn(M1 - win, M1, want, not);
      // no word looks like these lines: then the side where Whisper heard singing at all (runs of words) tells
      // (words Whisper heard there without knowing their time count too: something was sung on that side)
      if (nA === nB) { const sung = (a, b) => runs(freeIn(a, b)).filter((r) => r.length >= 2).flat().length + piles.filter((x) => x > a && x < b).length; nA = sung(M0 - 0.01, M0 + win); nB = sung(M1 - win, M1); }
      if (nB > nA) A = Math.max(M0, Math.min(M1 - need, (freeIn(M1 - need - 2, M1)[0] || M1 - need)));
      // nothing tells (or the singing is right after the line before): the lines go on at a normal pace after the
      // line before and the break comes after them – they are not spread thin over the whole instrumental
      else B = Math.min(M1, Math.max(M0 + need, (freeIn(M0 - 0.01, M0 + need + 2).slice(-1)[0] || M0 + need) + perWord));
    }
    // heard words to follow: words heard on their own far from any other (noise in a break) are left out
    const rs = runs(freeIn(A - 0.01, B)).filter((r) => r.length >= 2).flat();
    const at = (k) => {
      if (rs.length >= 2 && rs.length >= m * 0.25) { const p = k * (rs.length - 1) / Math.max(1, m - 1), f = Math.floor(p); return rs[f] + (rs[Math.min(rs.length - 1, f + 1)] - rs[f]) * (p - f); }
      return A + (B - A) * k / m;
    };
    mid.forEach((i, k) => { const st = at(k); ts[i] = { s: st, e: st + perWord }; });
    mid.forEach((i, k) => { const nx = k + 1 < m ? ts[mid[k + 1]].s : B; ts[i].e = Math.max(ts[i].s + 0.05, Math.min(ts[i].e, nx)); });
  }
  // a first word placed by guess right after the line before, far ahead of the rest of its line: next to the rest
  for (const idx of byLine) {
    if (idx.length < 2 || !ts[idx[0]] || !ts[idx[1]]) continue;
    const t = ts[idx[0]], e = ts[idx[1]].s - 0.05;
    if (e - t.e > FIRST_WORD_MAX) { t.s = Math.max(t.s, e - FIRST_WORD_HELD); t.e = e; }
  }
  // the line ends shortly after its last word, not at the end of the following instrumental break
  for (const idx of byLine) { const t = idx.length && ts[idx[idx.length - 1]]; if (t && t.e - t.s > MAX_HOLD) t.e = t.s + MAX_HOLD; }
  // Every line gets a subtitle, in order, with enough time to be read: lines without any word (only symbols) go
  // between their neighbours; lines squeezed together are moved apart (their words move with them).
  const lt = byLine.map((idx) => (idx.length ? { s: ts[idx[0]].s, e: ts[idx[idx.length - 1]].e } : null));
  for (let li = 0; li < lt.length; li++) {
    if (lt[li]) continue;
    let q = li; while (q < lt.length && !lt[q]) q++;
    const p0 = li ? lt[li - 1].e : (q < lt.length ? Math.max(0, lt[q].s - (q - li) * 1.5) : 0);
    const p1 = q < lt.length ? lt[q].s : p0 + (q - li) * 1.5;
    for (let k = li; k < q; k++) { const st = p0 + (p1 - p0) * (k - li) / (q - li); lt[k] = { s: st, e: st + Math.max(0.8, (p1 - p0) / (q - li) - 0.1) }; }
    li = q - 1;
  }
  const minD = (li) => Math.min(2, Math.max(0.9, 0.22 * byLine[li].length));
  const s0 = lt.map((x) => x.s);
  for (let li = 1; li < lt.length; li++) lt[li].s = Math.max(lt[li].s, lt[li - 1].s + minD(li - 1));
  for (let li = lt.length - 2; li >= 0; li--) lt[li].s = Math.max(li ? lt[li - 1].s + 0.3 : 0, Math.min(lt[li].s, lt[li + 1].s - minD(li)));
  lt.forEach((x, li) => {
    const d = x.s - s0[li];
    if (Math.abs(d) > 1e-6) { for (const k of byLine[li]) { ts[k] = { s: ts[k].s + d, e: ts[k].e + d }; } x.e += d; }
    const nx = lt[li + 1];
    if (nx && x.e > nx.s) { x.e = Math.max(x.s + 0.5, nx.s); for (const k of byLine[li]) { ts[k] = { s: Math.min(ts[k].s, x.e - 0.05), e: Math.min(ts[k].e, x.e) }; } }
  });
  const cues = [];
  lines.forEach((line, li) => {
    const idx = byLine[li];
    // shown a moment before the first word and kept a moment after the last one (never into the next line)
    const prevE = li ? lt[li - 1].e : 0, nextS = li + 1 < lt.length ? lt[li + 1].s : Infinity;
    const start = Math.max(0, Math.min(lt[li].s, Math.max(prevE, lt[li].s - SHOW_BEFORE)));
    const end = Math.max(Math.min(lt[li].e + SHOW_AFTER, nextS - SHOW_BEFORE), lt[li].e, start + 0.8);
    const parts = splitText(line, maxChars * 2);
    const counts = parts.map((p) => capWords(p).reduce((n, o) => n + scriptTokens(o.w).length, 0));
    const exact = idx.length > 0 && counts.reduce((x, y) => x + y, 0) === idx.length;
    const total = parts.reduce((x, p) => x + p.length, 0) || 1;
    let t = start, k = 0;
    parts.forEach((p, j) => {
      let cs = t, ce = j === parts.length - 1 ? end : t + (end - start) * p.length / total;
      let toks2 = null;
      if (exact && counts[j]) {
        toks2 = idx.slice(k, k + counts[j]).map((x) => ts[x]);
        cs = j ? Math.max(t, toks2[0].s - SHOW_BEFORE) : start;
        ce = j === parts.length - 1 ? end : Math.max(cs + 0.4, toks2[toks2.length - 1].e);
      }
      k += counts[j];
      const c = { start: round3(cs), end: round3(ce), text: wrapText(p, maxChars) };
      const wt = toks2 && attachWt(c, toks2);
      if (wt) { c.wt = wt; c.wm = wmask(p, toks2); }
      cues.push(c);
      t = ce;
    });
  });
  return tidy(cues.filter((c) => maxSec == null || c.start < maxSec));
}

// Move cue edges onto the real speech: Whisper sometimes starts the first word of a line during the
// silence before it (or ends the last word late). Uses the loudness of the audio around each edge.
function snapToSpeech(cues, samples) {
  if (!samples || !samples.length) return cues;
  const F = SR / 50; // 20 ms frames
  const frameRms = (t) => rms(samples, t * SR, t * SR + F);
  for (const c of cues) {
    let peak = 0;
    for (let t = c.start; t < c.end; t += 0.02) peak = Math.max(peak, frameRms(t));
    const thr = Math.max(0.004, peak * 0.1);
    const loud = (t) => rms(samples, t * SR, t * SR + SR / 10) >= thr; // 100 ms look-ahead
    if (!loud(c.start)) {
      const lim = Math.min((c.w0e != null ? c.w0e : c.end) - 0.05, c.start + 3);
      let t = c.start;
      while (t < lim && !loud(t)) t += 0.02;
      if (t < lim) c.start = Math.max(c.start, t - 0.08);
    }
    if (!loud(c.end - 0.1)) {
      const lim = Math.max((c.wLs != null ? c.wLs : c.start) + 0.15, c.start + 0.3);
      let t = c.end - 0.1;
      while (t > lim && !loud(t)) t -= 0.02;
      if (t > lim) c.end = Math.min(c.end, t + 0.1 + 0.25);
    }
    delete c.w0e; delete c.wLs;
  }
  return cues;
}

// Sort, remove empties, make sure every cue has a sensible length and none overlap.
function tidy(cues) {
  const list = cues
    .filter((c) => c && isFinite(c.start) && isFinite(c.end) && cleanText(c.text))
    .map((c) => { const o = { start: Math.max(0, c.start), end: Math.max(0, c.end), text: String(c.text).trim() }; if (c.spk != null && c.spk >= 0) o.spk = c.spk; if (c.star) o.star = true; if (c.sing === 'a' || c.sing === 'b' || c.sing === 'ab') o.sing = c.sing; if (validWt(c)) { o.wt = c.wt.map((p) => [round3(p[0]), round3(p[1])]); if (Array.isArray(c.wm) && c.wm.length === c.wt.length) o.wm = c.wm; } return o; })
    .sort((a, b) => a.start - b.start);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.end <= c.start) c.end = c.start + 1;
    const next = list[i + 1];
    if (next && c.end > next.start) c.end = Math.max(c.start + 0.2, next.start);
    c.start = round3(c.start); c.end = round3(c.end);
  }
  return list;
}

// Drop Whisper's typical "hallucinations" on silence / repeated loops.
const JUNK = /^(\[?(music|applause|silence|blank_audio|no speech|inaudible)\]?|\(.*\)|♪+|\.+|-+|thanks? (you )?for watching[.!]*|subscribe[.!]*)$/i;
function filterSegments(segs) {
  const out = [];
  for (const s of segs) {
    const t = cleanText(s.text);
    if (!t || JUNK.test(t.replace(/[\[\]]/g, (m) => m))) continue;
    const prev = out[out.length - 1];
    if (prev && cleanText(prev.text).toLowerCase() === t.toLowerCase() && s.start - prev.end < 1.5) { prev.end = s.end; continue; }
    out.push(Object.assign({}, s, { text: t }));
  }
  return out;
}

// Whisper output chunks (timestamps relative to the window) -> absolute segments
function chunksToSegments(chunks, offset, windowEnd) {
  const segs = [];
  for (const c of chunks || []) {
    const ts = c.timestamp || [];
    let s = ts[0], e = ts[1];
    if (s == null || !isFinite(s)) s = 0;
    if (e == null || !isFinite(e)) e = windowEnd - offset;
    segs.push({ start: offset + s, end: offset + Math.min(e, windowEnd - offset), text: c.text });
  }
  return segs;
}

// ---- audio windows ----
function rms(samples, from, to) {
  from = Math.max(0, from | 0); to = Math.min(samples.length, to | 0);
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return to > from ? Math.sqrt(sum / (to - from)) : 0;
}
// Quietest 100 ms frame between `from` and `to` (seconds); returns time in seconds.
function quietPoint(samples, from, to) {
  const frame = SR / 10;
  let best = to, bestV = Infinity;
  for (let t = from; t + 0.1 <= to; t += 0.1) {
    const v = rms(samples, t * SR, t * SR + frame);
    if (v < bestV) { bestV = v; best = t + 0.05; }
  }
  return best;
}
// Plan ≤ 30 s windows, cutting at a quiet moment so words are not split.
function planWindows(samples, maxSec) {
  const dur = samples.length / SR;
  const limit = Math.min(dur, maxSec || dur);
  const wins = [];
  let start = 0;
  while (start < limit - 0.05) {
    let end;
    if (limit - start <= 29.5) end = limit;
    else end = quietPoint(samples, start + 20, start + 29.5);
    wins.push({ start: round3(start), end: round3(end) });
    start = end;
  }
  return wins;
}
const isSilent = (samples, w) => rms(samples, w.start * SR, w.end * SR) < 0.0025;

// ---- subtitle files ----
// an empty line inside a cue would end it early in SRT/VTT files
const cueBody = (t) => String(t).split('\n').filter((l) => l.trim()).join('\n');
function toSRT(cues) {
  return cues.map((c, i) => `${i + 1}\n${fmtTime(c.start, ',')} --> ${fmtTime(c.end, ',')}\n${cueBody(c.text)}\n`).join('\n');
}
function toVTT(cues) {
  return 'WEBVTT\n\n' + cues.map((c) => `${fmtTime(c.start, '.')} --> ${fmtTime(c.end, '.')}\n${cueBody(c.text)}\n`).join('\n');
}
function toTXT(cues) {
  return cues.map((c) => c.text.replace(/\n/g, ' ')).join('\n') + '\n';
}
function toTXTStamped(cues) {
  return cues.map((c) => `[${fmtClock(c.start)}] ${c.text.replace(/\n/g, ' ')}`).join('\n') + '\n';
}
function parseSubs(text) {
  const src = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const blocks = src.split(/\n{2,}/);
  const cues = [];
  const re = /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;
  for (const b of blocks) {
    const lines = b.split('\n');
    const k = lines.findIndex((l) => re.test(l));
    if (k < 0) continue;
    const m = lines[k].match(re);
    const txt = lines.slice(k + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (!txt) continue;
    cues.push({ start: parseTime(m[1]), end: parseTime(m[2]), text: txt });
  }
  return tidy(cues);
}

// ---- editing helpers ----
// ---------- word timing for animated captions ----------
// Whisper gives a time for each line. Inside a line every word gets a share of the time by its length,
// with a little extra after a comma or full stop. Edited text keeps working because nothing is stored.
const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;
// the words of a caption as they are drawn (CJK: one character each)
function capWords(text) {
  const out = [];
  String(text || '').split('\n').forEach((ln, li) => {
    const toks = ln.match(/[぀-ヿ㐀-鿿豈-﫿][、。，！？]?|[^\s぀-ヿ㐀-鿿豈-﫿]+/g) || [];
    let prevCjk = false;
    toks.forEach((w, k) => {
      const cjk = CJK.test(w);
      out.push({ w, line: li, sp: k > 0 && !(cjk && prevCjk) });
      prevCjk = cjk;
    });
  });
  return out;
}
// Lines made from the sound keep the real time of every word (cue.wt, relative to the line start).
// Otherwise every word gets a share of the line's time by its length.
function wordTimes(cue) {
  const out = capWords(cue && cue.text);
  if (!out.length) return out;
  if (validWt(cue) && cue.wt.length === out.length) {
    const end = Math.max(cue.start + 0.05, cue.end), dur = end - cue.start;
    // a line made shorter after its words were timed: the words keep their real time (they must not start early);
    // only words that would now fall after the end share the time left at the end (repairWords below)
    out.forEach((o, i) => { o.s = Math.min(end, cue.start + cue.wt[i][0]); o.e = Math.min(end, Math.max(o.s, cue.start + cue.wt[i][1])); });
    return repairWords(out, cue.start, end);
  }
  const weight = (w) => {
    const letters = (w.match(/[\p{L}\p{N}]/gu) || []).length;
    return Math.max(1, letters) + 1.5 + (/[.,!?;:…、。，！？]$/.test(w) ? 2.5 : 0);
  };
  const dur = Math.max(0.05, cue.end - cue.start);
  const span = dur - Math.min(0.15, dur * 0.1);
  const ws = out.map((o) => weight(o.w)), tot = ws.reduce((a, b) => a + b, 0);
  let acc = 0;
  out.forEach((o, i) => { o.s = cue.start + span * acc / tot; acc += ws[i]; o.e = cue.start + span * acc / tot; });
  return out;
}
// Words with (almost) no time of their own would change colour all at once. They get a share of the time around
// them by syllable length; when most words of a line are like that, the whole line is spread again.
function repairWords(ws, start, end) {
  const MIN = 0.06, n = ws.length;
  const bad = ws.map((o, k) => o.e - o.s < MIN || (k && o.s < ws[k - 1].s + 0.02));
  const nb = bad.filter(Boolean).length;
  if (!nb) return ws;
  const len = (o) => Math.max(1, (o.w.match(/[\p{L}\p{N}]/gu) || []).length) + 1;
  const spread = (a, b, t0, t1) => { let W = 0; for (let k = a; k <= b; k++) W += len(ws[k]); let acc = 0; for (let k = a; k <= b; k++) { ws[k].s = t0 + (t1 - t0) * acc / W; acc += len(ws[k]); ws[k].e = t0 + (t1 - t0) * acc / W; } };
  if (nb > n / 2) { spread(0, n - 1, Math.min(ws[0].s, end - 0.1 * n), end); return ws; }
  for (let k = 0; k < n; k++) {
    if (!bad[k]) continue;
    let j = k; while (j + 1 < n && bad[j + 1]) j++;
    let t0 = k ? ws[k - 1].e : start, t1 = j + 1 < n ? ws[j + 1].s : end;
    if (t1 - t0 < MIN * (j - k + 1) && k) { t0 = ws[k - 1].s + (ws[k - 1].e - ws[k - 1].s) / 2; ws[k - 1].e = t0; } // take time from the word before
    if (t1 - t0 < MIN * (j - k + 1)) t1 = Math.min(end, t0 + MIN * (j - k + 1));
    spread(k, j, t0, Math.max(t1, t0 + 0.01));
    k = j;
  }
  return ws;
}
// how much of each word is sung at time t (0…1) – the karaoke colour moves smoothly across the word
// A short gap between two words of a line (< 0.3 s) is not a pause: the colour keeps moving through it at the
// word's own speed, so it never stops and jumps. ease 'smooth': each word starts and ends its fill gently.
const FILL_BRIDGE = 0.3;
function wordFill(words, t, ease) {
  return words.map((o, k) => {
    const nx = words[k + 1];
    const e = nx && nx.s > o.e && nx.s - o.e < FILL_BRIDGE ? nx.s : o.e;
    if (t <= o.s) return 0;
    if (t >= e) return 1;
    const f = (t - o.s) / Math.max(0.01, e - o.s);
    return ease === 'smooth' ? f * f * (3 - 2 * f) : f;
  });
}
// the word being spoken at time t (-1 before the first word)
function wordAt(words, t) {
  let k = -1;
  for (let i = 0; i < words.length; i++) if (words[i].s <= t) k = i; else break;
  return k;
}
// short groups of words for "pop-up words" captions: up to max words, a new group after punctuation
function popChunks(words, max) {
  max = max || 3;
  const out = []; let cur = [];
  words.forEach((o, i) => {
    cur.push(i);
    const letters = cur.reduce((n, j) => n + words[j].w.length, 0);
    if (cur.length >= max || /[.,!?;:…、。，！？]$/.test(o.w) || letters > 16) { out.push(cur); cur = []; }
  });
  if (cur.length) out.push(cur);
  return out;
}
const CAP_PRESETS = {
  classic: { name: 'Classic', size: 5, pos: 'bottom', color: '#ffffff', bg: 'box', chars: 42, anim: 'none', hl: '#ffd400', font: 'normal', upper: false, ol: '#000000' },
  tiktok: { name: 'TikTok bold', size: 7, pos: 'middle', color: '#ffffff', bg: 'shadow', chars: 32, anim: 'highlight', hl: '#ffd400', font: 'heavy', upper: true, ol: '#000000' },
  pop: { name: 'Pop-up words', size: 10, pos: 'middle', color: '#ffffff', bg: 'shadow', chars: 32, anim: 'pop', hl: '#3ee07a', font: 'heavy', upper: true, ol: '#000000' },
  karaoke: { name: 'Karaoke', size: 6, pos: 'bottom', color: '#ffffff', bg: 'shadow', chars: 42, anim: 'fill', hl: '#33c3ff', font: 'heavy', upper: false, ol: '#000000' },
  karaoke2: { name: 'Karaoke – 2 lines', size: 6.5, pos: 'bottom', color: '#ffffff', bg: 'shadow', chars: 42, anim: 'karaoke2', hl: '#1e6bff', font: 'heavy', upper: false, ol: '#0a1a4a', olHl: '#ffffff', leadIn: true },
  boxed: { name: 'Box highlight', size: 6, pos: 'bottom', color: '#ffffff', bg: 'box', chars: 32, anim: 'highlight', hl: '#ff5ca8', font: 'heavy', upper: false, ol: '#000000' },
};
const STYLE_DEFAULT = { size: 5, pos: 'bottom', color: '#ffffff', bg: 'box', chars: 42, anim: 'none', hl: '#ffd400', font: 'normal', upper: false,
  family: '', dx: 0, dy: 0, ol: '#000000', olHl: '#ffffff', leadIn: true, leadGap: 8, kOff: 0.1,
  // two-line karaoke, each row on its own: move (% of the picture), text size and width (%)
  k2uX: 0, k2uY: 0, k2uSize: 100, k2uWide: 100, k2lX: 0, k2lY: 0, k2lSize: 100, k2lWide: 100,
  // where a line sits across the picture: 1 line centred; 2 lines upper on the left, lower on the right
  align: 'center', k2uAlign: 'left', k2lAlign: 'right', ease: 'linear', sigShape: 'dot', sigSize: 150,
  // effects (in the saved video they are Pro): line effect, glow, outline thickness (%), two-colour fill, duet colours
  fx: 'none', glow: 0, olw: 100, grad: false, hl2: '#ffffff', duetA: '#2f7dff', duetB: '#ff4fa3', duetAB: '#b45cff',
  // title card, video shape, background (colour + darkening of a picture)
  titleOn: false, titleText: '', titleBy: '', titleMusic: '', titleSecs: 5, out: 'source', bgColor: '#000000', bgDim: 30,
  // interlude screen, your logo, second-language line, beat karaoke (singer's voice %, key in semitones, speed)
  intOn: false, intText: '', logoOn: false, logoPos: 'tr', logoSize: 12, logoAlpha: 85, trOn: false, trSize: 60, trColor: '#e5e7eb',
  beatVoice: 0, beatKey: 0, beatTempo: 1 };

// ---------- two-line karaoke (lyrics videos) ----------
// Lines take turns in an upper row (left) and a lower row (right). The next line is already shown in the free row
// so the singer can read ahead; a line goes away shortly after it is sung. After a break of `gap` seconds a new
// block starts in the upper row, with a lead-in countdown (4 dots) before its first word.
const KARAOKE = { gap: 8, lead: 3, ahead: 6, hold: 0.5, minLead: 0.8 };
function karaokePlan(list, o) {
  o = Object.assign({}, KARAOKE, o);
  const plan = list.map((c, i) => ({ row: 0, block: !i || c.start - list[i - 1].end >= o.gap, appear: c.start, remove: c.end, lead: null }));
  plan.forEach((p, i) => { if (!p.block) p.row = 1 - plan[i - 1].row; });
  plan.forEach((p, i) => {
    const c = list[i];
    let rm = c.end + o.hold;
    // the row is needed by the line after next
    if (list[i + 2] && !plan[i + 1].block && !plan[i + 2].block) rm = Math.min(rm, Math.max(c.end, list[i + 2].start - 0.25));
    if (list[i + 1] && plan[i + 1].block) rm = Math.min(rm, Math.max(c.end, list[i + 1].start - Math.min(o.lead, o.gap - o.hold)));
    p.remove = rm;
  });
  // the last two lines of a part (before an interlude and at the end of the song) stay on screen together
  // until the last one has been sung
  plan.forEach((p, i) => {
    if (p.block || !list[i]) return;
    const last = !list[i + 1] || plan[i + 1].block;
    if (last) { const q = plan[i - 1]; if (q && q.row !== p.row) q.remove = Math.max(q.remove, p.remove); }
  });
  plan.forEach((p, i) => {
    const c = list[i];
    if (p.block) {
      const room = i ? c.start - plan[i - 1].remove : c.start;
      const lead = Math.max(0, Math.min(o.lead, room));
      p.appear = c.start - lead;
      if (o.leadIn && lead >= o.minLead) p.lead = { from: c.start - lead, to: c.start };
    } else {
      // the first two lines of a part (start of the song, after an interlude) appear together
      if (plan[i - 1].block) p.appear = Math.min(c.start, plan[i - 1].appear);
      else p.appear = Math.min(c.start, Math.max(plan[i - 2].remove, c.start - o.ahead));
    }
  });
  return plan;
}
// One-line karaoke: lead-in countdown before the first line and before every line after a break of `gap` seconds.
function lineLeads(list, o) {
  o = Object.assign({}, KARAOKE, o);
  return list.map((c, i) => {
    const room = i ? c.start - list[i - 1].end : c.start;
    if (i && room < o.gap) return null;
    const lead = Math.min(o.lead, room - (i ? 0.3 : 0));
    return lead >= o.minLead ? { from: c.start - lead, to: c.start } : null;
  });
}
// lines on screen at time t: [{ i, row }]
function karaokeVisible(plan, t) {
  const out = [];
  plan.forEach((p, i) => { if (t >= p.appear && t < p.remove) out.push({ i, row: p.row }); });
  return out;
}
// lead-in countdown: how many of the 4 dots are still shown at time t
function leadDots(lead, t) {
  if (!lead || t < lead.from || t >= lead.to) return 0;
  return Math.max(1, Math.min(4, Math.ceil(4 * (lead.to - t) / (lead.to - lead.from))));
}

// ---------- Tap timing (exact line / word times by hand, Sayatoo style) ----------
// word times worth keeping: every word has its own time, in order, and they cover the line
function goodWt(wt, dur) {
  const n = wt.length;
  if (!n || !(dur > 0)) return false;
  for (let k = 0; k < n; k++) {
    const [a, b] = wt[k];
    if (!(b - a >= Math.min(0.08, dur / n * 0.3)) || (k && a < wt[k - 1][0] + 0.03) || b > dur + 0.05) return false;
  }
  return wt[0][0] <= dur * 0.35 && wt[n - 1][1] >= dur * 0.6;
}
// Words of a line spread over [s, e] by syllable length (Vietnamese: every space-separated word is a syllable).
// Returns times relative to s, the same form as cue.wt.
function spreadWords(text, s, e) {
  const ws = capWords(text);
  if (!ws.length) return null;
  const span = Math.max(0.05, e - s);
  const wts = ws.map((o) => Math.max(1, (o.w.match(/[\p{L}\p{N}]/gu) || []).length) + 1);
  const tot = wts.reduce((a, b) => a + b, 0);
  let acc = 0;
  return ws.map((_, k) => { const a = span * acc / tot; acc += wts[k]; return [round3(a), round3(span * acc / tot)]; });
}
// recs: what the user tapped, in order: { i (line), s, e (hold mode), w: [word starts] (word mode) }.
// o: { mode: 'hold' | 'tap' | 'word', gap, stop (time the user stopped), oldWt: { [i]: { wt, dur } } }.
// Returns [{ i, start, end, wt }] – times of every tapped line, words included.
function buildTapCues(texts, recs, o) {
  o = Object.assign({ mode: 'hold', gap: 0.12 }, o);
  const out = [];
  recs.forEach((r, k) => {
    const text = texts[r.i] || '', n = capWords(text).length;
    const nx = recs[k + 1];
    const nextS = nx ? (nx.w ? nx.w[0] : nx.s) : Infinity;
    const guess = Math.min(8, Math.max(1.2, n * 0.5 + 0.8));
    let start, end, wt = null;
    if (o.mode === 'word' && r.w && r.w.length) {
      const w = r.w.slice().sort((a, b) => a - b);
      start = w[0];
      const avg = w.length > 1 ? (w[w.length - 1] - w[0]) / (w.length - 1) : 0.5;
      const abs = [];
      for (let j = 0; j < n; j++) {
        const ws = j < w.length ? w[j] : abs[j - 1][1];
        const we = j + 1 < w.length ? Math.max(ws + 0.05, w[j + 1] - 0.02) : ws + Math.max(0.4, Math.min(1.5, avg * 1.2));
        abs.push([ws, we]);
      }
      end = Math.min(abs[n - 1][1], nextS - o.gap);
      if (o.stop != null && !nx) end = Math.min(end, Math.max(o.stop, abs[Math.min(n, w.length) - 1][0] + 0.3));
      end = Math.max(end, start + 0.3);
      wt = abs.map(([a, b]) => { const x = Math.min(end - start, Math.max(0, a - start)); return [round3(x), round3(Math.min(end - start, Math.max(x, b - start)))]; });
    } else {
      start = r.s;
      if (o.mode === 'hold' && r.e != null) end = r.e;
      else end = nx ? nextS - o.gap : o.stop != null && o.stop > start + 0.3 ? Math.min(o.stop, start + guess) : start + guess;
      end = Math.max(start + 0.3, Math.min(end, nextS - 0.02));
      const old = o.oldWt && o.oldWt[r.i];
      if (old && Array.isArray(old.wt) && old.wt.length === n && old.dur > 0 && goodWt(old.wt, old.dur)) { const f = (end - start) / old.dur; wt = old.wt.map(([a, b]) => [round3(a * f), round3(b * f)]); }
      else wt = spreadWords(text, start, end);
    }
    out.push({ i: r.i, start: round3(start), end: round3(end), wt });
  });
  return out;
}
// Tapped lines: put the first word on the nearest clear rise of the voice band (−0.3…+0.25 s from the key),
// and show the line SHOW_BEFORE earlier than its first word (never into the line before).
function tapToVoice(got, env) {
  return got.map((r, k) => {
    let first = r.start + (r.wt && r.wt[0] ? r.wt[0][0] : 0);
    const prevEnd = k ? got[k - 1].end : 0;
    if (env && env.length) {
      const at = (t) => Math.max(0, Math.min(env.length - 1, Math.round(t * 100)));
      const mean = (a, b) => { a = Math.max(0, a); b = Math.min(env.length, b); let x = 0; for (let q = a; q < b; q++) x += env[q]; return b > a ? x / (b - a) : 0; };
      let peak = 0; for (let q = at(first - 0.3); q < at(first + 1.2); q++) peak = Math.max(peak, env[q]);
      let best = -1, bd = 9;
      if (peak > 1e-4) for (let q = at(Math.max(prevEnd, first - 0.3)); q <= at(first + 0.25); q++) {
        const after = mean(q, q + 6), before = mean(q - 8, q);
        if (after >= peak * 0.35 && after / (before + peak * 0.03) >= 2.5 && Math.abs(q / 100 - first) < bd) { bd = Math.abs(q / 100 - first); best = q / 100; }
      }
      if (best >= 0) { // the exact rise: where the jump is strongest just there
        let br = 0, bt = best;
        for (let q = at(best); q <= at(best + 0.08); q++) { const rr = mean(q, q + 6) / (mean(q - 8, q) + peak * 0.03); if (rr > br) { br = rr; bt = q / 100; } }
        first = bt;
      }
    }
    const abs = (r.wt || [[0, r.end - r.start]]).map(([a, b]) => [r.start + a, r.start + b]);
    const d = first - abs[0][0];
    abs[0][0] = first;
    abs[0][1] = Math.max(first + 0.05, abs[0][1]);
    if (abs[1] && abs[1][0] < abs[0][1]) { abs[1][0] = abs[0][1]; abs[1][1] = Math.max(abs[1][1], abs[1][0] + 0.05); }
    void d;
    const start = Math.max(0, Math.min(first, Math.max(prevEnd, first - SHOW_BEFORE)));
    return { i: r.i, start: round3(start), end: r.end, wt: r.wt ? abs.map(([a, b]) => [round3(Math.max(0, a - start)), round3(Math.max(0, b - start))]) : null };
  });
}
// Move the start or end of line i by d seconds. follow: the lines after it move too.
// Moving only the start keeps the words where they are (the karaoke colour stays on the singing).
// A new start for a line typed or set by hand: the words keep their real time in the song (word times are kept
// relative to the line start, so they are moved back by the same amount) – the karaoke colour must not start early.
// New times for a line. When the karaoke highlight follows time changes (Options), the words keep their rhythm
// but are fitted to the new start and end; otherwise they keep their real time in the song (moveStart).
function retime(c, ns, ne) {
  if (ui.hlFollow && validWt(c)) return fitWords(c, ns, ne);
  const o = moveStart(c, ns); o.end = ne; return o;
}
function fitWords(c, ns, ne) {
  const o = Object.assign({}, c, { start: ns, end: ne });
  if (!validWt(c)) return o;
  const oldDur = Math.max(0.05, c.end - c.start), dur = Math.max(0.05, ne - ns), f = dur / oldDur;
  o.wt = c.wt.map(([a, b]) => { const x = Math.min(dur, a * f); return [round3(x), round3(Math.min(dur, Math.max(x, b * f)))]; });
  return o;
}
function moveStart(c, ns) {
  const o = Object.assign({}, c, { start: ns });
  if (validWt(c)) { const dd = ns - c.start; o.wt = c.wt.map(([a, b]) => [round3(Math.max(0, a - dd)), round3(Math.max(0, b - dd))]); }
  return o;
}
function nudgeCue(list, i, edge, d, follow) {
  if (!list[i]) return list;
  const next = list.map((c) => Object.assign({}, c));
  const c = next[i];
  if (edge === 'start') {
    if (follow) {
      const dd = Math.max(-c.start, d);
      for (let k = i; k < next.length; k++) { next[k].start = round3(Math.max(0, next[k].start + dd)); next[k].end = round3(Math.max(next[k].start + 0.2, next[k].end + dd)); }
    } else {
      const ns = round3(Math.max(0, Math.min(c.end - 0.2, c.start + d)));
      next[i] = retime(c, ns, c.end);
      if (i > 0 && next[i - 1].end > ns) next[i - 1].end = Math.max(next[i - 1].start + 0.2, ns);
    }
  } else {
    const ne = round3(Math.max(c.start + 0.2, c.end + d));
    const dd = ne - c.end, old = Object.assign({}, c);
    c.end = ne;
    if (follow) for (let k = i + 1; k < next.length; k++) { next[k].start = round3(Math.max(0, next[k].start + dd)); next[k].end = round3(next[k].end + dd); }
    else if (next[i + 1] && ne > next[i + 1].start) c.end = Math.max(c.start + 0.2, next[i + 1].start);
    if (ui.hlFollow && validWt(old)) next[i] = fitWords(old, c.start, c.end);
  }
  return tidy(next);
}

// ---------- vocal-band onsets ----------
// Loudness of the 300–3400 Hz band (where the voice is) every 10 ms. Bass, kick drum and hiss count much less,
// so the moment a sung line starts shows up more clearly than in the plain loudness.
function vocalEnvelope(samples) {
  const biq = (type, f0) => {
    const w = 2 * Math.PI * f0 / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * 0.7071);
    const b = type === 'hp' ? [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2] : [(1 - cs) / 2, 1 - cs, (1 - cs) / 2];
    const a0 = 1 + al;
    return { b0: b[0] / a0, b1: b[1] / a0, b2: b[2] / a0, a1: -2 * cs / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
  };
  const hp = biq('hp', 300), lp = biq('lp', 3400);
  const step = (f, x) => { const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2; f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y; return y; };
  const F = SR / 100, n = Math.floor(samples.length / F), env = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = k * F; i < (k + 1) * F; i++) { const y = step(lp, step(hp, samples[i])); sum += y * y; }
    env[k] = Math.sqrt(sum / F);
  }
  return env;
}
// Lyrics lines: move the start of each line onto a clear rise of the voice band, at most 0.3 s away and never
// into the line before. Only the first word moves; lines without a clear onset stay as they are.
function snapLineStarts(list, env) {
  if (!env || !env.length) return list;
  const at = (t) => Math.max(0, Math.min(env.length - 1, Math.round(t * 100)));
  const mean = (a, b) => { a = Math.max(0, a); b = Math.min(env.length, b); let x = 0; for (let k = a; k < b; k++) x += env[k]; return b > a ? x / (b - a) : 0; };
  // strong rises of the voice band between a and b (s), at least 0.15 s apart
  const onsets = (a, b, peak) => {
    const out = [];
    for (let k = at(a); k <= at(b); k++) {
      const after = mean(k, k + 6), before = mean(k - 8, k), r = after / (before + peak * 0.03);
      if (after < peak * 0.35 || r < 2.5) continue;
      const last = out[out.length - 1];
      if (last && k / 100 - last.t < 0.15) { if (r > last.r) { last.t = k / 100; last.r = r; } continue; }
      out.push({ t: k / 100, r });
    }
    return out.map((x) => x.t);
  };
  return list.map((c, i) => {
    // The first word(s) of the line were not heard and were only guessed: their real start is the last voice
    // onsets before the first word that was heard (one onset per guessed word) – never earlier than the voice.
    if (validWt(c) && Array.isArray(c.wm) && c.wm[0] === 0 && c.wm.indexOf(1) > 0) {
      const k = c.wm.indexOf(1), S0 = c.start, hiT = S0 + c.wt[k][0] - 0.12;
      const loT = Math.max(i ? list[i - 1].end - SHOW_BEFORE + 0.05 : 0, hiT - 0.8 * k - 0.3); // a sung word is short: not seconds before the next
      let peak = 0; for (let f = at(loT); f < at(hiT + 1.5); f++) peak = Math.max(peak, env[f]);
      const on = peak > 1e-4 && hiT > loT ? onsets(loT, hiT, peak) : [];
      if (on.length >= k) {
        const st = on.slice(-k), abs = c.wt.map(([a, b]) => [S0 + a, S0 + b]);
        st.forEach((t, j) => { abs[j][0] = t; abs[j][1] = j + 1 < k ? st[j + 1] - 0.02 : Math.max(t + 0.05, Math.min(abs[j][1], abs[k][0] - 0.02)); });
        const ns = Math.max(0, i ? Math.min(st[0], Math.max(list[i - 1].end, st[0] - SHOW_BEFORE)) : st[0] - SHOW_BEFORE);
        const o = Object.assign({}, c, { start: round3(ns) });
        o.wt = abs.map(([a, b]) => [round3(Math.max(0, a - ns)), round3(Math.max(0, b - ns))]);
        return o;
      }
    }
    if (validWt(c) && Array.isArray(c.wm) && c.wm.length === c.wt.length && c.wm.every((x) => x === 0)) {
      const S0 = c.start, t = S0 + c.wt[0][0];
      const pv = i ? list[i - 1] : null, pEnd = pv ? (validWt(pv) ? pv.start + pv.wt[pv.wt.length - 1][1] : pv.end - SHOW_AFTER) : 0;
      const nx = list[i + 1] ? list[i + 1].start : Infinity;
      const loT = Math.max(pEnd + 0.15, t - 0.3), hiT = Math.min(t + 3, nx - 1);
      let peak = 0; for (let f = at(loT); f < at(hiT + 1); f++) peak = Math.max(peak, env[f]);
      const on = (peak > 1e-4 && hiT > loT ? onsets(loT, hiT, peak) : []).filter((x) => mean(at(x), at(x) + 25) >= peak * 0.3); // a real sung start, not a click
      if (on.length && on[0] > t + 0.1) {
        const d = on[0] - t, o = Object.assign({}, c, { start: round3(c.start + d), end: round3(Math.min(c.end + d, Math.max(c.end, nx - 0.05))) });
        o.wm = c.wm.slice(); o.wm[0] = 2; // its first word now sits on the voice: an anchor for the words after it
        return o; // the words keep their places in the line (relative times)
      }
    }
    const w0 = validWt(c) ? c.wt[0] : [Math.min(SHOW_BEFORE, (c.end - c.start) / 2), Math.min(c.end - c.start, SHOW_BEFORE + 0.4)];
    const t = c.start + w0[0];
    const lo = Math.max(t - 0.25, i ? list[i - 1].end - SHOW_BEFORE + 0.05 : 0), hi = Math.min(t + 0.3, c.start + w0[1] - 0.1, c.end - 0.3);
    if (hi <= lo) return c;
    let peak = 0;
    for (let k = at(t); k < at(t + 1); k++) peak = Math.max(peak, env[k]);
    if (peak < 1e-4) return c;
    let best = -1, bestR = 2.5;
    for (let k = at(lo); k <= at(hi); k++) {
      const after = mean(k, k + 6), before = mean(k - 8, k);
      const r = after / (before + peak * 0.03);
      if (after >= peak * 0.35 && r > bestR) { bestR = r; best = k / 100; }
    }
    // Whisper often gives a line's first word the quiet moment before it as well (a word "0.8–1.2 s long"): when the
    // voice band is low there and rises clearly further in, the word starts at that rise.
    const fw = w0[1] - w0[0];
    if (fw >= 0.55) {
      const hi2 = Math.min(t + 0.9, c.start + w0[1] - 0.15, c.end - 0.3);
      let pk2 = 0; for (let k = at(t); k < at(c.start + w0[1] + 0.5); k++) pk2 = Math.max(pk2, env[k]);
      const need = best < 0 ? 2.5 : bestR * 1.2;
      for (let k = at(Math.max(hi, t + 0.3)); k <= at(hi2); k++) {
        const after = mean(k, k + 6), before = mean(k - 8, k), r = after / (before + pk2 * 0.03);
        if (after >= pk2 * 0.5 && mean(k, k + 20) >= pk2 * 0.5 && r > need) { best = k / 100; break; }
      }
    }
    if (best < 0 || Math.abs(best - t) < 0.03) return c;
    const d = best - t, o = Object.assign({}, c, { start: round3(Math.max(0, c.start + d)) });
    const dd = o.start - c.start;
    if (validWt(c)) o.wt = c.wt.map(([a, b], k) => (k ? [round3(Math.max(0, a - dd)), round3(Math.max(0, b - dd))] : [a, round3(Math.max(a + 0.05, b - dd))]));
    return o;
  });
}
// The other words of a line: start on a clear rise of the voice band near Whisper's time (same careful rule:
// −0.1…+0.2 s, never before the word before). The last word is held as long as the voice holds the note.
function snapWordStarts(list, env) {
  if (!env || !env.length) return list;
  const at = (t) => Math.max(0, Math.min(env.length - 1, Math.round(t * 100)));
  const mean = (a, b) => { a = Math.max(0, a); b = Math.min(env.length, b); let x = 0; for (let k = a; k < b; k++) x += env[k]; return b > a ? x / (b - a) : 0; };
  return list.map((c, ci) => {
    if (!validWt(c) || c.wt.length < 1) return c;
    const wt = c.wt.map((p) => p.slice()), S0 = c.start;
    let peak = 0;
    for (let k = at(S0); k < at(c.end); k++) peak = Math.max(peak, env[k]);
    if (peak < 1e-4) return c;
    for (let i = 1; i < wt.length; i++) {
      // a heard word moves at most 0.2 s; a word placed between heard ones may be further off (0.4 s)
      const far = Array.isArray(c.wm) && c.wm[i] === 0 ? 0.4 : 0.2;
      const s = S0 + wt[i][0], lo = Math.max(s - (far > 0.2 ? 0.25 : 0.1), S0 + wt[i - 1][0] + 0.1), hi = Math.min(s + far, S0 + wt[i][1] - 0.06);
      if (hi <= lo) continue;
      let best = -1, bestR = 2.5;
      for (let k = at(lo); k <= at(hi); k++) {
        const after = mean(k, k + 5), before = mean(k - 6, k), r = after / (before + peak * 0.03);
        if (after >= peak * 0.35 && r > bestR) { bestR = r; best = k / 100; }
      }
      if (best < 0 || Math.abs(best - s) < 0.03) continue;
      const ns = round3(best - S0);
      if (wt[i - 1][1] > ns || Math.abs(wt[i - 1][1] - wt[i][0]) < 0.03) wt[i - 1][1] = Math.max(wt[i - 1][0] + 0.05, ns - 0.01);
      wt[i][0] = ns;
    }
    // sustained last syllable
    const L = wt.length - 1, ls = S0 + wt[L][0];
    let wp = 0; for (let k = at(ls); k < at(S0 + wt[L][1]); k++) wp = Math.max(wp, env[k]);
    const nextS = list[ci + 1] ? list[ci + 1].start + SHOW_BEFORE - 0.1 : Infinity;
    let e = S0 + wt[L][1];
    // while the voice band stays at ≥ 40 % of the word's own level and does not jump up (a new instrument, the outro)
    // (a dip shorter than 0.15 s – a breath, the gap after the word before – does not end it)
    if (wp > peak * 0.3) {
      let prevL = Math.max(mean(at(e) - 3, at(e)), wp * 0.5), t = e, low = 0;
      const lim = Math.min(ls + MAX_HOLD_HEARD, nextS);
      while (t < lim) {
        const l = mean(at(t), at(t) + 3);
        if (l > Math.max(prevL, wp * 0.5) * 1.6) break;
        if (l < wp * 0.4) { if (++low > 5) break; } else { low = 0; e = t + 0.03; prevL = prevL * 0.5 + l * 0.5; }
        t += 0.03;
      }
    }
    const o = Object.assign({}, c);
    if (e > S0 + wt[L][1] + 0.05) { wt[L][1] = round3(e - S0); o.end = round3(Math.max(c.end, Math.min(e + 0.15, nextS - 0.05))); }
    o.wt = wt.map(([a, b]) => [round3(a), round3(Math.max(a + 0.03, b))]);
    return o;
  });
}
// lyrics mode: align the user's lines to the recognised words, then put each line and word start on the voice
function lyricsCues(script, heard, maxChars, maxSec, total, samples) {
  const out = alignScript(script, heard, maxChars, maxSec, total);
  if (!samples || !samples.length) return out.map((c) => { delete c.wm; return c; });
  const env = vocalEnvelope(samples);
  return tidy(snapWordStarts(chainUnheard(snapLineStarts(out, env), env), env)).map((c) => { delete c.wm; return c; });
}
// Place K words on syllable starts. cands: [{t, w}] sorted (w = how clear the start is); t0: the word before; lim: no
// word at or after this. firsts[i]: word i begins a new line (the step into it is a line gap, not a word step).
// W0 / W1: the song's usual word step and line gap. Words without a clear start go evenly between their neighbours.
function placeOnSyllables(K, firsts, cands, t0, lim, W0, W1) {
  const CC = cands.filter((c) => c.t > t0 + 0.12 && c.t < lim - 0.1), C = CC.map((c) => c.t), CW = CC.map((c) => c.w), N = C.length;
  const skipC = (a, b) => { let x = 0; for (let q = a; q < b; q++) x += CW[q]; return x; };
  const exp = (a, b) => { let e = 0; for (let i = a; i <= b; i++) e += firsts[i] ? W1 : W0; return e; };
  const span = (d, a, b) => { if (d < 0.12 * (b - a + 1)) return Infinity; const l = Math.log(d / exp(a, b)); return l * l * (b === a && firsts[a] ? 0.4 : 1); };
  const SKIPW = 1;
  const dp = Array.from({ length: K }, () => new Float64Array(N).fill(Infinity)), bi = Array.from({ length: K }, () => new Int32Array(N).fill(-1)), bc = Array.from({ length: K }, () => new Int32Array(N).fill(-1));
  for (let i = 0; i < K; i++) for (let j = 0; j < N; j++) {
    let best = span(C[j] - t0, 0, i) + SKIPW * i + skipC(0, j), BI = -1, BC = -1;
    for (let ip = 0; ip < i; ip++) for (let q = 0; q < j; q++) { const v = dp[ip][q]; if (v === Infinity) continue; const c = v + span(C[j] - C[q], ip + 1, i) + SKIPW * (i - ip - 1) + skipC(q + 1, j); if (c < best) { best = c; BI = ip; BC = q; } }
    dp[i][j] = best; bi[i][j] = BI; bc[i][j] = BC;
  }
  let bv = Infinity, BI = -1, BJ = -1;
  for (let i = 0; i < K; i++) for (let j = 0; j < N; j++) { const v = dp[i][j] + SKIPW * (K - 1 - i); if (v < bv) { bv = v; BI = i; BJ = j; } }
  if (BI < 0) return null;
  const out = new Array(K).fill(null);
  for (let i = BI, j = BJ; i >= 0;) { out[i] = C[j]; const ni = bi[i][j], nj = bc[i][j]; i = ni; j = nj; }
  let pT = t0, pI = -1;
  for (let k = 0; k <= K; k++) {
    if (k < K && out[k] == null) continue;
    for (let m = pI + 1; m < k; m++) out[m] = k < K ? pT + (out[k] - pT) * (m - pI) / (k - pI) : Math.min(lim - 0.1, pT + exp(pI + 1, m));
    if (k < K) { pT = out[k]; pI = k; }
  }
  for (let k = 1; k < K; k++) if (!(out[k] > out[k - 1] + 0.05)) return null;
  return out;
}
// Words Whisper did not hear at all (in loud music it sometimes hears nothing and only guesses) are put on the
// syllable starts of the voice band – a run after the last heard word, or at the very start of the song a run before
// the first heard word – with the song's own pace (taken from the words it did hear).
function chainUnheard(list, env) {
  if (!env || !env.length || !list.length) return list;
  const at = (t) => Math.max(0, Math.min(env.length - 1, Math.round(t * 100)));
  const mean = (a, b) => { a = Math.max(0, a); b = Math.min(env.length, b); let x = 0; for (let k = a; k < b; k++) x += env[k]; return b > a ? x / (b - a) : 0; };
  const sm = (k) => mean(k - 1, k + 2);
  const syllables = (from, to) => { // dips of the voice band followed by voice: the start of a sung syllable
    let pk = 0; for (let k = at(from - 0.5); k < at(to + 0.8); k++) pk = Math.max(pk, env[k]);
    const out = []; if (pk < 1e-4 || to <= from) return out;
    for (let k = at(from); k <= at(to); k++) {
      const v = sm(k); if (!(v <= sm(k - 1) && v < sm(k + 1))) continue;
      let L = 0, R = 0; for (let j = k - 15; j < k; j++) L = Math.max(L, sm(j)); for (let j = k + 1; j <= k + 15; j++) R = Math.max(R, sm(j));
      const d = v / Math.max(1e-9, Math.min(L, R)); if (d >= 0.62 || R < pk * 0.3) continue;
      const t = k / 100 + 0.03, l = out[out.length - 1];
      if (l && t - l.t < 0.1) { if (d < l.d) { l.t = t; l.d = d; } continue; }
      out.push({ t, d });
    }
    out.forEach((c) => (c.w = Math.max(0.1, (0.85 - c.d) * 3)));
    return out;
  };
  const W = [];
  list.forEach((c, ci) => {
    if (!validWt(c) || !Array.isArray(c.wm) || c.wm.length !== c.wt.length) { W.push(null); return; }
    c.wt.forEach((q, k) => W.push({ ci, k, s: c.start + q[0], e: c.start + q[1], heard: c.wm[k] === 1 || c.wm[k] === 2, voice: c.wm[k] === 2, moved: false }));
  });
  // the song's pace from the heard words: word step inside a line, and the step from a line's last word to the next line
  const steps = [], gaps = [];
  for (let i = 1; i < W.length; i++) { const a = W[i - 1], b = W[i]; if (!a || !b || !a.heard || !b.heard) continue; (b.k === 0 ? gaps : steps).push(b.s - a.s); }
  const med = (x, d) => { if (x.length < 5) return d; const y = x.slice().sort((p, q) => p - q); return y[y.length >> 1]; };
  const W0 = Math.max(0.25, Math.min(1.2, med(steps, 0.5))), W1 = Math.max(0.8, Math.min(5, med(gaps, 2)));
  // only when Whisper heard most of the song (a weak model hears too little for this to be better than its guess)
  const real = W.filter((w) => w), heardShare = real.filter((w) => w.heard && !w.voice).length / Math.max(1, real.length);
  if (heardShare < 0.6) return list;
  // the song starts with a line only put on the voice (not heard): it may really start earlier – when its words would
  // otherwise be squeezed together, it is placed going back from the first heard word
  if (W[0] && W[0].voice) { let b = 0; while (b + 1 < W.length && W[b + 1] && !(W[b + 1].heard && !W[b + 1].voice)) b++; const n = W[b + 1]; if (n && (n.s - W[0].s) / (b + 1) < 0.9 * W0) W[0].heard = false; }
  for (let a = 0; a < W.length; a++) {
    if (!W[a] || W[a].heard) continue;
    let b = a; while (b + 1 < W.length && W[b + 1] && !W[b + 1].heard) b++;
    const prev = a > 0 ? W[a - 1] : null, next = b + 1 < W.length ? W[b + 1] : null, K = b - a + 1;
    // (only before a long instrumental break or the end: there the guess puts the lines right after the last heard word)
    if (K >= 4 && prev && prev.heard && (next && next.heard ? next.s : Infinity) - W[b].e > 8) {
      const lim = next && next.heard ? next.s - 0.1 : prev.s + (K + 2) * W0 * 3;
      const firsts = []; for (let j = a; j <= b; j++) firsts.push(W[j].k === 0);
      const r = placeOnSyllables(K, firsts, syllables(prev.s + 0.1, lim), prev.s, lim, W0, W1);
      if (r) r.forEach((t, i) => { W[a + i].s = t; W[a + i].moved = true; });
    } else if (K >= 4 && !prev && next && next.heard) {
      // mirrored in time: going back from the first heard word
      const lo = Math.max(0, next.s - W1 - K * W0 * 1.6), cs = syllables(lo, next.s - 0.1).map((c) => ({ t: -c.t, w: c.w })).reverse();
      const firsts = []; for (let j = b; j >= a; j--) firsts.push(W[j + 1] ? W[j + 1].k === 0 : false);
      const r = placeOnSyllables(K, firsts, cs, -next.s, -lo, W0, W1);
      if (r) r.forEach((t, i) => { W[b - i].s = -t; W[b - i].moved = true; });
    }
    a = b;
  }
  if (!W.some((w) => w && w.moved)) return list;
  for (let i = 0; i < W.length; i++) {
    const w = W[i]; if (!w) continue;
    const n = W[i + 1];
    if (w.moved || (n && n.moved)) { const nx = n ? n.s - 0.02 : w.s + 0.6; w.e = Math.max(w.s + 0.05, Math.min(nx, w.s + 1.5)); }
  }
  const out = list.map((c) => Object.assign({}, c));
  const byCue = new Map(); W.forEach((w) => { if (w) { if (!byCue.has(w.ci)) byCue.set(w.ci, []); byCue.get(w.ci).push(w); } });
  for (const [ci, ws] of byCue) {
    if (!ws.some((w) => w.moved)) continue;
    const c = out[ci], first = ws[0].s, last = ws[ws.length - 1];
    let st = first - SHOW_BEFORE;
    if (ci > 0) st = Math.max(st, Math.min(out[ci - 1].end, first - 0.05));
    c.start = round3(Math.max(0, st));
    c.end = round3(Math.max(last.e + SHOW_AFTER, c.start + 0.5));
    if (out[ci + 1] && c.end > out[ci + 1].start && !(byCue.get(ci + 1) || []).some((w) => w.moved)) c.end = round3(Math.max(last.e, out[ci + 1].start));
    c.wt = ws.map((w) => [round3(Math.max(0, w.s - c.start)), round3(Math.max(0, w.e - c.start))]);
    if (ci > 0 && out[ci - 1].end > c.start) out[ci - 1].end = round3(Math.max(out[ci - 1].start + 0.3, c.start));
  }
  return out;
}

// ---------- project files (.cpproj) ----------
const PROJECT_VER = 1;
function makeProject(d) {
  return JSON.stringify({
    app: 'CaptionPress', kind: 'project', version: PROJECT_VER, saved: new Date().toISOString(),
    video: d.video || null,
    subtitles: (d.cues || []).map((c) => { const o = { start: c.start, end: c.end, text: c.text }; if (validWt(c)) o.wt = c.wt; if (c.spk != null && c.spk >= 0) o.spk = c.spk; if (c.star) o.star = true; if (c.sing) o.sing = c.sing; return o; }),
    speakers: d.names || [], style: d.style || {}, lyrics: d.lyrics || '', translations: d.tr || {},
  }, null, 1);
}
// Returns { cues, names, style, lyrics, video } or throws a friendly error.
function readProject(text) {
  let p;
  try { p = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch (_) { throw new Error('This file is not a CaptionPress project.'); }
  if (!p || typeof p !== 'object' || p.app !== 'CaptionPress' || !Array.isArray(p.subtitles)) throw new Error('This file is not a CaptionPress project.');
  if (Number(p.version) > PROJECT_VER) throw new Error('This project was saved by a newer CaptionPress. Please update the app.');
  const cues = tidy(p.subtitles.filter((c) => c && typeof c === 'object').map((c) => {
    const o = { start: Number(c.start), end: Number(c.end), text: String(c.text == null ? '' : c.text).slice(0, 2000) };
    if (Number.isInteger(c.spk) && c.spk >= 0 && c.spk < 50) o.spk = c.spk;
    if (c.star === true) o.star = true;
    if (c.sing === 'a' || c.sing === 'b' || c.sing === 'ab') o.sing = c.sing;
    if (validWt(c)) o.wt = c.wt;
    return o;
  }));
  const st = {};
  const src = p.style && typeof p.style === 'object' ? p.style : {};
  for (const [k, v] of Object.entries(STYLE_DEFAULT)) if (k in src && typeof src[k] === typeof v) st[k] = src[k];
  const v = p.video && typeof p.video === 'object' ? { name: String(p.video.name || '').slice(0, 300), duration: Number(p.video.duration) || 0, size: Number(p.video.size) || 0 } : null;
  const tr = {};
  if (p.translations && typeof p.translations === 'object') for (const [k, x] of Object.entries(p.translations).slice(0, 5000)) if (typeof x === 'string' && x.trim()) tr[String(k).slice(0, 2000)] = x.slice(0, 2000);
  return { cues, names: Array.isArray(p.speakers) ? p.speakers.slice(0, 50).map((x) => String(x).slice(0, 80)) : [], style: st, lyrics: typeof p.lyrics === 'string' ? p.lyrics.slice(0, 200000) : '', video: v, tr };
}

// ---------- filler words and pauses ----------
// "um", "uh" and friends in the main languages; a word is removed only when it stands alone
const FILLERS = ['um', 'umm', 'uh', 'uhh', 'uhm', 'uhmm', 'er', 'erm', 'ah', 'ahh', 'hmm', 'hm', 'mm', 'mmm', 'eh', 'ehm', 'euh', 'heu', 'äh', 'ähm', 'öhm', 'ehh', 'ờ', 'ờm', 'ừm', 'ừ', 'ơ', 'à', 'ừa', 'em…'];
const fillerRe = new RegExp('(^|[\\s,(])(' + FILLERS.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=[\\s,.!?…)]|$)[,.…]*', 'giu');
function removeFillers(cues) {
  let count = 0;
  const out = [];
  cues.forEach((c) => {
    let t = String(c.text || '');
    const before = t;
    t = t.replace(fillerRe, (m, lead) => { count++; return lead === ',' ? ',' : lead; });
    t = t.replace(/,(\s*),/g, ',$1'); // tidy doubled commas
    // "we, uh, need" → "we need": a comma that only fenced the filler goes too
    if (/\b(um|uh|er|erm|ah|hmm|eh|ờ|ừm|à)\b,/iu.test(before)) t = t.replace(/(\p{L}),\s+(\p{Ll})/gu, (m, a, b, off) => (before.includes(a + ', ' + b) ? m : a + ' ' + b));
    if (t === before) { out.push(c); return; }
    t = t.split('\n').map((ln) => ln.replace(/\s{2,}/g, ' ').replace(/^[\s,]+/, '').replace(/\s+([,.!?…])/g, '$1').replace(/,\s*([.!?…])/g, '$1').replace(/,+/g, ',').trim()).filter(Boolean).join('\n');
    if (t && before.trimStart()[0] && before.trimStart()[0] === before.trimStart()[0].toUpperCase()) t = t.charAt(0).toUpperCase() + t.slice(1);
    if (t.replace(/[\s,.!?…]/g, '')) out.push(Object.assign({}, c, { text: t }));
  });
  return { cues: out, count };
}
// Long pauses in the sound: quiet stretches of at least minGap seconds. A little quiet (pad) is kept on each side.
function findPauses(samples, opts) {
  opts = opts || {};
  const minGap = opts.minGap || 0.8, pad = opts.pad == null ? 0.2 : opts.pad, F = Math.round(SR * 0.02);
  const n = Math.floor(samples.length / F);
  if (!n) return [];
  const lv = new Float32Array(n);
  for (let i = 0; i < n; i++) lv[i] = rms(samples, i * F, i * F + F);
  const sorted = Array.from(lv).sort((a, b) => a - b);
  const floor = sorted[Math.floor(n * 0.1)], loud = sorted[Math.floor(n * 0.9)] || 0.01;
  const th = Math.max(0.003, floor * 2.5, Math.min(loud * 0.08, floor + (loud - floor) * 0.06));
  const out = [];
  let s = -1;
  for (let i = 0; i <= n; i++) {
    const quiet = i < n && lv[i] < th;
    if (quiet && s < 0) s = i;
    if (!quiet && s >= 0) {
      const a = s * 0.02, b = i * 0.02;
      if (b - a >= minGap) {
        const ca = a === 0 ? 0 : a + pad, cb = i === n ? b : b - pad; // keep the start/end of the file trimmed fully
        if (cb - ca > 0.15) out.push({ start: Math.round(ca * 1000) / 1000, end: Math.round(cb * 1000) / 1000 });
      }
      s = -1;
    }
  }
  return out;
}
// the parts of the file that stay
function keepParts(duration, cuts) {
  const out = []; let t = 0;
  cuts.forEach((c) => { if (c.start > t + 0.01) out.push({ start: t, end: c.start }); t = Math.max(t, c.end); });
  if (duration > t + 0.01) out.push({ start: t, end: duration });
  return out;
}
// subtitle times after the pauses are cut out
function retimeCues(cues, cuts) {
  const map = (t) => { let d = 0; for (const c of cuts) { if (t >= c.end) d += c.end - c.start; else if (t > c.start) { d += t - c.start; break; } else break; } return Math.round((t - d) * 1000) / 1000; };
  return cues.map((c) => {
    const o = Object.assign({}, c, { start: map(c.start), end: map(c.end) });
    if (cuts.some((x) => x.start < c.end && x.end > c.start)) delete o.wt; // a pause inside the line was cut: word times no longer fit
    return o;
  }).filter((c) => c.end - c.start >= 0.2);
}
function cueAt(cues, t) {
  let lo = 0, hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].end <= t) lo = mid + 1;
    else if (cues[mid].start > t) hi = mid - 1;
    else return mid;
  }
  return -1;
}
function splitCue(cues, i, pos) {
  const c = cues[i];
  const flat = c.text.replace(/\n/g, ' ');
  if (pos == null || pos <= 0 || pos >= flat.length) {
    const mid = flat.length / 2;
    let best = -1;
    for (let k = 0; k < flat.length; k++) if (flat[k] === ' ' && (best < 0 || Math.abs(k - mid) < Math.abs(best - mid))) best = k;
    pos = best > 0 ? best : Math.floor(flat.length / 2);
  }
  const a = flat.slice(0, pos).trim(), b = flat.slice(pos).trim();
  if (!a || !b) return cues;
  let t = c.start + (c.end - c.start) * (a.length / (a.length + b.length));
  const na = capWords(a).length, keepWt = validWt(c) && na + capWords(b).length === c.wt.length && capWords(c.text).length === c.wt.length;
  if (keepWt && c.wt[na][0] > 0.05 && c.start + c.wt[na][0] < c.end - 0.05) t = c.start + c.wt[na][0];
  const out = cues.slice();
  const x = { start: c.start, end: round3(t), text: wrapText(a) }, y = { start: round3(t), end: c.end, text: wrapText(b) };
  if (keepWt) { const d = y.start - c.start; x.wt = c.wt.slice(0, na); y.wt = c.wt.slice(na).map(([p, q]) => [round3(Math.max(0, p - d)), round3(Math.max(0, q - d))]); }
  if (c.spk != null) { x.spk = c.spk; y.spk = c.spk; }
  if (c.star) x.star = true;
  if (c.sing) { x.sing = c.sing; y.sing = c.sing; }
  out.splice(i, 1, x, y);
  return out;
}
function mergeCue(cues, i) {
  if (i < 0 || i >= cues.length - 1) return cues;
  const a = cues[i], b = cues[i + 1];
  const out = cues.slice();
  const m = { start: a.start, end: b.end, text: wrapText(a.text.replace(/\n/g, ' ') + ' ' + b.text.replace(/\n/g, ' ')) };
  if (a.spk != null) m.spk = a.spk; else if (b.spk != null) m.spk = b.spk;
  if (a.star || b.star) m.star = true;
  if (a.sing || b.sing) m.sing = a.sing === b.sing ? a.sing : a.sing && b.sing ? 'ab' : a.sing || b.sing;
  if (validWt(a) && validWt(b)) { const d = b.start - a.start; m.wt = a.wt.concat(b.wt.map(([p, q]) => [round3(p + d), round3(q + d)])); }
  out.splice(i, 2, m);
  return out;
}
function shiftCues(cues, delta, fromIndex) {
  fromIndex = fromIndex || 0;
  return tidy(cues.map((c, i) => (i < fromIndex ? c : { ...c, start: Math.max(0, c.start + delta), end: Math.max(0.2, c.end + delta) })));
}
function replaceAll(cues, find, repl, matchCase) {
  if (!find) return { cues, count: 0 };
  const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
  let count = 0;
  const out = cues.map((c) => {
    const t = c.text.replace(re, () => { count++; return repl; });
    return t === c.text ? c : { ...c, text: t };
  });
  return { cues: out, count };
}
function rewrapAll(cues, maxChars) {
  return cues.map((c) => ({ ...c, text: wrapText(c.text.replace(/\n/g, ' '), maxChars) }));
}

// ---- Speakers (meeting notes) ----
// validated categorical order (light surface / dark surface)
const SPK_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const SPK_COLORS_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
// The piece of audio used to recognise the voice in each line (null when the line is too short).
function speakerPieces(cues, minLen, maxLen) {
  minLen = minLen || 0.5; maxLen = maxLen || 8;
  return cues.map((c) => {
    const d = c.end - c.start;
    if (!(d >= minLen)) return null;
    if (d <= maxLen) return { start: c.start, end: c.end };
    const mid = (c.start + c.end) / 2;
    return { start: mid - maxLen / 2, end: mid + maxLen / 2 };
  });
}
function unitVec(v) {
  let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const o = new Float32Array(v.length); for (let i = 0; i < v.length; i++) o[i] = v[i] / n;
  return o;
}
function dot(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; }
// Average-linkage agglomerative clustering (nearest-neighbour chain). Returns merges [a, b, similarity].
function agglomerate(vecs, weights) {
  const n = vecs.length;
  const S = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const s = dot(vecs[i], vecs[j]); S[i * n + j] = s; S[j * n + i] = s; }
  const size = weights ? weights.slice() : new Array(n).fill(1);
  const alive = new Uint8Array(n).fill(1);
  const merges = [];
  let left = n;
  const chain = [];
  while (left > 1) {
    if (!chain.length) { for (let i = 0; i < n; i++) if (alive[i]) { chain.push(i); break; } }
    const a = chain[chain.length - 1];
    const prev = chain.length > 1 ? chain[chain.length - 2] : -1;
    let best = -1, bs = -Infinity;
    for (let j = 0; j < n; j++) {
      if (j === a || !alive[j]) continue;
      const s = S[a * n + j];
      if (s > bs || (s === bs && j === prev)) { bs = s; best = j; }
    }
    if (best === prev) {
      chain.pop(); chain.pop();
      const x = Math.min(a, best), y = Math.max(a, best);
      merges.push([x, y, bs]);
      const wx = size[x], wy = size[y];
      for (let k = 0; k < n; k++) {
        if (!alive[k] || k === x || k === y) continue;
        const s = (wx * S[x * n + k] + wy * S[y * n + k]) / (wx + wy);
        S[x * n + k] = s; S[k * n + x] = s;
      }
      size[x] = wx + wy; alive[y] = 0; left--;
    } else chain.push(best);
  }
  return merges;
}
// Cut the merge tree: stop at `k` groups, or (k = 0) when groups are less alike than `threshold`.
function cutTree(n, merges, k, threshold) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const sorted = merges.slice().sort((a, b) => b[2] - a[2]);
  let groups = n;
  for (const [a, b, s] of sorted) {
    if (k ? groups <= k : s < threshold) break;
    const ra = find(a), rb = find(b);
    if (ra !== rb) { parent[rb] = ra; groups--; }
  }
  return Array.from({ length: n }, (_, i) => find(i));
}
// embs: one vector (or null) per line; durs: line lengths. opts: { k (0 = automatic), threshold }.
function diarize(embs, durs, opts) {
  opts = opts || {};
  const k = opts.k || 0, threshold = opts.threshold == null ? 0.42 : opts.threshold;
  const idx = [], vecs = [], w = [];
  embs.forEach((e, i) => { if (e) { idx.push(i); vecs.push(unitVec(e)); w.push(Math.max(0.5, durs[i] || 1)); } });
  const labels = new Array(embs.length).fill(-1);
  if (!idx.length) return labels.map(() => 0);
  let lab = idx.length === 1 ? [0] : cutTree(idx.length, agglomerate(vecs, w), Math.min(k, idx.length), threshold);
  // centroids
  const cent = (labs) => {
    const m = new Map();
    labs.forEach((l, j) => {
      if (!m.has(l)) m.set(l, { v: new Float32Array(vecs[0].length), d: 0 });
      const g = m.get(l); for (let t = 0; t < g.v.length; t++) g.v[t] += vecs[j][t] * w[j]; g.d += w[j];
    });
    for (const g of m.values()) g.v = unitVec(g.v);
    return m;
  };
  let groups = cent(lab);
  if (!k && groups.size > 1) {
    // fold tiny groups (a cough, a laugh, a noise) into the nearest real speaker
    const totalD = w.reduce((a, b) => a + b, 0);
    const minD = Math.max(4, totalD * 0.02);
    const big = [...groups.entries()].filter(([, g]) => g.d >= minD).map(([l]) => l);
    if (big.length) {
      // a small group with a clearly different voice is kept (someone who says little); a small group close to a big one is noise
      const keep = new Set(big);
      for (const [l, g] of groups) {
        if (keep.has(l) || g.d < 1.5) continue;
        const near = Math.max(...big.map((b) => dot(g.v, groups.get(b).v)));
        if (near < 0.3) keep.add(l);
      }
      const bigs = [...keep];
      lab = lab.map((l, j) => {
        if (keep.has(l)) return l;
        let best = bigs[0], bs = -Infinity;
        for (const b of bigs) { const s = dot(vecs[j], groups.get(b).v); if (s > bs) { bs = s; best = b; } }
        return best;
      });
      groups = cent(lab);
    }
  }
  // one pass of re-assignment to the closest centre (cleans up early merges)
  if (groups.size > 1) {
    lab = lab.map((l, j) => {
      let best = l, bs = dot(vecs[j], groups.get(l).v);
      for (const [g, c] of groups) { const s = dot(vecs[j], c.v); if (s > bs + 0.02) { bs = s; best = g; } }
      return best;
    });
  }
  idx.forEach((i, j) => (labels[i] = lab[j]));
  // short lines without a voice sample take the neighbour's speaker
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] >= 0) continue;
    let p = i - 1; while (p >= 0 && labels[p] < 0) p--;
    let q = i + 1; while (q < labels.length && labels[q] < 0) q++;
    labels[i] = p >= 0 ? labels[p] : q < labels.length ? labels[q] : 0;
  }
  // a very short line between two lines of the same person is that person too
  for (let i = 1; i < labels.length - 1; i++) {
    if ((durs[i] || 0) < 1 && labels[i - 1] === labels[i + 1] && labels[i] !== labels[i - 1]) labels[i] = labels[i - 1];
  }
  // number speakers in order of first appearance
  const order = new Map();
  return labels.map((l) => { if (!order.has(l)) order.set(l, order.size); return order.get(l); });
}
function spkName(names, i) { return (names && names[i]) || `Person ${i + 1}`; }
function speakerStats(cues, count) {
  const st = Array.from({ length: count }, () => ({ lines: 0, time: 0, first: -1 }));
  cues.forEach((c, i) => {
    if (c.spk == null || c.spk < 0 || c.spk >= count) return;
    const s = st[c.spk]; s.lines++; s.time += c.end - c.start; if (s.first < 0) s.first = i;
  });
  return st;
}
// Consecutive lines of the same person become one paragraph.
function speakerTurns(cues) {
  const out = [];
  for (const c of cues) {
    const text = c.text.replace(/\n/g, ' ').trim();
    const last = out[out.length - 1];
    if (last && !c.star && !last.star && last.spk === (c.spk == null ? -1 : c.spk) && c.start - last.end < 4) { last.text += ' ' + text; last.end = c.end; }
    else out.push({ spk: c.spk == null ? -1 : c.spk, start: c.start, end: c.end, text, star: !!c.star });
  }
  return out;
}
function toTXTSpeakers(cues, names) {
  return speakerTurns(cues).map((t) => `${t.star ? '★ ' : ''}[${fmtClock(t.start)}] ${t.spk >= 0 ? spkName(names, t.spk) + ': ' : ''}${t.text}`).join('\n\n') + '\n';
}
function toCSVSpeakers(cues, names) {
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  return 'Start,End,Speaker,Text\r\n' + cues.map((c) => [fmtClock(c.start), fmtClock(c.end), q(c.spk != null && c.spk >= 0 ? spkName(names, c.spk) : ''), q(c.text.replace(/\n/g, ' '))].join(',')).join('\r\n') + '\r\n';
}

// ---- Remembered voices ----
// Weighted mean direction of several voice fingerprints.
function centroid(vecs, weights) {
  if (!vecs.length) return null;
  const v = new Float32Array(vecs[0].length);
  vecs.forEach((x, j) => { const u = unitVec(x), w = weights ? weights[j] : 1; for (let t = 0; t < v.length; t++) v[t] += u[t] * w; });
  return unitVec(v);
}
// Give each found speaker a remembered name when the voice clearly matches (each name used once).
function matchVoices(cents, bank, threshold) {
  threshold = threshold == null ? 0.6 : threshold;
  const pairs = [];
  cents.forEach((c, i) => { if (!c) return; for (const b of bank) pairs.push([i, b.name, dot(c, unitVec(b.v))]); });
  pairs.sort((a, b) => b[2] - a[2]);
  const out = new Array(cents.length).fill(null), used = new Set();
  for (const [i, name, s] of pairs) {
    if (s < threshold) break;
    if (out[i] || used.has(name)) continue;
    out[i] = { name, score: s }; used.add(name);
  }
  return out;
}
// Add a voice to the bank (merging with the same name).
function rememberVoice(bank, name, vec, weight) {
  const key = String(name).trim();
  if (!key || !vec) return bank;
  const list = bank.map((b) => ({ ...b }));
  const old = list.find((b) => b.name.toLowerCase() === key.toLowerCase());
  const w = weight || 1;
  if (old) {
    const a = unitVec(old.v), v = new Float32Array(a.length), n = old.n || 1;
    for (let t = 0; t < v.length; t++) v[t] = a[t] * n + vec[t] * w;
    old.v = Array.from(unitVec(v), (x) => Math.round(x * 1e4) / 1e4); old.n = n + w; old.name = key;
  } else list.push({ name: key, v: Array.from(unitVec(vec), (x) => Math.round(x * 1e4) / 1e4), n: w });
  return list;
}

// ---- Word (.docx) meeting minutes ----
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function utf8(s) { return new TextEncoder().encode(s); }
// Minimal ZIP writer (stored, no compression) – enough for .docx files.
function makeZip(files) {
  const parts = [], central = [];
  let off = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const [name, content] of files) {
    const nb = utf8(name), data = typeof content === 'string' ? utf8(content) : content, crc = crc32(data);
    const head = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0)];
    parts.push(new Uint8Array(head), nb, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
    off += head.length + nb.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  const all = parts.concat(central, [end]);
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
function xmlEsc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
function wRun(text, o) {
  o = o || {};
  const pr = (o.b ? '<w:b/>' : '') + (o.color ? `<w:color w:val="${o.color.replace('#', '')}"/>` : '') + (o.sz ? `<w:sz w:val="${o.sz}"/>` : '');
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
}
function wPara(runs, style) { return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${runs}</w:p>`; }
// meta: { title, date, duration, file }
const MINUTES_TEXT = {
  en: { title: 'Meeting minutes', date: 'Date', file: 'Recording', len: 'Length', people: 'Participants', spoke: 'spoke for', actions: 'Decisions and action items', transcript: 'Transcript', moments: 'Key moments', charts: 'Who spoke how much', foot: 'Made with CaptionPress – transcribed on this computer.' },
  vi: { title: 'Biên bản cuộc họp', date: 'Ngày', file: 'File ghi âm', len: 'Thời lượng', people: 'Người tham gia', spoke: 'nói', actions: 'Kết luận và việc cần làm', transcript: 'Nội dung chi tiết', moments: 'Thời điểm quan trọng', charts: 'Thời gian phát biểu', foot: 'Tạo bằng CaptionPress – chép lời ngay trên máy tính này.' },
};
function minutesDocx(cues, names, meta) {
  meta = meta || {};
  const L = MINUTES_TEXT[meta.lang] || MINUTES_TEXT.en;
  const count = cues.reduce((m, c) => Math.max(m, c.spk == null ? -1 : c.spk), -1) + 1;
  const st = speakerStats(cues, count);
  const body = [];
  body.push(wPara(wRun(meta.title || L.title), 'Title'));
  const info = [[L.date, meta.date], [L.file, meta.file], [L.len, meta.duration]].filter((x) => x[1]);
  info.forEach(([k, v]) => body.push(wPara(wRun(k + ': ', { b: true }) + wRun(v))));
  if (count) {
    body.push(wPara(wRun(L.people), 'Heading1'));
    st.forEach((s, i) => { if (s.lines) body.push(wPara(wRun(spkName(names, i), { b: true, color: SPK_COLORS[i % SPK_COLORS.length] }) + wRun(` – ${L.spoke} ${fmtClock(s.time)}`), 'ListBullet')); });
  }
  const imgs = (meta.images || []).filter((im) => im && im.data && im.data.length);
  if (imgs.length) {
    body.push(wPara(wRun(L.charts), 'Heading1'));
    imgs.forEach((im, k) => {
      const cx = 6120000, cy = Math.round(cx * im.h / im.w);
      body.push(`<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${k + 1}" name="Chart ${k + 1}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${k + 1}" name="chart${k + 1}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${k + 1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
    });
  }
  const stars = speakerTurns(cues).filter((t) => t.star);
  if (stars.length) {
    body.push(wPara(wRun(L.moments), 'Heading1'));
    for (const t of stars) {
      const who = t.spk >= 0 ? wRun(spkName(names, t.spk) + ': ', { b: true, color: SPK_COLORS[t.spk % SPK_COLORS.length] }) : '';
      body.push(wPara(wRun(`★ [${fmtClock(t.start)}]  `, { color: '#b45309', b: true }) + who + wRun(t.text), 'ListBullet'));
    }
  }
  body.push(wPara(wRun(L.actions), 'Heading1'));
  for (let i = 0; i < 3; i++) body.push(wPara('', 'ListBullet'));
  body.push(wPara(wRun(L.transcript), 'Heading1'));
  for (const t of speakerTurns(cues)) {
    const who = t.spk >= 0 ? wRun(spkName(names, t.spk) + ': ', { b: true, color: SPK_COLORS[t.spk % SPK_COLORS.length] }) : '';
    body.push(wPara(wRun(`${t.star ? '★ ' : ''}[${fmtClock(t.start)}]  `, { color: t.star ? '#b45309' : '#6b7280', sz: 18, b: t.star }) + who + wRun(t.text)));
  }
  body.push(wPara(wRun(L.foot, { color: '#9ca3af', sz: 16 })));
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const NS = W + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:color w:val="0F766E"/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="60"/></w:pPr></w:style>
</w:styles>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${imgs.map((_, k) => `<Relationship Id="rIdImg${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/chart${k + 1}.png"/>`).join('')}</Relationships>`;
  return makeZip([['[Content_Types].xml', types], ['_rels/.rels', rels], ['word/document.xml', doc], ['word/styles.xml', styles], ['word/numbering.xml', numbering], ['word/_rels/document.xml.rels', docRels]].concat(imgs.map((im, k) => [`word/media/chart${k + 1}.png`, im.data])));
}

// ---- Pro rules ----
function limitReason(opts, pro) {
  if (pro) return '';
  if (opts.model && MODELS[opts.model] && MODELS[opts.model].pro) return `The ${MODELS[opts.model].name} quality setting is part of ScreenPress Pro.`;
  if (opts.task === 'translate') return 'Translating speech into English subtitles is part of ScreenPress Pro.';
  if (opts.burn) return 'Saving a video with the captions burned in is part of ScreenPress Pro.';
  if (opts.translateTo) return 'Translating subtitles into another language is part of ScreenPress Pro.';
  if (opts.speakers) return 'Meeting notes – finding who is speaking, naming people and saving Word minutes – is part of ScreenPress Pro.';
  if (opts.cut) return 'Saving a shorter video with the pauses cut out is part of ScreenPress Pro.';
  if (opts.voice) return 'AI voice-over – reading your subtitles aloud and saving the video or audio – is part of ScreenPress Pro.';
  return '';
}


return {
  SR, MODELS, LANGS, wordsToCues, snapToSpeech, recWords, groupWords, alignScript, alignTokens, scriptLines, scriptTokens, normWord, fmtTime, fmtShort, fmtClock, parseTime, cleanText, wrapText, splitText, segmentsToCues, tidy,
  filterSegments, chunksToSegments, rms, quietPoint, planWindows, isSilent, toSRT, toVTT, toTXT, toTXTStamped,
  parseSubs, cueAt, removeFillers, findPauses, keepParts, retimeCues, wordTimes, wordAt, popChunks, CAP_PRESETS, STYLE_DEFAULT, capWords, wordFill,
  fixLongWords, snapOnsets, tokTimes, attachWt, validWt, karaokePlan, karaokeVisible, leadDots, lineLeads, KARAOKE, dropJunkWords,
  spreadWords, buildTapCues, nudgeCue, tapToVoice, vocalEnvelope, snapLineStarts, snapWordStarts, lyricsCues, repairWords, goodWt, makeProject, readProject, VOICES, SAMPLE_LINE, TR_LANGS, sentenceGroups, distribute, langOfVoice, planVoice, splitCue, mergeCue, shiftCues, replaceAll, rewrapAll, limitReason,
  SPK_COLORS, SPK_COLORS_DARK, speakerPieces, unitVec, agglomerate, cutTree, diarize, spkName, speakerStats, speakerTurns, toTXTSpeakers, toCSVSpeakers, centroid, matchVoices, rememberVoice, crc32, makeZip, minutesDocx, MINUTES_TEXT,
};
})();
