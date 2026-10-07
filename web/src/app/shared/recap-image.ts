export interface RecapCard {
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  footer: string;
}

/** Draws the weekly recap as a 1080 x 1350 PNG, ready to share. */
export function renderRecap(card: RecapCard): Promise<Blob | null> {
  const w = 1080;
  const h = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return Promise.resolve(null);

  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#0c0e13');
  bg.addColorStop(1, '#1a2036');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w * 0.85, 0, 0, w * 0.85, 0, 700);
  glow.addColorStop(0, 'rgba(124,156,255,0.35)');
  glow.addColorStop(1, 'rgba(124,156,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);

  const font = (px: number, weight = 600) =>
    `${weight} ${px}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;

  // little cube mark
  const cols = [
    '#f87171',
    '#fbbf24',
    '#34d27b',
    '#60a5fa',
    '#f1f5f9',
    '#fb923c',
    '#34d27b',
    '#f87171',
    '#fbbf24',
  ];
  cols.forEach((c, i) => {
    g.fillStyle = c;
    g.beginPath();
    g.roundRect(80 + (i % 3) * 38, 90 + Math.floor(i / 3) * 38, 30, 30, 7);
    g.fill();
  });
  g.fillStyle = '#eceef4';
  g.font = font(40, 700);
  g.fillText('CubeTrainer', 214, 150);

  g.font = font(88, 750);
  g.fillText(card.title, 80, 360);
  g.fillStyle = '#8d95a8';
  g.font = font(40, 500);
  g.fillText(card.subtitle, 80, 425);

  const cell = 440;
  const gap = 40;
  card.stats.slice(0, 4).forEach((s, i) => {
    const x = 80 + (i % 2) * (cell + gap);
    const y = 520 + Math.floor(i / 2) * (cell / 1.45 + gap);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.roundRect(x, y, cell, cell / 1.45, 36);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#8d95a8';
    g.font = font(32, 550);
    g.fillText(s.label, x + 36, y + 70);
    g.fillStyle = '#eceef4';
    g.font = font(84, 750);
    g.fillText(s.value, x + 36, y + 190);
  });

  g.fillStyle = '#7c9cff';
  g.font = font(40, 650);
  g.fillText(card.footer, 80, h - 100);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
