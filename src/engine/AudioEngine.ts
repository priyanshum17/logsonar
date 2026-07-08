import { MetricType } from '../data/mockTimeSeries';

export class AudioEngine {
  private static instance: AudioEngine;
  private audioCtx: AudioContext | null = null;
  private activeOsc: OscillatorNode | null = null;
  private activeGain: GainNode | null = null;
  private activeNoise: AudioBufferSourceNode | null = null;
  private activeFilter: BiquadFilterNode | null = null;
  private synth: SpeechSynthesis;
  private isMuted: boolean = false;


  private currentMetric: MetricType | null = null;

  private constructor() {
    this.synth = window.speechSynthesis;
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public init() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(console.error);
      }
      
      const utterance = new SpeechSynthesisUtterance("System Online");
      this.synth.speak(utterance);
    } catch(e) {
      console.error("Audio Initialization Error", e);
    }
  }

  public cancel() {
    this.clearSpeech();
    this.stopDriving();
  }
  
  public clearSpeech() {
    if (this.synth.speaking || this.synth.pending) {
      this.synth.cancel();
    }
  }
  
  private createNoiseBuffer(): AudioBuffer {
     if (!this.audioCtx) throw new Error("No context");
     const bufferSize = this.audioCtx.sampleRate * 2; // 2 seconds of noise
     const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
     const output = buffer.getChannelData(0);
     for (let i = 0; i < bufferSize; i++) {
         output[i] = Math.random() * 2 - 1;
     }
     return buffer;
  }

  public startDriving(metric: MetricType) {
    if (this.isMuted || !this.audioCtx || this.audioCtx.state === 'suspended') return;
    if (this.currentMetric === metric && (this.activeOsc || this.activeNoise)) return; // Already running for this metric
    
    this.stopDriving();
    this.currentMetric = metric;
    
    const now = this.audioCtx.currentTime;
    
    if (metric === 'Latency') {
       const noiseSource = this.audioCtx.createBufferSource();
       noiseSource.buffer = this.createNoiseBuffer();
       noiseSource.loop = true;
       
       const filter = this.audioCtx.createBiquadFilter();
       filter.type = 'lowpass';
       filter.frequency.setValueAtTime(200, now);
       
       const gainNode = this.audioCtx.createGain();
       gainNode.gain.setValueAtTime(0.01, now); // start silent
       
       noiseSource.connect(filter);
       filter.connect(gainNode);
       gainNode.connect(this.audioCtx.destination);
       
       noiseSource.start(now);
       this.activeNoise = noiseSource;
       this.activeFilter = filter;
       this.activeGain = gainNode;
    } else {
       const osc = this.audioCtx.createOscillator();
       const gainNode = this.audioCtx.createGain();
       
       // Use smoother waveforms to avoid harshness
       if (metric === 'CPU') osc.type = 'sine';
       else if (metric === 'Memory') osc.type = 'triangle';
       else if (metric === 'Network') osc.type = 'sine';
       else if (metric === 'Disk') osc.type = 'triangle';
       else if (metric === 'ErrorRate') osc.type = 'sine'; 
       
       osc.frequency.setValueAtTime(200, now);
       gainNode.gain.setValueAtTime(0.01, now); // start silent
       
       osc.connect(gainNode);
       gainNode.connect(this.audioCtx.destination);
       
       osc.start(now);
       this.activeOsc = osc;
       this.activeGain = gainNode;
    }
  }
  
  public updateDriving(value: number, speed: number) {
    if (!this.audioCtx || this.isMuted || speed === 0) {
       this.stopDriving();
       return;
    }
    
    if (!this.activeGain) return;
    
    const now = this.audioCtx.currentTime;
    
    if (this.currentMetric === 'Latency' && this.activeFilter) {
       const freq = 200 + (value * 1200); 
       const vol = 0.02 + (value * 0.15); 
       this.activeFilter.frequency.setTargetAtTime(freq, now, 0.05);
       this.activeGain.gain.setTargetAtTime(vol, now, 0.05);
    } else if (this.activeOsc) {
       if (this.currentMetric === 'ErrorRate') {
          const freq = 400 + (value * 800);
          this.activeOsc.frequency.setTargetAtTime(freq, now, 0.05);
          const vol = 0.02 + (value * 0.2);
          this.activeGain.gain.setTargetAtTime(vol, now, 0.05);
       } else {
          const freq = 200 + (value * 600);
          const vol = 0.02 + (value * 0.15);
          this.activeOsc.frequency.setTargetAtTime(freq, now, 0.05);
          this.activeGain.gain.setTargetAtTime(vol, now, 0.05);
       }
    }
  }

  public stopDriving() {
    this.currentMetric = null;
    if (this.activeOsc) {
      try { this.activeOsc.stop(); } catch(e) {}
      this.activeOsc.disconnect();
      this.activeOsc = null;
    }
    if (this.activeGain) {
      if (this.audioCtx && this.activeGain.gain) {
        this.activeGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.activeGain.gain.setValueAtTime(this.activeGain.gain.value, this.audioCtx.currentTime);
        this.activeGain.gain.linearRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.05);
      }
      const gainToStop = this.activeGain;
      this.activeGain = null;
      setTimeout(() => {
        gainToStop.disconnect();
      }, 50);
    }
    if (this.activeNoise) {
       try { this.activeNoise.stop(); } catch(e) {}
       this.activeNoise.disconnect();
       this.activeNoise = null;
    }
    if (this.activeFilter) {
       this.activeFilter.disconnect();
       this.activeFilter = null;
    }
  }


  public speakLog(message: string, onEnd?: () => void): boolean {
    if (this.isMuted) {
      if (onEnd) onEnd();
      return false;
    }
    
    try {
      console.log(`AudioEngine: Directly speaking -> "${message}"`);
      const utterance = new SpeechSynthesisUtterance(message);
      if (onEnd) {
        utterance.onend = () => { console.log("AudioEngine: Finished speaking"); onEnd(); };
        utterance.onerror = (e) => { console.error("AudioEngine Speech Error:", e); onEnd(); };
      }
      this.synth.speak(utterance);
      return true;
    } catch(e) {
      console.error("AudioEngine Error:", e);
      if (onEnd) onEnd();
      return false;
    }
  }
}
