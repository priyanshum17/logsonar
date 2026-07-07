import { useEffect, useRef, useState, useMemo } from 'react';
import { MOCK_TIME_SERIES, MetricType, METRICS } from '../data/mockTimeSeries';
import { AudioEngine } from '../engine/AudioEngine';
import { TrieNavigator, TrieNode } from '../engine/TrieNavigator';
import DriveControls from './DriveControls';
import { Activity, Gauge, Navigation, Layers, Clock } from 'lucide-react';
import './TimelineVisualizer.css';

const ITEM_HEIGHT = 80;
const VISIBLE_COUNT = 15;
const MAX_LEVEL = 5;

// Formatting helper
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
  const [devMode] = useState(false);
  
  const [activeMetric, setActiveMetric] = useState<MetricType>('CPU');
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const trieNavigator = useMemo(() => new TrieNavigator(), []);
  const currentNodeRef = useRef<TrieNode>(trieNavigator.getLeafAt(0));
  const clutchUntilRef = useRef<number>(0);
  const hopProgressRef = useRef(0);
  const targetLinearIndexRef = useRef(0);
  
  const positionRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const lastTimeRef = useRef<number>(performance.now());
  const announcerRef = useRef(AudioEngine.getInstance());

  const activeData = MOCK_TIME_SERIES[activeMetric];
  const listSize = trieNavigator.leaves.length;

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
    let speakTimer: any;

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
      
      if (level !== 0) {
         if (audioEnabled) {
            announcerRef.current.startDriving(activeMetric);
         }
         
         const sign = Math.sign(level);
         const absLevel = Math.abs(level);
         
         // 1. Shift Gears (Vertical movement in Trie)
         // Level 1 = Gear 1 (Depth 5). Level 5 = Gear 5 (Depth 1).
         let targetDepth = 6 - absLevel; 
         
         if (currentNodeRef.current.depth > targetDepth) {
            currentNodeRef.current = currentNodeRef.current.getAncestorAtDepth(targetDepth);
         } else if (currentNodeRef.current.depth < targetDepth) {
            let curr = currentNodeRef.current;
            while (curr.depth < targetDepth && curr.children.length > 0) {
               curr = curr.children[0];
            }
            currentNodeRef.current = curr;
         }
         
         // 2. Horizontal Hopping
         let hopRate = baseSpeed;
         if (time > clutchUntilRef.current) {
             hopProgressRef.current += hopRate * dt;
         }
         
         let hopped = false;
         while (hopProgressRef.current >= 1) {
             hopProgressRef.current -= 1;
             let nextNode = sign > 0 ? currentNodeRef.current.nextSibling : currentNodeRef.current.prevSibling;
             if (nextNode) {
                 currentNodeRef.current = nextNode;
                 hopped = true;
             }
         }
         
         // 3. Audio & UI side effects
         if (audioEnabled) {
             const currentIndex = Math.floor(positionRef.current);
             if (currentIndex >= 0 && currentIndex < listSize) {
                 const logEv = activeData[currentIndex];
                 if (logEv && targetDepth < 5) {
                    announcerRef.current.updateDriving(logEv.value, Math.abs(velocity));
                 }
             }

             if (hopped) {
                 setIsSpeaking(true);
                 clearTimeout(speakTimer);
                 speakTimer = setTimeout(() => setIsSpeaking(false), 200);

                 if (targetDepth === 5) { // Level 1 (Leaves)
                    const logEv = activeData[currentNodeRef.current.startTime];
                    if (logEv) {
                       announcerRef.current.stopDriving();
                       announcerRef.current.speakLog(logEv.message);
                    }
                 }
             }
         }
      } else {
         if (audioEnabled) {
            announcerRef.current.stopDriving();
         }
      }
      
      // 4. Update target linear index for smooth scrolling
      targetLinearIndexRef.current = currentNodeRef.current.depth === 5 
        ? currentNodeRef.current.linearIndex 
        : currentNodeRef.current.getFirstLeaf().linearIndex;

      // 5. Smooth visual interpolation
      const diff = targetLinearIndexRef.current - positionRef.current;
      positionRef.current += diff * 15 * dt; 
      if (Math.abs(diff) < 0.05) positionRef.current = targetLinearIndexRef.current;
      
      setScrollTop(positionRef.current * ITEM_HEIGHT);
      reqId = requestAnimationFrame(loop);
    };
    reqId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(reqId);
      clearTimeout(speakTimer);
    };
  }, [level, mode, audioEnabled, baseSpeed, displayVelocity, activeMetric, activeData]);
  
  // Keyboard Bindings
  useEffect(() => {
     const onKeyDown = (e: KeyboardEvent) => {
        if (!audioEnabled) return; 
        if (e.key === 'w' || e.key === 'W') {
           setLevel(prev => {
              clutchUntilRef.current = performance.now() + 2000;
              return Math.min(prev + 1, MAX_LEVEL);
           });
        } else if (e.key === 's' || e.key === 'S') {
           setLevel(prev => {
              clutchUntilRef.current = performance.now() + 2000;
              return Math.max(prev - 1, -MAX_LEVEL);
           });
        } else if (e.key === 'a' || e.key === 'A') {
           setLevel(0);
           announcerRef.current.cancel();
        }
     };
     window.addEventListener('keydown', onKeyDown);
     return () => window.removeEventListener('keydown', onKeyDown);
  }, [audioEnabled]);

  const currentCenterIndex = Math.floor(positionRef.current + 0.5);

  const startIndex = Math.max(0, currentCenterIndex - Math.floor(VISIBLE_COUNT/2));
  const endIndex = Math.min(listSize - 1, startIndex + VISIBLE_COUNT);
  
  const items = useMemo(() => {
    const list = [];
    
    let activeDepth = 5;
    const absLevel = Math.abs(level);
    if (absLevel > 0) activeDepth = 6 - absLevel;
    
    // Determine the active range based on the current node
    const activeStart = currentNodeRef.current.startTime;
    const activeEnd = currentNodeRef.current.endTime;
    
    for (let i = startIndex; i <= endIndex; i++) {
        const leaf = trieNavigator.leaves[i];
        const log = activeData[leaf.startTime];
        const offset = (i * ITEM_HEIGHT) - scrollTop;
        
        // If we are aggregating, highlight all items in the current node's range
        const isCenter = activeDepth === 5 
           ? i === currentCenterIndex 
           : (leaf.startTime >= activeStart && leaf.startTime < activeEnd);
        
        // Use center of screen for transform scaling
        const isScreenCenter = i === currentCenterIndex;
        
        const distFromCenter = Math.abs(offset);
        const opacity = distFromCenter < ITEM_HEIGHT ? 1 : Math.max(0, 1 - (distFromCenter / (ITEM_HEIGHT * (VISIBLE_COUNT/2.8))));
        const blur = distFromCenter < ITEM_HEIGHT ? 0 : Math.min(6, distFromCenter / 120);

        list.push(
            <div 
              key={leaf.startTime} 
              className={`virtual-item ${isCenter ? 'active' : ''}`}
              style={{ 
                transform: `translateY(${offset}px) scale(${isScreenCenter ? 1.08 : 1})`, 
                opacity,
                filter: `blur(${blur}px)`
              }}
            >
              <div className="item-card">
                <div className="item-time">{formatTime(log.timestamp)}</div>
                {activeDepth === 5 ? (
                    <div className="log-message">{log.message}</div>
                ) : (
                    <div className="item-value">{(log.value * 100).toFixed(1)}%</div>
                )}
              </div>
            </div>
        );
    }
    return list;
  }, [startIndex, endIndex, scrollTop, currentCenterIndex, activeData, level]);

  const wpm = Math.abs(Math.round(displayVelocity * 60));
  const progress = (positionRef.current / (listSize - 1)) * 100;

  return (
    <div className="lux-console-fullscreen">
      {/* Side: Metric Quick-Nav */}
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

      {/* Main Container */}
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
              {devMode ? (
                 <div className="tree-canvas">
                    {/* Simplified Dev Mode could go here */}
                    <div style={{color: '#888', padding: 20}}>Tree Visualization Mode (See Code)</div>
                 </div>
              ) : (
                 <div className="list-content-frame">
                   {items}
                 </div>
              )}
              <div className="global-scrubber">
                <div className="scrubber-fill" style={{ width: `${progress}%` }}></div>
              </div>
            </div>

            <footer className="footer-controls">
              <DriveControls level={level} setLevel={setLevel} />
            </footer>
          </section>

          <aside className="console-details">
            <div className="metric-panel pulse-aware" data-active={Math.abs(level) > 0}>
              <Gauge size={18} className="icon-gold" />
              <div className="metric-readout">
                <span className="label">Velocity</span>
                <div className="big-num">{wpm} <span style={{fontSize: '0.8rem'}}>hops/min</span></div>
                <div className="gear-tag">G{Math.abs(level)} • {mode}</div>
              </div>
            </div>

            <div className="config-panel" onClick={() => setMode(m => m === 'linear' ? 'exponential' : 'linear')}>
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
                 <span>Time Index: {Math.round(positionRef.current)}s</span>
               </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
