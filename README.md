# LogSonar

**LogSonar** is an advanced, eyes-free auditory telemetry and system monitoring interface designed specifically for software engineers. It enables developers to monitor complex microservice infrastructure, track error rates, and identify server anomalies using an innovative **Velocity-Adaptive Audio** engine.

It also serves as the primary software instrument for the Georgia Tech IRB-approved research study **"Eyes-Free System Monitoring and Telemetry Exploration for Software Engineers"** (IRB Protocol #: IRB2026-487).

---

## Quick Start

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Running Locally
```bash
# 1. Clone repository
git clone https://github.com/priyanshum17/logsonar.git
cd logsonar

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

Open `http://localhost:5173` (or the port indicated in terminal) in a WebAudio-compatible browser (Chrome, Edge, Safari, Firefox). Click anywhere on the screen or press any key to initialize the Web Audio API.

---

## How to Use the Software

### 1. Keyboard Navigation Controls

LogSonar uses a gear-based physics model for navigating time-series telemetry datasets:

| Key | Action | Description |
|---|---|---|
| **W** | Gear Up (Forward) | Shifts playhead speed forward (+1 to +5 gears). Higher gears scrub faster. |
| **S** | Gear Down (Reverse) | Shifts playhead speed in reverse (-1 to -5 gears). |
| **A** | Hard Stop / Brake | Instantly stops timeline navigation (sets gear to 0) and cancels speech readout. |
| **D** | Flag Anomaly | Stamps an anomaly flag event (`flag`) into the interaction log for Signal Detection Theory ($d'$) analysis. |

---

### 2. Experimental Presets (Run Switcher)

Use the preset buttons in the header bar to select the study mode:

- **Free Play:** Manual exploration mode. Toggle any metrics on/off using the left navigation bar.
- **Solo Base (Solo Baseline):** Hides visual graphs and activates the primary mouse-tracking task without audio. Used to record 2-minute individual visual attention baseline floors.
- **Run 1 (Single Metric):** Configures single-metric monitoring (CPU Utilization) to calibrate basic auditory detection.
- **Run 2 (Two Metrics):** Configures two correlated metrics (Disk I/O + Latency) to test auditory causal attribution.
- **Run 3 (Full Cascade):** Configures all 6 microservice metrics to test 30-minute full cascading failure tracing.

---

### 3. Study Session & Header Controls

- **Start Log / Stop Log:** 
  - Click **Start Log** at the start of a trial to record timestamps, gear shifts, flags, and mouse tracking samples.
  - Click **Stop Log (NF)** to stop recording and automatically download the session CSV file (`session_XXXXXX.csv`).
- **Baseline (Audio Tour):**
  - Plays a 5-second baseline audio tour at 15% volume for each active metric, accompanied by TTS voice labels (e.g. *"CPU baseline"*). Gives participants a clear sonic anchor for normal system behavior.
- **Report Peak:**
  - Opens the **Incident Reporting Modal** (see below).
- **Hide View / Show View:**
  - Toggles **Blind Mode**, hiding all visual line graphs to test eyes-free auditory monitoring.

---

### 4. Primary Visual Tracking Task (Dual-Task Load)

When an experimental preset (Solo Base, Run 1, Run 2, Run 3) is active, a floating canvas overlay appears in the top-right viewport:
- A target ring moves continuously across the canvas.
- Participants keep their mouse cursor inside the ring while listening to audio.
- The system computes real-time tracking error (pixel deviation) and logs a `primary_task_sample` every second to compute **Primary Task Degradation (PTD)**.

---

### 5. Incident Reporting Modal

When a participant identifies an anomaly, clicking **Report Peak** opens an interactive modal tailored to the active run:
- **Run 1:** Confirms the reported timestamp and root cause metric.
- **Run 2:** Captures the **Root Cause Metric** (Disk I/O) and **Downstream Symptom Metric** (Latency).
- **Run 3:** Captures the Root Cause Metric and lets the participant interactively reconstruct the **Cascade Chain Sequence** (e.g. `Disk → Latency → Network → CPU → ErrorRate`).

Submitting the report automatically calculates temporal proximity ($\Delta T_{root}$), continuous proximity score ($0.0 - 1.0$), and binary causal attribution accuracy directly into the CSV log.

---

## Data Collection & CSV Export Format

Generated CSV files (`session_XXXXXX.csv`) contain no personally identifying information (PII). Each row represents an event with the following schema:

`wall_clock_ms, elapsed_ms, event_type, playhead_pos_s, gear_level, extra`

Event types logged include:
- `gear_change` (W/S/A key shifts)
- `flag` (D key presses)
- `primary_task_sample` (`tracking_error_px=...`)
- `baseline_tour_start` / `baseline_tour_end`
- `report_peak` (`reported_root_metric=...; gt_root_onset_s=...; delta_T_root_s=...; proximity_score=...; attribution_correct=...`)

---

## Audio Mappings & Synthesizers

| Metric | Waveform / Engine | Stereo Panning | Frequency Range |
|---|---|---|---|
| **CPU Utilization** | Pure Sine Wave | Hard Left (-60°) | 250 Hz – 800 Hz |
| **Memory** | Triangle Wave | Hard Right (+60°) | 600 Hz – 1400 Hz |
| **Network I/O** | Sawtooth Wave | Soft Right (+30°) | 200 Hz – 800 Hz |
| **Disk I/O** | Square Wave | Soft Left (-30°) | 200 Hz – 800 Hz |
| **Latency** | Bandpass Filtered Noise | Center (0°) | 500 Hz – 4000 Hz |
| **Error Rate** | High Pitch Sine | Center (0°) | 400 Hz – 1600 Hz |

*The audio engine includes dynamic **Salience-Driven Masking** (Auditory Spotlight) that automatically ducks background metrics when an anomaly exceeds 30% severity, preventing auditory overload.*

---

## License
MIT License
