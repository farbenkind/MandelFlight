//__CMPARAMS_STRUCT__

@group(0) @binding(0)
var<uniform> cmParams : CMParams;

@group(0) @binding(1)
var cmTexWrite : texture_storage_2d<rgba8unorm, write>;

@group(0) @binding(2)
var curve1DWrite : texture_storage_2d<rgba8unorm, write>;

// xCmap-LUTs aus dem Function Plotter: 3 Kanaele (R,G,B) x 1024 Werte, Identitaet wenn keine Kette gewaehlt
@group(0) @binding(3)
var<storage, read> xlut : array<f32>;

const pi2 = 6.283185307179586476925286766559;
const small = 1e-5;

fn logb(x: f32, base: f32) -> f32 {
    return log(x) / log(base);
}

fn sympow(base :f32, exp:f32) -> f32 {
    let b = clamp(base, 0, 1);
    var e = exp;
    if (e < 1e-9) { e = 1e-9;}
    if (exp<1) {
        return f32(1-pow(1-b,1/e));
    }
    else {
        return f32(pow(b,e));
    }
}
// knob=0.5: Identitaet. knob>0.5: base^e (Stauchung rechts), e bis mult.
// knob<0.5: punktgespiegelt am Mittelpunkt, 1-(1-base)^e (gleiche Stauchung links, Kurve ueber der Diagonale).
fn spk(base: f32, knob: f32, mult: f32) -> f32 {
    let e = pow(mult, abs(knob - 0.5) * 2.0);
    if (knob >= 0.5) {
        return pow(base, e);
    }
    return 1.0 - pow(1.0 - base, e);
}
fn powknob(base: f32, knob: f32, mult: f32) -> f32 {
        
    var exp_1 = pow(knob, logb(mult,2)) * mult;
    if ( exp_1 < 1) {
        exp_1 = pow(pow(knob*2,knob*1.1/10)/2,logb(mult,2))*mult;
    }

    exp_1 = pow(pow(knob*2,(knob+.1)/1.1)/2,logb(mult,2))*mult;
    return pow(base, exp_1);
    

}
fn shapeWave(t : f32, shape : f32) -> f32 {
    let s = max(0.001, shape * 20.0);
    return 0.5 + 0.5 * tanh(cos(t) * s);
}
fn powerWave(t: f32, shape: f32) -> f32 {
    let c = 0.5 + 0.5 * cos(t);
    if (shape > 0.5) {
        return pow(c, 1.0 + (shape - 0.5) * 50.0);
    }
    return 1.0 - pow(1.0 - c, 1.0 + (0.5 - shape) * 50.0);
}

fn primcolmap1(x: f32, amount: f32, power: f32, pos: f32, mult: f32, phaseShift: f32) -> f32 {
    let t = (x * mult * 20.0 - pos - phaseShift) * pi2;
    let c = 0.5 + small + (0.5-small) * cos(t);
    return amount * spk(c, power, 10000.0);
}
fn primcolmap2(x: f32, amount: f32, shape:f32, power: f32, pos: f32, mult: f32, phaseShift: f32) -> f32 {
    let t = (x * mult * 20.0 - pos - phaseShift) * pi2;
    var c = small+(1-small)*powerWave(t,shape);
    //ec = powerWave(t,shape);
    return amount * spk(c, power, 10000.0);
}

// xCmap: verzerrt nur die Domain x; bei Mix=0 und Pow-Knobs=0.5 ist sie die Identitaet
fn xwarp(x: f32, prePow: f32, waveMix: f32, waveFreq: f32, postPow: f32, shift: f32) -> f32 {
    let x1 = spk(clamp(x, 0.0, 1.0), max(prePow, 0.001), 100.0);
    let wave = 0.5 + 0.5 * cos((x1 * waveFreq * 20.0 - shift) * pi2);
    let mixed = mix(x1, wave, waveMix);
    return spk(clamp(mixed, 0.0, 1.0), max(postPow, 0.001), 100.0);
}

fn xlutLookup(channel: u32, x: f32) -> f32 {
    let p = clamp(x, 0.0, 1.0) * 1023.0;
    let i = u32(floor(p));
    let j = min(i + 1u, 1023u);
    return mix(xlut[channel * 1024u + i], xlut[channel * 1024u + j], fract(p));
}

fn rgbToHsv(rgb: vec3<f32>) -> vec3<f32> {
    let value = max(rgb.r, max(rgb.g, rgb.b));
    let chroma = value - min(rgb.r, min(rgb.g, rgb.b));
    if (chroma == 0.0) {
        return vec3<f32>(0.0, 0.0, value);
    }

    var hue: f32;
    if (value == rgb.r) {
        hue = (rgb.g - rgb.b) / chroma;
    } else if (value == rgb.g) {
        hue = (rgb.b - rgb.r) / chroma + 2.0;
    } else {
        hue = (rgb.r - rgb.g) / chroma + 4.0;
    }
    return vec3<f32>(fract(hue / 6.0), chroma / value, value);
}

fn hsvToRgb(hsv: vec3<f32>) -> vec3<f32> {
    let ramps = abs(fract(vec3<f32>(hsv.x) + vec3<f32>(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return hsv.z * mix(vec3<f32>(1.0), clamp(ramps - 1.0, vec3<f32>(0.0), vec3<f32>(1.0)), hsv.y);
}

fn shiftHue(rgb: vec3<f32>, shift: f32) -> vec3<f32> {
    let turns = fract(shift);
    if (turns == 0.0) {
        return rgb;
    }
    // Match the normalized texture's RGB range before rotating the hue.
    let hsv = rgbToHsv(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)));
    return hsvToRgb(vec3<f32>(fract(hsv.x + turns), hsv.y, hsv.z));
}

@compute @workgroup_size(64)
fn cm_main(@builtin(global_invocation_id) gid : vec3<u32>) {
    if (gid.x >= 1024u) { return; }

    let x = f32(gid.x) / 1024.0;

    // ALL-Knobs: Shape/Pow/Shape1/Shape2 verschieben um (all-0.5), Mix/Freq/Shift/Pos/Mult addieren sich,
    // Amount multipliziert sich. Neutral: 0.5 bzw. 0 bzw. 1.
    let a = cmParams;
    let xr = xlutLookup(0u, xwarp(x, a.xpre_r + a.xpre_all - 0.5, a.xmix_r + a.xmix_all, a.xfreq_r + a.xfreq_all, a.xpost_r + a.xpost_all - 0.5, a.xshift_r + a.xshift_all));
    let xg = xlutLookup(1u, xwarp(x, a.xpre_g + a.xpre_all - 0.5, a.xmix_g + a.xmix_all, a.xfreq_g + a.xfreq_all, a.xpost_g + a.xpost_all - 0.5, a.xshift_g + a.xshift_all));
    let xb = xlutLookup(2u, xwarp(x, a.xpre_b + a.xpre_all - 0.5, a.xmix_b + a.xmix_all, a.xfreq_b + a.xfreq_all, a.xpost_b + a.xpost_all - 0.5, a.xshift_b + a.xshift_all));

    let r = primcolmap2(xr, a.amount_r * a.amount_all, clamp(a.shape_r + a.shape_all - 0.5, 0.0, 1.0), clamp(a.pow_r + a.pow_all - 0.5, 0.0, 1.0), a.pos_r + a.pos_all, a.mult_r + a.mult_all, a.phaseShift);
    let g = primcolmap2(xg, a.amount_g * a.amount_all, clamp(a.shape_g + a.shape_all - 0.5, 0.0, 1.0), clamp(a.pow_g + a.pow_all - 0.5, 0.0, 1.0), a.pos_g + a.pos_all, a.mult_g + a.mult_all, a.phaseShift);
    let b = primcolmap2(xb, a.amount_b * a.amount_all, clamp(a.shape_b + a.shape_all - 0.5, 0.0, 1.0), clamp(a.pow_b + a.pow_all - 0.5, 0.0, 1.0), a.pos_b + a.pos_all, a.mult_b + a.mult_all, a.phaseShift);
    let color = shiftHue(vec3<f32>(r, g, b), a.hueShift);
    textureStore(
        cmTexWrite,
        vec2<i32>(i32(gid.x), 0),
        vec4<f32>(color, 1.0)
    );

    // Curves show the same final RGB values as the colormap.
    textureStore(
        curve1DWrite,
        vec2<i32>(i32(gid.x), 0),
        vec4<f32>(color, 1.0)
    );
}
