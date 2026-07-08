export type MetricType = 'CPU' | 'Memory' | 'Network' | 'Disk' | 'Latency' | 'ErrorRate';

export interface LogEvent {
  id: string;
  timestamp: number; // 0 to 599
  metric: MetricType;
  value: number; // 0.0 to 1.0
  message: string;
}

export const METRICS: MetricType[] = ['CPU', 'Memory', 'Network', 'Disk', 'Latency', 'ErrorRate'];

function calculateOrganicAnomaly(t: number, start: number, peak: number, end: number, maxIntensity: number): number {
  if (t < start || t > end) return 0;
  
  let progress = 0;
  if (t <= peak) {
    progress = (t - start) / (peak - start);
  } else {
    progress = 1 - (t - peak) / (end - peak);
  }
  
  // Smoothstep easing: 3x^2 - 2x^3
  // This rounds off the sharp corners of the triangle, creating a bell-like curve
  const ease = progress * progress * (3 - 2 * progress);
  return ease * maxIntensity;
}

export const generateTimeSeriesData = (): Record<MetricType, LogEvent[]> => {
  const data: Record<string, LogEvent[]> = {
    CPU: [], Memory: [], Network: [], Disk: [], Latency: [], ErrorRate: []
  };
  const TOTAL_SECONDS = 1800; // 30 minutes
  
  // Starting baselines for the Random Walk
  const state = {
      Disk: 0.1, Latency: 0.05, Network: 0.15, CPU: 0.15, ErrorRate: 0.0, Memory: 0.4
  };
  
  for (let t = 0; t < TOTAL_SECONDS; t++) {
    METRICS.forEach(metric => {
       
       // 1. Organic Base: Random Walk (Brownian Motion) instead of White Noise
       // This prevents the graph from looking like a fuzzy caterpillar
       const maxBase = metric === 'Memory' ? 0.6 : (metric === 'ErrorRate' ? 0.05 : 0.3);
       const minBase = metric === 'ErrorRate' ? 0.0 : 0.05;
       
       // Drift slowly up or down
       const drift = (Math.random() - 0.5) * 0.015;
       state[metric] = Math.max(minBase, Math.min(maxBase, state[metric] + drift));
       
       // 2. Smooth Anomaly Curves
       let anomaly = 0;
       if (metric === 'Disk') {
           anomaly = calculateOrganicAnomaly(t, 300, 540, 1320, 0.7);
       } else if (metric === 'Latency') {
           anomaly = calculateOrganicAnomaly(t, 540, 840, 1440, 0.8);
       } else if (metric === 'Network') {
           anomaly = calculateOrganicAnomaly(t, 840, 1080, 1560, 0.75);
       } else if (metric === 'CPU') {
           anomaly = calculateOrganicAnomaly(t, 1080, 1440, 1680, 0.85);
       } else if (metric === 'ErrorRate') {
           anomaly = calculateOrganicAnomaly(t, 1440, 1620, 1740, 0.95);
       } else if (metric === 'Memory') {
           anomaly = calculateOrganicAnomaly(t, 300, 1500, 1680, 0.4); 
       }
       
       // 3. Volatility Injection: Add slightly larger random walk steps when an anomaly is happening
       if (anomaly > 0) {
           const volatility = (Math.random() - 0.5) * 0.04 * (anomaly * 2);
           state[metric] = Math.max(0, state[metric] + volatility);
       }
       
       const val = Math.min(1.0, Math.max(0, state[metric] + anomaly));
       
       let msg = "";
       if (metric === 'CPU') msg = `CPU Util: ${Math.round(val * 100)}%`;
       if (metric === 'Memory') msg = `Mem: ${Math.round(val * 100)}%`;
       if (metric === 'Network') msg = `Net I/O: ${Math.round(val * 1000)} Mbps`;
       if (metric === 'Disk') msg = `Disk Wait: ${Math.round(val * 500)}ms`;
       if (metric === 'Latency') msg = `Latency: ${Math.round(val * 2000)}ms`;
       if (metric === 'ErrorRate') msg = `Errors: ${(val * 100).toFixed(1)}%`;
       
       data[metric].push({
         id: `log-${metric}-${t}`,
         timestamp: t,
         metric,
         value: val,
         message: msg
       });
    });
  }
  
  return data as Record<MetricType, LogEvent[]>;
};

export const MOCK_TIME_SERIES = generateTimeSeriesData();
