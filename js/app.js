import { DIMENSIONS, QUESTIONS, SCALE, STATES, TIERS, TIER_ADVICE, DIM_READING } from './data.js';

const $ = (id) => document.getElementById(id);
const HISTORY_KEY = 'heart-index-history-v1';
const PROGRESS_KEY = 'heart-index-progress-v1';
const THEME_KEY = 'heart-index-theme';

const app = {
  stateId: null,
  sceneId: null,
  index: 0,
  answers: new Array(QUESTIONS.length).fill(null),
  result: null,
  lastCardUrl: null,
};

let resumeState = null;

/* ---------------- 通用 ---------------- */

function show(pageId) {
  ['page-home', 'page-scene', 'page-quiz', 'page-loading', 'page-result'].forEach((id) => {
    $(id).classList.toggle('hidden', id !== pageId);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toastLayer').appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

function currentState() { return STATES.find((s) => s.id === app.stateId) || null; }

function currentScene() {
  const st = currentState();
  if (!st) return null;
  const i = st.scenes.findIndex((sc) => sc.id === app.sceneId);
  return i >= 0 ? { ...st.scenes[i], tierLabels: st.tierLabels[i], actions: st.actions[i] } : null;
}

/* ---------------- 首页 ---------------- */

function renderStates() {
  $('stateList').innerHTML = '';
  STATES.forEach((st) => {
    const btn = document.createElement('button');
    btn.className = 'state-card';
    btn.innerHTML = `<span class="emoji">${st.emoji}</span>
      <span class="name">${st.name}</span>
      <span class="sub">${st.sub}</span>`;
    btn.addEventListener('click', () => {
      app.stateId = st.id;
      renderScenes();
      show('page-scene');
    });
    $('stateList').appendChild(btn);
  });
}

function renderScenes() {
  const st = currentState();
  if (!st) return;
  $('sceneTitle').textContent = `${st.emoji} ${st.name} · 选一个场景`;
  $('sceneSub').textContent = '场景只影响解读文案，题目是一样的 30 道。';
  $('sceneList').innerHTML = '';
  st.scenes.forEach((sc) => {
    const btn = document.createElement('button');
    btn.className = 'scene-card';
    btn.innerHTML = `<span class="arrow">→</span>
      <div class="name">${sc.name}</div>
      <div class="tagline">${sc.tagline}</div>`;
    btn.addEventListener('click', () => startQuiz(sc.id));
    $('sceneList').appendChild(btn);
  });
}

/* ---------------- 答题 ---------------- */

function startQuiz(sceneId) {
  app.sceneId = sceneId;
  app.index = 0;
  app.answers = new Array(QUESTIONS.length).fill(null);
  saveProgress();
  renderQuestion();
  show('page-quiz');
}

function renderQuestion() {
  const q = QUESTIONS[app.index];
  const dim = DIMENSIONS.find((d) => d.id === q.dim);
  const picked = app.answers[app.index];

  $('quizCount').textContent = `${String(app.index + 1).padStart(2, '0')} / ${QUESTIONS.length}`;
  $('progressFill').style.width = `${((app.index) / QUESTIONS.length) * 100}%`;
  $('qKicker').textContent = `HEARTBEAT INDEX · ${dim.name}`;
  $('qText').textContent = q.text;
  $('quizBack').style.visibility = app.index === 0 ? 'hidden' : 'visible';

  const list = $('optionList');
  list.innerHTML = '';
  SCALE.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option' + (picked === i ? ' picked' : '');
    btn.style.animationDelay = `${i * 42}ms`;
    btn.innerHTML = `<span class="letter">${'ABCDE'[i]}</span><span>${opt.label}</span>`;
    btn.addEventListener('click', () => answer(i));
    list.appendChild(btn);
  });
}

function answer(optionIndex) {
  app.answers[app.index] = optionIndex;
  saveProgress();
  const picked = $('optionList').children[optionIndex];
  if (picked) picked.classList.add('picked');

  if (app.index === QUESTIONS.length - 1) {
    $('progressFill').style.width = '100%';
    setTimeout(finish, 220);
    return;
  }
  setTimeout(() => {
    app.index++;
    renderQuestion();
  }, 190);
}

function goBack() {
  if (app.index === 0) return;
  app.index--;
  renderQuestion();
}

/* ---------------- 计分 ---------------- */

function computeResult() {
  const dimTotals = {};
  const dimCounts = {};
  DIMENSIONS.forEach((d) => { dimTotals[d.id] = 0; dimCounts[d.id] = 0; });

  let rawSum = 0;
  QUESTIONS.forEach((q, i) => {
    const raw = app.answers[i] ?? 0;
    const value = q.reverse ? (SCALE.length - 1 - raw) : raw;
    dimTotals[q.dim] += value;
    dimCounts[q.dim] += 1;
    rawSum += value;
  });

  const dims = DIMENSIONS.map((d) => ({
    ...d,
    value: dimCounts[d.id] ? dimTotals[d.id] / (dimCounts[d.id] * (SCALE.length - 1)) : 0,
  }));

  const total = Math.round((rawSum / (QUESTIONS.length * (SCALE.length - 1))) * 100);
  const tierIndex = Math.max(0, TIERS.findIndex((t) => total <= t.max));
  const tier = TIERS[tierIndex === -1 ? TIERS.length - 1 : tierIndex];

  // 嘴硬指数：既等对方先动，又不太主动
  const reverseRaw = QUESTIONS.findIndex((q) => q.reverse);
  const waitScore = reverseRaw >= 0 ? (app.answers[reverseRaw] ?? 0) / (SCALE.length - 1) : 0;
  const activeDim = dims.find((d) => d.id === 'active');
  const hardheaded = Math.round((waitScore * 0.6 + (1 - (activeDim ? activeDim.value : 0.5)) * 0.4) * 100);

  const scene = currentScene();
  const state = currentState();
  return { total, tier, tierIndex, dims, hardheaded, scene, state };
}

function runLoading() {
  const steps = ['正在读取你的 30 个回答…', '计算五个维度的权重…', '匹配场景专属解读…', '正在生成你的心动报告…'];
  let i = 0;
  $('loadingFill').style.width = '0%';
  const timer = setInterval(() => {
    i++;
    $('loadingText').textContent = steps[Math.min(i, steps.length - 1)];
    $('loadingFill').style.width = `${Math.min(100, (i / steps.length) * 100)}%`;
    if (i >= steps.length) clearInterval(timer);
  }, 420);
  return () => clearInterval(timer);
}

function finish() {
  app.result = computeResult();
  show('page-loading');
  const stop = runLoading();
  setTimeout(() => {
    stop();
    renderResult();
    show('page-result');
    saveHistory();
    clearProgress();
  }, 1750);
}

/* ---------------- 结果渲染 ---------------- */

function renderResult() {
  const r = app.result;
  const state = r.state;
  const scene = r.scene;

  $('resultTop').innerHTML = `
    <div class="kicker">HEARTBEAT INDEX</div>
    <h1>你的心动指数 <em>${r.total}</em></h1>
    <div class="sub">${state.emoji} ${state.name} · ${scene.name}<br />${scene.tagline}</div>`;

  // 分数环
  const circumference = 2 * Math.PI * 52;
  const ring = $('ringFg');
  ring.setAttribute('stroke-dasharray', String(circumference));
  ring.setAttribute('stroke-dashoffset', String(circumference));
  ring.style.stroke = r.tier.color;
  requestAnimationFrame(() => {
    ring.setAttribute('stroke-dashoffset', String(circumference * (1 - r.total / 100)));
  });
  animateNumber($('scoreNum'), r.total, 1200);

  $('tierInfo').innerHTML = `
    <div class="tier-badge" style="background:${r.tier.color}">${scene.tierLabels[r.tierIndex]}</div>
    <div class="tier-scene">心动强度 ${Math.round(r.dims[0].value * 100)} · 嘴硬指数 ${r.hardheaded}</div>
    <div class="tier-tagline">${r.tier.name}档 · 在「${scene.name}」这个场景下，你的状态是「${scene.tierLabels[r.tierIndex]}」。</div>`;

  // 雷达
  drawRadar(r.dims);
  $('dimList').innerHTML = r.dims.map((d) => `
    <div class="dim-row">
      <span class="name">${d.name}</span>
      <span class="track"><i data-w="${Math.round(d.value * 100)}"></i></span>
      <span class="val">${Math.round(d.value * 100)}</span>
    </div>`).join('');
  requestAnimationFrame(() => {
    $('dimList').querySelectorAll('i').forEach((el) => { el.style.width = el.dataset.w + '%'; });
  });

  const advice = TIER_ADVICE[state.id][r.tierIndex];
  const dimReadings = r.dims
    .filter((d) => d.value >= 0.66 || d.value <= 0.34)
    .slice(0, 2)
    .map((d) => DIM_READING[d.id][d.value >= 0.5 ? 'high' : 'low']);
  $('adviceText').textContent = [advice, ...dimReadings].join('\n\n');

  $('actionList').innerHTML = scene.actions.map((a) => `<li>${a}</li>`).join('');
}

function animateNumber(el, target, duration) {
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function radarPoints(dims, ratio) {
  const cx = 100;
  const cy = 100;
  const radius = 78;
  return dims.map((d, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / dims.length;
    const r = radius * d.value * ratio;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });
}

function drawRadar(dims) {
  const svg = $('radar');
  const cx = 100;
  const cy = 100;
  const radius = 78;
  const parts = [];

  // 网格
  [0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const pts = radarPoints(dims.map(() => ({ value: 1 })), ratio)
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    parts.push(`<polygon points="${pts}" fill="none" stroke="rgba(217,75,106,0.16)" stroke-width="1" />`);
  });

  // 轴线与标签
  dims.forEach((d, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / dims.length;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(217,75,106,0.14)" stroke-width="1" />`);
    const lx = cx + Math.cos(angle) * (radius + 20);
    const ly = cy + Math.sin(angle) * (radius + 16);
    parts.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="9.5" fill="currentColor" opacity="0.62">${d.name}</text>`);
  });

  parts.push('<polygon id="radarShape" fill="rgba(217,75,106,0.22)" stroke="#d94b6a" stroke-width="2" points="" />');
  svg.innerHTML = `<defs>
      <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#d94b6a" /><stop offset="100%" stop-color="#e8825f" />
      </linearGradient>
    </defs>` + parts.join('');

  const shape = svg.querySelector('#radarShape');
  const t0 = performance.now();
  const animate = (now) => {
    const t = Math.min(1, (now - t0) / 900);
    const eased = 1 - Math.pow(1 - t, 3);
    shape.setAttribute('points', radarPoints(dims, eased).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
    if (t < 1) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

/* ---------------- 分享卡片 ---------------- */

function buildCardImage() {
  const r = app.result;
  const W = 900;
  const H = 1400;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fdf3f4');
  bg.addColorStop(0.55, '#fbe9ea');
  bg.addColorStop(1, '#f7e2e6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 120, 20, W / 2, 120, 560);
  glow.addColorStop(0, 'rgba(217,75,106,0.26)');
  glow.addColorStop(1, 'rgba(217,75,106,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 700);

  // 卡片底板
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  roundRect(ctx, 50, 200, W - 100, 1000, 40);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8b6b75';
  ctx.font = '600 20px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('HEARTBEAT INDEX', W / 2, 150);

  ctx.fillStyle = '#2b1f26';
  ctx.font = '900 40px "Songti SC", "Noto Serif SC", serif';
  ctx.fillText('心动指数', W / 2, 300);

  // 大分数
  ctx.fillStyle = r.tier.color;
  ctx.font = '900 190px "Songti SC", "Noto Serif SC", serif';
  ctx.fillText(String(r.total), W / 2, 500);

  ctx.fillStyle = '#8b6b75';
  ctx.font = '500 22px "PingFang SC", sans-serif';
  ctx.fillText(`${r.state.name} · ${r.scene.name}`, W / 2, 560);

  // 档位徽章
  const badge = r.scene.tierLabels[r.tierIndex];
  ctx.font = '700 30px "PingFang SC", sans-serif';
  const bw = ctx.measureText(badge).width + 70;
  ctx.fillStyle = r.tier.color;
  roundRect(ctx, W / 2 - bw / 2, 600, bw, 64, 32);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(badge, W / 2, 644);

  // 迷你雷达
  const cx = W / 2;
  const cy = 860;
  const radius = 120;
  ctx.strokeStyle = 'rgba(217,75,106,0.18)';
  ctx.lineWidth = 1;
  [0.5, 1].forEach((ratio) => {
    ctx.beginPath();
    r.dims.forEach((d, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / r.dims.length;
      const x = cx + Math.cos(angle) * radius * ratio;
      const y = cy + Math.sin(angle) * radius * ratio;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  });
  ctx.beginPath();
  r.dims.forEach((d, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / r.dims.length;
    const x = cx + Math.cos(angle) * radius * d.value;
    const y = cy + Math.sin(angle) * radius * d.value;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(217,75,106,0.24)';
  ctx.fill();
  ctx.strokeStyle = '#d94b6a';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#8b6b75';
  ctx.font = '500 18px "PingFang SC", sans-serif';
  r.dims.forEach((d, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / r.dims.length;
    const x = cx + Math.cos(angle) * (radius + 34);
    const y = cy + Math.sin(angle) * (radius + 30);
    ctx.fillText(d.name, x, y);
  });

  // 关键结论
  ctx.textAlign = 'left';
  ctx.fillStyle = '#4a3a41';
  ctx.font = '500 22px "PingFang SC", sans-serif';
  const lines = [
    `心动强度 ${Math.round(r.dims[0].value * 100)} · 投入 ${Math.round(r.dims[1].value * 100)} · 安全感 ${Math.round(r.dims[2].value * 100)}`,
    `主动 ${Math.round(r.dims[3].value * 100)} · 未来想象 ${Math.round(r.dims[4].value * 100)} · 嘴硬指数 ${r.hardheaded}`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, 110, 1075 + i * 38));

  ctx.textAlign = 'center';
  ctx.fillStyle = '#a58f98';
  ctx.font = '500 19px "PingFang SC", sans-serif';
  ctx.fillText('30 道题 · 5 个维度 · 12 种场景', W / 2, 1180);

  ctx.fillStyle = '#b09aa3';
  ctx.font = '500 21px "PingFang SC", sans-serif';
  ctx.fillText('心动指数 · 测你对 TA 的真实在意', W / 2, 1290);
  ctx.fillStyle = '#c4b0b8';
  ctx.font = '400 17px "PingFang SC", sans-serif';
  ctx.fillText('仅供自我觉察，不作为心理诊断依据', W / 2, 1325);

  return canvas.toDataURL('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function showCard() {
  const url = buildCardImage();
  app.lastCardUrl = url;
  $('cardImage').src = url;
  $('cardDownload').href = url;
  $('cardSheet').classList.remove('hidden');
}

/* ---------------- 记录 ---------------- */

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
}

function saveHistory() {
  const r = app.result;
  const list = loadHistory();
  list.unshift({
    ts: Date.now(),
    score: r.total,
    tier: r.scene.tierLabels[r.tierIndex],
    state: r.state.name,
    scene: r.scene.name,
    color: r.tier.color,
    dims: r.dims.map((d) => Math.round(d.value * 100)),
  });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30))); } catch (e) { /* 忽略 */ }
}

function renderHistory() {
  const list = loadHistory();
  if (!list.length) {
    $('historyBody').innerHTML = '<p class="dim center">还没有记录，测一次就会存下来。</p>';
    return;
  }
  $('historyBody').innerHTML = list.map((h) => {
    const d = new Date(h.ts);
    const when = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `<div class="hist-item">
      <div class="hist-score" style="color:${h.color || '#d94b6a'}">${h.score}</div>
      <div class="hist-meta">
        <div class="t">${h.tier} · ${h.state} · ${h.scene}</div>
        <div class="d">${when}${h.dims ? ' · 五维 ' + h.dims.join('/') : ''}</div>
      </div>
    </div>`;
  }).join('');
}

/* ---------------- 进度保存 ---------------- */

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      stateId: app.stateId, sceneId: app.sceneId, index: app.index, answers: app.answers,
    }));
  } catch (e) { /* 忽略 */ }
}

function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch (e) { /* 忽略 */ }
}

function maybeResume() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null'); } catch (e) { saved = null; }
  if (!saved || !saved.answers) return;
  const answered = saved.answers.filter((a) => a !== null).length;
  if (answered === 0) return;
  resumeState = {
    stateId: saved.stateId,
    sceneId: saved.sceneId,
    answers: saved.answers,
    index: Math.min(saved.index, QUESTIONS.length - 1),
  };
  $('startBtn').textContent = `继续上次测试（已完成 ${answered}/${QUESTIONS.length}）`;
}

/* ---------------- 事件绑定 ---------------- */

function bind() {
  $('startBtn').addEventListener('click', () => {
    if (resumeState) {
      app.stateId = resumeState.stateId;
      app.sceneId = resumeState.sceneId;
      app.answers = resumeState.answers.slice();
      app.index = resumeState.index;
      resumeState = null;
      renderQuestion();
      show('page-quiz');
      return;
    }
    if (app.stateId) {
      startQuiz(app.sceneId);
    } else {
      toast('先选一个你们现在的状态');
      $('stateList').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  $('sceneBack').addEventListener('click', () => show('page-home'));
  $('quizBack').addEventListener('click', goBack);
  $('againBtn').addEventListener('click', () => {
    clearProgress();
    app.stateId = null;
    app.sceneId = null;
    app.answers = new Array(QUESTIONS.length).fill(null);
    app.index = 0;
    $('startBtn').textContent = '开始测试';
    show('page-home');
  });
  $('cardBtn').addEventListener('click', showCard);
  $('copyBtn').addEventListener('click', copyResult);
  $('historyBtn').addEventListener('click', () => {
    renderHistory();
    $('historySheet').classList.remove('hidden');
  });
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => $(btn.dataset.close).classList.add('hidden'));
  });
  $('themeBtn').addEventListener('click', toggleTheme);

  document.addEventListener('keydown', (e) => {
    if ($('page-quiz').classList.contains('hidden')) return;
    if (e.key >= '1' && e.key <= '5') answer(Number(e.key) - 1);
    if (e.key === 'ArrowLeft' || e.key === 'Backspace') goBack();
  });
}

async function copyResult() {
  const r = app.result;
  const text = [
    `我的心动指数：${r.total}（${r.scene.tierLabels[r.tierIndex]}）`,
    `场景：${r.state.name} · ${r.scene.name}`,
    `心动 ${Math.round(r.dims[0].value * 100)} · 投入 ${Math.round(r.dims[1].value * 100)} · 安全感 ${Math.round(r.dims[2].value * 100)} · 主动 ${Math.round(r.dims[3].value * 100)} · 未来 ${Math.round(r.dims[4].value * 100)}`,
    `嘴硬指数：${r.hardheaded}`,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('结果已复制');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('结果已复制');
  }
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', cur);
  try { localStorage.setItem(THEME_KEY, cur); } catch (e) { /* 忽略 */ }
  toast(cur === 'dark' ? '已切换到深色' : '已切换到浅色');
}

/* ---------------- 启动 ---------------- */

function init() {
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { savedTheme = null; }
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', savedTheme || (prefersDark ? 'dark' : 'light'));

  renderStates();
  bind();
  maybeResume();
}

init();
