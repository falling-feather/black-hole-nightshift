#version 300 es
precision highp float;
in vec2 vUv;
layout(location=0) out vec4 metadata;
layout(location=1) out vec4 coordinates;
uniform sampler2D uSignals;
uniform vec2 uFeedbackSize;
void main() {
  ivec2 size=textureSize(uSignals,0);
  vec2 origin=vUv-0.5/uFeedbackSize,bestUv=vec2(0.0);
  metadata=vec4(0.0);
  // Max reduction keeps thin secondary images that point-downsampling misses.
  // Preserve the selected source pixel coordinate, not the reduced-cell center.
  for(int y=0;y<6;y++) for(int x=0;x<6;x++) {
    vec2 uv=origin+(vec2(float(x),float(y))+0.5)/(6.0*uFeedbackSize);
    ivec2 p=clamp(ivec2(uv*vec2(size)),ivec2(0),size-1);
    vec4 value=texelFetch(uSignals,p,0);
    if(value.r>0.0 && value.b>metadata.b) {metadata=value;bestUv=(vec2(p)+0.5)/vec2(size);}
  }
  vec2 packed=floor(bestUv*65535.0+0.5);
  coordinates=vec4(floor(packed.x/256.0),mod(packed.x,256.0),floor(packed.y/256.0),mod(packed.y,256.0))/255.0;
}
