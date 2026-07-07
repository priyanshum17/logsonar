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
  private activeVoice: SpeechSynthesisVoice | null = null;

  private currentMetric: MetricType | null = null;

  private constructor() {
    this.synth = window.speechSynthesis;
    const populateVoices = () => {
       const voices = this.synth.getVoices();
       if (voices.length > 0) {
          this.activeVoice = voices.find(v => v.name.includes('Premium') || v.name.includes('Google') || v.lang.startsWith('en')) || voices[0];
       }
    };
    populateVoices();
    if (this.synth.onvoiceschanged !== undefined) {
       this.synth.onvoiceschanged = populateVoices;
    }
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
      this.cancel();
      const utterance = new SpeechSynthesisUtterance("System Online");
      if (this.activeVoice) utterance.voice = this.activeVoice;
      this.synth.speak(utterance);
    } catch(e) {
      console.error("Audio Initialization Error", e);
    }
  }

  public cancel() {
    this.synth.cancel();
    this.stopDriving();
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
       
       if (metric === 'CPU') osc.type = 'sine';
       else if (metric === 'Memory') osc.type = 'square';
       else if (metric === 'Network') osc.type = 'sawtooth';
       else if (metric === 'Disk') osc.type = 'triangle';
       else if (metric === 'ErrorRate') osc.type = 'square'; 
       
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
    const smoothTime = now + 0.1; // Smooth out changes slightly
    
    if (this.currentMetric === 'Latency' && this.activeFilter) {
       const freq = 200 + (value * 1800);
       const vol = 0.05 + (value * 0.5); // base volume + anomaly swell
       this.activeFilter.frequency.linearRampToValueAtTime(freq, smoothTime);
       this.activeGain.gain.linearRampToValueAtTime(vol, smoothTime);
    } else if (this.activeOsc) {
       if (this.currentMetric === 'ErrorRate') {
          const freq = 800 + (value * 1000);
          this.activeOsc.frequency.linearRampToValueAtTime(freq, smoothTime);
          const vol = 0.05 + (value * 0.5);
          this.activeGain.gain.linearRampToValueAtTime(vol, smoothTime);
       } else {
          const freq = 200 + (value * 800);
          const vol = 0.05 + (value * 0.5);
          this.activeOsc.frequency.linearRampToValueAtTime(freq, smoothTime);
          this.activeGain.gain.linearRampToValueAtTime(vol, smoothTime);
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
        this.activeGain.gain.setValueAtTime(this.activeGain.gain.value, this.audioCtx.currentTime);
        this.activeGain.gain.linearRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.05);
      }
      setTimeout(() => {
        if (this.activeGain) this.activeGain.disconnect();
        this.activeGain = null;
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


  public speakLog(message: string): boolean {
    if (this.isMuted) return false;
    this.synth.cancel();
    
    try {
      const utterance = new SpeechSynthesisUtterance(message);
      if (this.activeVoice) utterance.voice = this.activeVoice;
      utterance.rate = 1.0;
      utterance.volume = 1.0;
      this.synth.speak(utterance);
      return true;
    } catch(e) {
      return false;
    }
  }
}
