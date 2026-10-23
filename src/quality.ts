export const FRAME_BUDGET_MS=1000/60;
const GPU_BUDGET_MS=FRAME_BUDGET_MS-3.5;
/** Sustained load changes sampling; one busy frame never reallocates targets. */
export class AdaptiveResolution {
  private pressured=0;private spare=0;
  reset() {this.pressured=0;this.spare=0;}
  suggest(scale:number,sample:{gpuMs:number;fps:number}):number {
    if(!Number.isFinite(sample.gpuMs)||!Number.isFinite(sample.fps)||sample.fps<=0) {this.reset();return scale;}
    const measured=sample.gpuMs>0;
    const busy=measured?sample.gpuMs>GPU_BUDGET_MS*1.1:sample.fps<30;
    const free=measured?sample.gpuMs<GPU_BUDGET_MS*0.65:sample.fps>57;
    this.pressured=busy?this.pressured+1:0;this.spare=free?this.spare+1:0;
    if(this.pressured>=2) {
      this.reset();
      const desired=measured?scale*Math.sqrt(GPU_BUDGET_MS/sample.gpuMs):scale-0.07;
      return Math.max(0.8,Math.min(scale,Math.max(scale-0.07,desired)));
    }
    if(this.spare>=4) {this.reset();return Math.min(1,scale+0.035);}
    return scale;
  }
}
