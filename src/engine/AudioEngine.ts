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

  public oscillatorMapping: Record<MetricType, string> = {
      CPU: 'sine',
      Memory: 'triangle',
      Disk: 'square',
      Latency: 'bandpass-noise'
  };

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
      if (this.voices.has(metric)) continue; 
      
      const panner = this.audioCtx.createStereoPanner();
      if (metric === 'CPU') panner.pan.value = -0.6;
      else if (metric === 'Memory') panner.pan.value = 0.6;
      else if (metric === 'Disk') panner.pan.value = -0.3;
      else panner.pan.value = 0.3;
      
      panner.connect(this.masterCompressor!);
      
      const gainNode = this.audioCtx.createGain();
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.connect(panner);
      
      const voice: AudioVoice = { gain: gainNode, panner };
      const voiceType = this.oscillatorMapping[metric] || 'sine';
      
      if (voiceType.includes('noise')) {
         const noiseSource = this.audioCtx.createBufferSource();
         noiseSource.buffer = this.createNoiseBuffer();
         noiseSource.loop = true;
         
         const filter = this.audioCtx.createBiquadFilter();
         if (voiceType === 'bandpass-noise') filter.type = 'bandpass';
         else if (voiceType === 'lowpass-noise') filter.type = 'lowpass';
         else if (voiceType === 'highpass-noise') filter.type = 'highpass';
         else filter.type = 'allpass';
         
         filter.Q.setValueAtTime(1.0, now);
         filter.frequency.setValueAtTime(500, now);
         
         noiseSource.connect(filter);
         filter.connect(gainNode);
         
         noiseSource.start(now);
         voice.noise = noiseSource;
         voice.filter = filter;
      } else {
         const osc = this.audioCtx.createOscillator();
         osc.type = (voiceType === 'am-sine' || voiceType === 'fm-sine') ? 'sine' : (voiceType as OscillatorType);
         osc.frequency.setValueAtTime(250, now);
         
         if (voiceType === 'am-sine') {
             const amOsc = this.audioCtx.createOscillator();
             amOsc.type = 'sine';
             amOsc.frequency.setValueAtTime(5, now);
             const amGain = this.audioCtx.createGain();
             amGain.gain.setValueAtTime(0.5, now);
             amOsc.connect(amGain.gain);
             osc.connect(amGain);
             amGain.connect(gainNode);
             amOsc.start(now);
         } else if (voiceType === 'fm-sine') {
             const fmOsc = this.audioCtx.createOscillator();
             fmOsc.type = 'sine';
             fmOsc.frequency.setValueAtTime(50, now);
             const fmGain = this.audioCtx.createGain();
             fmGain.gain.setValueAtTime(100, now);
             fmOsc.connect(fmGain);
             fmGain.connect(osc.frequency);
             osc.connect(gainNode);
             fmOsc.start(now);
         } else {
             osc.connect(gainNode);
         }
         
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
       
       let focusMultiplier = 1.0;
       if (this.activeMetrics.length > 1 && maxSalience > 0.3) {
           const distanceToMax = maxSalience - value;
           focusMultiplier = Math.max(0.1, 1.0 - (distanceToMax * 2.5));
       }
       
       const voiceType = this.oscillatorMapping[metric] || 'sine';
       
       if (voiceType.includes('noise') && voice.filter) {
          const freq = 500 + (value * 3500); 
          const vol = (0.04 + (value * 0.2)) * focusMultiplier; 
          voice.filter.frequency.setTargetAtTime(freq, now, 0.05);
          voice.gain.gain.setTargetAtTime(vol, now, 0.05);
       } else if (voice.osc) {
          let freq = 200 + (value * 600);
          let vol = (0.02 + (value * 0.15)) * focusMultiplier;
          
          if (metric === 'CPU') {
             freq = 250 + (value * 550); 
             vol = (0.04 + (value * 0.2)) * focusMultiplier;
          } else if (metric === 'Memory') {
             freq = 600 + (value * 800);
             vol = (0.02 + (value * 0.1)) * focusMultiplier;
          }
          
          voice.osc.frequency.setTargetAtTime(freq, now, 0.05);
          voice.gain.gain.setTargetAtTime(vol, now, 0.05);
       }
    }
  }

  private stopVoice(metric: MetricType) {
    const voice = this.voices.get(metric);
    if (!voice) return;
    
    if (voice.gain && this.audioCtx) {
      const g = voice.gain;
      const now = this.audioCtx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0.001, now + 0.05);
      setTimeout(() => { 
          if (voice.osc) { try { voice.osc.stop(); } catch(e) {} voice.osc.disconnect(); }
          if (voice.noise) { try { voice.noise.stop(); } catch(e) {} voice.noise.disconnect(); }
          if (voice.filter) voice.filter.disconnect();
          g.disconnect(); 
          voice.panner.disconnect(); 
      }, 50);
    } else {
      if (voice.osc) { try { voice.osc.stop(); } catch(e) {} voice.osc.disconnect(); }
      if (voice.noise) { try { voice.noise.stop(); } catch(e) {} voice.noise.disconnect(); }
      if (voice.filter) voice.filter.disconnect();
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
