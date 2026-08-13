import React, { useState, useEffect } from 'react';
import { MetricType, METRICS } from '../data/mockTimeSeries';
import './ReportModal.css';

interface ReportModalProps {
  isOpen: boolean;
  runPreset: 'run1' | 'run2' | 'run3' | 'free';
  currentTimeSec: number;
  surveyIndex?: number;
  totalSurveys?: number;
  onSubmitReport: (data: {
    rootCauseMetric: MetricType | 'Discarded';
    symptomMetric?: MetricType;
    chainOrder?: MetricType[];
    timestampSec: number;
    confidenceRating: number;
    detectionModality: 'audio' | 'visual' | 'both';
  }) => void;
}

type DetectionModality = 'audio' | 'visual' | 'both';

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  runPreset,
  currentTimeSec,
  surveyIndex,
  totalSurveys,
  onSubmitReport,
}) => {
  const [rootCause, setRootCause] = useState<MetricType>('Disk');
  const [symptom, setSymptom] = useState<MetricType>('Latency');
  const [chain, setChain] = useState<MetricType[]>(['Disk', 'Latency', 'CPU', 'Memory']);
  const [confidence, setConfidence] = useState<number>(3);
  const [detectionModality, setDetectionModality] = useState<DetectionModality>('audio');

  // Reset per-flag state whenever a new flag survey opens
  useEffect(() => {
    if (isOpen) {
      setConfidence(3);
      setDetectionModality('audio');
    }
  }, [isOpen, surveyIndex]);

  // Keyboard shortcuts: 1-5 for confidence, Escape intentionally ignored
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= 5) {
        setConfidence(num);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleChainMetric = (m: MetricType) => {
    if (chain.includes(m)) {
      setChain(chain.filter(x => x !== m));
    } else {
      setChain([...chain, m]);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitReport({
      rootCauseMetric: rootCause,
      symptomMetric: runPreset === 'run2' ? symptom : undefined,
      chainOrder: runPreset === 'run3' ? chain : undefined,
      timestampSec: currentTimeSec,
      confidenceRating: confidence,
      detectionModality,
    });
  };

  const handleDiscard = () => {
    onSubmitReport({
      rootCauseMetric: 'Discarded',
      timestampSec: currentTimeSec,
      confidenceRating: 0,
      detectionModality,
    });
  };

  const MODALITY_OPTIONS: { value: DetectionModality; label: string; desc: string }[] = [
    { value: 'audio', label: 'Heard It', desc: 'Sound cue prompted detection' },
    { value: 'visual', label: 'Saw It', desc: 'Visual chart prompted detection' },
    { value: 'both',  label: 'Both',    desc: 'Audio + visual together' },
  ];

  return (
    <div
      className="report-modal-overlay"
      onClick={() => {
        // Prevent clicking outside to close during study
      }}
    >
      <div className="report-modal-card">
        <header className="report-modal-header">
          <h3>
            Incident Report
            {totalSurveys && totalSurveys > 0 ? ` — Flag ${surveyIndex} of ${totalSurveys}` : ''}
          </h3>
          <span className="report-preset-badge">{runPreset.toUpperCase()}</span>
        </header>

        <form onSubmit={handleFormSubmit} className="report-modal-form">

          {/* Timestamp Display */}
          <div className="report-form-group">
            <label className="form-label">Flagged Incident Onset</label>
            <div className="time-display-box">
              T = {currentTimeSec}s&nbsp;&nbsp;({Math.floor(currentTimeSec / 60)}:{(currentTimeSec % 60).toString().padStart(2, '0')})
            </div>
          </div>

          {/* Detection Modality — CRITICAL for CHI attribution analysis */}
          <div className="report-form-group">
            <label className="form-label">How did you detect this anomaly?</label>
            <div className="modality-chip-grid">
              {MODALITY_OPTIONS.map(opt => (
                <button
                  type="button"
                  key={opt.value}
                  className={`modality-btn ${detectionModality === opt.value ? 'selected' : ''}`}
                  onClick={() => setDetectionModality(opt.value)}
                  title={opt.desc}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Root Cause (All Runs) */}
          <div className="report-form-group">
            <label className="form-label">What came first? (Root Cause Subsystem)</label>
            <div className="metric-chip-grid">
              {METRICS.map(m => (
                <button
                  type="button"
                  key={m}
                  className={`chip-btn ${rootCause === m ? 'selected' : ''}`}
                  onClick={() => setRootCause(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Run 2: Symptom */}
          {runPreset === 'run2' && (
            <div className="report-form-group">
              <label className="form-label">What came second? (Downstream Symptom)</label>
              <div className="metric-chip-grid">
                {METRICS.map(m => (
                  <button
                    type="button"
                    key={m}
                    className={`chip-btn ${symptom === m ? 'selected' : ''}`}
                    onClick={() => setSymptom(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Run 3: Chain ordering */}
          {runPreset === 'run3' && (
            <div className="report-form-group">
              <label className="form-label">Reconstruct the causality chain (click in order)</label>
              <div className="chain-builder-pool">
                {METRICS.map(m => {
                  const idx = chain.indexOf(m);
                  return (
                    <button
                      type="button"
                      key={m}
                      className={`chain-chip-btn ${idx !== -1 ? 'in-chain' : ''}`}
                      onClick={() => toggleChainMetric(m)}
                    >
                      {m} {idx !== -1 && <span className="chain-rank">#{idx + 1}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="chain-preview">
                Chain: {chain.length > 0 ? chain.join(' → ') : 'None selected'}
              </div>
            </div>
          )}

          {/* Confidence Rating */}
          <div className="report-form-group">
            <label className="form-label">
              Confidence in this identification &nbsp;<span style={{ color: '#888', fontWeight: 400 }}>(press 1–5)</span>
            </label>
            <div className="confidence-star-grid">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  type="button"
                  key={n}
                  className={`confidence-btn ${confidence >= n ? 'filled' : ''}`}
                  onClick={() => setConfidence(n)}
                  title={['Very Low', 'Low', 'Moderate', 'High', 'Very High'][n - 1]}
                >
                  ★
                </button>
              ))}
              <span className="confidence-label">
                {['Very Low', 'Low', 'Moderate', 'High', 'Very High'][confidence - 1]}
              </span>
            </div>
          </div>

          <div className="report-modal-actions">
            <button
              type="button"
              className="modal-btn secondary"
              onClick={handleDiscard}
              style={{ color: '#ef4444', borderColor: '#7f1d1d' }}
            >
              Discard (False Alarm)
            </button>
            <button type="submit" className="modal-btn primary">
              Submit Report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
