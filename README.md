# LogSonar

**LogSonar** is an advanced, eyes-free auditory telemetry and system monitoring interface designed specifically for software engineers. It enables developers to monitor complex microservice infrastructure, track error rates, and identify server anomalies using an innovative **Velocity-Adaptive Audio** engine.

## Overview

As digital environments and infrastructure dashboards become increasingly complex, engineers often experience visual fatigue. They are forced to actively monitor graphs while simultaneously focusing on high-demand tasks (e.g., writing code or debugging).

LogSonar solves this by shifting telemetry data into the auditory channel. Utilizing the Web Audio API and Web Speech API, LogSonar allows users to scrub through dense time-series server logs and hear anomalies as continuous synthesizer modulations, dropping down to granular, text-to-speech log readouts when precision is required.

## Features

- **Velocity-Adaptive Sonification (Gears 2-5):** At high scrubbing speeds, LogSonar converts dense time-series data into continuous audio signals (sine, triangle, and filtered noise) representing metrics like CPU Utilization, Memory, Network I/O, Disk I/O, Error Rates, and Latency.
- **"Karaoke" Log Reading (Gear 1):** At the most granular level, the system pauses timeline traversal to clearly read the exact text of the log statement using Text-to-Speech (TTS). It guarantees perfect audio-visual synchronization by intelligently pausing the timeline exactly when the utterance begins and resuming the exact millisecond it finishes.
- **Elastic Braking:** Rapid deceleration and hard stops ensure developers can quickly zero in on an anomaly the moment they hear an auditory spike.
- **Boundary Auto-Braking:** Automatic safety bounds prevent the scrubber from flying off the end of the timeline, enforcing a clean hard stop.
- **Visual Validation Dashboard:** A beautiful, real-time React/Recharts UI plots the active telemetry signal with dynamic domain tracking, providing visual feedback to match the auditory experience.

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/priyanshum17/logsonar.git
   cd logsonar
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

### Usage
- Use the **W** (Accelerate) and **S** (Reverse) keys to shift gears.
- Use **A** to trigger an immediate Hard Stop.
- Observe the auditory response and the visual playhead as you move through the dataset.
- Drop down to **Level 1** (or Level -1) to engage granular log-reading mode.

## Research & Academic Use

This software was developed in part to study the efficacy of eyes-free interfaces and cognitive load reduction in telemetry scenarios. For inquiries regarding human-computer interaction (HCI) studies using LogSonar, please refer to the internal IRB documentation.

## License
MIT License
