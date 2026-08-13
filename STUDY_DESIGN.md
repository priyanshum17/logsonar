# LogSonar - Study Design Document
IRB #: IRB2026-487 | PI: Warren Edwards | Contact: Priyanshu Mehta

> **IRB Status: Approved (Exempt), 22 July 2026**
> All data collected in this study is limited strictly to what is described in the approved IRB protocol. No audio recordings, screen recordings, photographs, IP addresses, or personally identifying information of any kind are collected by the software or research team at any point. All digital data is associated solely with an anonymous `Participant_XX` identifier assigned at the start of each session.

---

## 1. Background and Motivation

Modern software engineering demands continuous, multi-channel attention. A site reliability engineer (SRE) monitoring a live production environment must simultaneously write code, review alerts, and interpret telemetry dashboards, all of which compete for a single, shared visual channel. As microservice architectures grow more complex, the cognitive cost of glancing between a primary task and a monitoring dashboard becomes non-trivial, contributing to alert fatigue, missed anomalies, and delayed incident response.

The emerging field of **sonification**, the systematic mapping of data to non-speech audio, offers a compelling alternative. If the monitoring channel can be shifted to the auditory domain, an engineer's visual attention can remain entirely allocated to the primary task. Prior work has shown that auditory displays can support situational awareness in aviation, radiology, and financial trading (Hermann et al., 2011; Brewster, 2002). However, their application to time-series server telemetry monitoring in a realistic dual-task context remains largely unexplored.

*LogSonar* is a browser-based, keyboard-driven auditory telemetry interface built on the Web Audio API. It maps six server metrics (CPU Utilization, Memory, Network I/O, Disk I/O, Latency, Error Rate) to distinct synthesizer voices that vary in timbre, frequency, stereo panning, and volume based on metric value. A salience-driven masking system dynamically ducks background voices when an anomaly is detected, guiding listener attention to the failing subsystem without any visual cue.

---

## 2. Research Questions and Hypotheses

- **RQ1:** Can participants accurately detect and localize anomalies within a time-series telemetry dataset using only an auditory interface, compared to a traditional visual dashboard?
- **RQ2:** Does the eyes-free auditory interface reduce performance degradation on a concurrent, visually demanding primary task compared to a visual dashboard condition?
- **RQ3:** Does the auditory interface impose significantly different subjective workload (NASA-TLX) than a visual monitoring approach?

**H1 (Detection Accuracy):** In the Auditory condition, anomaly detection accuracy, measured as temporal proximity to the known ground-truth peak, will be non-inferior to the Visual Baseline, with a tolerance of plus or minus 60 seconds.

**H2 (Primary Task Preservation):** Primary task performance will be significantly better preserved during the Auditory condition, as participants will not need to shift visual attention away from the primary task.

---

## 3. Experimental Design

The study employs a within-subjects, counterbalanced, dual-task design with three progressive experimental runs. Each participant completes all runs under a counterbalanced condition order, allowing direct within-subject comparison.

### 3.1 Conditions

| Condition | Label | Description |
|-----------|-------|-------------|
| **A** | Visual Baseline | Standard time-series line graph. Participant must glance at the visual display to monitor telemetry while performing the primary task. |
| **B** | Auditory Experimental | LogSonar "Blind Mode" where all visual graphs are hidden. Participant navigates the dataset using keyboard controls and detects anomalies purely through the polyphonic audio engine. |

Condition order is Latin-square counterbalanced across participants to eliminate order and carryover effects.

### 3.2 Primary Task

The primary task is a continuous visual attention task displayed on the same screen as the monitoring interface (Condition A) or on a separate display region (Condition B). Participants track a smoothly moving on-screen target using mouse input and are scored on mean deviation from the target in pixels. This task was chosen for three reasons: it provides uninterrupted, continuous visual demand rather than bursty demand; it uses only the mouse, leaving the keyboard free for LogSonar navigation; and mean tracking error is a single, continuous score directly comparable to prior dual-task HCI literature. Baseline tracking performance is established individually during the familiarization phase before any dual-task load is introduced.

### 3.3 Dataset Randomization

Each dataset is procedurally generated with a seeded random walk. The structure and order of events (for example, Disk spikes before Latency) is identical across all participants and repetitions, but the exact relative timing of onset varies slightly between runs. This prevents memorization of a specific timestamp across repeated trials while ensuring the causal story remains consistent and evaluable against a known ground truth.

---

## 4. Three Progressive Experimental Runs

The runs are ordered from simplest to most complex. The intent is for participants to internalize what a single anomaly sounds like before being asked to locate a root cause within a full cascading chain. This scaffolded structure mirrors realistic on-call scenarios and lets us measure how quickly participants pick up the auditory mapping across the session.

Before each run, the researcher plays a 30-second Healthy State Anchor, with all selected metrics at baseline levels (10-20%), so participants have a clear sonic reference point for what normal sounds like. This directly addresses a well-documented pitfall in sonification research: asking users to detect anomalies without first giving them a calibration baseline.

Throughout every run, participants may press the **[F] key** at any point to log a suspected anomaly. This is captured as part of the standard keyboard interaction log, consistent with the IRB-approved data collection method. At analysis time, the full sequence of flags is used to compute Hit Rate and False Alarm Rate, enabling a Signal Detection Theory (d-prime) analysis rather than simple binary accuracy.

---

#### Run 1 - Single Metric, Isolated Spike (*3 attempts*)

| Parameter | Value |
|-----------|-------|
| Dataset Duration | 5 minutes |
| Active Metrics | 1 (CPU Utilization only) |
| Anomaly Type | Single isolated CPU spike peaking at ~80% |
| Anomaly Onset | T approximately 2:30 (randomized +/- 15s each attempt) |
| Anomaly Duration | ~45 seconds |
| Dataset Complexity | Low |

This is the calibration run. The participant monitors a single sine wave mapped to CPU utilization, the most intuitive and concrete mapping in the system. The anomaly is a rapid, sustained rise in pitch. This run answers the most fundamental question: can the participant simply hear a spike at all? Three attempts are given because the onset timing shifts by up to 15 seconds each time, which prevents participants from memorizing an exact timestamp. That said, they do benefit from knowing roughly where in the dataset to listen, which is an intentional and ecologically valid design choice. Real SREs also tend to know roughly when an incident window started.

**Logged Variables - `run1_events.csv`**

| CSV Column | Type | Description | Used For |
|---|---|---|---|
| `participant_id` | string | Anonymous session ID (e.g. `Participant_04`) | Joining records across files |
| `attempt` | int (1-3) | Which of the three attempts | Learning-effect ANOVA |
| `condition` | string (`visual` / `auditory`) | Which interface condition | Primary between-condition comparison |
| `wall_clock_ms` | int | Absolute millisecond timestamp of the event (session clock) | Sequencing and latency calculation |
| `event_type` | string (`gear_change` / `flag` / `report`) | Type of keyboard action | Navigation strategy analysis |
| `gear_level` | int (-5 to +5) | Playhead speed at time of event | Understanding approach behavior |
| `playhead_pos_s` | float | Dataset position in seconds at time of event | Mapping flag to ground-truth anomaly window |
| `ground_truth_onset_s` | float | True anomaly onset for this seed (computed, not user-provided) | Calculating delta_T and d-prime |
| `delta_T_s` | float | Absolute difference between playhead position and ground truth onset, for report events | Primary accuracy metric |

*Each row is one keyboard event. All flag events and final report events are used to compute Hit Rate, False Alarm Rate, and d-prime. Gear change rows support post-hoc navigation strategy analysis.*

---

#### Run 2 - Two Metrics, Correlated Anomaly (*3 attempts*)

| Parameter | Value |
|-----------|-------|
| Dataset Duration | 10 minutes |
| Active Metrics | 2 (Disk I/O + Latency) |
| Anomaly Type | Disk I/O spikes first; Latency follows ~90s later |
| Disk Onset | T approximately 3:00 (randomized +/- 20s each attempt) |
| Latency Onset | T approximately 4:30 (randomized +/- 20s each attempt) |
| Dataset Complexity | Medium |

This run introduces a two-step causal chain and tests auditory causal attribution. The core question is whether the participant can distinguish the cause (Disk, a square wave panned hard-left) from the effect (Latency, a filtered noise burst centered) and correctly report the earlier root-cause timestamp rather than the louder, later symptom. This mirrors the most common real-world SRE failure pattern: the visible alert (high latency) is nearly always a lagging indicator of a deeper root cause (disk saturation). Running three attempts lets us measure whether attribution accuracy improves with repetition, which is an important data point for understanding the learnability of the auditory mapping.

**Logged Variables - `run2_events.csv`**

| CSV Column | Type | Description | Used For |
|---|---|---|---|
| `participant_id` | string | Anonymous session ID | Joining records |
| `attempt` | int (1-3) | Which attempt | Learning-effect ANOVA |
| `condition` | string | Interface condition | Primary comparison |
| `wall_clock_ms` | int | Absolute event timestamp | Sequencing |
| `event_type` | string (`gear_change` / `flag` / `report_cause` / `report_symptom`) | Type of action | Attribution analysis |
| `gear_level` | int | Playhead speed | Navigation strategy |
| `playhead_pos_s` | float | Dataset position in seconds | Mapping to ground-truth windows |
| `reported_metric` | string (null unless report event) | Which metric the participant named as cause or symptom | Causal attribution accuracy (binary: Disk = correct) |
| `gt_cause_onset_s` | float | True Disk onset for this seed | delta_T_cause calculation |
| `gt_symptom_onset_s` | float | True Latency onset for this seed | delta_T_symptom calculation |
| `delta_T_cause_s` | float | Absolute difference between playhead position and true cause onset, for report_cause events | Temporal accuracy |
| `attribution_correct` | bool | True if reported_metric equals Disk | Binary attribution score |

*Attribution accuracy and temporal proximity are the two axes of the Run 2 accuracy score. The flag event sequence across the full 10-minute window feeds the d-prime calculation.*

---

#### Run 3 - Full 6-Metric Cascading Failure (*1 attempt*)

| Parameter | Value |
|-----------|-------|
| Dataset Duration | 30 minutes |
| Active Metrics | All 6 |
| Anomaly Type | Full cascading outage |
| Dataset Complexity | High |

**Ground-Truth Cascade Timeline:**

| Time | Event | Audio Cue |
|------|-------|-----------|
| T = 5:00 | **Disk I/O** degrades | Square wave (-30 degrees) rises in frequency |
| T = 9:00 | **Latency** spikes | Filtered noise burst (center) comes to foreground |
| T = 14:00 | **Network I/O** saturates | Sawtooth (+30 degrees) intensifies |
| T = 18:00 | **CPU** maxes out | Low sine (-60 degrees) climbs in pitch |
| T = 24:00 | **Error Rate** spikes | High sine (+60 degrees) dominates |
| Throughout | **Memory** leaks slowly | Triangle wave sustains a slow ambient climb |

This is the critical run and most closely mirrors a real production incident. It is completed once only, because repetition would allow participants to carry over precise timing from previous runs, which would invalidate the detection measurement. The participant must detect the onset of failure, navigate backward to locate the root cause (Disk at T=5:00) rather than the loudest downstream alert (Error Rate at T=24:00), and optionally reconstruct the full causal chain. The Salience-Driven Masking engine is essential here. Without dynamic volume ducking, all 6 synthesizers would create a wall of noise. The Auditory Spotlight guides the participant through the cascade in real time.

**Logged Variables - `run3_events.csv`**

| CSV Column | Type | Description | Used For |
|---|---|---|---|
| `participant_id` | string | Anonymous session ID | Joining records |
| `condition` | string | Interface condition | Primary comparison |
| `wall_clock_ms` | int | Absolute event timestamp | Sequencing |
| `event_type` | string (`gear_change` / `flag` / `report_root_cause` / `report_chain`) | Type of action | Multi-component accuracy |
| `gear_level` | int | Playhead speed | Navigation strategy and overshoot analysis |
| `playhead_pos_s` | float | Dataset position in seconds | Mapping flags to the 5-event anomaly windows |
| `reported_root_metric` | string (null unless report_root_cause event) | Which metric named as root cause | Root-cause attribution accuracy (correct = Disk) |
| `reported_chain_order` | string (null unless report_chain event) | Comma-separated list of metric names in reported order (e.g. Disk,Latency,CPU) | Cascade reconstruction score vs. ground truth |
| `gt_root_onset_s` | float | True Disk I/O onset (300s) | delta_T_root and proximity score |
| `delta_T_root_s` | float | Absolute difference between playhead position and 300s, for report_root_cause events | Temporal accuracy |
| `proximity_score` | float | 1 minus (delta_T_root_s divided by 1680) | Continuous 0-1 accuracy score |
| `chain_reconstruction_score` | float (null unless report_chain event) | Fraction of correct adjacent pairs in reported chain vs. ground truth order | Cascade reconstruction metric |

*All three CSV files are stored locally on the encrypted session machine and immediately transferred to GT OneDrive upon session completion. Local copies are permanently deleted. Files are named {participant_id}_run{N}_events.csv and contain no columns with personally identifying information.*

---

## 5. Accuracy and Analysis Framework

### 5.1 Primary: Anomaly Detection (Signal Detection Theory)

Rather than binary hit/miss scoring, all runs are evaluated using a Signal Detection Theory framework. The sequence of [F] key flags is compared against the known anomaly windows to compute, for each participant and condition, a Hit Rate (the proportion of true anomaly windows correctly flagged) and a False Alarm Rate (the proportion of non-anomalous regions incorrectly flagged). These are combined into a d-prime sensitivity score, which is the standard measure in detection studies and is independent of response bias, making it directly comparable across conditions and prior literature.

For root-cause attribution in Runs 2 and 3, temporal proximity (absolute seconds from the ground-truth onset) and metric attribution accuracy (correct/incorrect label) are reported alongside d-prime.

### 5.2 Secondary: Primary Task Degradation (PTD)

PTD is computed per participant as the change in mean tracking error between the solo baseline established during familiarization and the dual-task condition. A lower PTD under Condition B than Condition A would confirm H2, specifically that the auditory monitoring channel preserves visual attention better than a visual dashboard.

```
PTD = (Error_dual_task - Error_solo_baseline) / Error_solo_baseline
```

### 5.3 Tertiary: NASA-TLX

Administered as a paper questionnaire after all runs, linked only to the anonymous Participant ID. Two demographic items are appended to the top of the TLX sheet as anonymous covariates: years of formal musical training (0-5 ordinal scale) and years of professional SRE/DevOps experience (0-5 ordinal scale). These are non-sensitive, non-identifying attributes collected on paper and digitized only by Participant ID, consistent with the IRB's approved survey instrument and data protection provisions. Raw TLX scores are compared across conditions using a paired Wilcoxon signed-rank test. Musical training and SRE experience are included as covariates in an ANCOVA to control for individual differences in auditory discrimination and domain familiarity.

---

## 6. Session Procedure

| Phase | Duration | Description |
|-------|----------|-------------|
| Welcome and Consent | ~5m | Participant reads and signs physical consent form. Assigned anonymous Participant_XX ID. Consent form immediately filed separately and never linked to digital data. |
| System Familiarization and Solo Baselines | ~10m | Researcher demonstrates LogSonar on a short practice dataset not used in any experimental run. Participant practices freely. Researcher then records solo baseline tracking performance (primary task only, no audio) for approximately 2 minutes to establish the individual performance floor used in PTD calculation. The Healthy State Anchor demo is played before each subsequent run. |
| Run 1, 3 attempts | ~15m | Three attempts of the 5-minute single-metric dataset under assigned condition. Participant uses [F] key to flag anomalies and keyboard controls to navigate. |
| Run 2, 3 attempts | ~30m | Three attempts of the 10-minute two-metric dataset. Participant flags and reports root-cause metric at end of each attempt. |
| Run 3, 1 attempt | ~20m | Single attempt of the 30-minute full-cascade dataset. Participant flags throughout and provides root-cause report and optional chain reconstruction at the end. |
| NASA-TLX and Debrief | ~5m | Anonymous paper TLX with 2 covariate items at top (musical training, SRE experience). Researcher debriefs participant on study purpose. |

*All data collected consists solely of keyboard interaction events (timestamps, flag events, navigation inputs) and the anonymous paper NASA-TLX. No audio, video, screen recordings, or personally identifying information are collected at any point.*

---

## 7. Statistical Analysis Plan (Blueprint)

This blueprint maps each research hypothesis directly to the metric being collected, the statistical test used, and the target success outcome.

### 7.1 Analysis Summary Blueprint

| Goal / Hypothesis | What We Measure | Statistical Test Used | Target Outcome (Success Criterion) |
|---|---|---|---|
| **H1: Anomaly Detection Accuracy** | Sensitivity score (d-prime) calculated from Hit Rate and False Alarm Rate | **Paired Wilcoxon Signed-Rank Test** (comparing Visual vs Auditory) | Auditory d-prime is equal to or higher than Visual d-prime |
| **H2: Primary Task Preservation** | Primary Task Degradation (PTD: percentage increase in mouse tracking error compared to solo baseline) | **Paired t-Test** (comparing PTD in Visual vs Auditory) | Auditory PTD is significantly lower than Visual PTD (p < 0.05) |
| **H3: Cognitive Workload** | NASA-TLX overall workload rating (0 to 100) | **Paired Wilcoxon Signed-Rank Test** | Auditory TLX workload score is comparable to or lower than Visual |
| **Learnability Effect** | Accuracy improvement across Attempts 1, 2, and 3 in Runs 1 and 2 | **Repeated-Measures ANOVA** | Performance improves across attempts, demonstrating learnability |
| **Background Controls** | Musical training and SRE experience (0 to 5 rating from paper sheet) | **ANCOVA (Analysis of Covariance)** | Confirms auditory benefits hold across varying musical/SRE backgrounds |

### 7.2 Execution Rules

1. **Significance Threshold:** Standard cutoff set to **alpha = 0.05**.
2. **Sample Power:** N = 20 participants provides 80% statistical power to detect medium effect sizes.
3. **Pre-registration:** Hypotheses and analysis scripts will be pre-registered on OSF prior to main data collection.
4. **Pilot Testing:** A 3-participant pilot run will be conducted first to verify event logging and timing accuracy.

---