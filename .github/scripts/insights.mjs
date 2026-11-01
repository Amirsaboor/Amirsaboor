// Generates a dark dashboard SVG (stat tiles + language bar) from the public GitHub API.
// Usage: GITHUB_USER=Amirsaboor GITHUB_TOKEN=... OUT=dist/github-insights.svg node insights.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const USER = process.env.GITHUB_USER || "Amirsaboor";
const OUT = process.env.OUT || "dist/github-insights.svg";
const TOKEN = process.env.GITHUB_TOKEN;

const headers = { Accept: "application/vnd.github+json", "User-Agent": "profile-insights" };
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

async function api(url) {
  const res = await fetch(url.startsWith("http") ? url : `https://api.github.com${url}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

const user = await api(`/users/${USER}`);
const repos = (await api(`/users/${USER}/repos?per_page=100&type=owner`)).filter(r => !r.fork);

const bytes = {};
for (const r of repos) {
  const langs = await api(r.languages_url);
  for (const [k, v] of Object.entries(langs)) bytes[k] = (bytes[k] || 0) + v;
}

const stars = repos.reduce((n, r) => n + r.stargazers_count, 0);
const since = new Date(user.created_at).getFullYear();
const tiles = [
  ["REPOSITORIES", user.public_repos],
  ["STARS EARNED", stars],
  ["FOLLOWERS", user.followers],
  ["ON GITHUB SINCE", since],
];

const COLORS = {
  TypeScript: "#3178C6", JavaScript: "#F7DF1E", HTML: "#E34F26", CSS: "#1572B6", SCSS: "#C6538C",
  Python: "#3572A5", Vue: "#41B883", Shell: "#89E051", Dart: "#00B4AB", Kotlin: "#A97BFF",
  Java: "#B07219", PHP: "#777BB4", Swift: "#F05138", Go: "#00ADD8", Rust: "#DEA584",
};
const FALLBACK = ["#DC2626", "#B91C1C", "#991B1B", "#7F1D1D", "#6B7280"];

const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
let langs = Object.entries(bytes).sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, pct: (v / total) * 100 }));
if (langs.length > 6) {
  const rest = langs.slice(5).reduce((a, l) => a + l.pct, 0);
  langs = [...langs.slice(0, 5), { name: "Other", pct: rest }];
}
langs.forEach((l, i) => (l.color = COLORS[l.name] || FALLBACK[i % FALLBACK.length]));

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const W = 800, PAD = 28, INNER = W - PAD * 2, GAP = 14;
const tw = (INNER - GAP * 3) / 4;

let body = "";
tiles.forEach(([label, value], i) => {
  const x = PAD + i * (tw + GAP), y = 28, t = 0.15 * i;
  body += `  <g opacity="0">
    <animate attributeName="opacity" from="0" to="1" begin="${t}s" dur="0.5s" fill="freeze"/>
    <rect x="${x}" y="${y}" width="${tw}" height="92" rx="12" fill="#161B22" stroke="#30363D"/>
    <rect x="${x + 16}" y="${y}" width="36" height="3" rx="1.5" fill="#DC2626"/>
    <text x="${x + 16}" y="${y + 52}" class="big" fill="#FFFFFF">${esc(value)}</text>
    <text x="${x + 16}" y="${y + 74}" class="lbl" fill="#8B949E">${label}</text>
  </g>\n`;
});

body += `  <text x="${PAD}" y="166" class="t"><tspan fill="#DC2626">//</tspan> <tspan fill="#8B949E">languages</tspan></text>\n`;
body += `  <clipPath id="bar"><rect x="${PAD}" y="182" width="${INNER}" height="12" rx="6"/></clipPath>
  <rect x="${PAD}" y="182" width="${INNER}" height="12" rx="6" fill="#161B22"/>
  <g clip-path="url(#bar)">\n`;
let x = PAD;
langs.forEach((l, i) => {
  const w = Math.max(3, (l.pct / 100) * INNER);
  body += `    <rect x="${x.toFixed(1)}" y="182" width="0" height="12" fill="${l.color}">
      <animate attributeName="width" from="0" to="${w.toFixed(1)}" begin="${(0.6 + i * 0.12).toFixed(2)}s" dur="0.7s" fill="freeze"/>
    </rect>\n`;
  x += w;
});
body += `  </g>\n`;

const cols = 3, colW = INNER / cols;
langs.forEach((l, i) => {
  const cx = PAD + (i % cols) * colW, cy = 232 + Math.floor(i / cols) * 30;
  body += `  <circle cx="${cx + 6}" cy="${cy - 5}" r="5" fill="${l.color}"/>
  <text x="${cx + 20}" y="${cy}" class="t" fill="#E6EDF3">${esc(l.name)}<tspan fill="#8B949E" dx="8">${l.pct.toFixed(1)}%</tspan></text>\n`;
});

const rows = Math.ceil(langs.length / cols);
const H = 232 + (rows - 1) * 30 + 32;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub insights">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0D1117"/>
      <stop offset="1" stop-color="#160A0D"/>
    </linearGradient>
    <style>
      .t{font-family:'JetBrains Mono','Fira Code',Consolas,'Courier New',monospace;font-size:14px}
      .lbl{font-family:'JetBrains Mono','Fira Code',Consolas,'Courier New',monospace;font-size:11px;letter-spacing:2px}
      .big{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;font-weight:800;font-size:34px}
    </style>
  </defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="url(#bg)" stroke="#30363D"/>
${body}</svg>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log(`Wrote ${OUT}`, { repos: user.public_repos, stars, langs: langs.map(l => `${l.name} ${l.pct.toFixed(1)}%`) });
