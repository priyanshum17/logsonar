import { useEffect, useRef, useState, useMemo } from 'react';
import { generateDataset, Dataset, MetricType, METRICS } from '../data/mockTimeSeries';
import { AudioEngine } from '../engine/AudioEngine';
import DriveControls from './DriveControls';
import { Activity, Navigation, Layers, Clock, PanelRightClose, PanelRightOpen, Flag } from 'lucide-react';
import { AreaChart, Area, XAxis, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrackingTask } from './TrackingTask';
import { ReportModal } from './ReportModal';
import { PostSessionModal, PostSessionData } from './PostSessionModal';
import './TimelineVisualizer.css';

const ITEM_HEIGHT = 80;
const VISIBLE_COUNT = 15;
const MAX_LEVEL = 5;

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const getMetricColor = (metric: MetricType) => {
  switch(metric) {
    case 'CPU': return '#ffb347';
    case 'Memory': return '#8884d8';
    case 'Disk': return '#ffc658';
    case 'Latency': return '#00C49F';
    default: return '#d4af37';
  }
};

export default function TimelineVisualizer() {
  const [level, setLevel] = useState(0);
  const mode = 'linear';
  const baseSpeed = 0.5;
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [displayVelocity, setDisplayVelocity] = useState(0);

  const [activeMetrics, setActiveMetrics] = useState<MetricType[]>(['CPU']);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isViewVisible, setIsViewVisible] = useState(true);

  // --- Study state ---
  const [participantId, setParticipantId] = useState('Participant_01');
  const [runPreset, setRunPreset] = useState<'free' | 'solo_baseline' | 'run1' | 'run2' | 'run3'>('free');
  const [attempt, setAttempt] = useState(1);
  const [dataset, setDataset] = useState<Dataset>(generateDataset('free', 1));
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [flaggedTimestamps, setFlaggedTimestamps] = useState<number[]>([]);
  const [surveyQueue, setSurveyQueue] = useState<number[]>([]);
  const [totalSurveysInQueue, setTotalSurveysInQueue] = useState(0);
  const [trainingPassed, setTrainingPassed] = useState(false);
  const [alertFlashing, setAlertFlashing] = useState(false);
  
  const lastFlagWindowRef = useRef<number | null>(null);

  // --- Study logging state ---
  const [isLogging, setIsLogging] = useState(false);
  const [sessionLog, setSessionLog] = useState<string[]>([]);
  const [flagCount, setFlagCount] = useState(0);
  const sessionStartRef = useRef<number | null>(null);
  const trackingErrorWindowRef = useRef<number[]>([]); // rolling 30-sample window
  const pendingLogsRef = useRef<string[]>([]); // holds logs while PostSessionModal is open
  const [isPostSessionOpen, setIsPostSessionOpen] = useState(false);

  // Mirror AudioEngine oscillatorMapping in React state so dropdowns re-render on change
  const [soundMapping, setSoundMapping] = useState<Record<MetricType, string>>({
    CPU: 'sine',
    Memory: 'triangle',
    Disk: 'square',
    Latency: 'bandpass-noise',
  });

  const getSoundMapping = () => {
    const m = announcerRef.current.oscillatorMapping;
    return `${m['CPU']},${m['Memory']},${m['Disk']},${m['Latency']}`;
  };

  const logEvent = (eventType: string, extra: Record<string, string | number> = {}, returnRow: boolean = false) => {
    if (!sessionStartRef.current) return null;
    const wallMs = Date.now();
    const elapsed = wallMs - sessionStartRef.current;
    const pos = Math.round(positionRef.current);
    const condition = isViewVisible ? 'visual' : 'auditory';
    const activeStr = activeMetrics.join('|');
    const soundStr = getSoundMapping();
    
    const extraStr = Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(',');
    const row = `${participantId},${condition},${runPreset},${attempt},${wallMs},${elapsed},${eventType},${pos},${level},${activeStr},${soundStr}${extraStr ? ',' + extraStr : ''}`;
    
    if (!returnRow) {
      setSessionLog(prev => [...prev, row]);
    }
    return row;
  };

  const flagDebounceRef = useRef<number>(0); // wall-clock ms of last accepted flag

  const handleFlag = () => {
    if (!audioEnabled || isReportModalOpen) return;
    if (!isLogging) return; // only flag during an active session

    const pos = Math.round(positionRef.current);

    // 3-second wall-clock debounce — prevents mechanical double-taps only
    const now = Date.now();
    if (now - flagDebounceRef.current < 3000) return;
    flagDebounceRef.current = now;

    const gt = dataset.groundTruths.rootOnsetS;
    const deltaT = Math.abs(pos - gt);
    const maxTrackingErr = trackingErrorWindowRef.current.length > 0
      ? Math.max(...trackingErrorWindowRef.current)
      : -1;

    lastFlagWindowRef.current = pos;
    setFlaggedTimestamps(prev => [...prev, pos]);
    logEvent('flag', { delta_T_s: deltaT, ground_truth_onset_s: gt, max_tracking_err_30s: maxTrackingErr });
    setFlagCount(prev => prev + 1);
  };
  
  const endRunAndProcessSurveys = () => {
      setLevel(0);
      announcerRef.current.cancel();
      
      if (runPreset === 'free' || runPreset === 'solo_baseline') {
          // Non-study modes: just download and reset, no survey
          teardownSession();
          downloadCsv(sessionLog);
          return;
      }
      
      // Study run: always show at least one survey.
      // If the participant placed explicit flags, queue one survey per flag.
      // If they placed no flags, queue one survey at the current playhead position.
      const timestamps = flaggedTimestamps.length > 0
          ? [...flaggedTimestamps]
          : [Math.round(positionRef.current)];
      
      setSurveyQueue(timestamps);
      setTotalSurveysInQueue(timestamps.length);
      setIsReportModalOpen(true);
      // isLogging stays true until the full survey queue is dismissed
  };

  // Resets all session state — called after CSV is safely triggered
  const teardownSession = () => {
      setIsLogging(false);
      setSessionLog([]);
      setFlagCount(0);
      setFlaggedTimestamps([]);
      setSurveyQueue([]);
      setTotalSurveysInQueue(0);
      lastFlagWindowRef.current = null;
      trackingErrorWindowRef.current = [];
      sessionStartRef.current = null;
  };

  const toggleLogging = () => {
    if (isLogging) {
      endRunAndProcessSurveys();
    } else {
      sessionStartRef.current = Date.now();
      setSessionLog([]);
      setFlagCount(0);
      setFlaggedTimestamps([]);
      lastFlagWindowRef.current = null;
      trackingErrorWindowRef.current = [];
      setIsLogging(true);
      // Log session_config snapshot — captures sound mapping at start
      const m = announcerRef.current.oscillatorMapping;
      logEvent('session_config', {
        cpu_sound: m['CPU'],
        memory_sound: m['Memory'],
        disk_sound: m['Disk'],
        latency_sound: m['Latency'],
        gt_onset_s: dataset.groundTruths.rootOnsetS,
      });
      logEvent('session_start');
    }
  };
  
  const downloadCsv = (logs: string[]) => {
      if (logs.length === 0) return;
      const header = 'participant_id,condition,run_preset,attempt,wall_clock_ms,elapsed_ms,event_type,playhead_pos_s,gear_level,active_metrics,cpu_sound,memory_sound,disk_sound,latency_sound,extra';
      const csv = [header, ...logs].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${participantId}_${runPreset}-${attempt}.csv`;
      a.click();
      URL.revokeObjectURL(url);
  };

  // Baseline tour state
  const [baselineLabel, setBaselineLabel] = useState<string | null>(null);
  const baselineRunningRef = useRef(false);
  const previewRunningRef = useRef(false);
  const baselineIntervalsRef = useRef<{ tick?: any; countdown?: any; timeout?: any }>({});

  const cancelBaselineTour = () => {
    if (baselineIntervalsRef.current.tick) clearInterval(baselineIntervalsRef.current.tick);
    if (baselineIntervalsRef.current.countdown) clearInterval(baselineIntervalsRef.current.countdown);
    if (baselineIntervalsRef.current.timeout) clearTimeout(baselineIntervalsRef.current.timeout);
    baselineRunningRef.current = false;
    previewRunningRef.current = false;
    setBaselineLabel(null);
    announcerRef.current.stopDriving();
  };

  const runBaselineTour = () => {
    cancelBaselineTour();
    const engine = announcerRef.current;
    const metrics = [...activeMetrics];
    const DURATION = 5000;
    const TICK = 100;

    const baselineValues: Record<MetricType, number> = {
      CPU: 0.15, Memory: 0.15, Disk: 0.15, Latency: 0.15
    };

    baselineRunningRef.current = true;
    logEvent('baseline_tour_start');

    let step = 0;

    const playStep = () => {
      if (baselineIntervalsRef.current.tick) clearInterval(baselineIntervalsRef.current.tick);
      if (baselineIntervalsRef.current.countdown) clearInterval(baselineIntervalsRef.current.countdown);

      if (step >= metrics.length) {
        cancelBaselineTour();
        logEvent('baseline_tour_end');
        return;
      }

      const m = metrics[step];
      engine.startDriving([m]);
      engine.updateDriving(baselineValues, 1);

      baselineIntervalsRef.current.tick = setInterval(() => {
        engine.updateDriving(baselineValues, 1);
      }, TICK);

      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(`${m} baseline`);
      window.speechSynthesis.speak(utter);

      let remaining = DURATION / 1000;
      setBaselineLabel(`${m} (${remaining}s)`);
      baselineIntervalsRef.current.countdown = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) setBaselineLabel(`${m} (${remaining}s)`);
        else clearInterval(baselineIntervalsRef.current.countdown);
      }, 1000);

      step++;
      baselineIntervalsRef.current.timeout = setTimeout(playStep, DURATION);
    };

    playStep();
  };

  const [activeTimeRange, setActiveTimeRange] = useState({ start: -30, end: 30 });
  const [playheadIndex, setPlayheadIndex] = useState(0);
  const lastSpokenIndexRef = useRef(-1);

  const positionRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const lastTimeRef = useRef<number>(performance.now());
  const announcerRef = useRef(AudioEngine.getInstance());

  const primaryMetric = activeMetrics[0] || 'CPU';
  const listSize = dataset.durationSec;

  const prevLevelRef = useRef(level);
  const isSpeakingRef = useRef(false);
  
  useEffect(() => {
    if (prevLevelRef.current !== level) {
      announcerRef.current.clearSpeech();
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      prevLevelRef.current = level;
    }
  }, [level]);

  useEffect(() => {
    if (audioEnabled) return;
    const unlock = () => {
      announcerRef.current.init();
      setAudioEnabled(true);
    };
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
    };
  }, [audioEnabled]);

  useEffect(() => {
    let reqId: number;
    let autoStopTriggered = false;

    const loop = (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      let velocity = 0;
      if (level !== 0) {
        const sign = Math.sign(level);
        const absLevel = Math.abs(level);
        if (mode === 'linear') {
          velocity = sign * (absLevel * baseSpeed);
        } else {
          velocity = sign * baseSpeed * Math.pow(1.8, absLevel - 1);
        }
      }

      if (Math.abs(velocity) !== Math.abs(displayVelocity)) {
        setDisplayVelocity(velocity);
      }

      const absLevel = Math.abs(level);
      let timeScale = 1;
      let lookahead = 1;
      let graphWindow = 600;

      if (absLevel === 0) {
        graphWindow = 60;
      } else if (absLevel === 1) {
        timeScale = 1; lookahead = 1; graphWindow = 20;
      } else if (absLevel === 2) {
        timeScale = 5; lookahead = 5; graphWindow = 60;
      } else if (absLevel === 3) {
        timeScale = 15; lookahead = 15; graphWindow = 120;
      } else if (absLevel === 4) {
        timeScale = 30; lookahead = 30; graphWindow = 300;
      } else if (absLevel === 5) {
        timeScale = 60; lookahead = 60; graphWindow = 600;
      }

      if (level !== 0) {
        const sign = Math.sign(level);
        const effectiveTimeScale = (absLevel === 1 && isSpeakingRef.current) ? 0 : timeScale;
        const newPos = positionRef.current + sign * effectiveTimeScale * baseSpeed * dt;
        
        // Auto-stop at end of run
        if (newPos >= listSize - 1 && !autoStopTriggered) {
            setLevel(0);
            positionRef.current = listSize - 1;
            autoStopTriggered = true;
            if (isLogging) {
                endRunAndProcessSurveys();
            }
        } else if (newPos <= 0) {
            setLevel(0);
            positionRef.current = 0;
            announcerRef.current.clearSpeech();
            isSpeakingRef.current = false;
            setIsSpeaking(false);
        } else {
            positionRef.current = Math.max(0, Math.min(listSize - 1, newPos));
            autoStopTriggered = false;
        }
      }

      let domainStart = positionRef.current - graphWindow / 2;
      let domainEnd = positionRef.current + graphWindow / 2;
      
      if (domainStart < 0) {
        domainStart = 0;
        domainEnd = Math.min(listSize - 1, graphWindow);
      } else if (domainEnd > listSize - 1) {
        domainEnd = listSize - 1;
        domainStart = Math.max(0, domainEnd - graphWindow);
      }

      if (Math.abs(domainStart - activeTimeRange.start) > 0.1 || Math.abs(domainEnd - activeTimeRange.end) > 0.1) {
        setActiveTimeRange({ start: domainStart, end: domainEnd });
      }

      if (audioEnabled) {
        const currentIndex = Math.round(positionRef.current);
        let maxValInView = 0;
        
        if (level !== 0) {
          if (absLevel > 1) {
            announcerRef.current.startDriving(activeMetrics);
          } else {
            announcerRef.current.stopDriving();
          }

          if (currentIndex >= 0 && currentIndex < listSize) {
            const endIdx = Math.min(listSize, currentIndex + lookahead);
            
            const condensedValues: Record<MetricType, number> = {} as any;
            
            for (const metric of activeMetrics) {
              const mData = dataset.logs[metric];
              const windowData = mData.slice(currentIndex, endIdx);
              if (windowData.length > 0) {
                 const maxVal = Math.max(...windowData.map(d => d.value));
                 const avgVal = windowData.reduce((sum, d) => sum + d.value, 0) / windowData.length;
                 condensedValues[metric] = (avgVal * 0.4) + (maxVal * 0.6);
                 
                 if (condensedValues[metric] > maxValInView) maxValInView = condensedValues[metric];
              }
            }

            // Visual alerting baseline
            if (isViewVisible && maxValInView > 0.75) {
               setAlertFlashing(true);
            } else {
               setAlertFlashing(false);
            }

            if (absLevel > 1) {
               announcerRef.current.updateDriving(condensedValues, Math.abs(velocity));
            }

            if (absLevel === 1) {
              if (currentIndex !== lastSpokenIndexRef.current) {
                lastSpokenIndexRef.current = currentIndex;
                
                const msgs = activeMetrics.map(m => {
                   const log = dataset.logs[m][currentIndex];
                   return log ? log.message : '';
                }).filter(Boolean);
                
                if (msgs.length > 0) {
                  const combinedMessage = msgs.join('. ');
                  announcerRef.current.stopDriving();
                  
                  isSpeakingRef.current = true;
                  setIsSpeaking(true);
                  
                  announcerRef.current.speakLog(combinedMessage, () => {
                    isSpeakingRef.current = false;
                    setIsSpeaking(false);
                  });
                }
              }
            } else {
              lastSpokenIndexRef.current = -1;
            }
          }
        } else {
          if (!baselineRunningRef.current && !previewRunningRef.current) {
            announcerRef.current.stopDriving();
          }
          lastSpokenIndexRef.current = -1;
          setAlertFlashing(false);
        }
      }

      const newPlayheadIndex = Math.round(positionRef.current);
      if (newPlayheadIndex !== playheadIndex) {
        setPlayheadIndex(newPlayheadIndex);
      }

      setScrollTop(positionRef.current * ITEM_HEIGHT);
      reqId = requestAnimationFrame(loop);
    };
    reqId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(reqId);
    };
  }, [level, mode, audioEnabled, baseSpeed, displayVelocity, activeMetrics, activeTimeRange, playheadIndex, listSize, dataset, isViewVisible, runPreset]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!audioEnabled || isReportModalOpen) return;
      if (e.key === 'w' || e.key === 'W') {
        setLevel(prev => Math.min(prev + 1, MAX_LEVEL));
        logEvent('gear_change', { new_gear: Math.min(level + 1, MAX_LEVEL) });
      } else if (e.key === 's' || e.key === 'S') {
        setLevel(prev => Math.max(prev - 1, -MAX_LEVEL));
        logEvent('gear_change', { new_gear: Math.max(level - 1, -MAX_LEVEL) });
      } else if (e.key === 'a' || e.key === 'A') {
        setLevel(0);
        cancelBaselineTour();
        announcerRef.current.cancel();
        logEvent('gear_change', { new_gear: 0 });
      } else if (e.key === 'd' || e.key === 'D') {
        toggleLogging();
      } else if (e.key === ' ' || e.code === 'Space' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleFlag();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [audioEnabled, isLogging, level, isReportModalOpen, dataset]);

  const startIndex = Math.max(0, playheadIndex - Math.floor(VISIBLE_COUNT / 2));
  const endIndex = Math.min(listSize - 1, startIndex + VISIBLE_COUNT);

  const items = useMemo(() => {
    const list = [];
    const absLevel = Math.abs(level);

    for (let i = startIndex; i <= endIndex; i++) {
      const primaryLog = dataset.logs[primaryMetric]?.[i];
      if (!primaryLog) continue;

      const offset = (i * ITEM_HEIGHT) - scrollTop;
      const isScreenCenter = i === playheadIndex;
      const distFromCenter = Math.abs(offset);
      const opacity = distFromCenter < ITEM_HEIGHT ? 1 : Math.max(0, 1 - (distFromCenter / (ITEM_HEIGHT * (VISIBLE_COUNT / 2.5))));
      const blur = distFromCenter < ITEM_HEIGHT ? 0 : Math.min(6, distFromCenter / 120);

      list.push(
        <div
          key={primaryLog.timestamp}
          className={`virtual-item ${isScreenCenter ? 'active' : ''}`}
          style={{
            transform: `translateY(${offset}px) scale(${isScreenCenter ? 1.08 : 1})`,
            opacity,
            filter: `blur(${blur}px)`
          }}
        >
          <div className="item-card">
            <div className="item-time">{formatTime(primaryLog.timestamp)}</div>
            {absLevel <= 1 ? (
              <div className="log-message" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                {activeMetrics.map(m => {
                   const mLog = dataset.logs[m][i];
                   return mLog ? <span key={m} style={{color: getMetricColor(m), fontSize: activeMetrics.length > 1 ? '0.85em' : '1em'}}>{mLog.message}</span> : null;
                })}
              </div>
            ) : (
              <div className="item-value" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                {activeMetrics.map(m => {
                   const mLog = dataset.logs[m][i];
                   return mLog ? <span key={m} style={{color: getMetricColor(m), fontSize: activeMetrics.length > 1 ? '0.85em' : '1em'}}>{m}: {(mLog.value * 100).toFixed(1)}%</span> : null;
                })}
              </div>
            )}
          </div>
        </div>
      );
    }
    return list;
  }, [startIndex, endIndex, scrollTop, playheadIndex, activeMetrics, level, primaryMetric, dataset]);

  const chartData = useMemo(() => {
    const baseData = dataset.logs[primaryMetric];
    return baseData.map((d, i) => {
      const point: any = { time: d.timestamp };
      for (const m of activeMetrics) {
         point[m] = dataset.logs[m][i]?.value || 0;
      }
      return point;
    });
  }, [activeMetrics, primaryMetric, dataset]);

  const handlePresetChange = (preset: 'free'|'solo_baseline'|'run1'|'run2'|'run3') => {
    const newAttempt = (preset === runPreset && preset !== 'free' && preset !== 'solo_baseline') ? (attempt < 3 ? attempt + 1 : 1) : 1;
    setRunPreset(preset);
    setAttempt(newAttempt);
    setDataset(generateDataset(preset, newAttempt));
    positionRef.current = 0;
    setPlayheadIndex(0);
    setLevel(0);
    
    if (preset === 'solo_baseline') {
      setIsViewVisible(false);
      setActiveMetrics(['CPU']);
    } else if (preset === 'run1') {
      setActiveMetrics(['CPU']);
    } else if (preset === 'run2') {
      setActiveMetrics(['Disk', 'Latency']);
    } else if (preset === 'run3') {
      setActiveMetrics(['Disk', 'Latency', 'CPU', 'Memory']);
    }
    
    setFlaggedTimestamps([]);
    setSurveyQueue([]);
    lastFlagWindowRef.current = null;
    
    logEvent('preset_change', { preset, attempt: newAttempt });
  };

  const progress = (positionRef.current / (listSize - 1)) * 100;

  return (
    <div className={`lux-console-fullscreen ${alertFlashing ? 'alert-flash' : ''}`}>
      <nav className="metrics-bar">
        {METRICS.map(m => (
          <button
            key={m}
            className={`metric-btn ${activeMetrics.includes(m) ? 'active' : ''}`}
            onClick={() => {
              if (activeMetrics.includes(m)) {
                if (activeMetrics.length > 1) setActiveMetrics(activeMetrics.filter(a => a !== m));
              } else {
                if (activeMetrics.length < 4) setActiveMetrics([...activeMetrics, m]);
              }
            }}
            style={activeMetrics.includes(m) ? { borderBottomColor: getMetricColor(m), color: getMetricColor(m) } : {}}
          >
            {m}
          </button>
        ))}

        {/* Keyboard / button legend */}
        <div className="sidebar-legend">
          <div className="legend-divider" />
          {[
            { key: 'W', label: 'Forward' },
            { key: 'S', label: 'Backward' },
            { key: 'A', label: 'Stop' },
            { key: 'D', label: 'Start / Stop' },
            { key: 'SPACE', label: 'Flag Anomaly' },
          ].map(({ key, label }) => (
            <div key={key} className="legend-item">
              <span className="legend-key" style={key === 'SPACE' ? { fontSize: '0.5rem', padding: '2px 4px' } : {}}>{key}</span>
              <span className="legend-label">{label}</span>
            </div>
          ))}
          <div className="legend-divider" />
          <div className="legend-item">
            <span className="legend-key" style={{ fontSize: '0.45rem', padding: '2px 3px' }}>BTN</span>
            <span className="legend-label">Start / Stop Log</span>
          </div>
          <div className="legend-item">
            <span className="legend-key" style={{ fontSize: '0.45rem', padding: '2px 3px', background: '#7f1d1d' }}>🚩</span>
            <span className="legend-label">Flag Anomaly</span>
          </div>
        </div>
      </nav>

      <div className="console-workspace">
        <header className="console-header-integrated">
          <div className="brand-suite">
            <h1 className="main-title serif-text">Log<span className="accent">Sonar</span></h1>
            <div className="id-strip" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="serial">SYS-LOGS</span>
              <div className="pulse-container" data-speaking={isSpeaking}>
                <div className="pulse-bar"></div>
                <div className="pulse-bar"></div>
                <div className="pulse-bar"></div>
              </div>
            </div>
          </div>
          <div className="global-stats">
            <button
              className="lux-btn reset-btn flag-btn-ui"
              onClick={handleFlag}
              style={{ background: '#b91c1c' }}
              title="Flag Anomaly"
            >
              <Flag size={14} style={{ marginRight: '6px' }} /> Flag Anomaly
            </button>
            <button
              className="lux-btn reset-btn study-btn-log"
              onClick={toggleLogging}
              style={{ background: isLogging ? '#7f1d1d' : undefined }}
            >
              {isLogging ? `Stop Log (${flagCount}F)` : 'Start Log'}
            </button>
            <button
              className="lux-btn reset-btn"
              disabled={isLogging}
              onClick={() => {
                positionRef.current = 0;
                setPlayheadIndex(0);
                setLevel(0);
                lastFlagWindowRef.current = null;
              }}
              style={{ opacity: isLogging ? 0.5 : 1, cursor: isLogging ? 'not-allowed' : 'pointer' }}
              title={isLogging ? "Cannot reset while logging is active" : "Reset Timeline"}
            >
              Reset
            </button>
            <button
              className="lux-btn reset-btn study-btn-view"
              onClick={() => {
                  setIsViewVisible(!isViewVisible);
                  logEvent('toggle_view', { visible: !isViewVisible ? 1 : 0 });
              }}
            >
              {isViewVisible ? 'Hide View' : 'Show View'}
            </button>
            <button
              className="sidebar-toggle"
              onClick={() => setIsDetailsOpen(!isDetailsOpen)}
              title="Toggle Sidebar"
            >
              {isDetailsOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
          </div>
        </header>

        <main className="console-main-layout">
          <section className="viewport-primary" style={{ position: 'relative' }}>
            {/* TrackingTask always takes the full main area when logging, in ALL conditions.
                 The chart (if visible) shrinks to a corner reference panel so the operator
                 can still see metrics while keeping the tracking task primary. */}
            {isLogging && (
              <div className="overlay-tracking-wrapper full-mode">
                <TrackingTask
                  isActive={isLogging}
                  onSampleError={(errPx) => {
                    trackingErrorWindowRef.current = [
                      ...trackingErrorWindowRef.current.slice(-29),
                      errPx,
                    ];
                    logEvent('primary_task_sample', { tracking_error_px: errPx });
                  }}
                />
              </div>
            )}

            <div className="viewport-overflow">
              <div className="focal-anchor"></div>

              {/* Chart: full area when not logging; compact corner overlay when logging in visual condition */}
              {isViewVisible && (
                <div className={isLogging ? 'list-content-frame split-layout chart-logging-mini' : 'list-content-frame split-layout'}>
                  <div className="graph-pane">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCPU" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ffb347" stopOpacity={0.8} /><stop offset="95%" stopColor="#ffb347" stopOpacity={0} /></linearGradient>
                          <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} /><stop offset="95%" stopColor="#8884d8" stopOpacity={0} /></linearGradient>
                          <linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ffc658" stopOpacity={0.8} /><stop offset="95%" stopColor="#ffc658" stopOpacity={0} /></linearGradient>
                          <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00C49F" stopOpacity={0.8} /><stop offset="95%" stopColor="#00C49F" stopOpacity={0} /></linearGradient>
                        </defs>
                        <XAxis dataKey="time" hide type="number" domain={[activeTimeRange.start, activeTimeRange.end]} />
                        
                        {activeMetrics.includes('CPU') && <Area type="monotone" dataKey="CPU" stroke="#ffb347" fillOpacity={1} fill="url(#colorCPU)" isAnimationActive={false} />}
                        {activeMetrics.includes('Memory') && <Area type="monotone" dataKey="Memory" stroke="#8884d8" fillOpacity={1} fill="url(#colorMemory)" isAnimationActive={false} />}
                        {activeMetrics.includes('Disk') && <Area type="monotone" dataKey="Disk" stroke="#ffc658" fillOpacity={1} fill="url(#colorDisk)" isAnimationActive={false} />}
                        {activeMetrics.includes('Latency') && <Area type="monotone" dataKey="Latency" stroke="#00C49F" fillOpacity={1} fill="url(#colorLatency)" isAnimationActive={false} />}
                        
                        <ReferenceLine x={positionRef.current} stroke="#E65722" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="details-pane">
                    {items}
                  </div>
                </div>
              )}

              <div className="timeline-scrubber-wrapper">
                <input
                  type="range"
                  className="timeline-scrubber-input"
                  min="0"
                  max={listSize - 1}
                  step="1"
                  value={playheadIndex}
                  onChange={(e) => {
                    positionRef.current = parseInt(e.target.value);
                    setPlayheadIndex(positionRef.current);
                  }}
                  style={{ '--progress': `${progress}%` } as React.CSSProperties}
                />
              </div>
            </div>

            <footer className="footer-controls">
              <DriveControls level={level} setLevel={setLevel} />
            </footer>
          </section>

          <aside className={`console-details ${isDetailsOpen ? '' : 'collapsed'}`}>            
            <div className="sidebar-section" style={{ marginBottom: '16px' }}>
              <div className="cfg-header" style={{ marginBottom: '10px' }}>
                <Activity size={14} />
                <span>PARTICIPANT</span>
              </div>
              <input 
                 className="participant-input sidebar-input" 
                 value={participantId} 
                 onChange={(e) => setParticipantId(e.target.value)} 
                 title="Participant ID"
                 style={{ background: '#222', border: '1px solid #444', color: '#fff', padding: '6px 8px', width: '100%', borderRadius: '4px' }}
                 placeholder="Enter Participant ID"
              />
            </div>
            
            <div className="sidebar-section">
              <div className="cfg-header" style={{ marginBottom: '10px' }}>
                <Activity size={14} />
                <span>STUDY PRESETS (Attempt {attempt})</span>
              </div>
              {/* Run preset number for badge: free=F, baseline=B, run1=1, run2=2, run3=3 */}
              {(() => {
                const runNum: Record<string, string> = { free: 'F', solo_baseline: 'B', run1: '1', run2: '2', run3: '3' };
                const badge = (preset: string) => runPreset === preset
                  ? <span style={{ marginLeft: 'auto', fontSize: '0.65rem', background: '#E65722', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>{runNum[preset]}-{attempt}</span>
                  : null;
                return (
                  <div className="sidebar-preset-group">
                    <button
                      className={`sidebar-preset-btn ${runPreset === 'free' ? 'active' : ''}`}
                      disabled={isLogging}
                      style={{ opacity: isLogging ? 0.5 : 1, cursor: isLogging ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                      onClick={() => handlePresetChange('free')}
                    >
                      <span>Free Play</span>{badge('free')}
                    </button>
                    <button
                      className={`sidebar-preset-btn ${runPreset === 'solo_baseline' ? 'active' : ''}`}
                      disabled={isLogging}
                      style={{ opacity: isLogging ? 0.5 : 1, cursor: isLogging ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                      onClick={() => handlePresetChange('solo_baseline')}
                    >
                      <span>Solo Baseline</span>{badge('solo_baseline')}
                    </button>
                    <button
                      className={`sidebar-preset-btn ${runPreset === 'run1' ? 'active' : ''}`}
                      disabled={isLogging}
                      style={{ opacity: isLogging ? 0.5 : 1, cursor: isLogging ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                      onClick={() => handlePresetChange('run1')}
                    >
                      <span>Run 1 (CPU) {trainingPassed && '✓'}</span>{badge('run1')}
                    </button>
                    <button
                      className={`sidebar-preset-btn ${runPreset === 'run2' ? 'active' : ''}`}
                      disabled={isLogging}
                      style={{ opacity: isLogging ? 0.5 : 1, cursor: isLogging ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                      onClick={() => handlePresetChange('run2')}
                    >
                      <span>Run 2 (Disk + Latency)</span>{badge('run2')}
                    </button>
                    <button
                      className={`sidebar-preset-btn ${runPreset === 'run3' ? 'active' : ''}`}
                      disabled={isLogging}
                      style={{ opacity: isLogging ? 0.5 : 1, cursor: isLogging ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                      onClick={() => handlePresetChange('run3')}
                    >
                      <span>Run 3 (Full Cascade)</span>{badge('run3')}
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Audio Calibration Baseline Panel */}
            <div className="sidebar-section" style={{ marginTop: '16px' }}>
              <div className="cfg-header" style={{ marginBottom: '10px' }}>
                <Clock size={14} />
                <span>CALIBRATION</span>
              </div>
              <button
                className="sidebar-baseline-btn"
                onClick={() => {
                  if (baselineLabel) return;
                  runBaselineTour();
                }}
                style={{ opacity: baselineLabel ? 0.6 : 1, marginBottom: '10px' }}
                title="Play 5-second baseline audio for each active metric"
              >
                {baselineLabel ? `Baseline: ${baselineLabel}` : 'Play Baseline Audio Tour'}
              </button>

              <div className="cfg-header" style={{ marginBottom: '10px', marginTop: '16px' }}>
                <Activity size={14} />
                <span>SOUND PREFERENCES</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['CPU', 'Memory', 'Disk', 'Latency'].map((m) => (
                  <div key={m} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#ccc' }}>
                    <span>{m}</span>
                    <select 
                      disabled={isLogging}
                      style={{ background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '2px 4px', opacity: isLogging ? 0.5 : 1, cursor: isLogging ? 'not-allowed' : 'pointer' }}
                      value={soundMapping[m as MetricType]}
                      onChange={(e) => {
                         if (audioEnabled) {
                            const newVal = e.target.value;
                            // Update the AudioEngine (used for actual audio)
                            announcerRef.current.oscillatorMapping[m as MetricType] = newVal as any;
                            // Update React state (used for controlled dropdown display)
                            setSoundMapping(prev => ({ ...prev, [m]: newVal }));
                            
                            // Play 2s preview
                            cancelBaselineTour();
                            previewRunningRef.current = true;
                            announcerRef.current.startDriving([m as MetricType]);
                            announcerRef.current.updateDriving({ CPU: 1, Memory: 1, Disk: 1, Latency: 1 }, 1);
                            
                            if (baselineIntervalsRef.current.timeout) clearTimeout(baselineIntervalsRef.current.timeout);
                            baselineIntervalsRef.current.timeout = setTimeout(() => {
                               previewRunningRef.current = false;
                            }, 2000);
                         }
                      }}
                    >
                      <optgroup label="Tonal (Synths)">
                        <option value="sine">Sine Wave</option>
                        <option value="square">Square Wave</option>
                        <option value="triangle">Triangle Wave</option>
                        <option value="sawtooth">Sawtooth Wave</option>
                        <option value="am-sine">AM Synth (Tremolo)</option>
                        <option value="fm-sine">FM Synth (Vibrato)</option>
                      </optgroup>
                      <optgroup label="Noise (Filtered)">
                        <option value="bandpass-noise">Bandpass Noise</option>
                        <option value="lowpass-noise">Lowpass Noise</option>
                        <option value="highpass-noise">Highpass Noise</option>
                        <option value="allpass-noise">White Noise</option>
                      </optgroup>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="system-footprint" style={{ marginTop: 'auto' }}>
              <div className="foot-row">
                <Layers size={14} />
                <span>Timeline Length: {listSize}s</span>
              </div>
              <div className="foot-row">
                <Navigation size={14} />
                <span>Time Index: {playheadIndex}s</span>
              </div>
            </div>
          </aside>
        </main>
      </div>

      <ReportModal
        key={`survey-${totalSurveysInQueue - surveyQueue.length + 1}`}
        isOpen={isReportModalOpen}
        runPreset={runPreset === 'solo_baseline' ? 'free' : runPreset}
        currentTimeSec={surveyQueue[0] || Math.round(positionRef.current)}
        surveyIndex={totalSurveysInQueue - surveyQueue.length + 1}
        totalSurveys={totalSurveysInQueue}
        onSubmitReport={(data) => {
          const pos = surveyQueue[0] ?? Math.round(positionRef.current);
          const gtOnset = dataset.groundTruths.rootOnsetS;
          const deltaT = Math.abs(pos - gtOnset);
          const proximityScore = Math.max(0, parseFloat((1 - (deltaT / listSize)).toFixed(3)));
          const isAttributionCorrect = data.rootCauseMetric === (runPreset === 'run1' ? 'CPU' : 'Disk');

          if (runPreset === 'run1' && isAttributionCorrect && deltaT < 60) {
              setTrainingPassed(true);
          }

          const row = logEvent('report_peak', {
            reported_root_metric: data.rootCauseMetric,
            reported_symptom_metric: data.symptomMetric || '',
            reported_chain_order: data.chainOrder ? data.chainOrder.join('->') : '',
            gt_root_onset_s: gtOnset,
            delta_T_root_s: deltaT,
            proximity_score: proximityScore,
            attribution_correct: isAttributionCorrect ? 1 : 0,
            confidence_rating: data.confidenceRating,
            detection_modality: data.detectionModality,
          }, true);

          // Build the updated log immediately (don't rely on async setState)
          const newLog = row ? [...sessionLog, row] : [...sessionLog];
          setSessionLog(newLog);

          const newQueue = surveyQueue.slice(1);
          if (newQueue.length > 0) {
             // More flags to review — advance the queue
             setSurveyQueue(newQueue);
          } else {
             // All flags reviewed — close modal and finalize
             setIsReportModalOpen(false);
             setSurveyQueue([]);
             // Run 3: show post-session questionnaire before downloading
             if (runPreset === 'run3') {
                 setIsPostSessionOpen(true);
                 // Hold log in state for post-session modal to append to
                 teardownSession();
                 // But we need to pass newLog to PostSessionModal — store in a ref
                 pendingLogsRef.current = newLog;
             } else {
                 downloadCsv(newLog);
                 teardownSession();
             }
          }
        }}
      />

      <PostSessionModal
        isOpen={isPostSessionOpen}
        onSubmit={(data: PostSessionData) => {
          setIsPostSessionOpen(false);
          const wallMs = Date.now();
          const soundStr = getSoundMapping();
          const extraStr = `usefulness=${data.usefulnessRating},distraction=${data.distractionRating},prefer_audio=${data.wouldPreferAudio}`;
          const row = `${participantId},${isViewVisible ? 'visual' : 'auditory'},${runPreset},${attempt},${wallMs},,post_session_survey,,,${activeMetrics.join('|')},${soundStr},${extraStr}`;
          const finalLog = [...pendingLogsRef.current, row];
          pendingLogsRef.current = [];
          downloadCsv(finalLog);
        }}
      />
    </div>
  );
}
