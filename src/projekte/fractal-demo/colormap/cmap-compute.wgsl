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
// knob<0.5: an der Antidiagonale gespiegelt, 1-(1-base)^(1/e) (gleiche Stauchung links).
fn spk(base: f32, knob: f32, mult: f32) -> f32 {
    let e = pow(mult, abs(knob - 0.5) * 2.0);
    if (knob >= 0.5) {
        return pow(base, e);
    }
    return 1.0 - pow(1.0 - base, 1.0 / e);
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

@compute @workgroup_size(64)
fn cm_main(@builtin(global_invocation_id) gid : vec3<u32>) {
    if (gid.x >= 1024u) { return; }

    let x = f32(gid.x) / 1024.0;

    let xr = xlutLookup(0u, xwarp(x, cmParams.xpre_r, cmParams.xmix_r, cmParams.xfreq_r, cmParams.xpost_r, cmParams.xshift_r));
    let xg = xlutLookup(1u, xwarp(x, cmParams.xpre_g, cmParams.xmix_g, cmParams.xfreq_g, cmParams.xpost_g, cmParams.xshift_g));
    let xb = xlutLookup(2u, xwarp(x, cmParams.xpre_b, cmParams.xmix_b, cmParams.xfreq_b, cmParams.xpost_b, cmParams.xshift_b));

    let r = primcolmap2(xr, cmParams.amount_r, cmParams.shape_r, cmParams.pow_r, cmParams.pos_r, cmParams.mult_r, cmParams.phaseShift);
    let g = primcolmap2(xg, cmParams.amount_g, cmParams.shape_g, cmParams.pow_g, cmParams.pos_g, cmParams.mult_g, cmParams.phaseShift);
    let b = primcolmap2(xb, cmParams.amount_b, cmParams.shape_b, cmParams.pow_b, cmParams.pos_b, cmParams.mult_b, cmParams.phaseShift);

textureStore(
    cmTexWrite,
    vec2<i32>(i32(gid.x), 0),
    vec4<f32>(r, g, b, 1.0)
);

    // 1D-Kurve: nur r-Kanal als Kurve
    textureStore(
        curve1DWrite,
        vec2<i32>(i32(gid.x), 0),
        vec4<f32>(r, g, b, 1.0)
    );
}
