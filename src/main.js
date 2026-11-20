import './style.css';
import { PracticeAudio } from './audio.js';
import { clamp, nearestBeat, classify, stepDuration } from './timing.js';

const icons = {
  mark: '<svg viewBox="0 0 32 32" fill="none"><path d="m7 26 6-20h6l6 20H7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m16 23 8-15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="23" r="2" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 4.5a1 1 0 0 1 1.5-.86l12 7.5a1 1 0 0 1 0 1.72l-12 7.5A1 1 0 0 1 8 19.5Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v4m-4 0h8"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m4 17 6-6 4 3 6-9m-6 0h6v6"/></svg>',
};

const state = { bpm: 80, numerator: 4, denominator: 4, subdivision: 1, accents: [2, 1, 1, 1], volume: 0.35, listen: true, route: 'speaker', threshold: 0.025, offset: 0, ramp: false, rampAmount: 2, rampBars: 4, rampTarget: 120 };
let running = false;
let starting = false;
let sessionToken = 0;
let wakeLock;
let hitCount = 0;
let goodHits = 0;
let errors = [];
let lastHitAt = 0;
let pendingHits = new Set();

document.querySelector('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="/" aria-label="Pocket Time home"><span class="brand-icon">${icons.mark}</span>pocket<span class="brand-light">time</span><span class="brand-dot">.</span></a>
    <button class="help-button" id="help" aria-label="How to use Pocket Time">?</button>
  </header>
  <main>
    <div class="intro"><div><p class="eyebrow">A LITTLE PRACTICE. A LITTLE CLOSER.</p><h1>Find your pocket.</h1><p class="intro-copy">Your tempo. Your rhythm. A little feedback along the way.</p></div><span class="practice-tag"><span></span> PRACTICE PAD</span></div>
    <div class="workspace">
      <section class="metronome card" aria-labelledby="metronome-title">
        <div class="card-heading"><h2 id="metronome-title">Metronome</h2><span id="transport-status" class="small-status">READY WHEN YOU ARE</span></div>
        <div class="tempo-control"><button class="round-button" id="slower" aria-label="Decrease tempo by one">−</button><div class="tempo-number"><label class="sr-only" for="bpm">Tempo in quarter notes per minute</label><input id="bpm" type="number" min="30" max="240" value="80" inputmode="numeric"><span>BPM</span></div><button class="round-button" id="faster" aria-label="Increase tempo by one">+</button></div>
        <label class="sr-only" for="tempo-slider">Tempo</label><input id="tempo-slider" type="range" min="30" max="240" value="80" class="tempo-slider"><div class="range-labels"><span>30</span><span id="tempo-word">ANDANTE · AT A WALKING PACE</span><span>240</span></div>
        <div id="beats" class="beats" aria-label="Beat accents"></div><p class="beat-hint">Tap a beat to change its accent <span>● accent &nbsp; ◌ regular &nbsp; − silent</span></p>
        <div class="rhythm-controls"><div><label class="field-label" for="signature">TIME SIGNATURE</label><select id="signature"><option value="2/4">2 / 4</option><option value="3/4">3 / 4</option><option value="4/4" selected>4 / 4</option><option value="5/4">5 / 4</option><option value="6/8">6 / 8</option><option value="7/8">7 / 8</option><option value="9/8">9 / 8</option><option value="12/8">12 / 8</option></select></div><div class="subdivision-control"><span class="field-label" id="subdivision-label">HITS PER BEAT</span><div class="segments" role="group" aria-labelledby="subdivision-label"><button data-sub="1" aria-pressed="true"><span>♩</span><small>1</small></button><button data-sub="2" aria-pressed="false"><span>♫</span><small>2</small></button><button data-sub="3" aria-pressed="false"><span>3</span><small>triplet</small></button><button data-sub="4" aria-pressed="false"><span>♬</span><small>4</small></button></div></div></div>
        <button class="start-button" id="start">${icons.play}<span>Start practice</span></button>
        <div class="volume-row"><span aria-hidden="true">◖))</span><label for="volume">Click volume</label><input id="volume" type="range" min="0" max="100" value="35"><output id="volume-value" for="volume">35%</output></div>
      </section>
      <div class="right-column">
        <section class="feedback card" aria-labelledby="feedback-title"><div class="card-heading"><h2 id="feedback-title">${icons.mic} Live feedback</h2><label class="switch"><input id="listen" type="checkbox" checked aria-label="Listen to my playing"><span></span></label></div>
          <div class="listening-state"><span class="status-dot" id="mic-dot"></span><span id="mic-status">Listening starts with your practice</span><div class="input-meter" aria-label="Microphone input level"><i id="input-level"></i></div></div>
          <div class="feedback-result" id="feedback-result"><div class="result-symbol" id="result-symbol">◎</div><h3 id="result-label">Make every hit count.</h3><p id="result-detail">Play your pad. See where you land.</p></div>
          <div class="timing-scale"><div class="scale-track"><div class="target-zone"></div><div class="center-line"></div><div class="hit-marker" id="hit-marker" hidden></div></div><div class="scale-labels"><span>EARLY</span><span>ON TIME</span><span>LATE</span></div></div>
          <div class="hit-history" id="hit-history" aria-label="Timing of your last 24 hits"><span>Your rhythm will show up here</span></div>
          <div class="session-stats"><div><strong id="hits-stat">—</strong><span>HITS HEARD</span></div><div><strong id="accuracy-stat">—</strong><span>WITHIN ±25 MS</span></div><div><strong id="average-stat">—</strong><span>AVG. ERROR</span></div></div>
          <p class="feedback-note" id="feedback-note">Use headphones so we hear your pad, not the click.</p>
        </section>
        <section class="ramp card"><div class="card-heading"><div><h2>${icons.arrow} Build your tempo</h2><p>A little faster, one bar at a time.</p></div><label class="switch"><input id="ramp" type="checkbox" aria-label="Gradually increase tempo"><span></span></label></div><div class="ramp-fields"><label>INCREASE<input id="ramp-amount" type="number" min="1" max="20" value="2"><span>BPM</span></label><label>EVERY<input id="ramp-bars" type="number" min="1" max="64" value="4"><span>BARS</span></label><label>UP TO<input id="ramp-target" type="number" min="30" max="240" value="120"><span>BPM</span></label></div></section>
      </div>
    </div>
    <details class="settings card"><summary><span>Fine-tune your setup</span><span class="settings-summary">Audio output, sensitivity & timing <span aria-hidden="true">＋</span></span></summary><div class="settings-body"><div><label class="field-label" for="route">METRONOME OUTPUT</label><select id="route"><option value="wired">Wired headphones</option><option value="bluetooth">Bluetooth headphones</option><option value="speaker">Phone speaker</option></select><p id="route-note">Wired headphones give the most consistent timing. Select the output you have connected; this doesn't switch your audio device.</p></div><div><label class="field-label" for="sensitivity">MIC SENSITIVITY <output id="sensitivity-value">60%</output></label><input id="sensitivity" type="range" min="0" max="100" value="60"><p>Raise for missed soft hits. Lower if room noise is counted. Closely spaced flams and rolls may merge.</p></div><div><label class="field-label" for="offset">TIMING OFFSET <output id="offset-value">0 ms</output></label><input id="offset" type="range" min="-150" max="500" step="5" value="0"><p>Feedback is an estimate until calibrated for your setup. If hits consistently read 60 ms late, try +60 ms. This also shifts your natural timing bias; it is not an objective calibration.</p><button class="text-button" id="reset-offset">Reset offset</button></div></div></details>
    <p id="notice" class="notice" role="status" hidden></p>
    <footer><span><span class="privacy-dot"></span> On your device. In your own time.</span><button id="install-help">Add to your home screen <span aria-hidden="true">↗</span></button></footer>
  </main>
  <dialog id="help-dialog"><button id="close-help" class="close-button" aria-label="Close help">×</button><span class="eyebrow">WELCOME TO POCKET TIME</span><h2>A good habit starts<br>with a steady beat.</h2><ol><li><strong>Set your rhythm.</strong> Choose your tempo, time signature, and hits per beat. BPM uses quarter notes; in 6/8 each visible beat is an eighth note.</li><li><strong>Set up your phone.</strong> Place it near your pad and keep the speaker click quiet. Start practice and allow the microphone. Before playing, check whether the click alone registers as hits; if it does, lower the volume or mic sensitivity.</li><li><strong>Find your pocket.</strong> Green means within 25 ms. Blue is early, peach is late. Every detected hit is matched to the nearest subdivision, even if that beat is silent.</li></ol><p>Timing is approximate: microphone and playback delays vary. Adjust the timing offset for your setup. Phone speakers may be heard as hits, and Bluetooth adds delay. This first version measures steady strokes, not sticking patterns or individual drums.</p><p>No audio is recorded, saved, or uploaded. Keep the app open during practice; switching apps or locking the screen pauses the session.</p><div class="install-box"><strong>Make yourself at home.</strong><p>Open this site in Safari, tap Share, then <b>Add to Home Screen</b>. After the first online visit, the installed app works offline.</p></div><button id="got-it" class="start-button">Let’s practice</button></dialog>
`;

const $ = id => document.getElementById(id);
const audio = new PracticeAudio({
  onStep(event) {
    document.querySelectorAll('.beat').forEach((el, i) => el.classList.toggle('active', i === event.beat));
    $('transport-status').textContent = `BAR ${event.bar + 1} · BEAT ${event.beat + 1}`;
  },
  onTempo(bpm) { if (state.bpm !== bpm) { state.bpm = bpm; renderTempo(); } },
  onHit(time) {
    // Allow the following scheduled beat to exist before resolving nearest beat.
    const handle = setTimeout(() => {
      pendingHits.delete(handle);
      if (!running) return;
      const nearest = nearestBeat(time, audio.events, state.offset);
      if (!nearest || Math.abs(nearest.error) > stepDuration(state.bpm, state.denominator, state.subdivision) * 500) return;
      showHit(nearest.error);
    }, 90);
    pendingHits.add(handle);
  },
  onLevel(peak) { $('input-level').style.width = `${clamp(peak * 350, 0, 100)}%`; },
  onInterrupted() { stopPractice('Practice paused because audio was interrupted. Tap Start to resume.'); },
});

function notice(message = '') { $('notice').textContent = message; $('notice').hidden = !message; }
function renderTempo() {
  $('bpm').value = state.bpm;
  $('tempo-slider').value = state.bpm;
  $('tempo-slider').style.setProperty('--range', `${(state.bpm - 30) / 210 * 100}%`);
  $('tempo-word').textContent = state.bpm < 60 ? 'LARGO · TAKE YOUR TIME' : state.bpm < 108 ? 'ANDANTE · AT A WALKING PACE' : state.bpm < 156 ? 'ALLEGRO · FIND YOUR ENERGY' : 'PRESTO · LIGHT AND QUICK';
}
function renderBeats() {
  $('beats').innerHTML = state.accents.map((accent, i) => `<button class="beat ${accent === 2 ? 'accent' : accent === 0 ? 'muted' : ''}" data-beat="${i}" aria-label="Beat ${i + 1}: ${['silent', 'regular', 'accented'][accent]}. Tap to change." ${running || starting ? 'disabled' : ''}><span>${accent === 0 ? '−' : i + 1}</span><i></i></button>`).join('');
}
function lockControls(locked) {
  for (const selector of ['#bpm', '#tempo-slider', '#slower', '#faster', '#signature', '[data-sub]', '.beat', '#listen', '#route', '#ramp', '#ramp-amount', '#ramp-bars', '#ramp-target']) {
    document.querySelectorAll(selector).forEach(el => { el.disabled = locked; });
  }
}
function setTempo(value) { state.bpm = clamp(Math.round(Number(value) || 80), 30, 240); renderTempo(); }
function resetFeedback() {
  hitCount = 0; goodHits = 0; errors = []; lastHitAt = 0;
  $('hit-history').innerHTML = '<span>Your rhythm will show up here</span>';
  for (const id of ['hits-stat', 'accuracy-stat', 'average-stat']) $(id).textContent = '—';
  $('hit-marker').hidden = true;
  $('feedback-result').className = 'feedback-result';
  $('result-symbol').textContent = '◎';
}
function showHit(error) {
  hitCount++;
  if (Math.abs(error) <= 25) goodHits++;
  errors.push(error);
  if (errors.length > 24) errors.shift();
  lastHitAt = performance.now();
  const type = classify(error);
  $('feedback-result').className = `feedback-result ${type}`;
  $('result-symbol').textContent = type === 'on-time' ? '◎' : type === 'early' ? '←' : '→';
  $('result-label').textContent = type === 'on-time' ? 'In the pocket.' : type === 'early' ? 'A little early.' : 'A little late.';
  const ms = Math.round(Math.abs(error));
  $('result-detail').textContent = `${ms} ms ${error < 0 ? 'before' : 'after'} the beat${type === 'on-time' ? ' · Nice and steady.' : ''}`;
  $('hit-marker').hidden = false;
  $('hit-marker').style.left = `${50 + clamp(error, -150, 150) / 3}%`;
  $('hit-marker').className = `hit-marker ${type}`;
  $('hits-stat').textContent = hitCount;
  $('accuracy-stat').textContent = `${Math.round(goodHits / hitCount * 100)}%`;
  $('average-stat').textContent = `${Math.round(errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length)} ms`;
  $('average-stat').title = 'Mean absolute error of the last 24 detected hits';
  $('hit-history').innerHTML = errors.map(e => `<i class="history-hit ${classify(e)}" style="height:${8 + Math.min(Math.abs(e), 100) / 100 * 24}px" title="${Math.round(e)} ms"></i>`).join('');
}

async function startPractice() {
  if (starting || running) return;
  starting = true;
  const token = ++sessionToken;
  lockControls(true);
  $('start').innerHTML = `${icons.stop}<span>Cancel starting</span>`;
  $('transport-status').textContent = 'GETTING READY';
  notice();
  resetFeedback();
  try {
    // Resume from the tap before awaiting the microphone permission dialog.
    await audio.init();
    if (token !== sessionToken) return;
    if (state.listen) {
      $('mic-status').textContent = 'Allow microphone access to listen';
      try { await audio.listen(state.threshold, state.route); }
      catch (error) {
        if (token !== sessionToken) return;
        const message = error.name === 'NotAllowedError' ? 'Microphone access was not allowed. Enable it in Safari’s website settings, then restart to hear your pad.' : error.name === 'NotFoundError' ? 'No microphone found. Connect one, then restart to listen.' : error.message;
        notice(`${message} The metronome is still available.`);
      }
    }
    if (token !== sessionToken || document.hidden) { audio.stop(); return; }
    running = true;
    audio.start(state);
    document.body.classList.add('practicing');
    if (matchMedia('(max-width: 620px)').matches) window.scrollTo({ top: 0, behavior: 'instant' });
    $('start').innerHTML = `${icons.stop}<span>Stop practice</span>`;
    $('start').classList.add('playing');
    const listening = Boolean(audio.stream);
    $('mic-dot').classList.toggle('live', listening);
    $('mic-status').textContent = listening ? 'Listening to your pad' : 'Metronome only · microphone off';
    $('result-label').textContent = listening ? 'You set the rhythm.' : 'Just you and the beat.';
    $('result-detail').textContent = listening ? 'Play steady strokes to see your timing.' : 'Enable listening for live timing feedback.';
    try { wakeLock = await navigator.wakeLock?.request('screen'); if (!running) await wakeLock?.release(); } catch { /* Screen wake lock is optional. */ }
  } catch (error) {
    if (token === sessionToken) { starting = false; stopPractice(`Could not start audio. ${error.message}`); }
  } finally {
    starting = false;
    if (!running) {
      $('start').disabled = false;
      stopPractice();
    }
  }
}
function stopPractice(message) {
  sessionToken++;
  running = false;
  document.body.classList.remove('practicing');
  // A pending permission request cannot be aborted; keep start locked until it settles.
  const wasStarting = starting;
  audio.stop();
  pendingHits.forEach(clearTimeout); pendingHits.clear();
  wakeLock?.release().catch(() => {}); wakeLock = null;
  $('start').innerHTML = `${icons.play}<span>Start practice</span>`;
  $('start').classList.remove('playing');
  $('transport-status').textContent = 'READY WHEN YOU ARE';
  $('mic-status').textContent = 'Microphone off';
  $('mic-dot').classList.remove('live');
  $('input-level').style.width = '0%';
  lockControls(false);
  document.querySelectorAll('.beat').forEach(el => el.classList.remove('active'));
  if (message) notice(message);
  if (wasStarting) { $('start').disabled = true; $('start').innerHTML = '<span>Waiting for microphone…</span>'; }
}

$('start').onclick = () => running || starting ? stopPractice() : startPractice();
$('slower').onclick = () => setTempo(state.bpm - 1);
$('faster').onclick = () => setTempo(state.bpm + 1);
$('bpm').onchange = event => setTempo(event.target.value);
$('tempo-slider').oninput = event => setTempo(event.target.value);
$('beats').onclick = event => { const button = event.target.closest('[data-beat]'); if (!button || running || starting) return; const i = Number(button.dataset.beat); state.accents[i] = (state.accents[i] + 1) % 3; renderBeats(); };
$('signature').onchange = event => { [state.numerator, state.denominator] = event.target.value.split('/').map(Number); state.accents = Array.from({ length: state.numerator }, (_, i) => i === 0 ? 2 : 1); renderBeats(); };
document.querySelectorAll('[data-sub]').forEach(button => { button.onclick = () => { state.subdivision = Number(button.dataset.sub); document.querySelectorAll('[data-sub]').forEach(el => el.setAttribute('aria-pressed', String(el === button))); }; });
$('volume').oninput = event => { state.volume = Number(event.target.value) / 100; $('volume-value').textContent = `${event.target.value}%`; if (audio.settings) audio.settings.volume = state.volume; };
$('listen').onchange = event => { state.listen = event.target.checked; $('mic-status').textContent = state.listen ? 'Listening starts with your practice' : 'Metronome only · listening off'; };
$('ramp').onchange = event => { state.ramp = event.target.checked; document.querySelector('.ramp').classList.toggle('enabled', state.ramp); };
for (const [id, key, min, max] of [['ramp-amount', 'rampAmount', 1, 20], ['ramp-bars', 'rampBars', 1, 64], ['ramp-target', 'rampTarget', 30, 240]]) {
  $(id).onchange = event => { state[key] = clamp(Math.round(Number(event.target.value) || min), min, max); event.target.value = state[key]; };
}
$('sensitivity').oninput = event => { const value = Number(event.target.value); state.threshold = 0.004 * 100 ** ((100 - value) / 100); $('sensitivity-value').textContent = `${value}%`; audio.setThreshold(state.threshold); };
$('offset').oninput = event => { state.offset = Number(event.target.value); $('offset-value').textContent = `${state.offset > 0 ? '+' : ''}${state.offset} ms`; };
$('reset-offset').onclick = () => { $('offset').value = '0'; $('offset').dispatchEvent(new Event('input')); };
$('route').onchange = event => {
  state.route = event.target.value;
  const text = state.route === 'speaker' ? 'Speaker mode requests echo cancellation, but clicks can still register as hits. Keep the click quiet and the pad close to the mic. Before playing, check for hits from the click alone; lower volume or sensitivity if needed. Timing feedback is unverified for this setup.' : state.route === 'bluetooth' ? 'Bluetooth adds variable delay. Timing feedback needs an offset and may drift. Recheck the offset when reconnecting your headphones.' : 'Wired headphones give the most consistent timing. Select the output you have connected; this doesn’t switch your audio device.';
  $('route-note').textContent = text;
  $('feedback-note').textContent = state.route === 'wired' ? 'Use headphones so we hear your pad, not the click.' : state.route === 'speaker' ? 'Speaker mode · metronome clicks may be counted as hits.' : 'Bluetooth mode · adjust timing offset for headphone delay.';
};
for (const id of ['help', 'install-help']) $(id).onclick = () => $('help-dialog').showModal();
for (const id of ['close-help', 'got-it']) $(id).onclick = () => $('help-dialog').close();
$('help-dialog').onclick = event => { if (event.target === $('help-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } };
document.addEventListener('visibilitychange', () => { if (document.hidden && (running || starting)) stopPractice('Practice paused while the app was in the background. Tap Start when you’re ready.'); });
window.addEventListener('pagehide', () => { if (running || starting) stopPractice(); });
setInterval(() => { if (running && lastHitAt && performance.now() - lastHitAt > 2500) { $('result-label').textContent = 'Ready for your next hit.'; $('result-detail').textContent = 'Keep playing to see live timing.'; $('feedback-result').className = 'feedback-result'; $('hit-marker').hidden = true; } }, 1000);
renderTempo(); renderBeats();
$('route').value = state.route;
$('route').dispatchEvent(new Event('change'));
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => notice('Offline setup failed. You can still practice while online.'));
