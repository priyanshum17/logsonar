import { MetricType } from '../data/mockTimeSeries';

interface AudioVoice {
  osc?: OscillatorNode;
  noise?: AudioBufferSourceNode;
  filter?: BiquadFilterNode;
  gain: GainNode;
  panner: StereoPannerNode;
}

export class AudioEngine {
  private static instance: AudioEngine;
  private audioCtx: AudioContext | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  
  private voices: Map<MetricType, AudioVoice> = new Map();
  private activeMetrics: MetricType[] = [];
  
  private synth: SpeechSynthesis;
  private isMuted: boolean = false;

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
        this.masterCompressor = this.audioCtx.createDynamicsCompressor();
        
        // Configure compressor to gracefully squash loud peaks
        this.masterCompressor.threshold.value = -12;
        this.masterCompressor.knee.value = 15;
        this.masterCompressor.ratio.value = 4;
        this.masterCompressor.attack.value = 0.01;
        this.masterCompressor.release.value = 0.25;

        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 1.0;
        
        this.masterCompressor.connect(this.masterGain);
        this.masterGain.connect(this.audioCtx.destination);
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

  public startDriving(metrics: MetricType[]) {
    if (this.isMuted || !this.audioCtx || this.audioCtx.state === 'suspended') return;
    
    // Stop voices that are no longer requested
    for (const metric of this.voices.keys()) {
      if (!metrics.includes(metric)) {
        this.stopVoice(metric);
      }
    }
    
    this.activeMetrics = [...metrics];
    const now = this.audioCtx.currentTime;
    
    for (const metric of metrics) {
      if (this.voices.has(metric)) continue; // Already running
      
      const panner = this.audioCtx.createStereoPanner();
      if (metric === 'CPU') panner.pan.value = -0.6; // Hard left
      else if (metric === 'Memory') panner.pan.value = 0.6; // Hard right
      else if (metric === 'Disk') panner.pan.value = -0.3;
      else if (metric === 'Network') panner.pan.value = 0.3;
      else panner.pan.value = 0; // Center for Latency, ErrorRate
      
      panner.connect(this.masterCompressor!);
      
      const gainNode = this.audioCtx.createGain();
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.connect(panner);
      
      const voice: AudioVoice = { gain: gainNode, panner };
      
      if (metric === 'Latency') {
         const noiseSource = this.audioCtx.createBufferSource();
         noiseSource.buffer = this.createNoiseBuffer();
         noiseSource.loop = true;
         
         const filter = this.audioCtx.createBiquadFilter();
         filter.type = 'lowpass';
         filter.frequency.setValueAtTime(200, now);
         
         noiseSource.connect(filter);
         filter.connect(gainNode);
         
         noiseSource.start(now);
         voice.noise = noiseSource;
         voice.filter = filter;
      } else {
         const osc = this.audioCtx.createOscillator();
         if (metric === 'CPU') osc.type = 'sine';
         else if (metric === 'Memory') osc.type = 'triangle';
         else if (metric === 'Network') osc.type = 'sawtooth';
         else if (metric === 'Disk') osc.type = 'square';
         else if (metric === 'ErrorRate') osc.type = 'sine'; 
         
         osc.frequency.setValueAtTime(200, now);
         osc.connect(gainNode);
         osc.start(now);
         voice.osc = osc;
      }
      
      this.voices.set(metric, voice);
    }
  }
  
  public updateDriving(values: Record<MetricType, number>, speed: number) {
    if (!this.audioCtx || this.isMuted || speed === 0) {
       this.stopDriving();
       return;
    }
    
    const now = this.audioCtx.currentTime;
    
    // 1. Calculate Salience (find the most anomalous metric currently playing)
    let maxSalience = 0;
    for (const metric of this.activeMetrics) {
       if ((values[metric] || 0) > maxSalience) {
           maxSalience = values[metric] || 0;
       }
    }
    
    for (const metric of this.activeMetrics) {
       const voice = this.voices.get(metric);
       if (!voice) continue;
       
       const value = values[metric] || 0;
       
       // 2. Dynamic Masking Mitigation (Auditory Spotlight)
       // If there is a major anomaly (maxSalience > 0.3) and we are polyphonic,
       // we aggressively duck the volume of the non-anomalous streams.
       let focusMultiplier = 1.0;
       if (this.activeMetrics.length > 1 && maxSalience > 0.3) {
           const distanceToMax = maxSalience - value;
           // The further a metric is from the peak anomaly, the quieter it gets (down to 10% volume)
           focusMultiplier = Math.max(0.1, 1.0 - (distanceToMax * 2.5));
       }
       
       if (metric === 'Latency' && voice.filter) {
          const freq = 200 + (value * 2000); 
          const vol = (0.02 + (value * 0.15)) * focusMultiplier; 
          voice.filter.frequency.setTargetAtTime(freq, now, 0.05);
          voice.gain.gain.setTargetAtTime(vol, now, 0.05);
       } else if (voice.osc) {
          let freq = 0;
          let vol = 0;
          
          if (metric === 'CPU') {
             freq = 100 + (value * 200); 
             vol = (0.02 + (value * 0.15)) * focusMultiplier;
          } else if (metric === 'Memory') {
             freq = 600 + (value * 800);
             vol = (0.02 + (value * 0.1)) * focusMultiplier;
          } else if (metric === 'ErrorRate') {
             freq = 400 + (value * 1200);
             vol = (0.02 + (value * 0.2)) * focusMultiplier;
          } else {
             freq = 200 + (value * 600);
             vol = (0.02 + (value * 0.15)) * focusMultiplier;
          }
          
          voice.osc.frequency.setTargetAtTime(freq, now, 0.05);
          voice.gain.gain.setTargetAtTime(vol, now, 0.05);
       }
    }
  }

  private stopVoice(metric: MetricType) {
    const voice = this.voices.get(metric);
    if (!voice) return;
    
    if (voice.osc) {
      try { voice.osc.stop(); } catch(e) {}
      voice.osc.disconnect();
    }
    if (voice.noise) {
      try { voice.noise.stop(); } catch(e) {}
      voice.noise.disconnect();
    }
    if (voice.filter) voice.filter.disconnect();
    
    if (voice.gain && this.audioCtx) {
      const g = voice.gain;
      g.gain.cancelScheduledValues(this.audioCtx.currentTime);
      g.gain.setValueAtTime(g.gain.value, this.audioCtx.currentTime);
      g.gain.linearRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.05);
      setTimeout(() => { 
          g.disconnect(); 
          voice.panner.disconnect(); 
      }, 50);
    }
    this.voices.delete(metric);
  }

  public stopDriving() {
    this.activeMetrics = [];
    for (const metric of Array.from(this.voices.keys())) {
       this.stopVoice(metric);
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
