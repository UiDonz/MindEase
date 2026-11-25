// chart.js - a small hand-written SVG line chart (no external chart library needed).
// Draws daily average mood and energy over the last N days.

function drawMoodChart(container, checkins, days = 30) {
  if (!checkins.length) {
    container.innerHTML = '<div class="empty">Your chart will appear after your first check-in.</div>';
    return;
  }

  // 1) Group check-ins by day and average them.
  const byDay = {};
  checkins.forEach((c) => {
    const key = new Date(c.created_at).toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
    (byDay[key] ||= { mood: [], energy: [] });
    byDay[key].mood.push(c.mood);
    byDay[key].energy.push(c.energy);
  });
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  // 2) Build the list of the last `days` dates so gaps show as gaps.
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA');
    const entry = byDay[key];
    points.push({
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      mood: entry ? avg(entry.mood) : null,
      energy: entry ? avg(entry.energy) : null,
    });
  }

  // 3) Map values to SVG coordinates.
  const W = 640, H = 240, padL = 30, padR = 12, padT = 12, padB = 28;
  const x = (i) => padL + (i / (days - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - 1) / 9) * (H - padT - padB);

  // Path that "lifts the pen" over missing days.
  const pathFor = (key) => {
    let d = '', penDown = false;
    points.forEach((p, i) => {
      if (p[key] === null) { penDown = false; return; }
      d += `${penDown ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)} `;
      penDown = true;
    });
    return d;
  };
  const dots = (key, color) =>
    points
      .map((p, i) => (p[key] === null ? '' : `<circle cx="${x(i)}" cy="${y(p[key])}" r="3.5" fill="${color}"><title>${p.label}: ${key} ${p[key].toFixed(1)}</title></circle>`))
      .join('');

  const grid = [1, 4, 7, 10]
    .map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#e3ddd1" stroke-dasharray="3 4"/><text x="${padL - 8}" y="${y(v) + 4}" font-size="11" fill="#8a958e" text-anchor="end">${v}</text>`)
    .join('');
  const xLabels = [0, Math.floor(days / 2), days - 1]
    .map((i) => `<text x="${x(i)}" y="${H - 6}" font-size="11" fill="#8a958e" text-anchor="${i === 0 ? 'start' : i === days - 1 ? 'end' : 'middle'}">${points[i].label}</text>`)
    .join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of mood and energy over the last ${days} days">
      ${grid}${xLabels}
      <path d="${pathFor('energy')}" fill="none" stroke="#c9744f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
      <path d="${pathFor('mood')}" fill="none" stroke="#3f6b55" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots('energy', '#c9744f')}${dots('mood', '#3f6b55')}
    </svg>`;
}
