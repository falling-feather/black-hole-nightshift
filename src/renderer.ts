import vertex from './shaders/fullscreen.vert?raw';
import scene from './shaders/scene.frag?raw';
import blur from './shaders/blur.frag?raw';
import composite from './shaders/composite.frag?raw';
import signalReduce from './shaders/signal_reduce.frag?raw';
import type { Settings } from './model.ts';
import { cameraFor, traceScreen, imagesOfPoint, type Vec3 } from './optics.ts';
import { LIGHT_LIFETIME, LIGHT_RISE, MAX_STROKES, PIGMENTS, type LightStroke } from './light.ts';
import { FIELD_WIDTH, FIELD_HEIGHT, FIELD_INNER, FIELD_OUTER,atlasCapacity,type EmissionField } from './brush.ts';
import { decodeSignals, type VisibleSignal } from './signals.ts';
import { buildRayTable, observerMetadata, CRITICAL_IMPACT, MAX_IMPACT, MAX_PHI, ANGLE_EXPONENT, OUTER_RADIUS, type RayTable } from './geodesics.ts';
import { AdaptiveResolution } from './quality.ts';

type Target = { texture: WebGLTexture; signal?:WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number };
type Program = { handle: WebGLProgram; uniforms: Map<string, WebGLUniformLocation> };
export type Quality = 'auto' | 'detail' | 'performance';

export class BlackHoleRenderer {
  private gl: WebGL2RenderingContext;
  private programs: { scene: Program; blur: Program; composite: Program; signal:Program };
  private targets: Target[] = [];
  private scale = 1;
  private quality: Quality = 'auto';
  private adaptive=new AdaptiveResolution();
  private pigmentUniform=new Float32Array(PIGMENTS.flatMap(color=>[...color.rgb]));
  private hdr: boolean;
  private resized = true;
  private observer: ResizeObserver;
  private frameCount = 0;
  private sampleStart = 0;
  private timerExt:{TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}|null;
  private gpuQuery:WebGLQuery|null=null;
  private lastTimer=0;
  gpuMs=0;
  cpuMs=0;
  private rayTable:RayTable;
  private rayTexture:WebGLTexture;
  private metadataTexture:WebGLTexture;
  private noiseTexture:WebGLTexture;
  private lastRadius=0;
  private observerData:Float32Array;
  private strokeTimes=new Float32Array(MAX_STROKES*4);
  private strokeBounds=new Float32Array(MAX_STROKES*4);
  private strokeTexture:WebGLTexture;
  private strokeCapacity=1;
  private strokeSlots:{field:EmissionField;revision:number}[]=[];
  private feedbackTarget:Target;
  private feedbackBytes=new Uint8Array(320*180*4);
  private feedbackCoordinates=new Uint8Array(320*180*4);
  private packBuffer:WebGLBuffer;
  private pendingFeedback:{fence:WebGLSync;viewKey:string;materialKey:string;ids:number[];phase:number;frame:number;lightDelay:boolean}|undefined;
  private signalViewKey='';
  private lastSceneKey='';
  private feedbackSceneKey='';
  private lastFeedback=0;
  signals:VisibleSignal[]=[];
  fps = 0;
  frames = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('此设备没有提供 WebGL 2。请在 Edge 或 Chrome 中启用图形加速后重新打开。');
    this.gl = gl;
    this.timerExt=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.hdr = Boolean(gl.getExtension('EXT_color_buffer_float'));
    this.programs = { scene: this.program(scene), blur: this.program(blur), composite: this.program(composite),signal:this.program(signalReduce) };
    this.rayTable=buildRayTable();
    this.rayTexture=this.dataTexture(this.rayTable.width,this.rayTable.height,this.rayTable.data);
    this.observerData=new Float32Array(this.rayTable.height*4);
    this.metadataTexture=this.dataTexture(this.rayTable.height,1,this.observerData);
    this.strokeTexture=this.createStrokeTexture(1);
    this.feedbackTarget=this.target(320,180,true,true);
    this.packBuffer=gl.createBuffer()!;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.packBuffer);
    gl.bufferData(gl.PIXEL_PACK_BUFFER,this.feedbackBytes.byteLength*2,gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
    const noise=new Uint8Array(256*256*4);
    let seed=197710;
    for(let i=0;i<noise.length;i++) {seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;noise[i]=(seed>>>0)%256;}
    this.noiseTexture=gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D,this.noiseTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,256,256,0,gl.RGBA,gl.UNSIGNED_BYTE,noise);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.observer = new ResizeObserver(() => { this.resized = true; });
    this.observer.observe(canvas);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      canvas.dispatchEvent(new CustomEvent('renderfailure', { detail: '图形上下文已中断，请重新载入恢复观测。' }));
    });
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.DITHER);
  }

  private createStrokeTexture(layers:number) {
    const gl=this.gl,texture=gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY,Math.log2(FIELD_WIDTH)+1,gl.RG32F,FIELD_WIDTH,FIELD_HEIGHT,layers);
    // A mip-capable sampler exposes every level to our manual texelFetch filter.
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    return texture;
  }

  private dataTexture(width:number,height:number,data:Float32Array):WebGLTexture {
    const gl=this.gl,texture=gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,width,height,0,gl.RGBA,gl.FLOAT,data);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return texture;
  }

  private program(fragment: string): Program {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`画面着色器编译失败：${message}`);
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
    const handle = gl.createProgram()!;
    gl.attachShader(handle, vs); gl.attachShader(handle, fs); gl.linkProgram(handle);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(`画面程序连接失败：${gl.getProgramInfoLog(handle)}`);
    const uniforms = new Map<string, WebGLUniformLocation>();
    const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(handle, i)!.name;
      uniforms.set(name, gl.getUniformLocation(handle, name)!);
    }
    return { handle, uniforms };
  }

  private target(width: number, height: number, withSignal=false, byte=false): Target {
    const gl = this.gl, texture = gl.createTexture()!, framebuffer = gl.createFramebuffer()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.hdr && !byte ? gl.RGBA16F : gl.RGBA8, width, height, 0, gl.RGBA, this.hdr && !byte ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    let signal:WebGLTexture|undefined;
    if(withSignal) {
      signal=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,signal);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,signal,0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
    }
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('当前图形设备无法建立画面缓冲。');
    return { texture, signal, framebuffer, width, height };
  }

  setQuality(quality: Quality) {
    this.quality = quality;
    this.adaptive.reset();
    this.scale = quality === 'detail' ? 1.15 : quality === 'performance' ? 0.65 : 1;
    this.resized = true;
  }

  private resize() {
    const ratio = Math.min(window.devicePixelRatio, 2);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (!this.resized && this.canvas.width === width && this.canvas.height === height) return;
    this.lastSceneKey='';
    this.canvas.width = width; this.canvas.height = height;
    for (const target of this.targets) { this.gl.deleteTexture(target.texture);if(target.signal) this.gl.deleteTexture(target.signal);this.gl.deleteFramebuffer(target.framebuffer); }
    const rw = Math.max(1, Math.round(width*this.scale)), rh = Math.max(1,Math.round(height*this.scale));
    this.targets = [this.target(rw,rh,true), this.target(Math.ceil(rw/3),Math.ceil(rh/3)), this.target(Math.ceil(rw/3),Math.ceil(rh/3))];
    this.resized = false;
  }

  private use(program: Program, target: Target | null) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    gl.viewport(0,0,target?.width ?? this.canvas.width,target?.height ?? this.canvas.height);
    gl.useProgram(program.handle);
  }

  private texture(program: Program, name: string, texture: WebGLTexture, unit: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.uniform1i(program.uniforms.get(name)!,unit);
  }

  private prepareObserver(r:number) {
    const gl=this.gl;
    if(Math.abs(r-this.lastRadius)>0.0001) {
      this.observerData=observerMetadata(this.rayTable,r);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D,this.metadataTexture);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,this.rayTable.height,1,gl.RGBA,gl.FLOAT,this.observerData);
      this.lastRadius=r;
    }
  }

  inspect(settings:Settings,x:number,y:number,paths=true) {
    const camera=cameraFor(settings,this.canvas.clientWidth,this.canvas.clientHeight);
    this.prepareObserver(camera.radius);
    return traceScreen(this.rayTable,this.observerData,camera,x,y,paths);
  }
  invalidateSignals() {
    this.lastFeedback=0;this.signals=[];this.lastSceneKey='';this.feedbackSceneKey='';
    if(this.pendingFeedback) {this.gl.deleteSync(this.pendingFeedback.fence);this.pendingFeedback=undefined;}
  }

  private pollFeedback(viewKey:string,phase:number,materialKey:string) {
    if(viewKey!==this.signalViewKey) this.signals=[];
    const pending=this.pendingFeedback;if(!pending) return;
    const gl=this.gl,result=gl.clientWaitSync(pending.fence,0,0);
    if(result===gl.TIMEOUT_EXPIRED) return;
    gl.deleteSync(pending.fence);this.pendingFeedback=undefined;
    if(result===gl.WAIT_FAILED) throw new Error('信号成像读回未完成，请重新接入光场。');
    if(viewKey!==pending.viewKey || Math.abs(phase-pending.phase)>8 || materialKey!==pending.materialKey) {this.lastFeedback=0;return;}
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.packBuffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,this.feedbackBytes);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,this.feedbackBytes.byteLength,this.feedbackCoordinates);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
    this.signals=decodeSignals(this.feedbackBytes,320,180,pending.ids,this.feedbackCoordinates,pending);this.signalViewKey=viewKey;
  }

  images(settings:Settings,point:Vec3) {
    const camera=cameraFor(settings,this.canvas.clientWidth,this.canvas.clientHeight);
    this.prepareObserver(camera.radius);
    return imagesOfPoint(this.rayTable,this.observerData,camera,point);
  }

  render(settings: Settings, phase: number, strokes:readonly LightStroke[]=[], isolate=false, countFrame = true) {
    const cpuStart=performance.now();
    this.resize();
    const gl = this.gl, programs = this.programs;
    if(this.gpuQuery && gl.getQueryParameter(this.gpuQuery,gl.QUERY_RESULT_AVAILABLE)) {
      if(this.timerExt && !gl.getParameter(this.timerExt.GPU_DISJOINT_EXT)) this.gpuMs=Number(gl.getQueryParameter(this.gpuQuery,gl.QUERY_RESULT))/1e6;
      gl.deleteQuery(this.gpuQuery);this.gpuQuery=null;
    }
    const [target,ping,pong] = this.targets;
    const camera=cameraFor(settings,this.canvas.clientWidth,this.canvas.clientHeight);
    const viewKey=[...camera.position,this.canvas.clientWidth,this.canvas.clientHeight,settings.lightDelay].join('/');
    const materialKey=strokes.map(stroke=>`${stroke.id}:${stroke.field.revision}`).join('/');
    const sceneKey=[viewKey,phase,materialKey,settings.palette,settings.accretion,isolate,target.width,target.height].join('|');
    if(countFrame) {
      this.pollFeedback(viewKey,phase,materialKey);
      // A final brush update may arrive while an earlier readback is pending.
      // Draw once more for fresh feedback, then leave an unchanged canvas idle.
      const refreshFeedback=strokes.length>0 && !this.pendingFeedback && sceneKey!==this.feedbackSceneKey && cpuStart-this.lastFeedback>180;
      if(sceneKey===this.lastSceneKey && !refreshFeedback) {
        this.sampleStart=0;this.frameCount=0;this.fps=0;this.adaptive.reset();return;
      }
    }
    const timeGpu=Boolean(countFrame && this.timerExt && !this.gpuQuery && cpuStart-this.lastTimer>1000);
    if(timeGpu) {this.gpuQuery=gl.createQuery();gl.beginQuery(this.timerExt!.TIME_ELAPSED_EXT,this.gpuQuery);this.lastTimer=cpuStart;}
    this.prepareObserver(camera.radius);
    this.use(programs.scene,target);
    gl.uniform2f(programs.scene.uniforms.get('uResolution')!,target.width,target.height);
    gl.uniform2f(programs.scene.uniforms.get('uFocus')!,...camera.focus);
    gl.uniform3f(programs.scene.uniforms.get('uCamera')!,...camera.position);
    gl.uniform1f(programs.scene.uniforms.get('uFov')!,camera.fov);
    gl.uniform1f(programs.scene.uniforms.get('uTime')!,phase);
    gl.uniform1f(programs.scene.uniforms.get('uAccretion')!,settings.accretion);
    gl.uniform1f(programs.scene.uniforms.get('uDelay')!,settings.lightDelay ? 1 : 0);
    gl.uniform1f(programs.scene.uniforms.get('uPalette')!,settings.palette);
    const capacity=atlasCapacity(strokes.length,this.strokeCapacity);
    if(capacity!==this.strokeCapacity) {
      gl.deleteTexture(this.strokeTexture);this.strokeTexture=this.createStrokeTexture(capacity);
      this.strokeCapacity=capacity;this.strokeSlots=[];
    }
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.strokeTexture);
    for(let i=0;i<strokes.length;i++) {
      const stroke=strokes[i],field=stroke.field,slot=this.strokeSlots[i];
      if(!slot || slot.field!==field || slot.revision!==field.revision) {
        const update=field.buildMips(),partial=slot?.field===field && slot.revision===update.fromRevision;
        field.levels.forEach((level,index)=>{
          const region=partial?update.regions[index]:{x:0,y:0,width:level.width,height:level.height};
          if(!region) return;
          gl.pixelStorei(gl.UNPACK_ROW_LENGTH,level.width);
          gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,index,region.x,region.y,i,region.width,region.height,1,gl.RG,gl.FLOAT,level.data,(region.y*level.width+region.x)*2);
        });
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH,0);
        this.strokeSlots[i]={field,revision:field.revision};this.strokeBounds.set(field.bounds,i*4);
      }
      const offset=i*4;this.strokeTimes[offset]=field.reference;this.strokeTimes[offset+1]=stroke.minPeak;
      this.strokeTimes[offset+2]=stroke.maxPeak;this.strokeTimes[offset+3]=stroke.pigment;
    }
    this.strokeSlots.length=strokes.length;
    gl.uniform1i(programs.scene.uniforms.get('uBrush')!,5);
    gl.uniform1i(programs.scene.uniforms.get('uStrokeCount')!,strokes.length);
    gl.uniform4fv(programs.scene.uniforms.get('uStrokeTime[0]')!,this.strokeTimes);
    gl.uniform4fv(programs.scene.uniforms.get('uStrokeBounds[0]')!,this.strokeBounds);
    gl.uniform3fv(programs.scene.uniforms.get('uPigments[0]')!,this.pigmentUniform);
    gl.uniform2f(programs.scene.uniforms.get('uFieldRange')!,FIELD_INNER,FIELD_OUTER);
    gl.uniform1f(programs.scene.uniforms.get('uBrushMaxLod')!,Math.log2(FIELD_WIDTH));
    gl.uniform1f(programs.scene.uniforms.get('uLightLifetime')!,LIGHT_LIFETIME);
    gl.uniform1f(programs.scene.uniforms.get('uLightRise')!,LIGHT_RISE);
    gl.uniform1f(programs.scene.uniforms.get('uIsolate')!,isolate?1:0);
    this.texture(programs.scene,'uRayTable',this.rayTexture,2);
    this.texture(programs.scene,'uRayMetadata',this.metadataTexture,3);
    this.texture(programs.scene,'uNoise',this.noiseTexture,4);
    gl.uniform2f(programs.scene.uniforms.get('uTableSize')!,this.rayTable.width,this.rayTable.height);
    gl.uniform1f(programs.scene.uniforms.get('uCriticalImpact')!,CRITICAL_IMPACT);
    gl.uniform1f(programs.scene.uniforms.get('uMaxImpact')!,MAX_IMPACT);
    gl.uniform1f(programs.scene.uniforms.get('uMaxPhi')!,MAX_PHI);
    gl.uniform1f(programs.scene.uniforms.get('uAngleExponent')!,ANGLE_EXPONENT);
    gl.uniform1f(programs.scene.uniforms.get('uOuterRadius')!,OUTER_RADIUS);
    gl.drawArrays(gl.TRIANGLES,0,3);

    if(countFrame && strokes.length && !this.pendingFeedback && performance.now()-this.lastFeedback>180) {
      this.use(programs.signal,this.feedbackTarget);
      this.texture(programs.signal,'uSignals',target.signal!,6);
      gl.uniform2f(programs.signal.uniforms.get('uFeedbackSize')!,320,180);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.feedbackTarget.framebuffer);gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.packBuffer);
      gl.readPixels(0,0,320,180,gl.RGBA,gl.UNSIGNED_BYTE,0);
      gl.readBuffer(gl.COLOR_ATTACHMENT1);gl.readPixels(0,0,320,180,gl.RGBA,gl.UNSIGNED_BYTE,this.feedbackBytes.byteLength);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
      const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
      if(!fence) throw new Error('无法建立信号成像同步标记，请重新接入光场。');
      this.pendingFeedback={fence,viewKey,materialKey,ids:strokes.map(stroke=>stroke.id),phase,frame:this.frames,lightDelay:settings.lightDelay};gl.flush();
      this.feedbackSceneKey=sceneKey;
      this.lastFeedback=performance.now();
    } else if(!strokes.length) this.signals=[];

    this.use(programs.blur,ping);
    this.texture(programs.blur,'uTexture',target.texture,0);
    gl.uniform2f(programs.blur.uniforms.get('uDirection')!,3/target.width,0);
    gl.uniform1f(programs.blur.uniforms.get('uThreshold')!,0.6);
    gl.drawArrays(gl.TRIANGLES,0,3);
    this.use(programs.blur,pong);
    this.texture(programs.blur,'uTexture',ping.texture,0);
    gl.uniform2f(programs.blur.uniforms.get('uDirection')!,0,1/ping.height);
    gl.uniform1f(programs.blur.uniforms.get('uThreshold')!,0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    this.use(programs.composite,null);
    this.texture(programs.composite,'uScene',target.texture,0);
    this.texture(programs.composite,'uBloom',pong.texture,1);
    gl.drawArrays(gl.TRIANGLES,0,3);
    if (countFrame) {
      this.lastSceneKey=sceneKey;
      if(timeGpu) gl.endQuery(this.timerExt!.TIME_ELAPSED_EXT);
      const now=performance.now();
      this.cpuMs=now-cpuStart;
      if(!this.sampleStart) {this.sampleStart=now;this.frameCount=0;}
      // A slow visible frame must still lower adaptive quality. Only background
      // throttling is excluded; a 250 ms threshold incorrectly hid real stalls.
      if(document.hidden) {this.frameCount=0;this.sampleStart=now;this.fps=0;}
      this.frames++; this.frameCount++;
      const elapsed = now-this.sampleStart;
      if (elapsed >= 1500) {
        this.fps = Math.round(this.frameCount*1000/elapsed);
        this.frameCount=0; this.sampleStart=performance.now();
        if (this.quality === 'auto') {
          const next=this.adaptive.suggest(this.scale,{gpuMs:this.gpuMs,fps:this.fps});
          if (next !== this.scale) { this.scale=next; this.resized=true; }
        }
      }
    }
  }

  private canvasImage(maxWidth:number):string {
    const image=document.createElement('canvas'),ratio=Math.min(1,maxWidth/this.canvas.width);
    image.width=Math.round(this.canvas.width*ratio);image.height=Math.round(this.canvas.height*ratio);
    const context=image.getContext('2d');if(!context) throw new Error('此浏览器暂时无法生成观测图像。');
    context.drawImage(this.canvas,0,0,image.width,image.height);return image.toDataURL('image/png');
  }
  snapshot(settings:Settings,phase:number,strokes:readonly LightStroke[]=[],isolate=false):string {
    this.render(settings,phase,strokes,isolate,false);return this.canvasImage(1440);
  }
  capture(settings: Settings, phase: number, strokes:readonly LightStroke[]=[], isolate=false, maxWidth = 1440): string {
    const previousScale=this.scale;
    try {
      this.scale=Math.max(previousScale,1.15);this.resized=true;
      this.render(settings,phase,strokes,isolate,false);
      return this.canvasImage(maxWidth);
    } finally {this.scale=previousScale;this.resized=true;}
  }

  get resolution() { return `${this.targets[0]?.width ?? 0} × ${this.targets[0]?.height ?? 0}`; }
  get usesHdr() { return this.hdr; }
  get fieldLayers() {return this.strokeCapacity;}
}
