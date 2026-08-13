import React, { useState } from 'react';
import './PostSessionModal.css';

export interface PostSessionData {
  usefulnessRating: number;   // 1-7 Likert: how useful was audio?
  distractionRating: number;  // 1-7 Likert: how distracting was audio?
  wouldPreferAudio: 'yes' | 'no' | 'unsure';
}

interface PostSessionModalProps {
  isOpen: boolean;
  onSubmit: (data: PostSessionData) => void;
}

const LIKERT_LABELS: Record<number, string> = {
  1: 'Not at all',
  2: 'Slightly',
  3: 'Somewhat',
  4: 'Moderately',
  5: 'Quite',
  6: 'Very',
  7: 'Extremely',
};

function LikertScale({
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <div className="likert-wrapper">
      <div className="likert-grid">
        {[1, 2, 3, 4, 5, 6, 7].map(n => (
          <button
            key={n}
            type="button"
            className={`likert-btn ${value === n ? 'selected' : ''}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="likert-pole-labels">
        <span>{lowLabel}</span>
        <span>{value > 0 ? LIKERT_LABELS[value] : ''}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

export const PostSessionModal: React.FC<PostSessionModalProps> = ({ isOpen, onSubmit }) => {
  const [usefulness, setUsefulness] = useState(0);
  const [distraction, setDistraction] = useState(0);
  const [preference, setPreference] = useState<'yes' | 'no' | 'unsure' | null>(null);

  if (!isOpen) return null;

  const canSubmit = usefulness > 0 && distraction > 0 && preference !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      usefulnessRating: usefulness,
      distractionRating: distraction,
      wouldPreferAudio: preference!,
    });
  };

  return (
    <div className="post-modal-overlay">
      <div className="post-modal-card">
        <header className="post-modal-header">
          <h3>Post-Session Questionnaire</h3>
          <span className="post-modal-badge">END OF SESSION</span>
        </header>

        <form onSubmit={handleSubmit} className="post-modal-form">

          <div className="post-form-group">
            <label className="post-form-label">
              How <strong>useful</strong> was the auditory cue for detecting system anomalies?
            </label>
            <LikertScale
              value={usefulness}
              onChange={setUsefulness}
              lowLabel="Not useful"
              highLabel="Extremely useful"
            />
          </div>

          <div className="post-form-group">
            <label className="post-form-label">
              How <strong>distracting</strong> was the audio from your primary tracking task?
            </label>
            <LikertScale
              value={distraction}
              onChange={setDistraction}
              lowLabel="Not distracting"
              highLabel="Extremely distracting"
            />
          </div>

          <div className="post-form-group">
            <label className="post-form-label">
              For long on-call shifts, would you prefer auditory monitoring over visual-only dashboards?
            </label>
            <div className="preference-grid">
              {(['yes', 'no', 'unsure'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={`preference-btn ${preference === opt ? 'selected' : ''}`}
                  onClick={() => setPreference(opt)}
                >
                  {opt === 'yes' ? 'Yes, prefer audio' : opt === 'no' ? 'No, prefer visual' : 'Unsure / Context-dependent'}
                </button>
              ))}
            </div>
          </div>

          <div className="post-modal-actions">
            <button
              type="submit"
              className="post-submit-btn"
              disabled={!canSubmit}
            >
              {canSubmit ? 'Submit & Download Data' : 'Answer all questions to continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
