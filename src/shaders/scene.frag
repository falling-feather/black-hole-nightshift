#version 300 es
precision highp float;
in vec2 vUv;
layout(location=0) out vec4 fragColor;
layout(location=1) out vec4 fragSignal;
uniform vec2 uResolution;
uniform vec2 uFocus;
uniform vec3 uCamera;
uniform float uFov;
uniform float uTime;
uniform float uAccretion;
const float DISPLAY_EXPOSURE=0.66;
uniform float uDelay;
uniform float uPalette;
uniform int uStrokeCount;
uniform vec4 uStrokeTime[32];
uniform vec4 uStrokeBounds[32];
uniform vec3 uPigments[3];
uniform highp sampler2DArray uBrush;
uniform vec2 uFieldRange;
uniform float uBrushMaxLod;
uniform float uLightLifetime;
uniform float uLightRise;
uniform float uIsolate;
uniform sampler2D uRayTable;
uniform sampler2D uRayMetadata;
uniform sampler2D uNoise;
uniform vec2 uTableSize;
uniform float uCriticalImpact;
uniform float uMaxImpact;
uniform float uMaxPhi;
uniform float uAngleExponent;
uniform float uOuterRadius;
const float PI = 3.141592653589793;
const float FLOW_LIFETIME=64.0;
const float HOTSPOT_RADIUS=5.2;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
vec3 noise3(vec3 p,float footprint) {
  vec3 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  vec2 uv=(i.xy+vec2(37.0,17.0)*i.z+f.xy+0.5)/256.0;
  float lod=clamp(log2(max(footprint,1.0)),0.0,8.0);
  return mix(textureLod(uNoise,uv,lod).rgb,textureLod(uNoise,uv+vec2(37.0,17.0)/256.0,lod).rgb,f.z);
}
vec3 fbm(vec3 p,float footprint) {
  return noise3(p,footprint)*0.57 + noise3(p*2.07+7.2,footprint*2.07)*0.29
    + noise3(p*4.13+11.9,footprint*4.13)*0.14;
}

vec3 starLayer(vec2 uv, float scale, float threshold) {
  vec2 grid = uv * scale;
  vec2 id = floor(grid), local = fract(grid) - 0.5;
  float seed = hash13(vec3(id, scale));
  vec2 offset = vec2(hash13(vec3(id, 5.9)), hash13(vec3(id, 17.1))) - 0.5;
  float radius = length(local - offset*0.7);
  float size = mix(0.024, 0.095, pow(seed, 8.0));
  float star = exp(-radius*radius/(size*size)) * step(threshold, seed);
  vec3 tint = mix(vec3(0.46,0.63,1.0), vec3(1.0,0.69,0.39), hash13(vec3(id, 6.3)));
  return tint * star * mix(0.24, 1.35, pow(seed, 12.0));
}
vec3 sky(vec3 d) {
  vec2 uv = vec2(atan(d.z, d.x)/(2.0*PI)+0.5, asin(clamp(d.y,-1.0,1.0))/PI+0.5);
  float band = exp(-pow((d.y*0.87 + d.x*0.34 - d.z*0.12)/0.17,2.0));
  float clouds = fbm(d*4.3+vec3(4.0,17.0,9.0),0.0).r;
  float mist = band * pow(clouds, 3.0);
  vec3 color = vec3(0.0022,0.0032,0.0060);
  color += vec3(0.04,0.055,0.085) * mist;
  color += vec3(0.034,0.018,0.038) * pow(clouds,7.0)*band;
  color += starLayer(uv, 290.0, 0.988);
  color += starLayer(uv, 630.0, 0.997)*0.6;
  return color;
}

float tableRow(float impact) {
  return impact<=uCriticalImpact
    ? 0.3*(1.0-sqrt(max(0.0,1.0-impact/uCriticalImpact)))
    : 0.3+0.7*pow((impact-uCriticalImpact)/(uMaxImpact-uCriticalImpact),1.0/3.0);
}
vec4 raySample(float row,float phi,out vec2 rowDerivative) {
  vec2 point=vec2(pow(clamp(phi/uMaxPhi,0.0,1.0),1.0/uAngleExponent),row)*(uTableSize-1.0);
  ivec2 base=ivec2(floor(point)),next=min(base+ivec2(1),ivec2(uTableSize)-1);
  vec2 f=fract(point);
  vec4 lower=mix(texelFetch(uRayTable,base,0),texelFetch(uRayTable,ivec2(next.x,base.y),0),f.x);
  vec4 upper=mix(texelFetch(uRayTable,ivec2(base.x,next.y),0),texelFetch(uRayTable,next,0),f.x);
  vec4 samplePoint=mix(lower,upper,f.y);
  rowDerivative=(upper.xz-lower.xz)*(uTableSize.y-1.0);
  if(samplePoint.x>0.0 && samplePoint.x<1.0) {
    float radius=1.0/samplePoint.x;
    rowDerivative.y+=rowDerivative.x/(samplePoint.x*samplePoint.x*(1.0-samplePoint.x));
    samplePoint.z+=uOuterRadius-radius+log((uOuterRadius-1.0)/(radius-1.0));
  }
  return samplePoint;
}
vec4 rayMetadata(float row,out vec2 rowDerivative) {
  float p=row*(uTableSize.y-1.0);
  int first=int(floor(p)),second=min(first+1,int(uTableSize.y)-1);
  vec4 lower=texelFetch(uRayMetadata,ivec2(first,0),0),upper=texelFetch(uRayMetadata,ivec2(second,0),0);
  rowDerivative=(upper.yz-lower.yz)*(uTableSize.y-1.0);
  return mix(lower,upper,fract(p));
}

vec3 flowField(float radius,float phi,float time,float omega,float radialWidth,float azimuthWidth,float travelWidth,float offset) {
  float age=mod(time+offset,FLOW_LIFETIME);
  float generation=floor((time+offset)/FLOW_LIFETIME);
  float angle=phi-age*omega;
  float angleWidth=azimuthWidth+1.5*abs(age*omega/radius)*radialWidth+omega*travelWidth*uDelay;
  float footprint=max(radialWidth,radius*angleWidth);
  vec3 advected=vec3(cos(angle)*radius,sin(angle)*radius,radius*0.65+generation*13.97);
  vec3 warp=noise3(advected*0.45,footprint*0.45)-0.5;
  vec3 field=fbm((advected+warp*1.8)*vec3(0.85,0.85,2.1),footprint*2.1);
  return vec3(field.x,field.y,pow(field.z,7.0)*5.0);
}

vec2 brushLevel(vec2 uv,int slot,int level) {
  ivec2 size=textureSize(uBrush,level).xy;
  vec2 p=uv*vec2(size)-0.5;ivec2 base=ivec2(floor(p));vec2 f=fract(p);
  int x0=(base.x%size.x+size.x)%size.x,x1=(x0+1)%size.x;
  int y0=clamp(base.y,0,size.y-1),y1=clamp(base.y+1,0,size.y-1);
  return mix(mix(texelFetch(uBrush,ivec3(x0,y0,slot),level).rg,texelFetch(uBrush,ivec3(x1,y0,slot),level).rg,f.x),
    mix(texelFetch(uBrush,ivec3(x0,y1,slot),level).rg,texelFetch(uBrush,ivec3(x1,y1,slot),level).rg,f.x),f.y);
}
vec2 brush(vec2 uv,int slot,float lod) {
  int lower=int(floor(lod)),upper=min(lower+1,int(uBrushMaxLod));
  return mix(brushLevel(uv,slot,lower),brushLevel(uv,slot,upper),fract(lod));
}

vec4 disc(vec3 p, vec3 ray, float travel,vec3 dx,vec3 dy,float travelWidth,int crossing,out vec3 signal) {
  float radius = length(p.xz);
  float phi = atan(p.z,p.x);
  float emittedTime = uTime - travel*uDelay;
  float omega = sqrt(0.5/(radius*radius*radius));
  vec2 radialDirection=p.xz/radius;
  float radialWidth=max(abs(dot(radialDirection,dx.xz)),abs(dot(radialDirection,dy.xz)));
  float azimuthWidth=max(abs(p.x*dx.z-p.z*dx.x),abs(p.x*dy.z-p.z*dy.x))/(radius*radius);
  // Overlapping lifetimes keep turbulence continuous without infinite shearing.
  float weight=1.0-abs(mod(emittedTime,FLOW_LIFETIME)/(FLOW_LIFETIME*0.5)-1.0);
  vec3 field=flowField(radius,phi,emittedTime,omega,radialWidth,azimuthWidth,travelWidth,0.0)*weight
    +flowField(radius,phi,emittedTime,omega,radialWidth,azimuthWidth,travelWidth,FLOW_LIFETIME*0.5)*(1.0-weight);
  float cloud=field.x;
  float ribbon=1.0-abs(2.0*field.y-1.0);
  float lanes=mix(0.1,1.75,smoothstep(0.24,0.77,cloud))*mix(0.45,1.3,ribbon);
  float knots=field.z;
  // A broad orbiting concentration makes the differential motion readable.
  float hotRate=sqrt(0.5/(HOTSPOT_RADIUS*HOTSPOT_RADIUS*HOTSPOT_RADIUS));
  float hotspotAngle=phi-emittedTime*hotRate-0.9;
  hotspotAngle=atan(sin(hotspotAngle),cos(hotspotAngle));
  float hotFootprint=azimuthWidth+hotRate*travelWidth*uDelay;
  float hotVariance=0.142857+hotFootprint*hotFootprint/12.0;
  float hotAngular=sqrt(0.142857/hotVariance)*exp(-hotspotAngle*hotspotAngle/(2.0*hotVariance));
  hotAngular=mix(hotAngular,0.14945,smoothstep(1.0,6.283185,hotFootprint));
  float hotRadialVariance=0.81+radialWidth*radialWidth/12.0;
  float hotspot=sqrt(0.81/hotRadialVariance)*exp(-(radius-HOTSPOT_RADIUS)*(radius-HOTSPOT_RADIUS)/hotRadialVariance)*hotAngular;
  float inner = smoothstep(3.0,3.45,radius);
  float outer = 1.0-smoothstep(10.0,14.5,radius);
  float envelope = inner*outer*pow(3.5/radius,1.45);

  vec3 tangent = normalize(vec3(-p.z,0.0,p.x));
  float velocity = sqrt(0.5/(radius-1.0));
  float gamma = inversesqrt(1.0-velocity*velocity);
  float doppler = 1.0/(gamma*(1.0-velocity*dot(tangent,-normalize(ray))));
  float redshift = sqrt((1.0-1.0/radius)/(1.0-1.0/length(uCamera)));
  float g = doppler*redshift;
  float temperature = pow(3.2/radius,0.52)*g;

  vec3 cool = vec3(0.22,0.035,0.025);
  vec3 warm = vec3(1.0,0.32,0.095);
  vec3 hot = vec3(1.0,0.89,0.65);
  vec3 color = mix(cool,warm,smoothstep(0.22,0.65,temperature));
  color = mix(color,hot,smoothstep(0.68,1.18,temperature));
  if (uPalette > 0.5 && uPalette < 1.5) {
    color = mix(vec3(0.055,0.12,0.36), vec3(0.62,0.80,1.0), smoothstep(0.25,1.2,temperature));
    color += vec3(0.24,0.07,0.18)*(1.0-smoothstep(0.2,0.8,temperature));
  } else if (uPalette > 1.5) {
    color = mix(vec3(0.25,0.035,0.12),vec3(1.0,0.62,0.44),smoothstep(0.25,1.1,temperature));
  }
  float seams=smoothstep(0.46,0.66,field.y)*(1.0-smoothstep(0.69,0.8,field.y));
  float brightness = envelope*(lanes+knots+hotspot*0.9+seams*0.5)*pow(g,3.0)*uAccretion*1.8;
  float alpha = clamp((0.61+0.34*cloud)*inner*outer*sqrt(uAccretion),0.0,0.97);
  vec3 written=vec3(0.0);
  signal=vec3(-1.0,0.0,0.0);
  for(int i=0;i<32;i++) {
    if(i>=uStrokeCount) break;
    vec4 times=uStrokeTime[i],bounds=uStrokeBounds[i];
    float timeFootprint=max(0.03,travelWidth*uDelay*0.5);
    if(emittedTime<times.y-uLightRise-timeFootprint || emittedTime>times.z+uLightLifetime+timeFootprint
      || radius<bounds.x-radialWidth || radius>bounds.y+radialWidth) continue;
    float material=phi-omega*(emittedTime-times.x);
    float angleFootprint=azimuthWidth+1.5*abs((emittedTime-times.x)*omega/radius)*radialWidth+omega*travelWidth*uDelay;
    if(abs(mod(material-bounds.z+PI,2.0*PI)-PI)>bounds.w+angleFootprint) continue;
    vec2 brushSize=vec2(textureSize(uBrush,0).xy);
    float footprint=max(radialWidth*brushSize.y/(uFieldRange.y-uFieldRange.x),angleFootprint*brushSize.x/(2.0*PI));
    float lod=clamp(log2(max(1.0,footprint)),0.0,uBrushMaxLod);
    vec2 value=brush(vec2(fract(material/(2.0*PI)+0.5),(radius-uFieldRange.x)/(uFieldRange.y-uFieldRange.x)),i,lod);
    if(value.x<0.0005) continue;
    float peak=times.x+value.y/value.x;
    float age=emittedTime-peak;
    if(age<-uLightRise-timeFootprint || age>=uLightLifetime+timeFootprint) continue;
    float onset=smoothstep(-uLightRise-timeFootprint,timeFootprint,age);
    float energy=onset*exp(-max(0.0,age)/(uLightLifetime*0.5))
      *(1.0-clamp((age-uLightLifetime*0.65)/(uLightLifetime*0.35),0.0,1.0));
    float strength=value.x*energy*10.0*pow(g,2.0)*mix(1.0,1.0+float(crossing)*2.0,uIsolate);
    written+=uPigments[int(times.w)]*strength;
    if(strength>=signal.y) signal=vec3(float(i),strength,age);
  }
  alpha*=mix(1.0,0.42,uIsolate);
  // The explicit development view lifts faint higher-order images, like exposure
  // compensation; it is not a claim of radiometric brightness calibration.
  // Spectral contrast is an artistic display treatment of the written signal.
  // It preserves a colored filament over a white-hot background without a broad blob.
  float signalContrast=1.0-0.82*smoothstep(0.02,1.2,signal.y);
  return vec4(color*brightness*mix(1.0,0.055,uIsolate)*signalContrast+written,alpha);
}

void main() {
  fragSignal=vec4(0.0);
  float strongest=0.0;
  float aspect = uResolution.x/uResolution.y;
  vec2 screen = (vUv-uFocus)*2.0;
  screen.x *= aspect;
  vec3 forward = normalize(-uCamera);
  vec3 right = normalize(cross(forward,vec3(0,1,0)));
  vec3 up = cross(right,forward);
  vec3 direction = normalize(forward + uFov*(screen.x*right + screen.y*up));

  vec3 radial = normalize(uCamera);
  float along = dot(direction,radial);
  vec3 tangentDirection=direction-along*radial;
  vec3 transverse=tangentDirection/max(length(tangentDirection),1e-7);
  float impact=length(uCamera)*sqrt(max(0.0,1.0-along*along))/sqrt(1.0-1.0/length(uCamera));
  if(impact>uMaxImpact) { fragColor=vec4(sky(direction)*DISPLAY_EXPOSURE,1.0);return; }
  float row=clamp(tableRow(impact),0.0,1.0);
  vec2 metaDerivative;
  vec4 meta=rayMetadata(row,metaDerivative);
  float firstCrossing=mod(atan(-radial.y,transverse.y)+PI,PI);
  // Evaluate screen derivatives once, in uniform control flow. The per-hit
  // footprint below follows the geodesic chain rule, so empty rays can exit early.
  vec2 rowGradient=vec2(dFdx(row),dFdy(row));
  vec2 crossingGradient=vec2(dFdx(firstCrossing),dFdy(firstCrossing));
  vec3 transverseX=dFdx(transverse),transverseY=dFdy(transverse);
  vec3 emission = vec3(0.0);
  float transmission = 1.0;
  for(int crossing=0;crossing<4;crossing++) {
    float relativePhi=firstCrossing+float(crossing)*PI;
    float phi=relativePhi+meta.y;
    if(phi>=meta.w) break;
    vec2 sampleDerivative;
    vec4 samplePoint=raySample(row,phi,sampleDerivative);
    float radius=1.0/max(samplePoint.x,1e-5);
    if(samplePoint.x<=0.0 || samplePoint.x>=1.0 || radius<3.0 || radius>14.5) continue;
    vec3 localRadial=radial*cos(relativePhi)+transverse*sin(relativePhi);
    vec3 localTangent=-radial*sin(relativePhi)+transverse*cos(relativePhi);
    vec3 position=radius*localRadial;
    vec2 phiGradient=crossingGradient+metaDerivative.x*rowGradient;
    vec2 uGradient=samplePoint.y*phiGradient+sampleDerivative.x*rowGradient;
    vec3 dx=-uGradient.x*radius*radius*localRadial
      +radius*(localTangent*crossingGradient.x+sin(relativePhi)*transverseX);
    vec3 dy=-uGradient.y*radius*radius*localRadial
      +radius*(localTangent*crossingGradient.y+sin(relativePhi)*transverseY);
    float travel=max(0.0,samplePoint.z-meta.z);
    float timePhi=1.0/(max(impact,0.001)*samplePoint.x*samplePoint.x*(1.0-samplePoint.x));
    vec2 timeGradient=timePhi*phiGradient+(sampleDerivative.y-metaDerivative.y)*rowGradient;
    float travelWidth=max(abs(timeGradient.x),abs(timeGradient.y));
    vec3 lightDirection=normalize(-samplePoint.y/sqrt(1.0-samplePoint.x)*localRadial+samplePoint.x*localTangent);
    vec3 signal;
    vec4 discColor=disc(position,lightDirection,travel,dx,dy,travelWidth,crossing,signal);
    float strength=transmission*discColor.a*signal.y;
    if(strength>strongest) {
      strongest=strength;
      fragSignal=vec4((signal.x+1.0)/255.0,float(crossing)/255.0,clamp(log(1.0+strength)/3.0,0.0,1.0),clamp((signal.z+uLightRise)/(uLightLifetime+uLightRise),0.0,1.0));
    }
    emission+=transmission*discColor.rgb*discColor.a;
    transmission*=1.0-discColor.a;
    if(transmission<0.025) break;
  }
  vec3 outgoing=radial*cos(meta.x)+transverse*sin(meta.x);
  vec3 background = impact<uCriticalImpact ? vec3(0.0) : sky(outgoing);
  vec3 color = emission + transmission*background;
  fragColor = vec4(max(color*DISPLAY_EXPOSURE,vec3(0.0)),1.0);
}
