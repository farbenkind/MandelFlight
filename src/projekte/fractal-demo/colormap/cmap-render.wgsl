struct VSOut {
    @builtin(position) pos : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@vertex
fn cm_vs(@builtin(vertex_index) idx : u32) -> VSOut {
    let pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0),
    );

    let p = pos[idx];
    var out : VSOut;
    out.pos = vec4<f32>(p, 0.0, 1.0);
    out.uv  = (p + vec2<f32>(1.0, 1.0)) * 0.5;
    return out;
}

// Preview: Colormap-Texture
@group(0) @binding(0)
var cmTexSample : texture_2d<f32>;

// AA-Curve: 1D-Kurve als Texture
@group(0) @binding(1)
var curve1D : texture_2d<f32>;

@fragment
fn cm_fs(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
    let x = i32(uv.x * 1023.0);
    let color = textureLoad(cmTexSample, vec2<i32>(x, 0), 0);
    return vec4<f32>(color.rgb, 1.0);
}

fn AAColor(colval : f32, y : f32) -> f32 {

    let curveY = colval * 63.0;

    let dy = abs(y - curveY);
    let lineWidth = 1.0;
    let aaWidth   = 1.0;

    // Kern der Linie
    if (dy < lineWidth) {
        return 1.0;
    }

    // AA-Bereich
    if (dy < lineWidth + aaWidth) {
        return 1.0 - (dy - lineWidth) / aaWidth;
    }

    // Hintergrund = 0 → wird später mit Weiß gemischt
    return 0.0;
}

@fragment
fn cmAACurve_fs(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {

    let w = 1024.0;
    let h = 63.0;

    let x = i32(uv.x * w);
    let y = f32(i32(uv.y * h));

    let c = textureLoad(curve1D, vec2<i32>(x, 0), 0);

    // AA für jede Farbe
    let ar = AAColor(c.r, y);
    let ag = AAColor(c.g, y);
    let ab = AAColor(c.b, y);

    let col = vec3<f32>(ar, ag, ab);

    // Hintergrund weiß
    let bg = vec3<f32>(1.0, 1.0, 1.0);

    // Alpha = max der drei Kanäle → deckend, wo eine Kurve ist
    let alpha = max(max(ar, ag), ab);

    // Finales Mischen
    let finl = mix(bg, col, alpha);

    return vec4<f32>(finl, 1.0);
}

