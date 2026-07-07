export type MetricType = 'CPU' | 'Memory' | 'Network' | 'Disk' | 'Latency' | 'ErrorRate';

export interface LogEvent {
  id: string;
  timestamp: number; // 0 to 599
  metric: MetricType;
  value: number; // 0.0 to 1.0
  message: string;
}

export const METRICS: MetricType[] = ['CPU', 'Memory', 'Network', 'Disk', 'Latency', 'ErrorRate'];

export const generateTimeSeriesData = (): Record<MetricType, LogEvent[]> => {
  const data: Record<string, LogEvent[]> = {
    CPU: [], Memory: [], Network: [], Disk: [], Latency: [], ErrorRate: []
  };
  const TOTAL_SECONDS = 600; // 10 minutes
  
  for (let t = 0; t < TOTAL_SECONDS; t++) {
    METRICS.forEach(metric => {
       // Base value
       let val = Math.random() * 0.3 + 0.2; 
       
       // Anomaly between minute 2.5 (150s) and minute 3.5 (210s), peaking at 180s
       if (t >= 150 && t <= 210) {
          const distanceToPeak = Math.abs(t - 180);
          const anomalyFactor = Math.max(0, 1 - (distanceToPeak / 30)); // 0 to 1
          val = Math.min(1.0, val + anomalyFactor * 0.6);
       }
       
       let msg = "";
       if (metric === 'CPU') msg = `CPU Utilization at ${Math.round(val * 100)}%`;
       if (metric === 'Memory') msg = `Memory usage reached ${Math.round(val * 100)}%`;
       if (metric === 'Network') msg = `Network I/O: ${Math.round(val * 1000)} Mbps`;
       if (metric === 'Disk') msg = `Disk I/O latency ${Math.round(val * 50)}ms`;
       if (metric === 'Latency') msg = `Request latency spiked to ${Math.round(val * 2000)}ms`;
       if (metric === 'ErrorRate') msg = `Error rate at ${(val * 5).toFixed(2)}%`;
       
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
