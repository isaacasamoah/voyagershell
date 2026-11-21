use crate::audio_io::SpeechDetector;
use std::sync::LazyLock;

pub const CHUNK: usize = 512;
const CONTEXT: usize = 64;
const WINDOW: usize = 256;
const HOP: usize = 128;
const BINS: usize = 129;
const FRAMES: usize = 4;
const HIDDEN: usize = 128;
const GATES: usize = 4 * HIDDEN;
const MODEL: &[u8] = include_bytes!("../models/silero_vad_v6.onnx");

static WEIGHTS: LazyLock<Weights> = LazyLock::new(|| {
    Weights::read(MODEL)
        .unwrap_or_else(|error| panic!("The embedded speech model is unreadable: {error}"))
});

struct Conv {
    weight: Vec<f32>,
    bias: Vec<f32>,
    inputs: usize,
    outputs: usize,
    stride: usize,
}

struct Weights {
    basis: Vec<f32>,
    convs: [Conv; 4],
    input_gates: Vec<f32>,
    hidden_gates: Vec<f32>,
    gate_bias: Vec<f32>,
    decoder: Vec<f32>,
    decoder_bias: f32,
}

pub struct Silero {
    weights: &'static Weights,
    hidden: [f32; HIDDEN],
    cell: [f32; HIDDEN],
    context: [f32; CONTEXT],
    pending: Vec<f32>,
    latest: f32,
}

impl SpeechDetector for Silero {
    fn probability(&mut self, frame: &[i16]) -> f32 {
        self.pending
            .extend(frame.iter().map(|sample| f32::from(*sample) / 32768.0));
        while self.pending.len() >= CHUNK {
            let mut samples = [0.0f32; CHUNK];
            samples.copy_from_slice(&self.pending[..CHUNK]);
            self.pending.drain(..CHUNK);
            self.latest = self.chunk(&samples);
        }
        self.latest
    }

    fn reset(&mut self) {
        self.hidden = [0.0; HIDDEN];
        self.cell = [0.0; HIDDEN];
        self.context = [0.0; CONTEXT];
        self.pending.clear();
        self.latest = 0.0;
    }
}

impl Silero {
    pub fn new() -> Self {
        Self {
            weights: &WEIGHTS,
            hidden: [0.0; HIDDEN],
            cell: [0.0; HIDDEN],
            context: [0.0; CONTEXT],
            pending: Vec::with_capacity(2 * CHUNK),
            latest: 0.0,
        }
    }

    fn chunk(&mut self, samples: &[f32; CHUNK]) -> f32 {
        let mut input = [0.0f32; CONTEXT + CHUNK];
        input[..CONTEXT].copy_from_slice(&self.context);
        input[CONTEXT..].copy_from_slice(samples);
        self.context.copy_from_slice(&samples[CHUNK - CONTEXT..]);
        let mut features = self.weights.spectrum(&input);
        let mut length = FRAMES;
        for conv in &self.weights.convs {
            (features, length) = conv.apply(&features, length);
        }
        self.step(&features);
        let weights = self.weights;
        let logit = weights.decoder_bias
            + weights
                .decoder
                .iter()
                .zip(&self.hidden)
                .map(|(weight, hidden)| weight * hidden.max(0.0))
                .sum::<f32>();
        sigmoid(logit)
    }

    fn step(&mut self, input: &[f32]) {
        let weights = self.weights;
        let mut gates = [0.0f32; GATES];
        for (row, gate) in gates.iter_mut().enumerate() {
            *gate = weights.gate_bias[row]
                + weights.gate_bias[GATES + row]
                + dot(&weights.input_gates[row * HIDDEN..][..HIDDEN], input)
                + dot(
                    &weights.hidden_gates[row * HIDDEN..][..HIDDEN],
                    &self.hidden,
                );
        }
        for unit in 0..HIDDEN {
            let keep_in = sigmoid(gates[unit]);
            let keep_out = sigmoid(gates[HIDDEN + unit]);
            let forget = sigmoid(gates[2 * HIDDEN + unit]);
            let fresh = gates[3 * HIDDEN + unit].tanh();
            self.cell[unit] = forget * self.cell[unit] + keep_in * fresh;
            self.hidden[unit] = keep_out * self.cell[unit].tanh();
        }
    }
}

impl Weights {
    fn read(model: &[u8]) -> Result<Self, String> {
        let mut tensors = std::collections::HashMap::new();
        let graph = field(model, 7)?.ok_or("The model has no graph")?;
        for tensor in fields(graph, 5) {
            let tensor = tensor?;
            let name = field(tensor, 8)?.ok_or("A tensor has no name")?;
            let name = std::str::from_utf8(name).map_err(|error| error.to_string())?;
            if let Some(raw) = field(tensor, 9)? {
                tensors.insert(name.to_owned(), raw);
            }
        }
        let mut take = |name: &str, count: usize| -> Result<Vec<f32>, String> {
            let raw = tensors
                .remove(name)
                .ok_or_else(|| format!("The model has no tensor {name}"))?;
            if raw.len() != count * 4 {
                return Err(format!(
                    "The tensor {name} has {} bytes, not {}",
                    raw.len(),
                    count * 4
                ));
            }
            Ok(raw
                .as_chunks::<4>()
                .0
                .iter()
                .map(|bytes| f32::from_le_bytes(*bytes))
                .collect())
        };
        let mut conv = |index: usize, inputs: usize, outputs: usize, stride: usize| {
            Ok::<_, String>(Conv {
                weight: take(
                    &format!("encoder.conv_layers.{index}.weight"),
                    outputs * inputs * 3,
                )?,
                bias: take(&format!("encoder.conv_layers.{index}.bias"), outputs)?,
                inputs,
                outputs,
                stride,
            })
        };
        let convs = [
            conv(0, BINS, 128, 1)?,
            conv(1, 128, 64, 2)?,
            conv(2, 64, 64, 2)?,
            conv(3, 64, HIDDEN, 1)?,
        ];
        Ok(Self {
            basis: take(
                "encoder.feature_extractor.forward_basis_buffer",
                2 * BINS * WINDOW,
            )?,
            convs,
            input_gates: take("onnx::LSTM_209", GATES * HIDDEN)?,
            hidden_gates: take("onnx::LSTM_210", GATES * HIDDEN)?,
            gate_bias: take("onnx::LSTM_211", 2 * GATES)?,
            decoder: take("decoder.conv1d.weight", HIDDEN)?,
            decoder_bias: take("decoder.conv1d.bias", 1)?[0],
        })
    }

    fn spectrum(&self, input: &[f32; CONTEXT + CHUNK]) -> Vec<f32> {
        let length = input.len();
        let padded: Vec<f32> = (0..length + 2 * HOP)
            .map(|at| {
                let from = at as isize - HOP as isize;
                let from = if from < 0 {
                    -from
                } else if from as usize >= length {
                    2 * (length as isize - 1) - from
                } else {
                    from
                };
                input[from as usize]
            })
            .collect();
        let mut features = vec![0.0f32; BINS * FRAMES];
        for frame in 0..FRAMES {
            let window = &padded[(frame + 1) * HOP..][..WINDOW];
            for bin in 0..BINS {
                let real = dot(&self.basis[bin * WINDOW..][..WINDOW], window);
                let imaginary = dot(&self.basis[(BINS + bin) * WINDOW..][..WINDOW], window);
                features[bin * FRAMES + frame] = (real * real + imaginary * imaginary).sqrt();
            }
        }
        features
    }
}

impl Conv {
    fn apply(&self, input: &[f32], length: usize) -> (Vec<f32>, usize) {
        let out_length = (length - 1) / self.stride + 1;
        let mut output = vec![0.0f32; self.outputs * out_length];
        for out in 0..self.outputs {
            for at in 0..out_length {
                let mut sum = self.bias[out];
                for tap in 0..3 {
                    let Some(from) = (at * self.stride + tap).checked_sub(1) else {
                        continue;
                    };
                    if from >= length {
                        continue;
                    }
                    for channel in 0..self.inputs {
                        sum += self.weight[(out * self.inputs + channel) * 3 + tap]
                            * input[channel * length + from];
                    }
                }
                output[out * out_length + at] = sum.max(0.0);
            }
        }
        (output, out_length)
    }
}

fn dot(left: &[f32], right: &[f32]) -> f32 {
    left.iter()
        .zip(right)
        .map(|(left, right)| left * right)
        .sum()
}

fn sigmoid(value: f32) -> f32 {
    1.0 / (1.0 + (-value).exp())
}

fn field(message: &[u8], number: u64) -> Result<Option<&[u8]>, String> {
    fields(message, number).next().transpose()
}

fn fields(message: &[u8], number: u64) -> impl Iterator<Item = Result<&[u8], String>> {
    let mut at = 0;
    std::iter::from_fn(move || {
        while at < message.len() {
            let found = (|| {
                let key = varint(message, &mut at)?;
                let body = match key & 7 {
                    0 => {
                        varint(message, &mut at)?;
                        None
                    }
                    1 => Some(skip(message, &mut at, 8)?),
                    2 => {
                        let size = varint(message, &mut at)? as usize;
                        Some(skip(message, &mut at, size)?)
                    }
                    5 => Some(skip(message, &mut at, 4)?),
                    kind => return Err(format!("The model has wire type {kind}")),
                };
                Ok(body.filter(|_| key >> 3 == number && key & 7 == 2))
            })();
            match found {
                Ok(Some(body)) => return Some(Ok(body)),
                Ok(None) => {}
                Err(error) => {
                    at = message.len();
                    return Some(Err(error));
                }
            }
        }
        None
    })
}

fn varint(message: &[u8], at: &mut usize) -> Result<u64, String> {
    let mut value = 0u64;
    for shift in (0..64).step_by(7) {
        let byte = *message.get(*at).ok_or("The model ends inside a number")?;
        *at += 1;
        value |= u64::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
    }
    Err("The model has a number longer than 64 bits".into())
}

fn skip<'a>(message: &'a [u8], at: &mut usize, size: usize) -> Result<&'a [u8], String> {
    let body = message
        .get(*at..at.saturating_add(size))
        .ok_or("The model ends inside a field")?;
    *at += size;
    Ok(body)
}

#[cfg(test)]
pub(crate) fn hearing_clips() -> std::collections::HashMap<String, Vec<i16>> {
    let fixtures = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/native/fixtures/hearing"
    );
    let pcm = std::fs::read(format!("{fixtures}/hearing.s16")).unwrap();
    let samples: Vec<i16> = pcm
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| i16::from_le_bytes(*pair))
        .collect();
    let table = std::fs::read_to_string(format!("{fixtures}/hearing.tsv")).unwrap();
    let mut start = 0;
    table
        .lines()
        .map(|line| {
            let fields: Vec<&str> = line.split('\t').collect();
            let length: usize = fields[2].parse().unwrap();
            let clip = samples[start..start + length].to_vec();
            start += length;
            (fields[0].to_owned(), clip)
        })
        .collect()
}

#[cfg(test)]
pub(crate) fn hearing_clip(name: &str) -> Vec<i16> {
    hearing_clips().remove(name).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_io::FRAME;

    const REFERENCE: &str = include_str!("../models/silero_vad_v6_reference.tsv");
    const TOLERANCE: f32 = 1e-4;

    fn through_the_gate_frames(detector: &mut Silero, clip: &[i16]) -> Vec<f32> {
        let mut probabilities = Vec::new();
        let mut fed = 0;
        for frame in clip.as_chunks::<FRAME>().0 {
            let probability = detector.probability(frame);
            fed += FRAME;
            if fed / CHUNK > probabilities.len() {
                probabilities.push(probability);
            }
        }
        probabilities
    }

    #[test]
    fn the_port_matches_the_reference_model_on_quiet_and_full_level_voices() {
        let clips = hearing_clips();
        let mut worst = 0.0f32;
        let mut chunks = 0;
        for line in REFERENCE.lines() {
            let fields: Vec<&str> = line.split('\t').collect();
            let gain: i32 = fields[1].parse().unwrap();
            let clip: Vec<i16> = clips[fields[0]]
                .iter()
                .map(|sample| (i32::from(*sample) * gain / 100) as i16)
                .collect();
            let expected: Vec<f32> = fields[3]
                .split(' ')
                .map(|value| value.parse().unwrap())
                .collect();
            let mut detector = Silero::new();
            let got = through_the_gate_frames(&mut detector, &clip);
            let compared = got.len().min(expected.len());
            assert!(
                compared + 1 >= expected.len(),
                "{} {}",
                got.len(),
                expected.len()
            );
            for (got, expected) in got.iter().zip(&expected) {
                worst = worst.max((got - expected).abs());
            }
            chunks += compared;
        }
        println!("compared {chunks} chunks, worst absolute difference {worst:e}");
        assert!(worst <= TOLERANCE, "worst difference {worst}");
    }
}
