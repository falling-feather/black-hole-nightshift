#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
vec3 aces(vec3 x) { return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
vec3 linearColor(vec2 uv) {
  return texture(uScene,uv).rgb+texture(uBloom,uv).rgb*0.42;
}
float luminance(vec3 c) { return dot(c,vec3(0.2126,0.7152,0.0722)); }
void main() {
  vec2 pixel=1.0/vec2(textureSize(uScene,0));
  vec3 color=linearColor(vUv);
  float center=luminance(color);
  float left=luminance(linearColor(vUv-vec2(pixel.x,0.0)));
  float right=luminance(linearColor(vUv+vec2(pixel.x,0.0)));
  float down=luminance(linearColor(vUv-vec2(0.0,pixel.y)));
  float up=luminance(linearColor(vUv+vec2(0.0,pixel.y)));
  float low=min(center,min(min(left,right),min(down,up)));
  float high=max(center,max(max(left,right),max(down,up)));
  // Filter along a detected edge; flat regions retain their original sample.
  if(high-low>max(0.04,high*0.14)) {
    vec2 gradient=vec2(right-left,up-down);
    vec2 tangent=vec2(-gradient.y,gradient.x)/max(length(gradient),0.0001);
    vec3 along=(linearColor(vUv+tangent*pixel*0.5)+linearColor(vUv-tangent*pixel*0.5))*0.5;
    color=mix(color,along,0.55);
  }
  color=pow(aces(color),vec3(1.0/2.2));
  float vignette=1.0-0.26*pow(length((vUv-0.5)*1.3),1.5);
  fragColor=vec4(color*vignette,1.0);
}
