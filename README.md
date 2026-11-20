# Pocket Time

A phone-first listening metronome PWA for practice-pad strokes and steady rudiments. Built with vanilla JavaScript, Vite, Web Audio, and an AudioWorklet. No backend, accounts, analytics, external fonts, or audio uploads.

## Run locally

```sh
npm install
npm run dev
```

Open the localhost URL shown by Vite on this computer. For a production build and offline support:

```sh
npm run build
npm run preview
```

Deploy the contents of `dist/` to any static **HTTPS** host. To serve from a subpath, build with `BASE_PATH=/your-path/ npm run build`.

Pushes to `main` deploy automatically to GitHub Pages via `.github/workflows/pages.yml`, which runs the unit tests and builds with the repository's Pages base path. A plain HTTP LAN URL can display the interface on your phone but cannot enable its microphone. Both [microphone capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) and [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) require a secure context; localhost is allowed for desktop development.

On iPhone, open the HTTPS address in Safari → Share → Add to Home Screen. The production service worker caches the entire app after the initial online visit, including detector modules and icons. Close all app windows and reopen to activate an updated version. [WebKit's Home Screen app guidance](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) explains installation behavior.

## Practice

- 30–240 quarter-note BPM, eight time signatures, and 1, 2, 3, or 4 hits per visible beat. In an eighth-note time signature, the visible beat is an eighth note; BPM remains quarter notes.
- Tap each numbered beat to cycle accented, silent, and regular. Subdivision clicks remain audible even when a numbered beat is silent. All selected subdivisions remain timing targets.
- Optional increases of 1–20 BPM every 1–64 bars, capped at a target. A target below the starting tempo leaves it unchanged. Rhythm controls lock during playback; stop to edit them. Volume, sensitivity, and offset remain adjustable.
- Start practice to request the mic and begin listening. Denying the mic still allows metronome playback. Stop releases the mic. Backgrounding or an audio interruption pauses practice; an optional screen wake lock helps keep the app visible.
- Each detected stroke is matched to the nearest subdivision. Within ±25 ms is green; early is blue, late is peach. The history and mean absolute timing error cover the last 24 hits. Hit count and on-time percentage cover the current session. Missed strokes are not counted as errors, so the percentage is not a completeness score.
- The phone layout becomes compact during playback to keep the live indicator visible.

## Accuracy and current boundaries

This is a first working prototype, **not yet calibrated or tested with a physical iPhone and practice pad**. Browser timing labels are estimates, not a verified measurement of playing accuracy.

The metronome schedules oscillator clicks against `AudioContext.currentTime` with 120 ms lookahead. The detector timestamps transient threshold crossings on the audio rendering thread at the sample level. It uses a high-pass filter, envelope/re-arm logic, a noise floor, and a 45 ms refractory period. Synthetic tests cover decaying pad-like strokes at 44.1/48 kHz and sixteenth notes at 180 BPM. Close flams, buzz rolls, and very fast subdivisions can merge; quiet strokes can be missed. It does not identify left/right sticking or recognize instruments.

Microphone capture delay and output-device delay can bias the result. The timing offset subtracts a user-selected amount from detected timestamps (positive corrects a consistently late reading). Adjusting it from your own strokes also removes your playing bias: **this is not objective automatic calibration**. Recheck whenever the audio route changes. [Output timestamps](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp) align the visual beat indicator with rendered playback; they do not solve unknown microphone latency.

Phone speaker is the default, with click volume starting at 35%. Speaker mode requests echo cancellation, but it cannot guarantee that clicks will be excluded. Before playing, check whether the click alone registers as hits; lower volume or sensitivity if needed. Speaker feedback still needs validation on the actual phone, especially for pad hits coinciding with clicks. Wired and Bluetooth headphones remain optional; Bluetooth may add variable delay. Selecting the output describes your setup; it does not switch the phone's physical audio route. Audio is processed transiently and is never recorded, persisted, or transmitted.

## Verification

```sh
npm test
npx playwright install chromium webkit
npm run test:browser
```

The browser suite checks desktop/mobile Chromium and the WebKit mobile layout, controls, service-worker cache, permission-denial handling, permission-request cancellation, tempo ramps, and synthetic microphone input through the real worklet. Offline reload and audio playback are exercised in Chromium. Windows Playwright WebKit lacks Web Audio and its offline navigation reports an internal error; those cases are explicitly skipped there. This emulator is not a replacement for Safari on an iPhone.

Before relying on the timing feedback, validate on the actual iPhone over HTTPS: speaker-only false hits, headphone route delay, soft/loud strokes, doubling strokes, permission grant/deny, lock/unlock, an interruption, Home Screen installation, and an offline relaunch. Compare against a known timed audio reference before claiming millisecond accuracy.

App icons are derived from the local SVG with `node scripts/generate-icons.js` (requires Playwright Chromium). Production builds use the committed PNGs and need no browser.
