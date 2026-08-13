# LogSonar — CHI Research Design Brief

## The Core Research Question

> **Does substituting a visual telemetry dashboard with a real-time auditory display (earcons mapped to system metrics) allow a software operator performing a concurrent primary task to detect anomalies with equivalent or superior accuracy, lower latency, and lower primary-task disruption compared to visual-only monitoring?**

This sits squarely at the intersection of **Multiple Resource Theory** (Wickens, 2002) — the hypothesis that offloading monitoring to the auditory channel frees the visual channel for the primary task, reducing dual-task interference without sacrificing detection quality.

---

## Why Should Reviewers Care?

SREs increasingly work across multiple streams simultaneously: writing code, reviewing PRs, reading alerts. All of this competes for a **single visual channel**. A dashboard alert that appears while the engineer is deep in a code review is effectively invisible until they break focus. The auditory channel is unused during visual work but is always "on." If earcon-based monitoring can match visual dashboards on detection accuracy while reducing tracking error on the primary task — that's a **direct productivity and reliability gain** for every on-call engineer on the planet. This is the argument that makes CHI reviewers care.

---

## Experimental Design

### Conditions (2 × Within-Subjects)
| Condition | Description |
|---|---|
| **AUDIO** | Timeline hidden (`Hide View`). System state conveyed only via earcons. |
| **VISUAL** | Timeline visible (`Show View`). System state conveyed only by the scrolling log chart. |

> [!IMPORTANT]
> The `condition` column is already logged correctly (`visual` vs `auditory`) in every CSV row based on the `isViewVisible` toggle. **This is good.** But counterbalancing must be done externally (e.g., odd participant IDs start with AUDIO, even with VISUAL). The software does not randomise — the researcher manually sets the condition before each run.

### Runs Per Participant
| Run | Preset | Duration | What's Tested |
|---|---|---|---|
| **Training** | `run1` (Solo Baseline / training) | 5 min | Calibrate sound preferences, learn the interface. Must pass attribution check (correct root cause + ΔT < 60s) to proceed. |
| **Run 1** | `run1` in assigned condition | 5 min | Single anomaly, single metric (CPU). Simplest case. |
| **Run 2** | `run2` in assigned condition | 10 min | Cause→Effect: Disk I/O causing Latency. Tests causal attribution. |
| **Run 3** | `run3` in assigned condition | 30 min | Full cascade: 4 metrics, temporal spread. Tests sustained vigilance and cascade reasoning. |

**Total per participant ≈ 50–55 min** of active task time + briefing/debrief.

### Counterbalancing
Use a simple **ABBA** or **Latin square** across the two conditions. With N=24+ participants, split into two groups:
- Group A: AUDIO → VISUAL (Runs 1, 2, 3 in audio then visual)
- Group B: VISUAL → AUDIO

With a **rest break** between condition blocks to minimise fatigue carryover.

---

## What Are We Trying to See?

Three hypotheses, ordered by importance for the CHI argument:

**H1 (Primary task cost):** Primary task tracking error (RMSE) will be **lower** in AUDIO condition than VISUAL condition during anomaly windows, because the earcon allows eyes to stay on the tracking target.

**H2 (Detection sensitivity):** There will be **no significant difference** in d-prime between conditions (i.e., the audio channel is equivalent to visual for signal detection). This is the non-inferiority argument.

**H3 (Temporal accuracy):** Detection latency (ΔT from ground truth onset) will be **lower or equal** in AUDIO condition vs VISUAL, because the audio is continuous and ambient rather than requiring a glance.

---

## The Metrics Framework

### Tier 1: Signal Detection Theory (SDT) — Per Participant, Per Run

This is the headline metric for CHI reviewers.

| Metric | Formula | Definition |
|---|---|---|
| **Hit** | Flag within ±60s of ground truth onset | Correctly detecting a real anomaly |
| **Miss** | No flag placed, ground truth exists | Failing to detect a real anomaly |
| **False Alarm** | Flag discarded in survey ("False Alarm" button) | Flag with no corresponding ground truth |
| **Correct Rejection** | No flag, no anomaly present | — |
| **Hit Rate (H)** | Hits / (Hits + Misses) | — |
| **False Alarm Rate (FA)** | FAs / (FAs + Correct Rejections) | — |
| **d′ (sensitivity)** | z(H) − z(FA) | Higher = better |
| **β (criterion)** | Conservative vs liberal detection bias | — |

> [!NOTE]
> The software already logs `flag` events with `delta_T_s` (distance from ground truth) and the "Discard (False Alarm)" button in the ReportModal marks `rootCauseMetric = 'Discarded'`. **This is sufficient to compute d-prime from the CSV.** The 60-second window in the code perfectly matches the Hit window above.

### Tier 2: Temporal Accuracy — Per Flag

| Metric | Already Logged? | Formula |
|---|---|---|
| **Detection Latency (ΔT)** | ✅ `delta_T_s` | `|flag_pos_s - ground_truth_onset_s|` |
| **Proximity Score** | ✅ `proximity_score` | `1 - (ΔT / run_duration)` |
| **Attribution Accuracy** | ✅ `attribution_correct` | `reported_root_metric == true_root_metric` |
| **Chain Accuracy (Run 3)** | ✅ `reported_chain_order` | Compare to ground-truth cascade order |
| **Confidence Rating** | ✅ `confidence_rating` | 1–5 stars |
| **Detection Modality** | ✅ `detection_modality` | Heard / Saw / Both — critical for attribution |

### Tier 3: Primary Task Cost — Per Second

| Metric | Already Logged? | Formula |
|---|---|---|
| **Tracking Error (per sample)** | ✅ `tracking_error_px` | Pixel distance from cursor to target |
| **Max Tracking Error in 30s window at flag** | ✅ `max_tracking_err_30s` | `max(window[-30s:])` |
| **Tracking RMSE (per run)** | ❌ Needs to be computed in R/Python post-hoc | `sqrt(mean(tracking_error_px²))` |
| **Dual-Task Cost (DTC)** | ❌ Needs post-hoc | `(RMSE_audio - RMSE_baseline) / RMSE_baseline` |

> [!IMPORTANT]
> **Tracking RMSE and DTC do not need to be added to the software.** The `primary_task_sample` rows contain 1 sample/second. Computing RMSE is a 3-line pandas/R operation from the CSV. The baseline for DTC comes from the `solo_baseline` run which the `Solo Baseline` preset already generates.

### Tier 4: Subjective Measures — Post-Run

| Metric | Source | Already Collected? |
|---|---|---|
| **NASA-TLX** (Mental, Physical, Temporal, Performance, Effort, Frustration) | Physical paper | ✅ (you have physical form) |
| **Subjective Usefulness (1–7)** | PostSessionModal | ✅ `usefulness` in CSV |
| **Distraction Rating (1–7)** | PostSessionModal | ✅ `distraction` in CSV |
| **Audio Preference** | PostSessionModal | ✅ `prefer_audio` in CSV |
| **Sound Type Chosen** | Session config log | ✅ `cpu_sound`, `memory_sound`, `disk_sound`, `latency_sound` |

---

## What the Software Already Has ✅

The CSV output, across all runs, gives you:

```
participant_id | condition | run_preset | attempt | wall_clock_ms | elapsed_ms
event_type | playhead_pos_s | gear_level | active_metrics
cpu_sound | memory_sound | disk_sound | latency_sound
[event-specific extras: delta_T_s, tracking_error_px, confidence_rating, detection_modality, ...]
```

**Event types captured:**
- `session_config` — full sound mapping snapshot + ground truth onset
- `session_start` — session begins
- `gear_change` — every navigation action (for behavioural analysis of search strategy)
- `flag` — every anomaly flag with ΔT and max tracking error
- `primary_task_sample` — 1/sec tracking error (during auditory condition)
- `report_peak` — survey answers per flag (root cause, symptom, chain, confidence, modality)
- `post_session_survey` — usefulness, distraction, preference
- `toggle_view` — any mode switch

---

## What Is Missing / Needs to Be Added

### 🔴 Critical Gaps

**1. Tracking error is only logged in the auditory condition.**
Currently, `TrackingTask` is only active when `isViewVisible = false` (AUDIO condition). In the VISUAL condition, no tracking error is recorded. Without both sides, you **cannot compute DTC** (the core primary task cost argument).

**Fix needed:** Run the TrackingTask and log `primary_task_sample` events in BOTH conditions. The canvas can be rendered even when the timeline is visible — just overlay it or keep it active regardless of `isViewVisible`.

**2. Solo Baseline run does not log tracking error.**
The `solo_baseline` preset is the single-task baseline for computing DTC. It currently only runs the timeline, not the tracking task. If tracking isn't active during Solo Baseline, you have no `RMSE_baseline` denominator.

**Fix needed:** Force the tracking task ON during `solo_baseline` regardless of view state.

**3. No run-start / run-end wall-clock timestamp per condition.**
You have `session_start` but no `session_end`. This makes it impossible to compute "time in run" without inferring from the last event row.

**Fix needed:** Log a `session_end` event when `endRunAndProcessSurveys` is called.

### 🟡 Nice to Have

**4. Gear-change velocity at anomaly onset.**
The gear level at the moment of flagging is logged, but a reviewer might ask: "Did participants slow down when they heard the anomaly, or were they already going slow?" You'd want to log the gear level 10 seconds *before* the flag too. This requires a rolling gear history buffer, similar to the tracking error window.

**5. Inter-flag interval.**
If a participant places 3 flags in a run, the time between flags tells you something about sustained vigilance. Currently computable post-hoc from the CSV `flag` events, so no software change needed.

---

## Participant Count Recommendation

**Target: N = 24 confirmed completions** (plan for N = 30 recruited to account for dropout).

**Justification:**
- **Design:** 2-condition within-subjects (AUDIO vs VISUAL), counterbalanced
- **Primary DV:** tracking RMSE — a continuous measure with typically moderate effect sizes (d ≈ 0.5–0.8) in dual-task auditory display studies
- **Power analysis (G*Power, paired t-test):** For d = 0.5, α = 0.05, power = 0.80 → N = 27. For d = 0.6, N = 21.
- **Convention:** Most recent CHI dual-task / auditory papers use N = 16–36. The sweet spot that satisfies reviewers without being extraordinary is **N = 24–30**.
- **Practical note:** Run a 4-person pilot first. Use pilot tracking RMSE variance to do a proper power analysis before full recruitment. If the effect is large (d > 0.8), N = 16 may suffice.

> [!WARNING]
> **Do not claim N = 24 is powered without running the actual G*Power calculation.** Reviewers will ask to see it. Run the calc after your pilot with real variance numbers and report the obtained power.

---

## Recommended Session Flow

```
[Consent + Briefing]           ~5 min
[Sound Calibration]            ~5 min  (Free Play preset, adjust sound preferences)
[Solo Baseline]                ~5 min  (tracking only, no monitoring — single task baseline)
[Training Run 1 — AUDIO]       ~5 min  (must pass attribution gate to proceed)
--- REST BREAK ---             ~5 min
[Condition Block A: Run 1, 2]  ~15 min
[Condition Block A: Run 3]     ~30 min
[NASA-TLX (paper)]             ~5 min
--- REST BREAK ---             ~10 min
[Condition Block B: Run 1, 2]  ~15 min
[Condition Block B: Run 3]     ~30 min
[NASA-TLX (paper)]             ~5 min
[Post-session questionnaire]   (in software — auto-fires after Run 3)
[Debrief]                      ~5 min
TOTAL ≈ 2 hrs
```
