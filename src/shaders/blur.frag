#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec2 uDirection;
uniform float uThreshold;
vec3 sampleLight(vec2 uv) {
  vec3 color=texture(uTexture,uv).rgb;
  if(uThreshold>0.0) {
    // The first bloom target is one third of the scene. Four bilinear reads
    // integrate its 3×3 source footprint before thresholding a thin filament.
    vec2 offset=(2.0/3.0)/vec2(textureSize(uTexture,0));
    color=(texture(uTexture,uv+offset).rgb+texture(uTexture,uv-offset).rgb
      +texture(uTexture,uv+vec2(offset.x,-offset.y)).rgb+texture(uTexture,uv+vec2(-offset.x,offset.y)).rgb)*0.25;
  }
  return color*max(0.0,1.0-uThreshold/max(0.001,max(color.r,max(color.g,color.b))));
}
void main() {
  vec3 color=sampleLight(vUv)*0.227027;
  color += sampleLight(vUv+uDirection*1.384615)*0.316216;
  color += sampleLight(vUv-uDirection*1.384615)*0.316216;
  color += sampleLight(vUv+uDirection*3.230769)*0.070270;
  color += sampleLight(vUv-uDirection*3.230769)*0.070270;
  fragColor=vec4(color,1.0);
}
