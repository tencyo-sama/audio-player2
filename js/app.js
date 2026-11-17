// --- app.js (Zero-base rebuild) ---

let audioCtx = null;
let audioBuffer = null;
let pitchShifter = null;
let dummySource = null;

// State
let isPlaying = false;
let isVideo = false;
let currentTempo = 1.0;
let currentPitch = 0; // semitones
let manualSyncOffset = 0.0; // seconds

// Loop State
const LOOP_OFF = 0;
const LOOP_ALL = 1;
const LOOP_AB = 2;
let loopMode = LOOP_OFF;
let loopStart = null;
let loopEnd = null;

// Bar Snap & BPM State
let isSnapEnabled = true;
let currentBpm = 120;
let beatsPerBar = 4;
let beatOffset = 0.0; // seconds (phase of the beat grid)
let tapTimestamps = [];

// Animation Frame ID
let rAF_ID = null;

// DOM Elements
const fileInput = document.getElementById('fileInput');
const videoSelector = document.getElementById('videoSelector');
const videoPlayer = document.getElementById('videoPlayer');
const audioVisualizer = document.getElementById('audioVisualizer');
const noFileMsg = document.getElementById('noFileMsg');
const btnFullscreenToggle = document.getElementById('btnFullscreenToggle');
const mediaContainer = document.getElementById('mediaContainer');
const controlsArea = document.getElementById('controlsArea');

// Controls
const seekSlider = document.getElementById('seekSlider');
const timeCurrent = document.getElementById('timeCurrent');
const timeTotal = document.getElementById('timeTotal');

// Buttons
const btnPlayPause = document.getElementById('btnPlayPause');
const iconPlay = document.getElementById('iconPlay');
const btnSkipBack = document.getElementById('btnSkipBack');
const btnSkipFwd = document.getElementById('btnSkipFwd');

// Loop & Bar Snap Buttons
const btnLoopMode = document.getElementById('btnLoopMode');
const iconLoopMode = document.getElementById('iconLoopMode');
const btnSnapToggle = document.getElementById('btnSnapToggle');
const badgeBpm = document.getElementById('badgeBpm');
const btnSetA = document.getElementById('btnSetA');
const btnSetB = document.getElementById('btnSetB');
const btnClearLoop = document.getElementById('btnClearLoop');
const loopOverlay = document.getElementById('loopOverlay');
const loopA_Disp = document.getElementById('loopA');
const loopB_Disp = document.getElementById('loopB');
const loopBarInfo = document.getElementById('loopBarInfo');

// Collapsible Settings Elements
const btnToggleSettings = document.getElementById('btnToggleSettings');
const iconToggleSettings = document.getElementById('iconToggleSettings');
const collapsibleSettings = document.getElementById('collapsibleSettings');
const btnBpmDown = document.getElementById('btnBpmDown');
const btnBpmUp = document.getElementById('btnBpmUp');
const inputBpm = document.getElementById('inputBpm');
const selectTimeSig = document.getElementById('selectTimeSig');
const btnTapTempo = document.getElementById('btnTapTempo');
const btnDetectBpm = document.getElementById('btnDetectBpm');

const btnShiftBeatBack = document.getElementById('btnShiftBeatBack');
const btnShiftFineBack = document.getElementById('btnShiftFineBack');
const btnShiftFineFwd = document.getElementById('btnShiftFineFwd');
const btnShiftBeatFwd = document.getElementById('btnShiftBeatFwd');
const btnBarMinus = document.getElementById('btnBarMinus');
const btnBarPlus = document.getElementById('btnBarPlus');
const btnPrevSection = document.getElementById('btnPrevSection');
const btnNextSection = document.getElementById('btnNextSection');

// Buttons: Tempo & Pitch
const btnTempoDown = document.getElementById('btnTempoDown');
const btnTempoUp = document.getElementById('btnTempoUp');
const valTempo = document.getElementById('valTempo');

const btnPitchDown = document.getElementById('btnPitchDown');
const btnPitchUp = document.getElementById('btnPitchUp');
const valPitch = document.getElementById('valPitch');

// Sync Slider
const sliderSync = document.getElementById('sliderSync');
const valSync = document.getElementById('valSync');
const btnResetSync = document.getElementById('btnResetSync');
const btnSyncMinus = document.getElementById('btnSyncMinus');
const btnSyncPlus = document.getElementById('btnSyncPlus');

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    // Requires user interaction to start AudioContext
    document.body.addEventListener('click', initAudioContext, { once: true });
    document.body.addEventListener('touchstart', initAudioContext, { once: true });

    // Dynamically adjust video container height when footer controls resize
    if (window.ResizeObserver && controlsArea) {
        const ro = new ResizeObserver(() => updateControlsHeight());
        ro.observe(controlsArea);
    }
    window.addEventListener('resize', updateControlsHeight);
    updateControlsHeight();

    loadVideoList();

    fileInput.addEventListener('change', handleFileLoad);
    videoSelector.addEventListener('change', handleRemoteVideoSelect);

    // Fullscreen Toggle
    btnFullscreenToggle.addEventListener('click', toggleFullscreen);

    // Playback
    btnPlayPause.addEventListener('click', togglePlay);
    btnSkipBack.addEventListener('click', () => skipTime(-5));
    btnSkipFwd.addEventListener('click', () => skipTime(5));

    // Seek
    seekSlider.addEventListener('input', (e) => {
        if (!pitchShifter) return;
        const perc = parseFloat(e.target.value) / 100;
        const targetTime = perc * pitchShifter.duration;
        seekTo(targetTime);
    });

    // Fullscreen video tap-to-pause
    videoPlayer.addEventListener('click', () => {
        if (document.fullscreenElement === mediaContainer) {
            togglePlay();
        }
    });

    // Tempo
    btnTempoDown.addEventListener('click', () => setTempo(currentTempo - 0.05));
    btnTempoUp.addEventListener('click', () => setTempo(currentTempo + 0.05));

    // Pitch
    btnPitchDown.addEventListener('click', () => setPitch(currentPitch - 1));
    btnPitchUp.addEventListener('click', () => setPitch(currentPitch + 1));

    // Sync
    sliderSync.addEventListener('input', (e) => setSyncOffset(parseFloat(e.target.value)));
    btnResetSync.addEventListener('click', () => setSyncOffset(0.0));
    btnSyncMinus.addEventListener('click', () => setSyncOffset(manualSyncOffset - 0.05));
    btnSyncPlus.addEventListener('click', () => setSyncOffset(manualSyncOffset + 0.05));

    // Collapsible Settings Panel
    btnToggleSettings.addEventListener('click', toggleSettingsPanel);

    // Bar Snap & BPM Controls
    btnSnapToggle.addEventListener('click', toggleSnapEnabled);
    btnBpmDown.addEventListener('click', () => setBpm(currentBpm - 1));
    btnBpmUp.addEventListener('click', () => setBpm(currentBpm + 1));
    inputBpm.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) setBpm(val);
    });
    selectTimeSig.addEventListener('change', (e) => {
        beatsPerBar = parseInt(e.target.value, 10) || 4;
        if (isSnapEnabled && loopStart !== null && loopEnd !== null) {
            resnapLoopEndToBars();
        } else {
            updateLoopOverlay();
        }
    });
    btnTapTempo.addEventListener('click', handleTapTempo);
    btnDetectBpm.addEventListener('click', () => {
        if (audioBuffer) runAutoBpmDetection(audioBuffer);
    });

    // Loop Fine-Tuning & Bar Navigation
    btnShiftBeatBack.addEventListener('click', () => shiftLoop(-getBeatDuration()));
    btnShiftBeatFwd.addEventListener('click', () => shiftLoop(getBeatDuration()));
    btnShiftFineBack.addEventListener('click', () => shiftLoop(-0.05));
    btnShiftFineFwd.addEventListener('click', () => shiftLoop(0.05));
    btnBarMinus.addEventListener('click', () => adjustLoopBars(-1));
    btnBarPlus.addEventListener('click', () => adjustLoopBars(1));
    btnPrevSection.addEventListener('click', () => moveLoopSection(-1));
    btnNextSection.addEventListener('click', () => moveLoopSection(1));

    // Loop Set A / Set B
    btnLoopMode.addEventListener('click', toggleLoopMode);
    btnSetA.addEventListener('click', handleSetA);
    btnSetB.addEventListener('click', handleSetB);
    btnClearLoop.addEventListener('click', clearABLoop);
});

function updateControlsHeight() {
    if (!controlsArea) return;
    const h = controlsArea.offsetHeight;
    if (h > 0) {
        document.documentElement.style.setProperty('--controls-height', `${h}px`);
    }
}

function toggleSettingsPanel() {
    const isHidden = collapsibleSettings.classList.toggle('d-none');
    if (isHidden) {
        iconToggleSettings.classList.replace('bi-chevron-down', 'bi-chevron-up');
        btnToggleSettings.classList.replace('btn-secondary', 'btn-outline-secondary');
    } else {
        iconToggleSettings.classList.replace('bi-chevron-up', 'bi-chevron-down');
        btnToggleSettings.classList.replace('btn-outline-secondary', 'btn-secondary');
    }
    updateControlsHeight();
}

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// --- File Handling ---
async function handleFileLoad(e) {
    const file = e.target.files[0];
    if (!file) return;

    initAudioContext();
    stopPlayback(); // Stop any current playback

    noFileMsg.classList.add('d-none');

    // Check if video
    isVideo = file.type.startsWith('video');
    const fileUrl = URL.createObjectURL(file);

    if (isVideo) {
        videoPlayer.src = fileUrl;
        videoPlayer.muted = true; // Audio is handled by WebAudio independently
        videoPlayer.classList.remove('d-none');
        btnFullscreenToggle.classList.remove('d-none');
        audioVisualizer.classList.add('d-none');
        videoPlayer.load();
    } else {
        videoPlayer.classList.add('d-none');
        btnFullscreenToggle.classList.add('d-none');
        audioVisualizer.classList.remove('d-none');
    }

    // Decode Audio Data
    try {
        const arrayBuffer = await file.arrayBuffer();
        await loadAudioData(arrayBuffer);
    } catch (err) {
        showStatusError("音声データのデコードに失敗しました。");
        console.error("Failed to decode audio data.");
    }
}

// Loads a video from the remote 'videos/' directory
async function handleRemoteVideoSelect(e) {
    const filename = e.target.value;
    if (!filename) return;

    // Reset local UI if picking from network
    fileInput.value = '';

    initAudioContext();
    stopPlayback();
    noFileMsg.classList.add('d-none');

    isVideo = true;
    const remoteUrl = `videos/${filename}`;

    // Set video src directly
    videoPlayer.src = remoteUrl;
    videoPlayer.muted = true;
    videoPlayer.classList.remove('d-none');
    btnFullscreenToggle.classList.remove('d-none');
    audioVisualizer.classList.add('d-none');
    videoPlayer.load();

    // Fetch same video data for WebAudio processing
    try {
        const response = await fetch(remoteUrl);
        if (!response.ok) throw new Error("Network response was not ok");
        const arrayBuffer = await response.arrayBuffer();
        await loadAudioData(arrayBuffer);
    } catch (err) {
        showStatusError("リモート動画データの読み込みに失敗しました。");
        console.error("Failed to fetch remote audio data.");
    }
}

function showStatusError(msg) {
    const p = noFileMsg.querySelector('p');
    if (p) p.textContent = msg;
    noFileMsg.classList.remove('d-none');
}

async function loadAudioData(arrayBuffer) {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    setupPitchShifter();

    timeTotal.textContent = formatTime(audioBuffer.duration);
    seekSlider.disabled = false;
    btnPlayPause.disabled = false;
    clearABLoop();
    setLoopMode(LOOP_OFF);

    // Automatically analyze audio buffer for BPM & beat grid offset
    runAutoBpmDetection(audioBuffer);
}

// Fetch list of available videos downloaded via main.py
async function loadVideoList() {
    try {
        const resp = await fetch('video_list.json');
        if (!resp.ok) return; // likely doesn't exist yet/empty
        const list = await resp.json();

        list.forEach(item => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = item;
            videoSelector.appendChild(opt);
        });
    } catch (e) {
        console.warn("Failed loading video list. Possibly not generated yet.", e);
    }
}

// --- Fullscreen Handling (Container Expand Approach) ---
// Using HTML5 Fullscreen API on the media container to keep controls logic fully alive underneath.
async function toggleFullscreen() {
    if (!document.fullscreenElement) {
        if (mediaContainer.requestFullscreen) {
            await mediaContainer.requestFullscreen();
        } else if (mediaContainer.webkitRequestFullscreen) { /* Safari */
            await mediaContainer.webkitRequestFullscreen();
        } else if (mediaContainer.msRequestFullscreen) { /* IE11 */
            await mediaContainer.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            await document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            await document.msExitFullscreen();
        }
    }
}

// Update icon and screen orientation based on fullscreen state
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('msfullscreenchange', handleFullscreenChange);

async function handleFullscreenChange() {
    const icon = btnFullscreenToggle.querySelector('i');
    if (document.fullscreenElement) {
        icon.classList.replace('bi-arrows-fullscreen', 'bi-fullscreen-exit');
        // Lock screen to landscape if supported
        if (screen.orientation && screen.orientation.lock) {
            try {
                await screen.orientation.lock('landscape');
            } catch (err) {
                console.warn('Screen orientation lock failed or not supported:', err);
            }
        }
    } else {
        icon.classList.replace('bi-fullscreen-exit', 'bi-arrows-fullscreen');
        // Unlock screen orientation
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }
}


function setupPitchShifter() {
    if (pitchShifter) {
        pitchShifter.disconnect();
        pitchShifter = null;
    }

    // Initialize from soundtouch.js
    // bufferSize: 4096 is a good balance of latency and performance
    pitchShifter = new PitchShifter(audioCtx, audioBuffer, 4096, () => {
        // onEnd callback (track finished)
        if (loopMode === LOOP_ALL) {
            seekTo(0);
        } else if (loopMode === LOOP_AB && loopStart !== null) {
            seekTo(loopStart);
        } else {
            pausePlayback();
            seekTo(0);
        }
    });

    // Apply current slider settings immediately
    pitchShifter.tempo = currentTempo;
    pitchShifter.pitchSemitones = currentPitch;
}


// --- Playback Control ---
async function togglePlay() {
    if (!pitchShifter) return;
    if (isPlaying) {
        pausePlayback();
    } else {
        await startPlayback();
    }
}

async function startPlayback() {
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    pitchShifter.connect(audioCtx.destination);

    // Web Audio limitation: ScriptProcessorNode sometimes stalls in some browsers
    // if there are no active input nodes. 
    // We bind a silent oscillator to ensure the graph keeps rendering.
    if (!dummySource) {
        dummySource = audioCtx.createOscillator();
        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        dummySource.connect(silentGain);
        silentGain.connect(pitchShifter.node);
        dummySource.start();
    }

    if (isVideo) {
        videoPlayer.playbackRate = currentTempo;
        videoPlayer.play().catch(e => console.warn(e));
    }

    isPlaying = true;
    iconPlay.classList.replace('bi-play-fill', 'bi-pause-fill');
    audioVisualizer.classList.add('is-playing');

    // Start Master Sync & UI render loop
    if (rAF_ID) cancelAnimationFrame(rAF_ID);
    rAF_ID = requestAnimationFrame(masterSyncLoop);
}

function pausePlayback() {
    if (pitchShifter) {
        pitchShifter.disconnect();
    }
    if (dummySource) {
        dummySource.stop();
        dummySource.disconnect();
        dummySource = null;
    }
    if (isVideo) {
        videoPlayer.pause();
    }

    isPlaying = false;
    iconPlay.classList.replace('bi-pause-fill', 'bi-play-fill');
    audioVisualizer.classList.remove('is-playing');

    if (rAF_ID) {
        cancelAnimationFrame(rAF_ID);
        rAF_ID = null;
    }
}

function stopPlayback() {
    pausePlayback();
    if (pitchShifter) {
        seekTo(0);
    }
}

function seekTo(timeInSeconds) {
    if (!pitchShifter) return;

    // clamp bounds
    let t = Math.max(0, Math.min(timeInSeconds, pitchShifter.duration));
    pitchShifter.percentagePlayed = t / pitchShifter.duration;

    if (isVideo) {
        const targetVideoTime = t + manualSyncOffset;
        videoPlayer.currentTime = Math.max(0, targetVideoTime);
        forceSyncNextFrame = true; // Added
    }

    updateUI(t);
}

function skipTime(delta) {
    if (!pitchShifter) return;
    seekTo(pitchShifter.timePlayed + delta);
}

// --- Advanced Timing & Sync State ---
let lastAudioPos = 0;
let lastAudioUpdatePerf = 0;
let forceSyncNextFrame = false;

// --- Master Clock Sync Loop ---
// Ensures Video exactly syncs with Audio, resolving Guitar practice frustrations.
function masterSyncLoop() {
    if (!isPlaying || !pitchShifter) return;

    // 1. Get Smoothed Audio Time (Interpolation)
    // Audio clock updates in chunks (about every ~93ms). 
    // We interpolate between updates using performance.now() for 60fps smoothness.
    const rawAudioTime = pitchShifter.timePlayed;
    const now = performance.now();

    if (rawAudioTime !== lastAudioPos) {
        lastAudioPos = rawAudioTime;
        lastAudioUpdatePerf = now;
    }

    // Calculate interpolated time: time since last chunk update * current speed
    const timeSinceUpdate = (now - lastAudioUpdatePerf) / 1000;
    const smoothAudioTime = rawAudioTime + (timeSinceUpdate * currentTempo);

    // 2. Check A-B Loop boundaries (use smooth time for precise triggers)
    checkABLoop(smoothAudioTime);

    // 3. Sync Video to Audio (Audio is Master)
    if (isVideo) {
        const targetVideoTime = smoothAudioTime + manualSyncOffset;
        const diff = videoPlayer.currentTime - targetVideoTime;
        const absDiff = Math.abs(diff);

        // Continuous playback rate alignment
        if (Math.abs(videoPlayer.playbackRate - currentTempo) > 0.01) {
            videoPlayer.playbackRate = currentTempo;
        }

        // SYNC STRATEGY:
        // - If forceSyncNextFrame is true (loops, seeks), sync immediately.
        // - If drift > 0.3s (relaxed threshold), force sync. 
        // - Otherwise, let the video's natural clock keep things smooth.
        if (forceSyncNextFrame || absDiff > 0.3) {
            videoPlayer.currentTime = Math.max(0, targetVideoTime);
            forceSyncNextFrame = false;
        }
    }

    // 4. Update Status UI
    updateUI(smoothAudioTime);

    rAF_ID = requestAnimationFrame(masterSyncLoop);
}

function updateUI(timeInSeconds) {
    timeCurrent.textContent = formatTime(timeInSeconds);
    if (!seekSlider.matches(':active')) { // only update slider if user isn't dragging it
        seekSlider.value = pitchShifter ? (timeInSeconds / pitchShifter.duration) * 100 : 0;
    }
}

// --- A-B Loop & Bar Snap Logic ---
function getBeatDuration() {
    return 60.0 / Math.max(40, Math.min(240, currentBpm));
}

function getBarDuration() {
    return getBeatDuration() * beatsPerBar;
}

function snapTimeToBeat(timeSec) {
    if (!isSnapEnabled) return timeSec;
    const beatDur = getBeatDuration();
    const beatsFromOffset = Math.round((timeSec - beatOffset) / beatDur);
    const snapped = beatOffset + beatsFromOffset * beatDur;
    const maxDur = pitchShifter ? pitchShifter.duration : Infinity;
    return Math.max(0, Math.min(maxDur, snapped));
}

function handleSetA() {
    if (!pitchShifter) return;
    const rawTime = pitchShifter.timePlayed;
    loopStart = isSnapEnabled ? snapTimeToBeat(rawTime) : rawTime;
    loopA_Disp.textContent = formatTime(loopStart);
    btnSetA.classList.add('active');

    // If B is already set after A and snap is active, align B to exact bar multiple from A
    if (isSnapEnabled && loopEnd !== null && loopEnd > loopStart) {
        resnapLoopEndToBars();
    } else {
        checkLoopState();
    }
}

function handleSetB() {
    if (!pitchShifter) return;
    const rawTime = pitchShifter.timePlayed;

    if (isSnapEnabled && loopStart !== null) {
        const barDur = getBarDuration();
        if (rawTime >= loopStart) {
            const numBars = Math.max(1, Math.round((rawTime - loopStart) / barDur));
            loopEnd = Math.min(pitchShifter.duration, loopStart + numBars * barDur);
        } else {
            // User pressed B before A: snap A-B swap to exact bars
            const snappedB = snapTimeToBeat(rawTime);
            const numBars = Math.max(1, Math.round((loopStart - snappedB) / barDur));
            loopEnd = Math.min(pitchShifter.duration, snappedB + numBars * barDur);
            loopStart = snappedB;
            loopA_Disp.textContent = formatTime(loopStart);
        }
    } else {
        loopEnd = isSnapEnabled ? snapTimeToBeat(rawTime) : rawTime;
    }

    loopB_Disp.textContent = formatTime(loopEnd);
    btnSetB.classList.add('active');
    checkLoopState();
}

function resnapLoopEndToBars() {
    if (!pitchShifter || loopStart === null || loopEnd === null) return;
    const barDur = getBarDuration();
    const numBars = Math.max(1, Math.round(Math.abs(loopEnd - loopStart) / barDur));
    loopEnd = Math.min(pitchShifter.duration, loopStart + numBars * barDur);
    loopB_Disp.textContent = formatTime(loopEnd);
    checkLoopState();
}

function toggleSnapEnabled() {
    isSnapEnabled = !isSnapEnabled;
    if (isSnapEnabled) {
        btnSnapToggle.classList.add('active', 'btn-outline-info');
        btnSnapToggle.classList.remove('btn-outline-secondary');
        if (loopStart !== null && loopEnd !== null) {
            loopStart = snapTimeToBeat(loopStart);
            resnapLoopEndToBars();
        }
    } else {
        btnSnapToggle.classList.remove('active', 'btn-outline-info');
        btnSnapToggle.classList.add('btn-outline-secondary');
        updateLoopOverlay();
    }
}

function setBpm(val) {
    currentBpm = Math.max(40, Math.min(240, Math.round(val * 10) / 10));
    const dispVal = Number.isInteger(currentBpm) ? currentBpm.toString() : currentBpm.toFixed(1);
    inputBpm.value = dispVal;
    badgeBpm.textContent = `${dispVal}`;

    if (isSnapEnabled && loopStart !== null && loopEnd !== null) {
        resnapLoopEndToBars();
    } else {
        updateLoopOverlay();
    }
}

function handleTapTempo() {
    const now = performance.now();
    // Reset tap history if last tap was more than 2.2 seconds ago
    if (tapTimestamps.length > 0 && now - tapTimestamps[tapTimestamps.length - 1] > 2200) {
        tapTimestamps = [];
    }
    tapTimestamps.push(now);
    if (tapTimestamps.length > 8) {
        tapTimestamps.shift();
    }

    // Align beat grid phase to the user's tap position in the track
    if (pitchShifter) {
        beatOffset = pitchShifter.timePlayed % getBeatDuration();
    }

    if (tapTimestamps.length >= 2) {
        let totalInterval = 0;
        for (let i = 1; i < tapTimestamps.length; i++) {
            totalInterval += (tapTimestamps[i] - tapTimestamps[i - 1]);
        }
        const avgMs = totalInterval / (tapTimestamps.length - 1);
        const tappedBpm = Math.round(60000 / avgMs);
        setBpm(tappedBpm);
    }
}

function shiftLoop(deltaSec) {
    if (!pitchShifter) return;
    const maxDur = pitchShifter.duration;

    // Also shift beat grid offset so future snaps follow the user's fine-tuning
    beatOffset = ((beatOffset + deltaSec) % getBeatDuration() + getBeatDuration()) % getBeatDuration();

    if (loopStart !== null && loopEnd !== null) {
        const len = loopEnd - loopStart;
        let newStart = Math.max(0, Math.min(maxDur - len, loopStart + deltaSec));
        loopStart = newStart;
        loopEnd = newStart + len;
        loopA_Disp.textContent = formatTime(loopStart);
        loopB_Disp.textContent = formatTime(loopEnd);
        updateLoopOverlay();
        seekTo(loopStart);
    } else if (loopStart !== null) {
        loopStart = Math.max(0, Math.min(maxDur, loopStart + deltaSec));
        loopA_Disp.textContent = formatTime(loopStart);
        seekTo(loopStart);
    }
}

function adjustLoopBars(deltaBars) {
    if (!pitchShifter) return;
    const barDur = getBarDuration();
    if (loopStart === null) {
        loopStart = snapTimeToBeat(pitchShifter.timePlayed);
        loopA_Disp.textContent = formatTime(loopStart);
        btnSetA.classList.add('active');
    }
    const currentBars = loopEnd !== null
        ? Math.max(1, Math.round((loopEnd - loopStart) / barDur))
        : 1;
    const nextBars = Math.max(1, currentBars + deltaBars);
    loopEnd = Math.min(pitchShifter.duration, loopStart + nextBars * barDur);
    loopB_Disp.textContent = formatTime(loopEnd);
    btnSetB.classList.add('active');
    checkLoopState();
}

function moveLoopSection(direction) {
    if (!pitchShifter || loopStart === null || loopEnd === null) return;
    const len = loopEnd - loopStart;
    if (len <= 0) return;
    shiftLoop(direction * len);
}

// --- Automatic BPM & Beat Phase Detection from AudioBuffer ---
function runAutoBpmDetection(buffer) {
    if (!buffer) return;
    badgeBpm.textContent = '...';

    // Run asynchronously after a short tick so UI remains responsive
    setTimeout(() => {
        try {
            const result = detectTempoAndBeatOffset(buffer);
            beatOffset = result.offset;
            setBpm(result.bpm);
        } catch (e) {
            console.warn("BPM auto-detection fallback to 120:", e);
            setBpm(120);
        }
    }, 20);
}

function detectTempoAndBeatOffset(buffer) {
    const sampleRate = buffer.sampleRate;
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
    const totalSamples = ch0.length;

    // Analyze up to 60 seconds from an active region of the track
    const startSec = buffer.duration > 25 ? Math.min(8, buffer.duration * 0.1) : 0;
    const analyzeDuration = Math.min(60, buffer.duration - startSec);
    const startSample = Math.floor(startSec * sampleRate);
    const endSample = Math.min(totalSamples, startSample + Math.floor(analyzeDuration * sampleRate));

    // Step 1: Compute energy envelope at ~100 Hz (10ms hop)
    const targetEnvRate = 100;
    const hopSize = Math.max(1, Math.floor(sampleRate / targetEnvRate));
    const envRate = sampleRate / hopSize;
    const numFrames = Math.floor((endSample - startSample) / hopSize);

    if (numFrames < 200) {
        return { bpm: 120, offset: 0 };
    }

    const energy = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
        const base = startSample + i * hopSize;
        let sum = 0;
        // Stride by 4 samples for fast RMS estimation
        let count = 0;
        for (let j = 0; j < hopSize; j += 4) {
            const s = ch1 ? 0.5 * (ch0[base + j] + ch1[base + j]) : ch0[base + j];
            sum += s * s;
            count++;
        }
        energy[i] = Math.sqrt(sum / Math.max(1, count));
    }

    // Step 2: Half-wave rectified first-order difference (Onset strength envelope)
    const onset = new Float32Array(numFrames);
    for (let i = 1; i < numFrames; i++) {
        const diff = energy[i] - energy[i - 1];
        onset[i] = diff > 0 ? diff : 0;
    }

    // Subtract local moving average (window ~0.2s) to normalize quiet vs loud passages
    const normOnset = new Float32Array(numFrames);
    const halfWin = 10;
    for (let i = 0; i < numFrames; i++) {
        let localSum = 0;
        let cnt = 0;
        const wStart = Math.max(0, i - halfWin);
        const wEnd = Math.min(numFrames - 1, i + halfWin);
        for (let k = wStart; k <= wEnd; k++) {
            localSum += onset[k];
            cnt++;
        }
        const v = onset[i] - (localSum / cnt);
        normOnset[i] = v > 0 ? v : 0;
    }

    // Step 3: Autocorrelation with harmonic enhancement over 70 - 180 BPM
    const minBpm = 70;
    const maxBpm = 180;
    const acfCache = new Map();

    function getAutocorr(lag) {
        if (lag < 1 || lag >= numFrames) return 0;
        if (acfCache.has(lag)) return acfCache.get(lag);
        let sum = 0;
        const limit = numFrames - lag;
        for (let i = 0; i < limit; i++) {
            sum += normOnset[i] * normOnset[i + lag];
        }
        const val = sum / limit;
        acfCache.set(lag, val);
        return val;
    }

    let bestBpm = 120;
    let bestScore = -1;

    for (let bpm = minBpm; bpm <= maxBpm; bpm += 1) {
        const exactLag = (60.0 * envRate) / bpm;
        const lag1 = Math.round(exactLag);
        const lag2 = Math.round(exactLag * 2);
        const lag4 = Math.round(exactLag * 4);

        // Combine fundamental beat period with 2-beat and 4-beat (1 bar) harmonics
        const rawScore = getAutocorr(lag1) + 0.5 * getAutocorr(lag2) + 0.3 * getAutocorr(lag4);

        // Gentle log-normal prior centered around 120 BPM to avoid octave errors
        const logRatio = Math.log2(bpm / 120.0);
        const prior = Math.exp(-0.5 * Math.pow(logRatio / 0.7, 2));
        const score = rawScore * prior;

        if (score > bestScore) {
            bestScore = score;
            bestBpm = bpm;
        }
    }

    // Step 4: Find optimal beat phase (offset) using a comb filter at bestBpm
    const beatPeriodSec = 60.0 / bestBpm;
    const beatPeriodFrames = (60.0 * envRate) / bestBpm;
    const numPhaseSteps = Math.max(8, Math.round(beatPeriodFrames));
    let bestPhaseFrame = 0;
    let maxPhaseEnergy = -1;

    for (let p = 0; p < numPhaseSteps; p++) {
        let phaseSum = 0;
        for (let f = p; f < numFrames; f += beatPeriodFrames) {
            const idx = Math.round(f);
            if (idx < numFrames) {
                phaseSum += normOnset[idx];
            }
        }
        if (phaseSum > maxPhaseEnergy) {
            maxPhaseEnergy = phaseSum;
            bestPhaseFrame = p;
        }
    }

    const rawOffsetSec = startSec + (bestPhaseFrame / envRate);
    const normalizedOffset = ((rawOffsetSec % beatPeriodSec) + beatPeriodSec) % beatPeriodSec;

    return {
        bpm: bestBpm,
        offset: normalizedOffset
    };
}

function toggleLoopMode() {
    loopMode = (loopMode + 1) % 3;
    setLoopMode(loopMode);
}

function setLoopMode(mode) {
    loopMode = mode;
    iconLoopMode.className = 'bi'; // reset
    btnLoopMode.classList.remove('btn-outline-secondary', 'btn-primary', 'btn-info', 'active');

    if (mode === LOOP_OFF) {
        iconLoopMode.classList.add('bi-repeat');
        btnLoopMode.classList.add('btn-outline-secondary');
    } else if (mode === LOOP_ALL) {
        iconLoopMode.classList.add('bi-repeat');
        btnLoopMode.classList.add('btn-primary');
    } else if (mode === LOOP_AB) {
        iconLoopMode.classList.add('bi-repeat-1');
        btnLoopMode.classList.add('btn-info', 'active');

        // Failsafe: if enabling AB but not set, guess reasonable defaults
        if (loopStart === null) loopStart = 0;
        if (loopEnd === null && pitchShifter) loopEnd = pitchShifter.duration;
        updateLoopOverlay();
    }
}

function checkABLoop(currentTime) {
    if (loopMode === LOOP_AB && loopStart !== null && loopEnd !== null) {
        // Trigger loop reset if we hit or exceed the B marker
        if (currentTime >= loopEnd) {
            seekTo(loopStart);
            forceSyncNextFrame = true; // Added
        }
    }
}

function checkLoopState() {
    if (loopStart !== null && loopEnd !== null) {
        // Validate A < B, swap if inverted
        if (loopStart >= loopEnd) {
            let temp = loopStart;
            loopStart = loopEnd;
            loopEnd = temp;
        }
        loopA_Disp.textContent = formatTime(loopStart);
        loopB_Disp.textContent = formatTime(loopEnd);
        btnClearLoop.disabled = false;
        loopOverlay.classList.remove('d-none');
        setLoopMode(LOOP_AB); // Auto-activate AB loop
        updateLoopOverlay();
    } else {
        btnClearLoop.disabled = true;
        loopOverlay.classList.add('d-none');
    }
}

function clearABLoop() {
    loopStart = null;
    loopEnd = null;
    btnSetA.classList.remove('active');
    btnSetB.classList.remove('active');
    loopA_Disp.textContent = '--:--';
    loopB_Disp.textContent = '--:--';
    if (loopBarInfo) loopBarInfo.textContent = '';
    btnClearLoop.disabled = true;
    loopOverlay.classList.add('d-none');
    if (loopMode === LOOP_AB) {
        setLoopMode(LOOP_OFF);
    }
}

function updateLoopOverlay() {
    if (loopMode === LOOP_AB && loopStart !== null && loopEnd !== null) {
        loopA_Disp.textContent = formatTime(loopStart);
        loopB_Disp.textContent = formatTime(loopEnd);
        if (loopBarInfo) {
            const barDur = getBarDuration();
            const bars = (loopEnd - loopStart) / barDur;
            const roundedBars = Math.round(bars * 10) / 10;
            loopBarInfo.textContent = isSnapEnabled
                ? `(${Math.round(bars)}小節 / ${currentBpm}BPM)`
                : `(${roundedBars}小節相当)`;
        }
        loopOverlay.classList.remove('d-none');
    }
}

// --- Parameter Adjustments ---
function setTempo(val) {
    // Clamp 0.5 - 1.2
    currentTempo = Math.max(0.5, Math.min(1.2, val));
    valTempo.textContent = Math.round(currentTempo * 100) + '%';

    // Indepnedent Control via soundtouch.js
    if (pitchShifter) {
        pitchShifter.tempo = currentTempo;
    }
    // Video rate sync is implicitly handled in masterSyncLoop
}

function setPitch(st) {
    // Clamp -4 to +4
    currentPitch = Math.max(-4, Math.min(4, st));
    valPitch.textContent = (currentPitch > 0 ? '+' : '') + currentPitch + ' st';

    // Indepnedent Control via soundtouch.js
    if (pitchShifter) {
        pitchShifter.pitchSemitones = currentPitch;
    }
}

function setSyncOffset(sec) {
    // Clamp -1.0 to 1.0 seconds range
    manualSyncOffset = Math.max(-1.0, Math.min(1.0, sec));
    sliderSync.value = manualSyncOffset.toFixed(2);
    valSync.textContent = (manualSyncOffset >= 0 ? '+' : '') + manualSyncOffset.toFixed(2) + 's';

    // Apply immediate sync correction if already playing
    if (isPlaying && isVideo && pitchShifter) {
        const targetVideoTime = pitchShifter.timePlayed + manualSyncOffset;
        videoPlayer.currentTime = Math.max(0, targetVideoTime);
    }
}

// --- Utils ---
function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00.0';
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const sInt = Math.floor(s);
    const ms = Math.floor((s - sInt) * 10); // 1 decimal place format

    return `${m.toString().padStart(2, '0')}:${sInt.toString().padStart(2, '0')}.${ms}`;
}