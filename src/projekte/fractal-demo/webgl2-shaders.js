import { cmapParams } from "./colormap/params.js";

export const fullscreenVertex = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
    vec2 p = gl_VertexID == 0 ? vec2(-1., -1.) : gl_VertexID == 1 ? vec2(3., -1.) : vec2(-1., 3.);
    gl_Position = vec4(p, 0., 1.);
    uv = (p + 1.) * .5;
}`;

export const paletteFragment = `#version 300 es
precision highp float;
precision highp int;
uniform float params[${cmapParams.length + 1}];
uniform highp sampler2D xlut;
out vec4 color;
${cmapParams.map((p, i) => `#define ${p.wgsl} params[${i}]`).join("\n")}
#define colorPipelineVersion params[${cmapParams.length}]
const float pi2 = 6.283185307179586;
const float small = 1e-5;
float spk(float base, float knob, float mult) {
    float e = pow(mult, abs(knob - .5) * 2.);
    if (knob >= .5) return pow(base, e);
    return 1. - pow(1. - base, e);
}
float powerWave(float t, float shape) {
    float c = .5 + .5 * cos(t);
    if (shape > .5) return pow(c, 1. + (shape - .5) * 50.);
    return 1. - pow(1. - c, 1. + (.5 - shape) * 50.);
}
float primcolmap(float x, float amount, float shape, float power, float pos, float mult, float phase) {
    float t = (x * mult * 20. - pos - phase) * pi2;
    float c = small + (1. - small) * powerWave(t, shape);
    return amount * spk(c, 1. - power, 10000.);
}
float xwarp(float x, float relax, float prePow, float waveMix, float waveFreq, float postPow) {
    float relaxed = .5 + (1. - 2. * clamp(relax, 0., 1.)) * (clamp(x, 0., 1.) - .5);
    float x1 = spk(relaxed, max(prePow, .001), 100.);
    float wave = .5 + .5 * cos(x1 * waveFreq * 20. * pi2);
    return spk(clamp(mix(x1, wave, waveMix), 0., 1.), max(postPow, .001), 100.);
}
float lookup(int channel, float x) {
    float p = clamp(x, 0., 1.) * 1023.;
    int i = int(floor(p));
    return mix(texelFetch(xlut, ivec2(i, channel), 0).r,
        texelFetch(xlut, ivec2(min(i + 1, 1023), channel), 0).r, fract(p));
}
float shiftDomain(float x, float shift) {
    float turns = fract(shift);
    if (turns == 0.) return x;
    return fract(x + turns);
}
vec3 rgbToHsv(vec3 rgb) {
    float value = max(rgb.r, max(rgb.g, rgb.b));
    float chroma = value - min(rgb.r, min(rgb.g, rgb.b));
    if (chroma == 0.) return vec3(0., 0., value);
    float hue;
    if (value == rgb.r) hue = (rgb.g - rgb.b) / chroma;
    else if (value == rgb.g) hue = (rgb.b - rgb.r) / chroma + 2.;
    else hue = (rgb.r - rgb.g) / chroma + 4.;
    return vec3(fract(hue / 6.), chroma / value, value);
}
vec3 hsvToRgb(vec3 hsv) {
    vec3 ramps = abs(fract(vec3(hsv.x) + vec3(0., 2./3., 1./3.)) * 6. - 3.);
    return hsv.z * mix(vec3(1.), clamp(ramps - 1., 0., 1.), hsv.y);
}
vec3 shiftHue(vec3 rgb, float shift) {
    float turns = fract(shift);
    if (turns == 0.) return rgb;
    vec3 hsv = rgbToHsv(clamp(rgb, 0., 1.));
    return hsvToRgb(vec3(fract(hsv.x + turns), hsv.yz));
}
vec3 pastelColor(vec3 rgb, float amount) {
    float strength = clamp(amount, 0., 1.);
    if (strength == 0.) return rgb;
    vec3 hsv = rgbToHsv(clamp(rgb, 0., 1.));
    float saturation = hsv.y * (1. - .8 * strength);
    float value = hsv.z + strength * .5 * hsv.z * (1. - hsv.z);
    if (colorPipelineVersion == 2.) value = mix(hsv.z, 1., .25 * strength);
    return hsvToRgb(vec3(hsv.x, saturation, value));
}
vec3 contrastColor(vec3 rgb, float amount) {
    float strength = clamp(amount, 0., 1.);
    if (strength == .5) return rgb;
    vec3 hsv = rgbToHsv(clamp(rgb, 0., 1.));
    float exponent = pow(2., 2. * strength - 1.);
    float low = pow(hsv.z, exponent);
    float high = pow(1. - hsv.z, exponent);
    return hsvToRgb(vec3(hsv.xy, low / (low + high)));
}
void main() {
    float x = floor(gl_FragCoord.x) / 1024.;
    float xr = lookup(0, xwarp(shiftDomain(x, xshift_r + xshift_all), xrelax_r + xrelax_all, xpre_r + xpre_all - .5, xmix_r + xmix_all, xfreq_r + xfreq_all, xpost_r + xpost_all - .5));
    float xg = lookup(1, xwarp(shiftDomain(x, xshift_g + xshift_all), xrelax_g + xrelax_all, xpre_g + xpre_all - .5, xmix_g + xmix_all, xfreq_g + xfreq_all, xpost_g + xpost_all - .5));
    float xb = lookup(2, xwarp(shiftDomain(x, xshift_b + xshift_all), xrelax_b + xrelax_all, xpre_b + xpre_all - .5, xmix_b + xmix_all, xfreq_b + xfreq_all, xpost_b + xpost_all - .5));
    float r = primcolmap(xr, amount_r * amount_all, clamp(shape_r + shape_all - .5, 0., 1.), clamp(pow_r + pow_all - .5, 0., 1.), pos_r + pos_all, mult_r + mult_all, phaseShift);
    float g = primcolmap(xg, amount_g * amount_all, clamp(shape_g + shape_all - .5, 0., 1.), clamp(pow_g + pow_all - .5, 0., 1.), pos_g + pos_all, mult_g + mult_all, phaseShift);
    float b = primcolmap(xb, amount_b * amount_all, clamp(shape_b + shape_all - .5, 0., 1.), clamp(pow_b + pow_all - .5, 0., 1.), pos_b + pos_all, mult_b + mult_all, phaseShift);
    color = vec4(contrastColor(pastelColor(shiftHue(vec3(r,g,b), hueShift), pastel), contrast), 1.);
}`;

export const fractalFragment = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 center;
uniform float zoom;
uniform float maxIter;
uniform float aspect;
uniform vec2 size;
uniform highp sampler2D palette;
out vec4 color;
void main() {
    vec2 pixel = vec2(floor(gl_FragCoord.x), size.y - 1. - floor(gl_FragCoord.y));
    vec2 uv = pixel / size;
    vec2 c = center + (uv - .5) * zoom * vec2(aspect, 1.);
    vec2 z = vec2(0.);
    int iter = 0;
    bool interior = false;
    while (true) {
        if (float(iter) >= maxIter) { interior = true; break; }
        if (dot(z,z) > 4.) break;
        z = vec2(z.x*z.x - z.y*z.y + c.x, 2.*z.x*z.y + c.y);
        iter++;
    }
    int index = int(clamp(float(iter) / maxIter, 0., 1.) * 1023.);
    color = interior ? vec4(0.,0.,0.,1.) : texelFetch(palette, ivec2(index,0), 0);
}`;

export const presentFragment = `#version 300 es
precision highp float;
uniform sampler2D image;
in vec2 uv;
out vec4 color;
void main() { color = texture(image, uv); }
`;
