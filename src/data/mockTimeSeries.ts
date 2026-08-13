export type MetricType = 'CPU' | 'Memory' | 'Disk' | 'Latency';

export interface LogEvent {
  id: string;
  timestamp: number; // in seconds
  metric: MetricType;
  value: number; // 0.0 to 1.0
  message: string;
}

export const METRICS: MetricType[] = ['CPU', 'Memory', 'Disk', 'Latency'];

export interface Dataset {
  logs: Record<MetricType, LogEvent[]>;
  durationSec: number;
  groundTruths: {
    rootOnsetS: number;
    symptomOnsetS?: number;
  };
}

function calculateOrganicAnomaly(t: number, start: number, peak: number, end: number, maxIntensity: number): number {
  if (t < start || t > end) return 0;
  
  let progress = 0;
  if (t <= peak) {
    progress = (t - start) / (peak - start);
  } else {
    progress = 1 - (t - peak) / (end - peak);
  }
  
  const ease = progress * progress * (3 - 2 * progress);
  return ease * maxIntensity;
}

export const generateDataset = (preset: 'run1' | 'run2' | 'run3' | 'free' | 'solo_baseline', attempt: number = 1): Dataset => {
  const data: Record<string, LogEvent[]> = { CPU: [], Memory: [], Disk: [], Latency: [] };
  let TOTAL_SECONDS = 300;
  let rootOnset = 0;
  let symptomOnset = 0;

  // Set duration and randomized onset based on preset
  if (preset === 'run1' || preset === 'solo_baseline') {
    TOTAL_SECONDS = 300; // 5 mins
    const baseOnset = 150; // 2:30
    // Randomize +/- 15s per attempt, seed based on attempt so it's consistent
    const offset = (Math.sin(attempt * 12.34) * 15);
    rootOnset = baseOnset + offset;
  } else if (preset === 'run2') {
    TOTAL_SECONDS = 600; // 10 mins
    const baseDiskOnset = 180; // 3:00
    const offset = (Math.sin(attempt * 45.67) * 20);
    rootOnset = baseDiskOnset + offset;
    symptomOnset = rootOnset + 90; // Latency 90s later
  } else if (preset === 'run3' || preset === 'free') {
    TOTAL_SECONDS = 1800; // 30 mins
    rootOnset = 300; // 5:00 Disk I/O
    symptomOnset = 540; // 9:00 Latency
  }

  const state = { Disk: 0.1, Latency: 0.05, CPU: 0.15, Memory: 0.4 };
  
  for (let t = 0; t < TOTAL_SECONDS; t++) {
    METRICS.forEach(metric => {
       const maxBase = metric === 'Memory' ? 0.6 : 0.3;
       const minBase = 0.05;
       
       const drift = (Math.random() - 0.5) * 0.015;
       state[metric] = Math.max(minBase, Math.min(maxBase, state[metric] + drift));
       
       let anomaly = 0;
       
       if (preset === 'run1' || preset === 'solo_baseline') {
         if (metric === 'CPU') {
           anomaly = calculateOrganicAnomaly(t, rootOnset, rootOnset + 20, rootOnset + 45, 0.85);
         }
       } else if (preset === 'run2') {
         if (metric === 'Disk') {
           anomaly = calculateOrganicAnomaly(t, rootOnset, rootOnset + 120, rootOnset + 300, 0.7);
         } else if (metric === 'Latency') {
           anomaly = calculateOrganicAnomaly(t, symptomOnset, symptomOnset + 120, rootOnset + 300, 0.8);
         }
       } else if (preset === 'run3' || preset === 'free') {
         if (metric === 'Disk') {
           anomaly = calculateOrganicAnomaly(t, rootOnset, rootOnset + 240, 1320, 0.7);
         } else if (metric === 'Latency') {
           anomaly = calculateOrganicAnomaly(t, symptomOnset, symptomOnset + 300, 1440, 0.8);
         } else if (metric === 'CPU') {
           anomaly = calculateOrganicAnomaly(t, 1080, 1440, 1680, 0.85);
         } else if (metric === 'Memory') {
           anomaly = calculateOrganicAnomaly(t, 300, 1500, 1680, 0.4); 
         }
       }
       
       if (anomaly > 0) {
           const volatility = (Math.random() - 0.5) * 0.04 * (anomaly * 2);
           state[metric] = Math.max(0, state[metric] + volatility);
       }
       
       const val = Math.min(1.0, Math.max(0, state[metric] + anomaly));
       
       let msg = "";
       if (metric === 'CPU') msg = `CPU Util: ${Math.round(val * 100)}%`;
       if (metric === 'Memory') msg = `Mem: ${Math.round(val * 100)}%`;
       if (metric === 'Disk') msg = `Disk Wait: ${Math.round(val * 500)}ms`;
       if (metric === 'Latency') msg = `Latency: ${Math.round(val * 2000)}ms`;
       
       data[metric].push({
         id: `log-${metric}-${t}`,
         timestamp: t,
         metric,
         value: val,
         message: msg
       });
    });
  }
  
  return {
    logs: data as Record<MetricType, LogEvent[]>,
    durationSec: TOTAL_SECONDS,
    groundTruths: {
      rootOnsetS: rootOnset,
      symptomOnsetS: preset !== 'run1' && preset !== 'solo_baseline' ? symptomOnset : undefined
    }
  };
};

