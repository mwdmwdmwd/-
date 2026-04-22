const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const stageInfoEl = document.getElementById('stageInfo');
const scoreInfoEl = document.getElementById('scoreInfo');
const itemLevelInfoEl = document.getElementById('itemLevelInfo');
const fusionInfoEl = document.getElementById('fusionInfo');
const pauseBtn = document.getElementById('pauseBtn');
const shopBtn = document.getElementById('shopBtn');
const heartCountEl = document.getElementById('heartCount');
const statusBtn = document.getElementById('statusBtn');
const overlayEl = document.getElementById('overlay');

const W = canvas.width;
const H = canvas.height;
const STORAGE_KEY = 'yumi_brick_breaker_stage_shop_v7';

const THEMES = [
  { top: '#1e1b4b', bottom: '#0f172a', block: '#f472b6', number: '#fbcfe8', boss: '#fb7185', accent: '#f9a8d4', line: '#fdf2f8' },
  { top: '#082f49', bottom: '#0f172a', block: '#38bdf8', number: '#bae6fd', boss: '#60a5fa', accent: '#7dd3fc', line: '#e0f2fe' },
  { top: '#312e81', bottom: '#0f172a', block: '#a78bfa', number: '#ddd6fe', boss: '#c084fc', accent: '#c4b5fd', line: '#f5f3ff' },
  { top: '#3f1d2e', bottom: '#0f172a', block: '#fb7185', number: '#fecdd3', boss: '#f97316', accent: '#fda4af', line: '#fff1f2' },
  { top: '#1f2937', bottom: '#0f172a', block: '#f8fafc', number: '#cbd5e1', boss: '#f59e0b', accent: '#fde68a', line: '#ffffff' }
];

const BRICK = {
  cols: 8,
  gap: 4,
  height: 20,
  top: 38,
};
BRICK.width = Math.floor((W - 8 - BRICK.gap * (BRICK.cols - 1)) / BRICK.cols);
BRICK.left = 4;
const ROW_STEP = BRICK.height + BRICK.gap;
const START_ROWS = 6;
const BASE_PADDLE = { width: 92, height: 13, y: H - 96 };
const BALL_RADIUS = 7;
const BASE_BALL_SPEED = 5.2;
const LOVE_DELAY = 3000;
const LASER_INTERVAL = 7000;
const MISSILE_INTERVAL = 380;
const MAX_STAGE_ROW_INTERVAL = 8000;
const CORE_ITEM_STAGES = new Set([1, 2, 4, 8]);

const save = loadSave();
const state = {
  stage: 1,
  score: 0,
  totalLove: save.totalLove || 0,
  runLove: 0,
  destroyedThisStage: 0,
  destroyedTotal: 0,
  status: 'start', // start, playing, paused, shop, status, choose, love, gameover1, gameover2
  previousStatus: 'start',
  rowTimer: 0,
  lastTime: 0,
  bossStage: false,
  bossSpawnAnim: 0,
  bossHp: 0,
  bossMaxHp: 0,
  hearts: save.hearts || 0,
  comboTextUntil: 0,
  comboText: '',
  overlaysLocked: false,
  particles: [],
  floatingTexts: [],
  missiles: [],
  beams: [],
  lastVerticalAt: 0,
  lastHorizontalAt: 0,
  lastMissileAt: 0,
  pauseRequested: false,
  loveUntil: 0,
  gameOverTapCount: 0,
  selectedCoreUntil: 0,
  shopOffers: [],
  itemLevels: {
    triangle: 0,
    long: 0,
    vlaser: 0,
    hlaser: 0,
  },
  upgrades: {
    crit: save.upgrades?.crit || 0,
    attack: save.upgrades?.attack || 0,
    split: save.upgrades?.split || 0,
    bomb: save.upgrades?.bomb || 0,
    magnet: save.upgrades?.magnet || 0,
    speed: save.upgrades?.speed || 0,
    leftDrone: save.upgrades?.leftDrone || 0,
    rightDrone: save.upgrades?.rightDrone || 0,
  },
};

const paddle = {
  x: W / 2 - BASE_PADDLE.width / 2,
  y: BASE_PADDLE.y,
  width: BASE_PADDLE.width,
  height: BASE_PADDLE.height,
};

let bricks = [];
let balls = [];
let drones = [];

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function persistSave() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    totalLove: state.totalLove,
    hearts: state.hearts,
    upgrades: state.upgrades,
  }));
}

function theme() {
  return THEMES[Math.floor((state.stage - 1) / 10) % THEMES.length];
}

function nowMs() { return performance.now(); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rand(min, max) { return min + Math.random() * (max - min); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function coreSpawnScheduled(stage) {
  return CORE_ITEM_STAGES.has(stage) || (stage > 8 && (stage - 8) % 8 === 0);
}

function mainFusionText() {
  const i = state.itemLevels;
  if (i.vlaser > 0 && i.hlaser > 0) return '융합: 십자 번개';
  if (i.triangle > 0 && i.long > 0) return '융합: 와이드 스플릿';
  if (i.triangle > 0) return '융합: 스플릿';
  if (i.long > 0) return '융합: 와이드';
  if (i.vlaser > 0) return '융합: 세로 번개';
  if (i.hlaser > 0) return '융합: 가로 번개';
  return '융합 없음';
}

function coreLevelText() {
  const entries = [];
  if (state.itemLevels.triangle) entries.push(`세모 Lv.${state.itemLevels.triangle}`);
  if (state.itemLevels.long) entries.push(`패들 Lv.${state.itemLevels.long}`);
  if (state.itemLevels.vlaser) entries.push(`세로 Lv.${state.itemLevels.vlaser}`);
  if (state.itemLevels.hlaser) entries.push(`가로 Lv.${state.itemLevels.hlaser}`);
  return entries.length ? entries.join(' · ') : '코어 없음';
}

function attackPower() { return 1 + state.upgrades.attack * 0.25; }
function critChance() { return state.upgrades.crit * 0.05; }
function splitChance() { return state.upgrades.split * 0.03; }
function ballSpeed() { return BASE_BALL_SPEED + state.upgrades.speed * 0.5; }
function magnetCapacity() { return state.upgrades.magnet; }
function longMultiplier() {
  const lv = state.itemLevels.long;
  if (lv <= 0) return 1;
  return 1 + lv;
}
function splitCountForLevel() {
  const lv = state.itemLevels.triangle;
  if (lv <= 0) return 0;
  return lv + 1; // 2,3,4
}
function lightningCount(lv) {
  if (lv <= 0) return 0;
  return lv * 2;
}
function dronePower(side) {
  const v = side === 'left' ? state.upgrades.leftDrone : state.upgrades.rightDrone;
  return v * 0.5;
}

function rowIntervalMs() {
  const bucket = Math.floor((state.stage - 1) / 10);
  if (bucket === 0) return 20000;
  const interval = 15000 - (bucket - 1) * 1000;
  return Math.max(MAX_STAGE_ROW_INTERVAL, interval);
}

function currentNumberBlockPlan() {
  if (state.stage === 1) return { hp: 1, count: 0 };
  const cycleIndex = state.stage - 2;
  return {
    hp: 2 + Math.floor(cycleIndex / 6),
    count: Math.min(BRICK.cols, 1 + (cycleIndex % 6)),
  };
}

function addFloatingText(text, x, y, color = '#ffffff', size = 16) {
  state.floatingTexts.push({ text, x, y, color, size, until: nowMs() + 900 });
}

function addParticles(x, y, color, count = 12, speed = 2.4) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const s = rand(0.4, speed);
    state.particles.push({ x, y, vx: Math.cos(angle) * s, vy: Math.sin(angle) * s, size: rand(2, 4), color, until: nowMs() + rand(300, 700) });
  }
}

function makeBall(x, y, angle = -Math.PI / 2) {
  const speed = ballSpeed();
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: BALL_RADIUS,
    held: false,
    paddleHits: 0,
    skipSplitUntil: 0,
  };
}

function resetPaddle() {
  paddle.width = BASE_PADDLE.width * longMultiplier();
  paddle.height = BASE_PADDLE.height;
  paddle.x = clamp(paddle.x, 0, W - paddle.width);
}

function syncHeldBalls() {
  const held = balls.filter((b) => b.held);
  if (!held.length) return;
  const center = paddle.x + paddle.width / 2;
  const spread = Math.min(10, paddle.width / 6);
  held.forEach((ball, idx) => {
    const offset = (idx - (held.length - 1) / 2) * spread;
    ball.x = center + offset;
    ball.y = paddle.y - 10;
    ball.vx = 0;
    ball.vy = 0;
  });
}

function launchHeldBalls(targetX, targetY) {
  const held = balls.filter((b) => b.held);
  if (!held.length) return;
  let dx = targetX - (paddle.x + paddle.width / 2);
  let dy = targetY - paddle.y;
  if (dy > -30) dy = -30;
  const baseAngle = Math.atan2(dy, dx);
  const fan = held.length > 1 ? Math.min(Math.PI / 3, held.length * 0.08) : 0;
  held.forEach((ball, idx) => {
    const offset = held.length > 1 ? (-fan / 2) + (fan * idx) / (held.length - 1) : 0;
    ball.held = false;
    const speed = ballSpeed();
    ball.vx = Math.cos(baseAngle + offset) * speed;
    ball.vy = Math.sin(baseAngle + offset) * speed;
  });
  state.status = 'playing';
}

function createBrick(col, row, type = 'normal', hp = 1) {
  const x = BRICK.left + col * (BRICK.width + BRICK.gap);
  const y = BRICK.top + row * ROW_STEP;
  return {
    x,
    y,
    col,
    row,
    width: BRICK.width,
    height: BRICK.height,
    type,
    hp,
    maxHp: hp,
  };
}

function allBlocksCleared() {
  return bricks.every((b) => b.destroyed || b.type === 'boss');
}

function createStageRows() {
  bricks = [];
  resetPaddle();
  const heartRowCandidate = coreSpawnScheduled(state.stage) ? Math.floor(rand(0, 5)) : -1;
  const heartColCandidate = coreSpawnScheduled(state.stage) ? Math.floor(rand(0, BRICK.cols)) : -1;
  const numberPlan = currentNumberBlockPlan();
  const protectedCols = new Set();
  if (numberPlan.count > 0) {
    while (protectedCols.size < numberPlan.count) protectedCols.add(Math.floor(rand(0, BRICK.cols)));
  }
  for (let r = 0; r < START_ROWS; r += 1) {
    for (let c = 0; c < BRICK.cols; c += 1) {
      let type = 'normal';
      let hp = 1;
      if (r === heartRowCandidate && c === heartColCandidate) {
        type = 'heart';
      } else if (protectedCols.has(c) && r >= START_ROWS - 2) {
        type = 'number';
        hp = numberPlan.hp;
      }
      bricks.push(createBrick(c, r, type, hp));
    }
  }
}

function createBossStage() {
  bricks = [];
  const hp = state.stage + 10;
  state.bossMaxHp = hp;
  state.bossHp = hp;
  state.bossSpawnAnim = 3 * ROW_STEP;
  bricks.push({
    x: BRICK.left,
    y: BRICK.top - state.bossSpawnAnim,
    width: W - 8,
    height: BRICK.height * 3 + BRICK.gap * 2,
    type: 'boss',
    hp,
    maxHp: hp,
    destroyed: false,
  });
}

function initStage() {
  state.rowTimer = 0;
  state.bossStage = state.stage % 10 === 0;
  state.destroyedThisStage = 0;
  if (state.bossStage) createBossStage();
  else createStageRows();
  if (!balls.length) {
    balls = [makeBall(paddle.x + paddle.width / 2, paddle.y - 12)];
    balls[0].held = true;
  }
  syncHeldBalls();
  updateHUD();
}

function fullReset() {
  state.stage = 1;
  state.score = 0;
  state.runLove = 0;
  state.destroyedThisStage = 0;
  state.destroyedTotal = 0;
  state.status = 'start';
  state.previousStatus = 'start';
  state.lastVerticalAt = nowMs();
  state.lastHorizontalAt = nowMs();
  state.lastMissileAt = nowMs();
  state.gameOverTapCount = 0;
  state.shopOffers = [];
  state.itemLevels = { triangle: 0, long: 0, vlaser: 0, hlaser: 0 };
  state.upgrades = { ...save.upgrades, ...state.upgrades };
  bricks = [];
  balls = [];
  state.particles = [];
  state.floatingTexts = [];
  state.missiles = [];
  state.beams = [];
  paddle.x = W / 2 - BASE_PADDLE.width / 2;
  resetPaddle();
  initStage();
}

function updateHUD() {
  stageInfoEl.textContent = `STAGE ${state.stage}`;
  scoreInfoEl.textContent = `점수 ${state.score} · ${state.destroyedThisStage}/20`;
  itemLevelInfoEl.textContent = coreLevelText();
  fusionInfoEl.textContent = mainFusionText();
  heartCountEl.textContent = state.hearts;
  shopBtn.classList.toggle('disabled', state.hearts < 5);
}

function openOverlay(html) {
  overlayEl.innerHTML = html;
  overlayEl.classList.remove('hidden');
}
function closeOverlay() {
  overlayEl.classList.add('hidden');
  overlayEl.innerHTML = '';
}

function showStartOverlay() {
  state.status = 'start';
  openOverlay(`
    <div class="modal">
      <h2>탭해서 시작</h2>
      <p>20개를 부수면 다음 스테이지로 넘어가고, 10스테이지마다 보스 행이 내려온다.</p>
      <div class="cards cols-2">
        <div class="card"><h3>하트 상점</h3><div class="desc">왼쪽 아래 ♥ 버튼으로 5/10/15 하트 카드 중 하나를 고를 수 있어.</div></div>
        <div class="card"><h3>코어 아이템</h3><div class="desc">특정 스테이지의 하트 블록을 깨면 세모, 긴 패들, 세로/가로 번개 중 하나를 선택할 수 있어.</div></div>
      </div>
      <div class="actions"><button id="startRunBtn" class="primary-btn" style="flex:1">시작</button></div>
    </div>
  `);
  document.getElementById('startRunBtn').onclick = () => {
    closeOverlay();
    state.status = 'playing';
  };
}

function showGameOverOverlay() {
  state.status = 'gameover1';
  state.gameOverTapCount = 0;
  openOverlay(`
    <div class="modal center-note">
      <h2>게임 오버</h2>
      <p>당신은 유미에게 <strong>${state.runLove}번</strong> 사랑한다고 말했습니다!</p>
      <p>한 번 탭해서 계속.</p>
    </div>
  `);
}

function advanceGameOverTap() {
  if (state.status === 'gameover1') {
    state.status = 'gameover2';
    openOverlay(`
      <div class="modal center-note">
        <h2>더 많이 사랑을 고백해보세요!</h2>
        <p>한 번 더 탭하면 처음으로 돌아갑니다.</p>
      </div>
    `);
    return;
  }
  if (state.status === 'gameover2') {
    closeOverlay();
    fullReset();
    showStartOverlay();
  }
}

function showPauseOverlay() {
  state.previousStatus = state.status;
  state.status = 'paused';
  openOverlay(`
    <div class="modal center-note">
      <h2>일시정지</h2>
      <p>왼쪽 아래 ♥ 상점, 오른쪽 아래 상태 버튼도 사용할 수 있어.</p>
      <div class="actions">
        <button id="resumeBtn" class="primary-btn" style="flex:1">계속</button>
      </div>
    </div>
  `);
  document.getElementById('resumeBtn').onclick = () => {
    closeOverlay();
    state.status = 'playing';
  };
}

function shopPool() {
  return [
    { key: 'crit', cost: 5, title: '치명타 +5%', desc: '공의 치명타 확률이 5% 증가', apply: () => state.upgrades.crit += 1 },
    { key: 'attack', cost: 5, title: '공격력 +0.25', desc: '공격력이 0.25 증가', apply: () => state.upgrades.attack += 1 },
    { key: 'split', cost: 5, title: '분열 +3%', desc: '공이 블록에 맞을 때 3% 확률로 자가 분열', apply: () => state.upgrades.split += 1 },
    { key: 'bomb', cost: 10, title: '폭탄', desc: '패들에 5번 이상 맞은 공이 주변 블록에 2 데미지 폭발', apply: () => state.upgrades.bomb += 1 },
    { key: 'magnet', cost: 10, title: '자석', desc: '패들에 붙여둘 수 있는 공 +1', apply: () => state.upgrades.magnet += 1 },
    { key: 'speed', cost: 10, title: '속도 +0.5', desc: '공 기본 속도 +0.5', apply: () => state.upgrades.speed += 1 },
    { key: 'leftDrone', cost: 15, title: '뿅뿅이', desc: '왼쪽 하트 드론 공격력 +0.5', apply: () => state.upgrades.leftDrone += 1 },
    { key: 'rightDrone', cost: 15, title: '뾱뾱이', desc: '오른쪽 하트 드론 공격력 +0.5', apply: () => state.upgrades.rightDrone += 1 },
  ];
}

function makeShopOffers() {
  const costs = [5, 10, 15].map(() => choice([5, 10, 15]));
  const pool = shopPool();
  return costs.map((cost) => choice(pool.filter((p) => p.cost === cost)));
}

function showShopOverlay() {
  state.previousStatus = state.status;
  state.status = 'shop';
  state.shopOffers = makeShopOffers();
  openOverlay(`
    <div class="modal">
      <h2>하트 상점</h2>
      <p>하트를 써서 능력치를 올려. 하트가 부족한 카드는 선택할 수 없어.</p>
      <div class="cards cols-3" id="shopCards"></div>
      <div class="actions"><button id="closeShopBtn" class="ghost-btn" style="flex:1">닫기</button></div>
    </div>
  `);
  const wrap = document.getElementById('shopCards');
  state.shopOffers.forEach((offer, idx) => {
    const disabled = state.hearts < offer.cost;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div>
        <div class="cost">${offer.cost} ♥</div>
        <h3>${offer.title}</h3>
        <div class="desc">${offer.desc}</div>
      </div>
      <button class="${disabled ? 'disabled' : ''}" ${disabled ? 'disabled' : ''}>선택</button>
    `;
    card.querySelector('button').onclick = () => {
      if (state.hearts < offer.cost) return;
      state.hearts -= offer.cost;
      offer.apply();
      persistSave();
      closeOverlay();
      state.status = 'paused';
      updateHUD();
      showPauseOverlay();
    };
    wrap.appendChild(card);
  });
  document.getElementById('closeShopBtn').onclick = () => {
    closeOverlay();
    state.status = 'paused';
    showPauseOverlay();
  };
}

function showStatusOverlay() {
  state.previousStatus = state.status;
  state.status = 'status';
  openOverlay(`
    <div class="modal">
      <h2>현재 능력치</h2>
      <div class="kv"><span>공격력</span><strong>${attackPower().toFixed(2)}</strong></div>
      <div class="kv"><span>치명타</span><strong>${Math.round(critChance() * 100)}%</strong></div>
      <div class="kv"><span>자가 분열</span><strong>${Math.round(splitChance() * 100)}%</strong></div>
      <div class="kv"><span>공 속도</span><strong>${ballSpeed().toFixed(1)}</strong></div>
      <div class="kv"><span>폭탄 공</span><strong>${state.upgrades.bomb > 0 ? '활성' : '없음'}</strong></div>
      <div class="kv"><span>자석 용량</span><strong>${magnetCapacity()}</strong></div>
      <div class="kv"><span>왼쪽 드론</span><strong>${dronePower('left').toFixed(1)}</strong></div>
      <div class="kv"><span>오른쪽 드론</span><strong>${dronePower('right').toFixed(1)}</strong></div>
      <div class="kv"><span>세모</span><strong>Lv.${state.itemLevels.triangle}</strong></div>
      <div class="kv"><span>긴 패들</span><strong>Lv.${state.itemLevels.long}</strong></div>
      <div class="kv"><span>세로 번개</span><strong>Lv.${state.itemLevels.vlaser}</strong></div>
      <div class="kv"><span>가로 번개</span><strong>Lv.${state.itemLevels.hlaser}</strong></div>
      <div class="kv"><span>융합 상태</span><strong>${mainFusionText().replace('융합: ', '')}</strong></div>
      <div class="actions"><button id="closeStatusBtn" class="primary-btn" style="flex:1">닫기</button></div>
    </div>
  `);
  document.getElementById('closeStatusBtn').onclick = () => {
    closeOverlay();
    state.status = state.previousStatus === 'playing' ? 'playing' : 'paused';
  };
}

function showCoreChoice() {
  state.previousStatus = state.status;
  state.status = 'choose';
  const pool = [
    { key: 'triangle', title: '세모', desc: 'Lv1: 2분할 · Lv2: 3분할 · Lv3: 4분할' },
    { key: 'long', title: '긴 패들', desc: 'Lv1: 2배 · Lv2: 3배 · Lv3: 4배 길이' },
    { key: 'vlaser', title: '세로 번개', desc: '7초마다 랜덤 열 공격 · Lv1 2줄 / Lv2 4줄 / Lv3 6줄' },
    { key: 'hlaser', title: '가로 번개', desc: '7초마다 랜덤 행 공격 · Lv1 2줄 / Lv2 4줄 / Lv3 6줄' },
  ];
  const offers = pool.sort(() => Math.random() - 0.5).slice(0, 3);
  openOverlay(`
    <div class="modal">
      <h2>하트 블록 보상</h2>
      <p>코어 아이템 하나를 고를 수 있어.</p>
      <div class="cards cols-3" id="coreCards"></div>
    </div>
  `);
  const wrap = document.getElementById('coreCards');
  offers.forEach((offer) => {
    const currentLv = state.itemLevels[offer.key];
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div>
        <div class="cost">현재 Lv.${currentLv}</div>
        <h3>${offer.title}</h3>
        <div class="desc">${offer.desc}</div>
      </div>
      <button>선택</button>
    `;
    card.querySelector('button').onclick = () => {
      state.itemLevels[offer.key] = Math.min(3, state.itemLevels[offer.key] + 1);
      resetPaddle();
      closeOverlay();
      state.status = 'playing';
      updateHUD();
    };
    wrap.appendChild(card);
  });
}

function movePaddle(clientX) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  paddle.x = clamp((clientX - rect.left) * scaleX - paddle.width / 2, 0, W - paddle.width);
  syncHeldBalls();
}

function pointerPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function circleRectCollision(ball, rect) {
  const closestX = clamp(ball.x, rect.x, rect.x + rect.width);
  const closestY = clamp(ball.y, rect.y, rect.y + rect.height);
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  return dx * dx + dy * dy <= ball.r * ball.r;
}

function stageAdvance() {
  state.stage += 1;
  initStage();
  updateHUD();
  addFloatingText(`STAGE ${state.stage}`, W / 2, H / 2, theme().accent, 22);
}

function registerDestroyed(brick) {
  if (brick.type === 'boss') return;
  state.score += 1;
  state.destroyedThisStage += 1;
  state.destroyedTotal += 1;
  if (state.destroyedThisStage >= 20) {
    stageAdvance();
  }
}

function destroyBrick(brick, silent = false) {
  if (brick.destroyed) return;
  brick.destroyed = true;
  if (!silent) registerDestroyed(brick);
  if (!silent) {
    addParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.type === 'heart' ? '#fb7185' : theme().accent, 10);
  }
  if (brick.type === 'heart' && !silent) {
    state.hearts += 1;
    persistSave();
    updateHUD();
    showCoreChoice();
  }
  if (brick.type === 'boss') {
    state.runLove += 1;
    state.totalLove += 1;
    persistSave();
    state.loveUntil = nowMs() + LOVE_DELAY;
    state.status = 'love';
    openOverlay(`
      <div class="modal center-note">
        <div class="big-love">유미야 사랑해!</div>
        <p>3초 뒤 다음 스테이지로 이어집니다.</p>
      </div>
    `);
  }
}

function damageBrick(brick, amount, isBeam = false) {
  if (brick.destroyed) return;
  brick.hp -= amount;
  if (brick.type === 'boss') state.bossHp = Math.max(0, brick.hp);
  if (brick.hp <= 0) {
    destroyBrick(brick);
  } else if (!isBeam) {
    addFloatingText(`-${amount % 1 === 0 ? amount : amount.toFixed(2)}`, brick.x + brick.width / 2, brick.y + 8, '#fff', 12);
  }
}

function critDamage(base) {
  return Math.random() < critChance() ? base * 2 : base;
}

function findBrickAtGrid(col, row) {
  return bricks.find((b) => !b.destroyed && b.type !== 'boss' && b.col === col && b.row === row);
}

function explosionAt(col, row) {
  for (let r = row - 1; r <= row + 1; r += 1) {
    for (let c = col - 1; c <= col + 1; c += 1) {
      const target = findBrickAtGrid(c, r);
      if (target) damageBrick(target, 2, true);
    }
  }
}

function splitBall(ball, totalCount) {
  if (nowMs() < ball.skipSplitUntil) return [ball];
  const speed = Math.max(3, Math.hypot(ball.vx, ball.vy));
  const spread = Math.PI / 2;
  const out = [];
  for (let i = 0; i < totalCount; i += 1) {
    const t = totalCount === 1 ? 0 : i / (totalCount - 1);
    const angle = -Math.PI / 2 - spread / 2 + spread * t;
    out.push({
      x: ball.x,
      y: ball.y - 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: BALL_RADIUS,
      held: false,
      paddleHits: ball.paddleHits,
      skipSplitUntil: nowMs() + 350,
    });
  }
  addParticles(ball.x, ball.y, theme().accent, 14, 3.5);
  return out;
}

function spawnSelfSplit(ball) {
  const speed = Math.max(3, Math.hypot(ball.vx, ball.vy));
  const angle = Math.atan2(ball.vy, ball.vx) + rand(-0.5, 0.5);
  balls.push({
    x: ball.x,
    y: ball.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: BALL_RADIUS,
    held: false,
    paddleHits: 0,
    skipSplitUntil: nowMs() + 350,
  });
  addFloatingText('+분열', ball.x, ball.y, '#fde68a', 12);
}

function addNewRow() {
  bricks.filter((b) => !b.destroyed && b.type !== 'boss').forEach((b) => {
    b.row += 1;
    b.y += ROW_STEP;
  });
  const plan = currentNumberBlockPlan();
  const numberCols = new Set();
  while (numberCols.size < plan.count) numberCols.add(Math.floor(rand(0, BRICK.cols)));
  for (let c = 0; c < BRICK.cols; c += 1) {
    const type = numberCols.has(c) ? 'number' : 'normal';
    const hp = type === 'number' ? plan.hp : 1;
    bricks.push(createBrick(c, 0, type, hp));
  }
}

function randomUniqueIndexes(total, count) {
  const set = new Set();
  while (set.size < Math.min(total, count)) set.add(Math.floor(rand(0, total)));
  return [...set];
}

function fireVerticalLightning() {
  const count = lightningCount(state.itemLevels.vlaser);
  if (!count) return;
  const cols = randomUniqueIndexes(BRICK.cols, count);
  cols.forEach((col) => {
    state.beams.push({ type: 'v', x: BRICK.left + col * (BRICK.width + BRICK.gap) + BRICK.width / 2, y: BRICK.top, until: nowMs() + 220, color: '#60a5fa' });
    bricks.filter((b) => !b.destroyed && b.type !== 'boss' && b.col === col).forEach((brick) => damageBrick(brick, 1, true));
    const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
    if (boss) {
      const bx = boss.x + boss.width / 2;
      if (Math.abs((BRICK.left + col * (BRICK.width + BRICK.gap) + BRICK.width / 2) - bx) < boss.width / 2) damageBrick(boss, 1, true);
    }
  });
}

function fireHorizontalLightning() {
  const count = lightningCount(state.itemLevels.hlaser);
  if (!count) return;
  const rowCount = 14;
  const rows = randomUniqueIndexes(rowCount, count);
  rows.forEach((row) => {
    state.beams.push({ type: 'h', y: BRICK.top + row * ROW_STEP + BRICK.height / 2, until: nowMs() + 220, color: '#c084fc' });
    bricks.filter((b) => !b.destroyed && b.type !== 'boss' && b.row === row).forEach((brick) => damageBrick(brick, 1, true));
    const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
    if (boss) {
      const by = BRICK.top + row * ROW_STEP + BRICK.height / 2;
      if (by >= boss.y && by <= boss.y + boss.height) damageBrick(boss, 1, true);
    }
  });
}

function updateDrones(dt) {
  const now = nowMs();
  if (now - state.lastMissileAt < MISSILE_INTERVAL) return;
  state.lastMissileAt = now;
  const powerLeft = dronePower('left');
  const powerRight = dronePower('right');
  const sweep = Math.sin(now / 400) * (Math.PI / 4);
  if (powerLeft > 0) {
    state.missiles.push({ x: paddle.x + paddle.width / 2 - 24, y: paddle.y - 20, vx: Math.cos(-Math.PI / 2 + sweep) * 4.4, vy: Math.sin(-Math.PI / 2 + sweep) * 4.4, dmg: powerLeft, color: '#fb7185' });
  }
  if (powerRight > 0) {
    state.missiles.push({ x: paddle.x + paddle.width / 2 + 24, y: paddle.y - 20, vx: Math.cos(-Math.PI / 2 - sweep) * 4.4, vy: Math.sin(-Math.PI / 2 - sweep) * 4.4, dmg: powerRight, color: '#f9a8d4' });
  }
}

function updateMissiles(dt) {
  for (const m of state.missiles) {
    m.x += m.vx;
    m.y += m.vy;
    for (const brick of bricks) {
      if (brick.destroyed) continue;
      if (m.x >= brick.x && m.x <= brick.x + brick.width && m.y >= brick.y && m.y <= brick.y + brick.height) {
        damageBrick(brick, m.dmg, true);
        m.dead = true;
        addParticles(m.x, m.y, m.color, 6);
        break;
      }
    }
  }
  state.missiles = state.missiles.filter((m) => !m.dead && m.x >= -20 && m.x <= W + 20 && m.y >= -20 && m.y <= H + 20);
}

function handleBallBrickCollision(ball) {
  for (const brick of bricks) {
    if (brick.destroyed) continue;
    const rect = { x: brick.x, y: brick.y, width: brick.width, height: brick.height };
    if (!circleRectCollision(ball, rect)) continue;

    const overlapLeft = Math.abs(ball.x + ball.r - brick.x);
    const overlapRight = Math.abs(brick.x + brick.width - (ball.x - ball.r));
    const overlapTop = Math.abs(ball.y + ball.r - brick.y);
    const overlapBottom = Math.abs(brick.y + brick.height - (ball.y - ball.r));
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
    if (minOverlap === overlapLeft || minOverlap === overlapRight) ball.vx *= -1;
    else ball.vy *= -1;

    const dmg = critDamage(attackPower());
    damageBrick(brick, dmg);
    if (state.upgrades.bomb > 0 && ball.paddleHits >= 5 && brick.type !== 'boss') {
      explosionAt(brick.col, brick.row);
      addFloatingText('폭탄!', brick.x + brick.width / 2, brick.y, '#fbbf24', 14);
    }
    if (Math.random() < splitChance()) spawnSelfSplit(ball);
    return true;
  }
  return false;
}

function updateBossAnimation(dt) {
  const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
  if (!boss || state.bossSpawnAnim <= 0) return;
  state.bossSpawnAnim = Math.max(0, state.bossSpawnAnim - dt * 0.12);
  boss.y = BRICK.top + ROW_STEP - state.bossSpawnAnim;
}

function updateBalls(dt) {
  const next = [];
  const heldCount = balls.filter((b) => b.held).length;
  for (const ball of balls) {
    if (ball.held) {
      next.push(ball);
      continue;
    }
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x - ball.r <= 0) { ball.x = ball.r; ball.vx *= -1; }
    if (ball.x + ball.r >= W) { ball.x = W - ball.r; ball.vx *= -1; }
    if (ball.y - ball.r <= 0) { ball.y = ball.r; ball.vy *= -1; }

    const triSplitCount = splitCountForLevel();
    const triZone = triSplitCount > 0 ? {
      x: paddle.x,
      y: paddle.y - 24,
      width: paddle.width,
      height: 24 + paddle.height,
    } : null;

    if (triZone && circleRectCollision(ball, triZone) && ball.vy > 0) {
      next.push(...splitBall(ball, triSplitCount));
      continue;
    }

    const paddleRect = { x: paddle.x, y: paddle.y, width: paddle.width, height: paddle.height };
    if (circleRectCollision(ball, paddleRect) && ball.vy > 0) {
      if (magnetCapacity() > 0 && balls.filter((b) => b.held).length < magnetCapacity()) {
        ball.held = true;
        next.push(ball);
        syncHeldBalls();
        continue;
      }
      const hit = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
      const angle = hit * (Math.PI / 3);
      const speed = ballSpeed();
      ball.vx = Math.sin(angle) * speed;
      ball.vy = -Math.abs(Math.cos(angle) * speed);
      ball.y = paddle.y - ball.r - 1;
      ball.paddleHits += 1;
      next.push(ball);
      continue;
    }

    handleBallBrickCollision(ball);
    if (ball.y - ball.r <= H + 20) next.push(ball);
  }
  balls = next;
  if (!balls.length) triggerGameOver();
}

function triggerGameOver() {
  if (state.status === 'gameover1' || state.status === 'gameover2') return;
  persistSave();
  showGameOverOverlay();
}

function updateRows(dt) {
  state.rowTimer += dt;
  if (state.rowTimer >= rowIntervalMs()) {
    state.rowTimer = 0;
    if (!state.bossStage) addNewRow();
  }
}

function updateAbilities(dt) {
  const now = nowMs();
  if (state.itemLevels.vlaser > 0 && now - state.lastVerticalAt >= LASER_INTERVAL) {
    state.lastVerticalAt = now;
    fireVerticalLightning();
  }
  if (state.itemLevels.hlaser > 0 && now - state.lastHorizontalAt >= LASER_INTERVAL) {
    state.lastHorizontalAt = now;
    fireHorizontalLightning();
  }
  updateDrones(dt);
}

function updateEffects(dt) {
  const now = nowMs();
  state.beams = state.beams.filter((b) => b.until > now);
  state.floatingTexts = state.floatingTexts.filter((t) => t.until > now);
  state.particles = state.particles.filter((p) => p.until > now);
  state.particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.98;
    p.vy *= 0.98;
  });
  updateMissiles(dt);
}

function checkDanger() {
  if (bricks.some((b) => !b.destroyed && b.type !== 'boss' && b.y + b.height >= paddle.y - 6)) {
    triggerGameOver();
  }
}

function update(dt) {
  if (state.status === 'love') {
    if (nowMs() >= state.loveUntil) {
      closeOverlay();
      state.stage += 1;
      balls = balls.length ? balls : [makeBall(paddle.x + paddle.width / 2, paddle.y - 12)];
      balls.forEach((b) => { b.held = true; b.paddleHits = 0; });
      initStage();
      state.status = 'playing';
    }
    return;
  }
  if (state.status !== 'playing') return;

  updateBossAnimation(dt);
  updateRows(dt);
  updateAbilities(dt);
  updateBalls(dt);
  updateEffects(dt);
  syncHeldBalls();
  checkDanger();
  updateHUD();
}

function drawBackground() {
  const t = theme();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, t.top);
  grad.addColorStop(1, t.bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < H; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function roundRect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function drawBricks() {
  const t = theme();
  for (const brick of bricks) {
    if (brick.destroyed) continue;
    if (brick.type === 'boss') {
      roundRect(brick.x, brick.y, brick.width, brick.height, 14, t.boss, 'rgba(255,255,255,0.25)');
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`BOSS ${Math.ceil(brick.hp)}`, brick.x + brick.width / 2, brick.y + brick.height / 2 + 6);
      continue;
    }
    let fill = t.block;
    let stroke = 'rgba(255,255,255,0.12)';
    if (brick.type === 'number') fill = t.number;
    if (brick.type === 'heart') fill = '#fb7185';
    roundRect(brick.x, brick.y, brick.width, brick.height, 6, fill, stroke);
    ctx.textAlign = 'center';
    if (brick.type === 'heart') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('♥', brick.x + brick.width / 2, brick.y + brick.height / 2 + 5);
    } else if (brick.type === 'number') {
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(String(Math.ceil(brick.hp)), brick.x + brick.width / 2, brick.y + brick.height / 2 + 5);
    }
  }
}

function drawPaddle() {
  roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 7, '#ffffff', null);
  if (state.itemLevels.triangle > 0) {
    ctx.fillStyle = theme().accent;
    ctx.beginPath();
    ctx.moveTo(paddle.x + paddle.width / 2, paddle.y - 24);
    ctx.lineTo(paddle.x + paddle.width / 2 - 18, paddle.y);
    ctx.lineTo(paddle.x + paddle.width / 2 + 18, paddle.y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBalls() {
  balls.forEach((ball) => {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
  });
}

function drawDrones() {
  const leftPower = dronePower('left');
  const rightPower = dronePower('right');
  if (leftPower > 0) {
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(paddle.x + paddle.width / 2 - 24, paddle.y - 20, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('♥', paddle.x + paddle.width / 2 - 24, paddle.y - 17);
  }
  if (rightPower > 0) {
    ctx.fillStyle = '#f9a8d4';
    ctx.beginPath();
    ctx.arc(paddle.x + paddle.width / 2 + 24, paddle.y - 20, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('♥', paddle.x + paddle.width / 2 + 24, paddle.y - 17);
  }
}

function drawMissiles() {
  state.missiles.forEach((m) => {
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x - m.vx * 2, m.y - m.vy * 2);
    ctx.stroke();
  });
}

function drawBeams() {
  state.beams.forEach((beam) => {
    ctx.strokeStyle = beam.color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    if (beam.type === 'v') {
      ctx.moveTo(beam.x, BRICK.top - 8);
      ctx.lineTo(beam.x, paddle.y + 18);
    } else {
      ctx.moveTo(0, beam.y);
      ctx.lineTo(W, beam.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

function drawParticles() {
  state.particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, (p.until - nowMs()) / 700);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

function drawFloatingTexts() {
  state.floatingTexts.forEach((t) => {
    ctx.globalAlpha = Math.max(0, (t.until - nowMs()) / 900);
    ctx.fillStyle = t.color;
    ctx.font = `bold ${t.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(t.text, t.x, t.y - ((900 - (t.until - nowMs())) / 45));
  });
  ctx.globalAlpha = 1;
}

function drawBossBar() {
  if (!state.bossStage) return;
  const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
  if (!boss) return;
  const x = 42;
  const y = 12;
  const w = W - 84;
  roundRect(x, y, w, 12, 6, 'rgba(255,255,255,0.12)', null);
  const ratio = clamp(boss.hp / boss.maxHp, 0, 1);
  roundRect(x, y, w * ratio, 12, 6, theme().boss, null);
}

function drawOverlayHints() {
  if (state.status === 'start') return;
  if (state.status === 'playing' && balls.every((b) => b.held)) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('탭해서 발사', W / 2, H / 2 - 10);
  }
}

function draw() {
  drawBackground();
  drawBeams();
  drawBricks();
  drawMissiles();
  drawPaddle();
  drawDrones();
  drawBalls();
  drawParticles();
  drawFloatingTexts();
  drawBossBar();
  drawOverlayHints();
}

function handleTap(clientX, clientY) {
  const pos = pointerPos(clientX, clientY);
  if (state.status === 'gameover1' || state.status === 'gameover2') {
    advanceGameOverTap();
    return;
  }
  if (state.status === 'start') {
    closeOverlay();
    state.status = 'playing';
    return;
  }
  if (balls.some((b) => b.held)) {
    launchHeldBalls(pos.x, pos.y);
  }
}

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  movePaddle(t.clientX);
  handleTap(t.clientX, t.clientY);
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  movePaddle(e.touches[0].clientX);
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  movePaddle(e.clientX);
  handleTap(e.clientX, e.clientY);
});
canvas.addEventListener('mousemove', (e) => {
  if (e.buttons === 1) movePaddle(e.clientX);
});

pauseBtn.onclick = () => {
  if (state.status === 'playing') showPauseOverlay();
  else if (state.status === 'paused') {
    closeOverlay();
    state.status = 'playing';
  }
};
shopBtn.onclick = () => {
  if (state.hearts < 5 || ['choose', 'love', 'gameover1', 'gameover2', 'start'].includes(state.status)) return;
  showShopOverlay();
};
statusBtn.onclick = () => {
  if (['choose', 'love', 'gameover1', 'gameover2', 'start'].includes(state.status)) return;
  showStatusOverlay();
};

overlayEl.addEventListener('click', (e) => {
  if (e.target === overlayEl && state.status === 'paused') {
    closeOverlay();
    state.status = 'playing';
  }
});

function loop(ts) {
  if (!state.lastTime) state.lastTime = ts;
  const dt = ts - state.lastTime;
  state.lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

fullReset();
showStartOverlay();
requestAnimationFrame(loop);
