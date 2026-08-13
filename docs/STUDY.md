# LogSonar — Study Protocol
**IRB #: IRB2026-487 | PI: Warren Edwards | Contact: Priyanshu Mehta**
**IRB Status: Approved (Exempt) — 22 July 2026**

> All data is collected under anonymous Participant_XX identifiers. No audio recordings, screen recordings, photographs, IP addresses, or personally identifying information are collected at any point.

---

## Why This Study Exists

Modern software engineers — especially site reliability engineers (SREs) — spend long on-call shifts monitoring complex systems while simultaneously writing code, reviewing pull requests, and responding to incidents. Every one of those tasks competes for the same visual channel. When a warning appears on a monitoring dashboard while an engineer is deep in a code review, it is effectively invisible until they stop and look up.

The auditory channel is different. Sound is ambient and persistent — it reaches us even when our eyes are elsewhere. This study asks a simple but consequential question: **can we replace the visual monitoring dashboard with a carefully designed audio stream, and have operators detect system anomalies just as well — or better — while keeping their focus on their primary work?**

If the answer is yes, the implications are broad. Every engineer who works on-call benefits. Every system that gets monitored by a human benefits. This is the argument that motivates the study, and it is the argument that needs to be substantiated with rigorous data.

---

## What We Are Measuring

We are comparing two monitoring conditions:

- **AUDIO condition:** The system metrics dashboard is hidden. The participant hears a continuous audio stream where each of four metrics (CPU, Memory, Disk I/O, Response Latency) is mapped to a distinct synthesized sound. Rising values produce rising pitch or increasing noise intensity.

- **VISUAL condition:** The system metrics dashboard is visible as a scrolling chart. The audio stream is off. The participant monitors by watching the chart.

In both conditions, the participant simultaneously performs a **primary task**: keeping a cursor inside a moving circular target on screen. This simulates the divided-attention nature of real engineering work.

The core questions are:
1. Does the audio condition allow participants to detect anomalies with similar accuracy and timing as the visual condition?
2. Does the audio condition cause less disruption to the primary task than the visual condition?
3. Do participants find the audio condition usable and acceptable for real on-call work?

---

## Session Overview

**Total time per participant: approximately 2 hours.**

| Phase | What Happens | Duration |
|---|---|---|
| Welcome + Consent | Explain study, obtain consent, assign Participant ID | 5 min |
| Sound Calibration | Participant customises which sound represents which metric | 5 min |
| Solo Baseline | Tracking task only — no monitoring required | 5 min |
| Training Run | Participant learns to detect a simple anomaly (must pass to continue) | 5 min |
| — Rest — | Mandatory break | 5 min |
| **Block A — Run 1** | Simple single-metric anomaly in assigned condition | 5 min |
| **Block A — Run 2** | Two-metric cause-and-effect anomaly | 10 min |
| **Block A — Run 3** | Full four-metric cascade anomaly | 30 min |
| NASA-TLX (paper form) | Workload questionnaire | 5 min |
| — Rest — | Mandatory break | 10 min |
| **Block B — Run 1** | Same run types in the alternate condition | 5 min |
| **Block B — Run 2** | | 10 min |
| **Block B — Run 3** | | 30 min |
| NASA-TLX (paper form) | Workload questionnaire | 5 min |
| In-software questionnaire | Auto-fires after final run | 2 min |
| Debrief | Answer participant questions, explain study goals | 5 min |

---

## Counterbalancing

Alternate the condition order between participants using the following rule:

- **Odd Participant IDs** (01, 03, 05…): Start with **AUDIO**, then switch to **VISUAL**
- **Even Participant IDs** (02, 04, 06…): Start with **VISUAL**, then switch to **AUDIO**

**Do not deviate from this assignment.** Counterbalancing is essential to prevent learning effects from inflating one condition's results.

---

## Before Each Session

1. Open LogSonar in a browser at `http://localhost:5174` (or the deployed URL).
2. Set the **Participant ID** field in the sidebar to the assigned ID (e.g., `Participant_07`).
3. Confirm the condition order for this participant (odd = AUDIO first, even = VISUAL first).
4. **If starting with AUDIO:** Click `Hide View` before the participant sits down.
5. **If starting with VISUAL:** Confirm `Show View` is active.
6. Set the run preset to **Free Play** for the calibration phase.

---

## Sound Calibration (Free Play — ~5 min)

1. Enable audio by pressing any key or clicking on the interface.
2. Select **Free Play** preset and click **Start Log** — wait, do NOT start logging here. Just let the timeline play freely.
3. Walk the participant through the Sound Preferences panel in the sidebar:
   - For each metric (CPU, Memory, Disk, Latency), have them click through the sound options.
   - Selecting a sound previews it for 2 seconds automatically.
   - Ask them to choose the sound that feels most natural and distinguishable for each metric.
4. Once satisfied, the participant's sound mapping is set for the entire session. **Do not change it after this point.**

> The participant chose their own sounds. This is intentional — it means we cannot later be accused of choosing a confounding sound design. Their choices are logged automatically.

---

## Solo Baseline (~5 min)

1. Select **Solo Baseline** preset.
2. Tell the participant: *"For this run, ignore the chart completely. Your only job is to keep the cursor inside the moving circle on screen. There is no monitoring task."*
3. Click **Start Log**.
4. Let the run complete naturally (5 minutes). The system will prompt to download a CSV automatically at the end. Save it.

---

## Training Run (~5 min)

1. Select **Run 1 (CPU)** preset.
2. Set the condition to **AUDIO** (hide view) regardless of the participant's assigned order — training always uses audio.
3. Explain: *"You will hear sounds representing system metrics. If you believe a metric has spiked abnormally, press the Flag Anomaly button. At the end, you will be asked what you think caused it."*
4. Click **Start Log**. The run is 5 minutes.
5. After the post-run survey, the system will show a checkmark (✓) next to Run 1 in the sidebar if the participant correctly identified the anomaly within 60 seconds. **If the checkmark does not appear, repeat the training run.** Do not proceed to experimental runs until the participant passes.

---

## Experimental Runs (Block A and Block B)

For each block, set the view state (AUDIO = hide view, VISUAL = show view) according to the participant's assigned order.

**Run 1 (5 min — CPU spike)**
1. Select **Run 1 (CPU)** preset.
2. Click **Start Log**.
3. Remind participant they can press **Flag Anomaly** at any time if they notice something unusual.
4. At the end, complete the in-software survey that appears automatically.
5. Save the CSV.

**Run 2 (10 min — Disk I/O → Latency)**
1. Select **Run 2 (Disk + Latency)** preset.
2. Click **Start Log**.
3. Same instructions as Run 1. The survey will ask about two metrics this time.
4. Save the CSV.

**Run 3 (30 min — Full cascade)**
1. Select **Run 3 (Full Cascade)** preset.
2. Click **Start Log**.
3. Remind the participant this is a longer run. They may flag multiple anomalies.
4. At the end, the survey fires once per flag, then a final in-software questionnaire fires automatically.
5. Save all CSVs.

> **Important:** After Run 3 in Block A, hand the participant the **NASA-TLX paper form** and let them complete it before the rest break. Repeat after Run 3 in Block B.

---

## Ending the Run Early

If a participant wants to stop mid-run, click **Stop Log**. The survey and CSV download will still fire. Mark the run as incomplete in your paper notes and note the elapsed time.

---

## Data Files

Every run produces one CSV file. The filename format is:
```
Participant_07_run3_1722954823000.csv
```

Save all CSV files to the shared study drive immediately after each download. Do not rename them.

---

## Things NOT to Tell the Participant

- Do not tell them where in the timeline the anomaly occurs.
- Do not tell them which metric is responsible for the anomaly.
- Do not tell them whether their flag was correct or not until the debrief.
- Do not suggest which sound to choose during calibration.

---

## Debrief Script

*"Thank you for participating. The study is now complete. What we were testing is whether audio feedback about system health metrics can help engineers stay aware of problems without having to look away from their primary work. Your data will help us understand how effectively sound can carry this information and whether it is worth building into real engineering tools. Do you have any questions?"*

---

## Contact

**Primary investigator:** Warren Edwards
**Study coordinator:** Priyanshu Mehta
