use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::to_value;
use wasm_bindgen::prelude::*;

use num_complex::Complex32;
use realfft::RealFftPlanner;
use std::cell::RefCell;
use std::collections::VecDeque;

// ---------------------------------------------
// Konfiguration
// ---------------------------------------------
const FFT_SIZE: usize = 2048;
const DEFAULT_SAMPLE_RATE: f32 = 48_000.0;
const ONSET_THRESHOLD: f32 = 5.0;
const ONSET_RESET_THRESHOLD: f32 = 2.5;

struct BeatTracker {
    sample_rate: f32,
    bpm: f32,
    last_beat: Option<u64>,
    beat_index: f64,
    has_tempo: bool,
    armed: bool,
    intervals: VecDeque<u64>,
}

impl BeatTracker {
    fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            bpm: 120.0,
            last_beat: None,
            beat_index: 0.0,
            has_tempo: false,
            armed: true,
            intervals: VecDeque::new(),
        }
    }

    fn update(&mut self, onset: f32, sample: u64) {
        if onset <= ONSET_RESET_THRESHOLD {
            self.armed = true;
        }
        if !self.armed || onset <= ONSET_THRESHOLD {
            return;
        }
        self.armed = false;

        if let Some(last) = self.last_beat {
            let seconds = (sample - last) as f32 / self.sample_rate;
            // Rejected short triggers must not move the beat clock.
            if seconds < 0.2 {
                return;
            }
            // Keep bar divisions aligned across missed onsets and pauses.
            self.beat_index += if self.has_tempo {
                (seconds as f64 * self.bpm as f64 / 60.0).round().max(1.0)
            } else {
                1.0
            };
            if seconds > 2.0 {
                self.last_beat = Some(sample);
                self.has_tempo = false;
                self.intervals.clear();
                return;
            }
            self.intervals.push_back(sample - last);
            if self.intervals.len() > 8 {
                self.intervals.pop_front();
            }
            let mean_samples = self.intervals.iter().sum::<u64>() as f32
                / self.intervals.len() as f32;
            let detected = 60.0 * self.sample_rate / mean_samples;
            self.bpm = if self.has_tempo {
                self.bpm * 0.75 + detected * 0.25
            } else {
                detected
            };
            self.has_tempo = true;
        }
        self.last_beat = Some(sample);
    }

    fn phase(&self, sample: u64) -> f32 {
        match self.last_beat {
            Some(last) => {
                let elapsed = (sample - last) as f32 / self.sample_rate;
                (elapsed * self.bpm / 60.0).fract()
            }
            None => 0.0,
        }
    }

    fn position(&self, sample: u64) -> f64 {
        match self.last_beat {
            Some(last) => self.beat_index
                + (sample - last) as f64 / self.sample_rate as f64 * self.bpm as f64 / 60.0,
            None => 0.0,
        }
    }

    fn confidence(&self, sample: u64) -> f32 {
        if !self.has_tempo || self.intervals.is_empty() {
            return 0.0;
        }
        let count = self.intervals.len() as f32;
        let mean = self.intervals.iter().sum::<u64>() as f32 / count;
        let variance = self.intervals.iter()
            .map(|interval| (*interval as f32 - mean).powi(2))
            .sum::<f32>() / count;
        let stability = (1.0 - variance.sqrt() / mean / 0.2).clamp(0.0, 1.0);
        let evidence = (count / 8.0).min(1.0);
        let elapsed = (sample - self.last_beat.unwrap()) as f32;
        // Full freshness for one expected interval, then fade over two intervals.
        let freshness = (1.0 - (elapsed / mean - 1.0).max(0.0) / 2.0)
            .clamp(0.0, 1.0);
        stability * evidence * freshness
    }
}

// ---------------------------------------------
// Thread-lokaler Audio-State
// ---------------------------------------------
thread_local! {
    static SAMPLE_BUFFER: RefCell<Vec<f32>> = RefCell::new(Vec::new());

    static LAST_BASS: RefCell<f32> = RefCell::new(0.0);
    static LAST_MID:  RefCell<f32> = RefCell::new(0.0);
    static LAST_TRE:  RefCell<f32> = RefCell::new(0.0);

    static PREV_BASS: RefCell<f32> = RefCell::new(0.0);
    static PREV_MID:  RefCell<f32> = RefCell::new(0.0);
    static PREV_TRE:  RefCell<f32> = RefCell::new(0.0);

    static BEAT_TRACKER: RefCell<BeatTracker> = RefCell::new(BeatTracker::new(DEFAULT_SAMPLE_RATE));
    static SAMPLE_COUNTER: RefCell<u64> = RefCell::new(0);
    static PROCESSED_SAMPLES: RefCell<u64> = RefCell::new(0);
}

// ---------------------------------------------
// Datenstruktur für JS
// ---------------------------------------------
#[derive(Serialize, Deserialize, Clone)]
pub struct BeatData {
    pub bass: f32,
    pub mid: f32,
    pub tre: f32,

    pub bpm: f32,
    pub beat_phase: f32,
    pub beat_position: f64,
    pub confidence: f32,
}
// ---------------------------------------------
// Spektrumanalyse (FFT → Bänder → Onsets)
// ---------------------------------------------
fn analyze_spectrum(spectrum: &[Complex32], fft_size: usize, sample: u64) {
    let sample_rate = BEAT_TRACKER.with(|tracker| tracker.borrow().sample_rate);
    let bin_hz = sample_rate / fft_size as f32;

    let mut bass = 0.0;
    let mut mid = 0.0;
    let mut tre = 0.0;

    // --- Frequenzbänder summieren ---
    for (i, c) in spectrum.iter().enumerate() {
        let freq = i as f32 * bin_hz;
        let mag = c.norm();

        if freq < 150.0 {
            bass += mag;
        } else if freq < 2000.0 {
            mid += mag;
        } else if freq < 8000.0 {
            tre += mag;
        }
    }

    // --- Onset Detection (Delta) ---
    PREV_BASS.with(|pb| {
        LAST_BASS.with(|lb| {
            let prev = *pb.borrow();
            *lb.borrow_mut() = (bass - prev).max(0.0);
            *pb.borrow_mut() = bass;
        });
    });
    LAST_BASS.with(|lb| {
        let onset = *lb.borrow();
        BEAT_TRACKER.with(|tracker| tracker.borrow_mut().update(onset, sample));
    });
    PREV_MID.with(|pm| {
        LAST_MID.with(|lm| {
            let prev = *pm.borrow();
            *lm.borrow_mut() = (mid - prev).max(0.0);
            *pm.borrow_mut() = mid;
        });
    });

    PREV_TRE.with(|pt| {
        LAST_TRE.with(|lt| {
            let prev = *pt.borrow();
            *lt.borrow_mut() = (tre - prev).max(0.0);
            *pt.borrow_mut() = tre;
        });
    });
}

// ---------------------------------------------
// FFT ausführen
// ---------------------------------------------
fn process_fft(samples: &[f32], sample: u64) {
    let mut planner = RealFftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(samples.len());

    let mut spectrum = fft.make_output_vec();
    let mut buffer = samples.to_vec();

    fft.process(&mut buffer, &mut spectrum).unwrap();

    analyze_spectrum(&spectrum, samples.len(), sample);
}

#[wasm_bindgen]
pub fn set_sample_rate(sample_rate: f32) -> Result<(), JsValue> {
    if !sample_rate.is_finite() || sample_rate <= 0.0 {
        return Err(JsValue::from_str("Audio sample rate must be finite and positive."));
    }
    BEAT_TRACKER.with(|tracker| *tracker.borrow_mut() = BeatTracker::new(sample_rate));
    SAMPLE_BUFFER.with(|buffer| buffer.borrow_mut().clear());
    SAMPLE_COUNTER.with(|counter| *counter.borrow_mut() = 0);
    PROCESSED_SAMPLES.with(|counter| *counter.borrow_mut() = 0);
    for band in [&LAST_BASS, &LAST_MID, &LAST_TRE, &PREV_BASS, &PREV_MID, &PREV_TRE] {
        band.with(|value| *value.borrow_mut() = 0.0);
    }
    Ok(())
}

// ---------------------------------------------
// JS → Rust: Samples updaten
// ---------------------------------------------
#[wasm_bindgen]
pub fn update_audio(samples: &[f32]) {
    SAMPLE_COUNTER.with(|sc| {
        *sc.borrow_mut() += samples.len() as u64;
    });
    SAMPLE_BUFFER.with(|buf| {
        let mut buf = buf.borrow_mut();
        buf.extend_from_slice(samples);

        while buf.len() >= FFT_SIZE {
            let chunk = buf[..FFT_SIZE].to_vec();
            buf.drain(..FFT_SIZE);
            let sample = PROCESSED_SAMPLES.with(|counter| {
                *counter.borrow_mut() += FFT_SIZE as u64;
                *counter.borrow()
            });
            process_fft(&chunk, sample);
        }
    });
}

// ---------------------------------------------
// Rust → JS: Beats zurückgeben
// ---------------------------------------------
#[wasm_bindgen]
pub fn get_beats() -> JsValue {
    let bass = LAST_BASS.with(|b| *b.borrow());
    let mid = LAST_MID.with(|m| *m.borrow());
    let tre = LAST_TRE.with(|t| *t.borrow());

    let bpm = BEAT_TRACKER.with(|tracker| tracker.borrow().bpm);
    let beat_phase = get_beat_phase();
    let sample = SAMPLE_COUNTER.with(|counter| *counter.borrow());
    let beat_position = BEAT_TRACKER.with(|tracker| tracker.borrow().position(sample));
    let confidence = BEAT_TRACKER.with(|tracker| tracker.borrow().confidence(sample));

    let data = BeatData {
        bass,
        mid,
        tre,

        bpm,
        beat_phase,
        beat_position,
        confidence,
    };
    to_value(&data).unwrap()
}
fn get_beat_phase() -> f32 {
    let sample = SAMPLE_COUNTER.with(|counter| *counter.borrow());
    BEAT_TRACKER.with(|tracker| tracker.borrow().phase(sample))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn trigger(tracker: &mut BeatTracker, sample: u64) {
        tracker.update(0.0, sample);
        tracker.update(10.0, sample);
    }

    #[test]
    fn beat_position_tracks_bars_and_missing_onsets() {
        for rate in [44_100.0, 48_000.0] {
            for bpm in [60.0, 120.0] {
                let mut tracker = BeatTracker::new(rate);
                assert_eq!(tracker.position(0), 0.0);
                let interval = (rate * 60.0 / bpm) as u64;
                for beat in 0..=16 {
                    trigger(&mut tracker, beat * interval);
                    assert!((tracker.position(beat * interval) - beat as f64).abs() < 1e-6);
                    if beat > 0 {
                        assert!((tracker.position(beat * interval + interval / 2) - beat as f64 - 0.5).abs() < 1e-6);
                    }
                }
                assert!((tracker.position(19 * interval) - 19.0).abs() < 1e-6);
                trigger(&mut tracker, 20 * interval);
                assert!((tracker.position(20 * interval) - 20.0).abs() < 1e-6);
            }
        }
    }

    #[test]
    fn confidence_requires_evidence_and_fades_after_missing_beats() {
        let mut tracker = BeatTracker::new(48_000.0);
        assert_eq!(tracker.confidence(0), 0.0);
        trigger(&mut tracker, 0);
        assert_eq!(tracker.confidence(0), 0.0);
        trigger(&mut tracker, 24_000);
        assert_eq!(tracker.confidence(24_000), 0.125);
        for beat in 2..=8 {
            trigger(&mut tracker, beat * 24_000);
        }
        assert_eq!(tracker.confidence(192_000), 1.0);
        assert_eq!(tracker.confidence(216_000), 1.0);
        assert_eq!(tracker.confidence(240_000), 0.5);
        assert_eq!(tracker.confidence(264_000), 0.0);
        trigger(&mut tracker, 360_000);
        assert_eq!(tracker.confidence(360_000), 0.0);
    }

    #[test]
    fn irregular_intervals_reduce_confidence() {
        let mut tracker = BeatTracker::new(48_000.0);
        trigger(&mut tracker, 0);
        let mut sample = 0;
        for interval in [12_000, 36_000, 12_000, 36_000, 12_000, 36_000, 12_000, 36_000] {
            sample += interval;
            trigger(&mut tracker, sample);
        }
        assert!(tracker.confidence(sample) < 0.1);
    }

    #[test]
    fn first_interval_sets_tempo_without_startup_bias() {
        for rate in [44_100.0, 48_000.0] {
            for bpm in [60.0, 120.0] {
                let mut tracker = BeatTracker::new(rate);
                trigger(&mut tracker, 0);
                trigger(&mut tracker, (rate * 60.0 / bpm) as u64);
                assert!((tracker.bpm - bpm).abs() < 0.001);
            }
        }
    }

    #[test]
    fn short_trigger_does_not_reset_tempo_or_phase() {
        let mut tracker = BeatTracker::new(48_000.0);
        trigger(&mut tracker, 0);
        trigger(&mut tracker, 7_200); // 0.15 seconds
        assert_eq!(tracker.last_beat, Some(0));
        assert!((tracker.phase(12_000) - 0.5).abs() < 0.001);
        trigger(&mut tracker, 24_000);
        assert_eq!(tracker.bpm, 120.0);
    }

    #[test]
    fn sustained_onset_is_only_one_event() {
        let mut tracker = BeatTracker::new(48_000.0);
        trigger(&mut tracker, 0);
        tracker.update(8.0, 24_000);
        assert_eq!(tracker.last_beat, Some(0));
        tracker.update(3.0, 24_000);
        tracker.update(8.0, 26_048);
        assert_eq!(tracker.last_beat, Some(0));
        trigger(&mut tracker, 48_000);
        assert_eq!(tracker.bpm, 60.0);
    }

    #[test]
    fn long_pause_restarts_interval_measurement() {
        let mut tracker = BeatTracker::new(48_000.0);
        trigger(&mut tracker, 0);
        trigger(&mut tracker, 24_000);
        trigger(&mut tracker, 168_000);
        trigger(&mut tracker, 216_000);
        assert_eq!(tracker.bpm, 60.0);
    }

    #[test]
    fn fft_pulse_tempos_are_independent_of_packet_size_and_sample_rate() {
        for rate in [44_100.0, 48_000.0] {
            for bpm in [60.0, 120.0] {
                for packet_size in [128, FFT_SIZE * 3 + 17] {
                    set_sample_rate(rate).unwrap();
                    let interval = (rate * 60.0 / bpm) as usize;
                    let samples: Vec<f32> = (0..interval * 10)
                        .map(|i| {
                            let t = (i % interval) as f32 / rate;
                            if t < 0.1 {
                                (2.0 * std::f32::consts::PI * 80.0 * t).sin()
                                    * (-60.0 * t).exp()
                            } else {
                                0.0
                            }
                        })
                        .collect();
                    for packet in samples.chunks(packet_size) {
                        update_audio(packet);
                    }
                    let actual = BEAT_TRACKER.with(|tracker| tracker.borrow().bpm);
                    assert!(
                        (actual - bpm).abs() < 2.0,
                        "Expected {bpm} BPM, got {actual}, rate {rate}, packet {packet_size}"
                    );
                    assert_eq!(
                        PROCESSED_SAMPLES.with(|counter| *counter.borrow()),
                        (samples.len() / FFT_SIZE * FFT_SIZE) as u64
                    );
                }
            }
        }
    }
}
