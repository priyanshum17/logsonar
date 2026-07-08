import { useEffect, useRef, useState, useMemo } from 'react';
import { MOCK_TIME_SERIES, MetricType, METRICS } from '../data/mockTimeSeries';
import { AudioEngine } from '../engine/AudioEngine';
import DriveControls from './DriveControls';
import { Activity, Navigation, Layers, Clock, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { AreaChart, Area, XAxis, ResponsiveContainer, ReferenceLine } from 'recharts';
import './TimelineVisualizer.css';

const ITEM_HEIGHT = 80;
const VISIBLE_COUNT = 15;
const MAX_LEVEL = 5;

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function TimelineVisualizer() {
  const [level, setLevel] = useState(0);
  const [mode, setMode] = useState<'linear' | 'exponential'>('linear');
  const [baseSpeed, setBaseSpeed] = useState(0.5);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [displayVelocity, setDisplayVelocity] = useState(0);

  const [activeMetric, setActiveMetric] = useState<MetricType>('CPU');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const [activeTimeRange, setActiveTimeRange] = useState({ start: -30, end: 30 });
  const [playheadIndex, setPlayheadIndex] = useState(0);
  const lastSpokenIndexRef = useRef(-1);

  const positionRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const lastTimeRef = useRef<number>(performance.now());
  const announcerRef = useRef(AudioEngine.getInstance());

  const activeData = MOCK_TIME_SERIES[activeMetric];
  const listSize = activeData.length;

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
        if (newPos <= 0 || newPos >= listSize - 1) {
            setLevel(0);
            announcerRef.current.clearSpeech();
            isSpeakingRef.current = false;
            setIsSpeaking(false);
        }
        positionRef.current = Math.max(0, Math.min(listSize - 1, newPos));
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
        if (level !== 0) {
          if (absLevel > 1) {
            announcerRef.current.startDriving(activeMetric);
          } else {
            announcerRef.current.stopDriving();
          }

          const currentIndex = Math.round(positionRef.current);
          if (currentIndex >= 0 && currentIndex < listSize) {
            const endIdx = Math.min(listSize, currentIndex + lookahead);
            const windowData = activeData.slice(currentIndex, endIdx);
            if (windowData.length > 0) {
              const maxVal = Math.max(...windowData.map(d => d.value));
              const avgVal = windowData.reduce((sum, d) => sum + d.value, 0) / windowData.length;
              const condensedValue = (avgVal * 0.4) + (maxVal * 0.6);

              if (absLevel > 1) {
                announcerRef.current.updateDriving(condensedValue, Math.abs(velocity));
              }
            }

            if (absLevel === 1) {
              if (currentIndex !== lastSpokenIndexRef.current) {
                lastSpokenIndexRef.current = currentIndex;
                const logEv = activeData[currentIndex];
                if (logEv) {
                  announcerRef.current.stopDriving();
                  
                  isSpeakingRef.current = true;
                  setIsSpeaking(true);
                  
                  announcerRef.current.speakLog(logEv.message, () => {
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
          announcerRef.current.stopDriving();
          lastSpokenIndexRef.current = -1;
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
  }, [level, mode, audioEnabled, baseSpeed, displayVelocity, activeMetric, activeData, activeTimeRange, playheadIndex]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!audioEnabled) return;
      if (e.key === 'w' || e.key === 'W') {
        setLevel(prev => Math.min(prev + 1, MAX_LEVEL));
      } else if (e.key === 's' || e.key === 'S') {
        setLevel(prev => Math.max(prev - 1, -MAX_LEVEL));
      } else if (e.key === 'a' || e.key === 'A') {
        setLevel(0);
        announcerRef.current.cancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [audioEnabled]);

  const startIndex = Math.max(0, playheadIndex - Math.floor(VISIBLE_COUNT / 2));
  const endIndex = Math.min(listSize - 1, startIndex + VISIBLE_COUNT);

  const items = useMemo(() => {
    const list = [];
    const absLevel = Math.abs(level);

    for (let i = startIndex; i <= endIndex; i++) {
      const log = activeData[i];
      if (!log) continue;

      const offset = (i * ITEM_HEIGHT) - scrollTop;
      const isScreenCenter = i === playheadIndex;
      const distFromCenter = Math.abs(offset);
      const opacity = distFromCenter < ITEM_HEIGHT ? 1 : Math.max(0, 1 - (distFromCenter / (ITEM_HEIGHT * (VISIBLE_COUNT / 2.5))));
      const blur = distFromCenter < ITEM_HEIGHT ? 0 : Math.min(6, distFromCenter / 120);

      list.push(
        <div
          key={log.timestamp}
          className={`virtual-item ${isScreenCenter ? 'active' : ''}`}
          style={{
            transform: `translateY(${offset}px) scale(${isScreenCenter ? 1.08 : 1})`,
            opacity,
            filter: `blur(${blur}px)`
          }}
        >
          <div className="item-card">
            <div className="item-time">{formatTime(log.timestamp)}</div>
            {absLevel <= 1 ? (
              <div className="log-message">{log.message}</div>
            ) : (
              <div className="item-value">{(log.value * 100).toFixed(1)}%</div>
            )}
          </div>
        </div>
      );
    }
    return list;
  }, [startIndex, endIndex, scrollTop, playheadIndex, activeData, level]);

  const chartData = useMemo(() => {
    // Pad the chart data to fill the visual domain if needed, 
    // but recharts handles it if we pass the whole dataset
    // To optimize, just pass the entire activeData. Recharts crops via domain.
    return activeData.map(d => ({
      time: d.timestamp,
      value: d.value
    }));
  }, [activeData]);


  const progress = (positionRef.current / (listSize - 1)) * 100;

  return (
    <div className="lux-console-fullscreen">
      <nav className="metrics-bar">
        {METRICS.map(m => (
          <button
            key={m}
            className={`metric-btn ${m === activeMetric ? 'active' : ''}`}
            onClick={() => { setActiveMetric(m); announcerRef.current.cancel(); }}
          >
            {m}
          </button>
        ))}
      </nav>

      <div className="console-workspace">
        <header className="console-header-integrated">
          <div className="brand-suite">
            <h1 className="main-title serif-text">Log<span className="accent">Sonar</span></h1>
            <div className="id-strip">
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
              className="lux-btn reset-btn"
              onClick={() => {
                positionRef.current = 0;
                setPlayheadIndex(0);
                setLevel(0);
              }}
              style={{ marginRight: '16px' }}
            >
              Reset Timeline
            </button>
            <button
              className="sidebar-toggle"
              onClick={() => setIsDetailsOpen(!isDetailsOpen)}
              title="Toggle Sidebar"
            >
              {isDetailsOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
            <div className="stat-blob linked">
              <span className="label">SYSTEM</span>
              <span className="value status" data-linked={audioEnabled}>
                {audioEnabled ? 'READY' : 'WAIT'}
              </span>
            </div>
          </div>
        </header>

        <main className="console-main-layout">
          <section className="viewport-primary">
            <div className="viewport-overflow">
              <div className="focal-anchor"></div>

              <div className="list-content-frame split-layout">
                <div className="graph-pane">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#d4af37" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#d4af37" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" hide type="number" domain={[activeTimeRange.start, activeTimeRange.end]} />
                      <Area type="monotone" dataKey="value" stroke="#d4af37" fillOpacity={1} fill="url(#colorValue)" isAnimationActive={false} />
                      <ReferenceLine x={positionRef.current} stroke="#E65722" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="details-pane">
                  {items}
                </div>
              </div>

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

          <aside className={`console-details ${isDetailsOpen ? '' : 'collapsed'}`}>            <div className="config-panel" onClick={() => setMode(m => m === 'linear' ? 'exponential' : 'linear')}>
              <div className="cfg-header">
                <Activity size={14} />
                <span>Physics Mode</span>
              </div>
              <div className="cfg-val">{mode}</div>
            </div>

            <div className="config-panel slider-panel">
              <div className="cfg-header">
                <Clock size={14} />
                <span>Sens: {baseSpeed.toFixed(2)}</span>
              </div>
              <input
                type="range" min="0.01" max="5.00" step="0.01"
                value={baseSpeed} onChange={(e) => setBaseSpeed(parseFloat(e.target.value))}
                className="lux-slider-mini"
              />
            </div>

            <div className="system-footprint">
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
    </div>
  );
}
