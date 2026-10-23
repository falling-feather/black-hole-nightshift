import { phraseFor,type SignalCue,type SignalPosition,type SignalTone } from './score.ts';

export const MASTER_LEVEL=0.18;
const HARMONICS=[1,1.5,2.002] as const;

/** All short notes use the main bus too, so mute reaches already-playing tails. */
export function playPhrase(context:BaseAudioContext,bus:AudioNode,notes:readonly SignalTone[]) {
  const now=context.currentTime+0.02;
  for(const note of notes) {
    const oscillator=context.createOscillator(),gain=context.createGain(),panner=context.createStereoPanner(),at=now+note.delay;
    oscillator.type='sine';oscillator.frequency.value=note.frequency;panner.pan.value=note.pan;
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(note.gain,at+0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001,at+note.duration);
    oscillator.connect(gain);gain.connect(panner);panner.connect(bus);
    oscillator.start(at);oscillator.stop(at+note.duration+0.08);
    oscillator.addEventListener('ended',()=>{oscillator.disconnect();gain.disconnect();panner.disconnect();},{once:true});
  }
}

/** Authored data sonification. No external samples or microphone access. */
export class Soundscape {
  private context?: AudioContext;
  private master?: GainNode;
  private voices: OscillatorNode[] = [];
  private bass=60;
  private lastCue=-Infinity;
  enabled = false;

  async toggle() {
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      const master = context.createGain();
      master.gain.value=0;
      master.connect(context.destination);
      this.master=master;
      const filter=context.createBiquadFilter();
      filter.type='lowpass';filter.frequency.value=320;
      filter.connect(master);
      for (const [index,level] of [0.3,0.12,0.06].entries()) {
        const oscillator=context.createOscillator(), gain=context.createGain();
        oscillator.type='sine';oscillator.frequency.value=this.bass*HARMONICS[index];
        gain.gain.value=level;oscillator.connect(gain);gain.connect(filter);oscillator.start();
        this.voices.push(oscillator);
      }
      const lfo=context.createOscillator(), depth=context.createGain();
      lfo.frequency.value=0.085;depth.gain.value=1.2;
      lfo.connect(depth);depth.connect(this.voices[0].frequency);lfo.start();
    }
    await this.context.resume();
    this.enabled=!this.enabled;
    if(this.enabled) this.tune();
    this.master!.gain.setTargetAtTime(this.enabled?MASTER_LEVEL:0,this.context.currentTime,this.enabled?0.7:0.12);
    return this.enabled;
  }

  update(accretion: number, mass: number) {
    const next=46+accretion*5+18/Math.sqrt(mass);if(next===this.bass) return;
    this.bass=next;if(this.enabled) this.tune();
  }

  private tune() {
    const context=this.context;if(!context) return;
    this.voices.forEach((voice,index)=>voice.frequency.setTargetAtTime(this.bass*HARMONICS[index],context.currentTime,1.5));
  }

  signal(cue:SignalCue,pigment:number,position?:SignalPosition) {
    if(!this.context||!this.master||!this.enabled) return;
    const now=this.context.currentTime;
    if(cue==='echo'&&now-this.lastCue<0.18) return;
    this.lastCue=now;playPhrase(this.context,this.master,phraseFor(cue,pigment,this.bass,position));
  }
  chime() {this.signal('capture',0);}
}
