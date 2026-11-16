#!/usr/bin/env node
// Checks that each look's Swarm/Court colour pair stays distinct under common colour-blindness
// types: simulates protanopia, deuteranopia and tritanopia (Machado et al. 2009, severity 1.0)
// and reports the CIE76 colour difference and the lightness difference of each pair.
// Usage: node prototypes/visual-directions/colorblind-check.mjs
const PAIRS = {
  "Ink & parchment": { swarm: "#b5651d", court: "#2f4f8f" },
  "Night glass": { swarm: "#f2b134", court: "#7d8cff" },
  "Clean modern": { swarm: "#f0662e", court: "#1d6fc2" },
};
const SIM = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (x) => Math.min(1, Math.max(0, x));
function hexToLinear(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255));
}
function simulate(lin, m) {
  return m.map((r) => clamp(r[0] * lin[0] + r[1] * lin[1] + r[2] * lin[2]));
}
function toHex(lin) {
  return `#${lin
    .map((c) =>
      Math.round(clamp(toSrgb(c)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
function toLab([r, g, b]) {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const MIN_DELTA_E = 20;
let ok = true;
const lines = [
  "| Look | Vision | Swarm | Court | ΔE | ΔL | Distinct |",
  "|---|---|---|---|---:|---:|:-:|",
];
for (const [look, { swarm, court }] of Object.entries(PAIRS)) {
  for (const [vision, m] of Object.entries(SIM)) {
    const s = simulate(hexToLinear(swarm), m);
    const c = simulate(hexToLinear(court), m);
    const ls = toLab(s);
    const lc = toLab(c);
    const d = dE(ls, lc);
    const pass = d >= MIN_DELTA_E;
    ok &&= pass;
    lines.push(
      `| ${look} | ${vision} | ${toHex(s)} | ${toHex(c)} | ${d.toFixed(1)} | ${Math.abs(ls[0] - lc[0]).toFixed(1)} | ${pass ? "yes" : "NO"} |`,
    );
  }
}
console.log(lines.join("\n"));
console.log(
  `\nThreshold: CIE76 ΔE ≥ ${MIN_DELTA_E} under every simulation. ${ok ? "All pairs pass." : "Some pairs FAIL."}`,
);
process.exit(ok ? 0 : 1);
