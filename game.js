const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const activeEl = document.getElementById('activeItem');
const timerEl = document.getElementById('itemTimer');
const loveEl = document.getElementById('loveCount');
const totalLoveEl = document.getElementById('totalLoveCount');
const pauseBtn = document.getElementById('pauseBtn');

const W = canvas.width;
const H = canvas.height;

const STORAGE_KEY = 'yumi_brick_breaker_save_v3';

const THEMES = [
  { name: 'forest', bgTop: '#0f172a', bgBottom: '#111827', brick: '#22c55e', accent: '#38bdf8', boss: '#f59e0b', love: '#f472b6' },
  { name: 'rose', bgTop: '#3b0764', bgBottom: '#1e1b4b', brick: '#fb7185', accent: '#f9a8d4', boss: '#f97316', love: '#fda4af' },
  { name: 'ocean', bgTop: '#082f49', bgBottom: '#172554', brick: '#38bdf8', accent: '#67e8f9', boss: '#60a5fa', love: '#93c5fd' },
  { name: 'sunset', bgTop: '#451a03', bgBottom: '#7c2d12', brick: '#f97316', accent: '#fdba74', boss: '#facc15', love: '#fde68a' },
  { name: 'violet', bgTop: '#2e1065', bgBottom: '#1e293b', brick: '#a78bfa', accent: '#c4b5fd', boss: '#e879f9', love: '#f0abfc' }
];

const COLORS = {
  paddle: '#ffffff',
  whiteBrick: '#ffffff',
  lockBrick: '#9ca3af',
  bombBrick: '#ef4444',
  heartBrick: '#ec4899',
  ball: '#fbbf24',
  text: '#ffffff'
};

const BRICK = {
  cols: 8,
  width: 41,
  height: 20,
  gap: 6,
  left: 12,
  top: 92
};
const ROW_STEP = BRICK.height + BRICK.gap;
const BASE_PADDLE = { width: 96, height: 14, y: H - 58 };
const BALL_RADIUS = 7;
const BASE_BALL_SPEED = 5.2;
const ITEM_DURATION = 10000;
const WHITE_RESPAWN_RATE = 0.36;
const ROW_FILL_RATE = 0.88;
const LOVE_DELAY = 3000;
const COMBO_WINDOW = 900;

let saveData = loadSave();

const game = {
  score: 0,
  level: 1,
  bestScore: saveData.bestScore || 0,
  bestLevel: saveData.bestLevel || 1,
  totalLove: saveData.totalLove || 0,
  runLove: 0,
  maxBalls: saveData.maxBalls || 1,
  status: 'start', // start, playing, paused, love, gameover1, gameover2
  previousStatus: 'start',
  rowTimer: 0,
  lastTime: 0,
  lastBrickBreakAt: 0,
  combo: 0,
  comboUntil: 0,
  loveMessageUntil: 0,
  shakeUntil: 0,
  overlayPulse: 0,
  stageType: 'normal',
  bossHp: 0,
  bossMaxHp: 0,
  activeItem: null,
  floatingTexts: [],
  particles: []
};

const paddle = {
  x: W / 2 - BASE_PADDLE.width / 2,
  y: BASE_PADDLE.y,
  width: BASE_PADDLE.width,
  height: BASE_PADDLE.height
};

let balls = [];
let bricks = [];
let items = [];

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function persistSave() {
  const payload = {
    bestScore: game.bestScore,
    bestLevel: game.bestLevel,
    totalLove: game.totalLove,
    maxBalls: game.maxBalls
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function themeIndex() {
  return Math.floor((game.level - 1) / 10) % THEMES.length;
}

function currentTheme() {
  return THEMES[themeIndex()];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function nowMs() {
  return performance.now();
}

function currentBallSpeed() {
  return BASE_BALL_SPEED + (game.level - 1) * 0.28;
}

function effectFlags() {
  return game.activeItem?.effects || {};
}

function paddleBounceSpeed() {
  const mult = effectFlags().speedMult || 1;
  return currentBallSpeed() * mult;
}
function applySpeedMultiplierTransition(oldMult = 1, newMult = 1) {
  if (!oldMult || oldMult <= 0) oldMult = 1;
  if (!newMult || newMult <= 0) newMult = 1;
  const ratio = newMult / oldMult;
  if (Math.abs(ratio - 1) < 0.001) return;
  for (const ball of balls) {
    if (ball.held) continue;
    ball.vx *= ratio;
    ball.vy *= ratio;
  }
}


function createBall(x, y, vx = 0, vy = 0, held = false) {
  return {
    x,
    y,
    vx,
    vy,
    radius: BALL_RADIUS,
    held,
    splitCooldownUntil: 0
  };
}

function createBrick(x, y, type = 'green') {
  const brick = {
    x,
    y,
    width: BRICK.width,
    height: BRICK.height,
    type,
    hp: 1,
    maxHp: 1,
    row: Math.round((y - BRICK.top) / ROW_STEP),
    col: Math.round((x - BRICK.left) / (BRICK.width + BRICK.gap))
  };

  if (type === 'white') {
    brick.hp = 3;
    brick.maxHp = 3;
  }
  if (type === 'lock') {
    brick.hp = 4;
    brick.maxHp = 4;
  }
  if (type === 'boss') {
    brick.width = W - 90;
    brick.height = 48;
    brick.x = (W - brick.width) / 2;
    brick.y = 150;
    brick.hp = 18 + Math.floor(game.level / 2);
    brick.maxHp = brick.hp;
    game.bossHp = brick.hp;
    game.bossMaxHp = brick.maxHp;
  }
  return brick;
}

function comboValue() {
  return Math.min(8, Math.max(1, game.combo));
}

function addFloatingText(text, x, y, color = '#ffffff', size = 18) {
  game.floatingTexts.push({
    text,
    x,
    y,
    color,
    size,
    until: nowMs() + 900
  });
}

function addParticles(x, y, color, count = 10) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 3,
      color,
      life: 500 + Math.random() * 300,
      createdAt: nowMs()
    });
  }
}

function startShake(duration = 220) {
  game.shakeUntil = Math.max(game.shakeUntil, nowMs() + duration);
}

function effectDescriptorFromTypes(types) {
  const sorted = [...types].sort().join('+');
  const map = {
    triangle: { label: '세모', effects: { triangle: true, splitCount: 2, splitSpeedMult: 1 } },
    bowl: { label: '그릇', effects: { bowl: true } },
    thick: { label: '두꺼운 패들', effects: { thick: true, speedMult: 1.5 } },
    long: { label: '긴 패들', effects: { long: true } },
    'long+triangle': { label: '세모+긴 패들', effects: { triangle: true, long: true, splitCount: 3, splitSpeedMult: 1 } },
    'thick+triangle': { label: '세모+두꺼운 패들', effects: { triangle: true, thick: true, splitCount: 2, splitSpeedMult: 1.22, speedMult: 1.7 } },
    'bowl+triangle': { label: '그릇+세모', effects: { bowl: true, triangle: true, bowlSpread: true, splitCount: 2, splitSpeedMult: 1 } },
    heart: { label: '하트', effects: { slow: true, speedMult: 0.5 } },
    'long+thick': { label: '롱+두꺼운 패들', effects: { long: true, thick: true, speedMult: 1.6 } }
  };
  return map[sorted] || map[types[types.length - 1]];
}

function setActiveItem(types, resetTimer = true) {
  const oldMult = game.activeItem?.effects?.speedMult || 1;
  const descriptor = effectDescriptorFromTypes(types);
  game.activeItem = {
    label: descriptor.label,
    types: [...types],
    effects: descriptor.effects,
    expiresAt: resetTimer ? nowMs() + ITEM_DURATION : (game.activeItem?.expiresAt || (nowMs() + ITEM_DURATION))
  };
  const newMult = descriptor.effects?.speedMult || 1;
  applySpeedMultiplierTransition(oldMult, newMult);
  resetPaddleGeometry();
  syncHeldBallsOnPaddle();
}

function clearActiveItem() {
  const oldMult = effectFlags().speedMult || 1;
  if (effectFlags().bowl) {
    releaseHeldBallsUpward();
  }
  game.activeItem = null;
  applySpeedMultiplierTransition(oldMult, 1);
  resetPaddleGeometry();
}

function resetPaddleGeometry() {
  const fx = effectFlags();
  paddle.width = BASE_PADDLE.width * (fx.long ? 2 : 1);
  paddle.height = BASE_PADDLE.height * (fx.thick ? 2.1 : 1);
  paddle.x = clamp(paddle.x, 0, W - paddle.width);
}

function syncHeldBallsOnPaddle() {
  const cx = paddle.x + paddle.width / 2;
  const y = effectFlags().bowl ? paddle.y - paddle.height / 2 - 10 : paddle.y - BALL_RADIUS - 2;
  for (const ball of balls) {
    if (ball.held) {
      ball.x = cx;
      ball.y = y;
      ball.vx = 0;
      ball.vy = 0;
    }
  }
}

function updateHud() {
  scoreEl.textContent = `점수: ${game.score}`;
  levelEl.textContent = `레벨: ${game.level}`;
  loveEl.textContent = `이번 고백: ${game.runLove}`;
  totalLoveEl.textContent = `총 고백: ${game.totalLove}`;

  if (game.activeItem) {
    activeEl.textContent = `장착: ${game.activeItem.label}`;
    const remain = Math.max(0, Math.ceil((game.activeItem.expiresAt - nowMs()) / 1000));
    timerEl.textContent = `남은 시간: ${remain}s`;
  } else {
    activeEl.textContent = '장착: 없음';
    timerEl.textContent = '남은 시간: -';
  }

  pauseBtn.textContent = game.status === 'paused' ? '▶' : '❚❚';
}

function getRowSpawnInterval() {
  return Math.max(1300, 7000 - (game.level - 1) * 360);
}

function maybeLevelUp() {
  const nextLevel = Math.floor(game.score / 30) + 1;
  if (nextLevel !== game.level) {
    game.level = nextLevel;
    if (game.level > game.bestLevel) {
      game.bestLevel = game.level;
      persistSave();
    }
    addFloatingText(`LEVEL ${game.level}!`, W / 2, 140, currentTheme().accent, 28);
  }
}

function movePaddleTo(clientX) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const canvasX = (clientX - rect.left) * scaleX;
  paddle.x = clamp(canvasX - paddle.width / 2, 0, W - paddle.width);
  syncHeldBallsOnPaddle();
}

function getPointerCanvasPosition(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function launchHeldBalls(targetX, targetY) {
  const heldBalls = balls.filter((ball) => ball.held);
  if (!heldBalls.length) return;

  let dx = targetX - (paddle.x + paddle.width / 2);
  let dy = targetY - paddle.y;
  if (dy > -20) dy = -20;
  const len = Math.hypot(dx, dy) || 1;
  const speed = currentBallSpeed();
  const baseVx = (dx / len) * speed;
  const baseVy = (dy / len) * speed;

  const fx = effectFlags();
  if (fx.bowlSpread) {
    const angles = [-0.28, 0, 0.28];
    balls = [];
    for (let i = 0; i < heldBalls.length; i += 1) {
      for (const offset of angles) {
        const angle = Math.atan2(baseVy, baseVx) + offset;
        balls.push(createBall(
          paddle.x + paddle.width / 2,
          paddle.y - paddle.height / 2 - 10,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          false
        ));
      }
    }
  } else {
    for (const ball of heldBalls) {
      ball.held = false;
      ball.vx = baseVx;
      ball.vy = baseVy;
    }
  }

  game.maxBalls = Math.max(game.maxBalls, balls.length);
  persistSave();
  game.status = 'playing';
}

function releaseHeldBallsUpward() {
  const heldBalls = balls.filter((ball) => ball.held);
  if (!heldBalls.length) return;
  const speed = currentBallSpeed();
  for (const ball of heldBalls) {
    ball.held = false;
    ball.vx = 0;
    ball.vy = -speed;
  }
  game.status = 'playing';
}

function bowlBounds() {
  const width = Math.min(92, Math.max(62, paddle.width * 0.72));
  return {
    x: paddle.x + paddle.width / 2 - width / 2,
    y: paddle.y - 18,
    width,
    height: 22
  };
}

function triangleBounds() {
  const width = effectFlags().long ? 60 : 46;
  const height = 28;
  return { cx: paddle.x + paddle.width / 2, top: paddle.y - height, width, height };
}

function spawnItem(x, y) {
  items.push({
    x,
    y,
    vy: 2.2,
    size: 18,
    type: randomChoice(['triangle', 'bowl', 'thick', 'long', 'heart'])
  });
}

function removeBottomRows(count = 2) {
  const rows = [...new Set(bricks.map((brick) => brick.y))].sort((a, b) => b - a).slice(0, count);
  const removed = bricks.filter((brick) => rows.includes(brick.y));
  bricks = bricks.filter((brick) => !rows.includes(brick.y));
  for (const brick of removed) {
    addParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, currentTheme().accent, 8);
  }
}

function activateItem(type) {
  const activeTypes = game.activeItem?.types || [];
  const samePickup = activeTypes.includes(type);

  if (samePickup) {
    removeBottomRows(2);
    addFloatingText('같은 아이템! 아래 2줄 삭제!', W / 2, H - 120, currentTheme().accent, 18);
    if (game.activeItem) {
      game.activeItem.expiresAt = nowMs() + ITEM_DURATION;
    }
  } else if (activeTypes.length === 1) {
    const merged = effectDescriptorFromTypes([activeTypes[0], type]);
    if (merged && !['세모','그릇','두꺼운 패들','긴 패들','하트'].includes(merged.label)) {
      setActiveItem([activeTypes[0], type], true);
      addFloatingText('융합!', W / 2, H - 120, '#f59e0b', 22);
    } else {
      setActiveItem([type], true);
    }
  } else {
    setActiveItem([type], true);
  }

  if (type === 'heart') {
    addFloatingText('하트! 공 속도 절반', W / 2, H - 120, COLORS.heartBrick, 20);
  }

  resetPaddleGeometry();
  syncHeldBallsOnPaddle();
}

function circleRectCollision(ball, rect) {
  const closestX = clamp(ball.x, rect.x, rect.x + rect.width);
  const closestY = clamp(ball.y, rect.y, rect.y + rect.height);
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  return dx * dx + dy * dy <= ball.radius * ball.radius;
}

function spawnNormalStage() {
  bricks = [];
  game.stageType = game.level % 10 === 0 ? 'boss' : 'normal';

  if (game.stageType === 'boss') {
    bricks.push(createBrick(0, 0, 'boss'));
    bricks.push(createBrick(BRICK.left + 1 * (BRICK.width + BRICK.gap), 240, 'lock'));
    bricks.push(createBrick(BRICK.left + 6 * (BRICK.width + BRICK.gap), 240, 'lock'));
    bricks.push(createBrick(BRICK.left + 0 * (BRICK.width + BRICK.gap), 266, 'heart'));
    bricks.push(createBrick(BRICK.left + 7 * (BRICK.width + BRICK.gap), 266, 'bomb'));
    return;
  }

  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < BRICK.cols; c += 1) {
      const x = BRICK.left + c * (BRICK.width + BRICK.gap);
      const y = BRICK.top + r * ROW_STEP;
      const roll = Math.random();
      let type = 'green';
      if (roll < 0.06) type = 'heart';
      else if (roll < 0.12) type = 'bomb';
      else if (roll < 0.18 && game.level >= 3) type = 'lock';
      bricks.push(createBrick(x, y, type));
    }
  }
}

function resetBallsToPaddle(ballCount = 1) {
  balls = [];
  for (let i = 0; i < ballCount; i += 1) {
    balls.push(createBall(paddle.x + paddle.width / 2, paddle.y - BALL_RADIUS - 2, 0, 0, true));
  }
  syncHeldBallsOnPaddle();
  game.maxBalls = Math.max(game.maxBalls, ballCount);
  persistSave();
}

function fullReset() {
  game.score = 0;
  game.level = 1;
  game.runLove = 0;
  game.status = 'start';
  game.previousStatus = 'start';
  game.rowTimer = 0;
  game.lastBrickBreakAt = 0;
  game.combo = 0;
  game.comboUntil = 0;
  game.loveMessageUntil = 0;
  game.activeItem = null;
  game.floatingTexts = [];
  game.particles = [];
  items = [];
  paddle.x = W / 2 - BASE_PADDLE.width / 2;
  resetPaddleGeometry();
  spawnNormalStage();
  resetBallsToPaddle(1);
  updateHud();
}

function prepareNextLoveCycle() {
  const count = Math.max(1, balls.length);
  items = [];
  spawnNormalStage();
  resetBallsToPaddle(count);
  game.status = 'start';
  updateHud();
}

function onAllBricksCleared() {
  if (game.status === 'love') return;
  game.runLove += 1;
  game.totalLove += 1;
  game.bestScore = Math.max(game.bestScore, game.score);
  game.bestLevel = Math.max(game.bestLevel, game.level);
  persistSave();
  addFloatingText('유미야 사랑해!', W / 2, H / 2, currentTheme().love, 32);
  game.loveMessageUntil = nowMs() + LOVE_DELAY;
  game.status = 'love';
  updateHud();
}

function endingMessage() {
  const n = game.runLove;
  if (n <= 2) return '아직 수줍은 마음입니다.';
  if (n <= 9) return '조금씩 진심이 전해지고 있습니다.';
  if (n <= 29) return '유미도 눈치챘을지도 몰라요.';
  return '이제 숨길 수 없는 사랑입니다.';
}

function triggerGameOver() {
  if (game.status === 'gameover1' || game.status === 'gameover2') return;
  game.bestScore = Math.max(game.bestScore, game.score);
  game.bestLevel = Math.max(game.bestLevel, game.level);
  persistSave();
  game.status = 'gameover1';
  updateHud();
}

function removeBrick(brick, options = {}) {
  bricks = bricks.filter((b) => b !== brick);

  if (!options.noScore) {
    const time = nowMs();
    if (time - game.lastBrickBreakAt <= COMBO_WINDOW) {
      game.combo += 1;
    } else {
      game.combo = 1;
    }
    game.lastBrickBreakAt = time;
    game.comboUntil = time + COMBO_WINDOW;
    const gained = comboValue();
    game.score += gained;
    addFloatingText(`+${gained}`, brick.x + brick.width / 2, brick.y, '#ffffff', 16);
    if (game.combo >= 2) {
      addFloatingText(`콤보 x${comboValue()}`, brick.x + brick.width / 2, brick.y - 18, currentTheme().accent, 16);
    }
    maybeLevelUp();
  }

  const centerX = brick.x + brick.width / 2;
  const centerY = brick.y + brick.height / 2;
  const color = brick.type === 'green' ? currentTheme().brick : brick.type === 'heart' ? COLORS.heartBrick : brick.type === 'bomb' ? COLORS.bombBrick : brick.type === 'lock' ? COLORS.lockBrick : currentTheme().accent;
  addParticles(centerX, centerY, color, brick.type === 'boss' ? 28 : 12);

  if (brick.type === 'green' && !options.noSpawn && Math.random() < WHITE_RESPAWN_RATE) {
    const occupied = bricks.some((b) => b.x === brick.x && b.y === brick.y);
    if (!occupied) bricks.push(createBrick(brick.x, brick.y, 'white'));
  }

  if (brick.type === 'white' && !options.noSpawn) {
    spawnItem(centerX, centerY);
  }

  if (brick.type === 'heart') {
    game.runLove += 1;
    game.totalLove += 1;
    persistSave();
    addFloatingText('사랑 +1', centerX, centerY - 18, COLORS.heartBrick, 18);
  }

  if (brick.type === 'bomb' && !options.fromBomb) {
    explodeBomb(brick);
  }

  if (brick.type === 'boss') {
    game.bossHp = 0;
    addFloatingText('보스 격파!', W / 2, 120, currentTheme().accent, 30);
    startShake(420);
  }

  updateHud();

  if (bricks.length === 0) {
    onAllBricksCleared();
  }
}

function explodeBomb(sourceBrick) {
  startShake(280);
  const cx = sourceBrick.x + sourceBrick.width / 2;
  const cy = sourceBrick.y + sourceBrick.height / 2;
  const victims = bricks.filter((brick) => {
    if (brick === sourceBrick) return false;
    const bx = brick.x + brick.width / 2;
    const by = brick.y + brick.height / 2;
    return Math.hypot(bx - cx, by - cy) < 75;
  });
  for (const victim of victims) {
    removeBrick(victim, { noSpawn: victim.type === 'white', noScore: false, fromBomb: true });
  }
}

function handleBrickCollision(ball) {
  for (const brick of bricks) {
    if (!circleRectCollision(ball, brick)) continue;

    const overlapLeft = Math.abs(ball.x + ball.radius - brick.x);
    const overlapRight = Math.abs(brick.x + brick.width - (ball.x - ball.radius));
    const overlapTop = Math.abs(ball.y + ball.radius - brick.y);
    const overlapBottom = Math.abs(brick.y + brick.height - (ball.y - ball.radius));
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (minOverlap === overlapLeft || minOverlap === overlapRight) ball.vx *= -1;
    else ball.vy *= -1;

    brick.hp -= 1;
    if (brick.type === 'boss') {
      game.bossHp = brick.hp;
      addFloatingText(`-${1}`, brick.x + brick.width / 2, brick.y - 8, '#ffffff', 18);
    }

    if (brick.hp <= 0) {
      removeBrick(brick);
    } else {
      addParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, '#ffffff', 5);
    }
    return true;
  }
  return false;
}

function createSplitBalls(ball) {
  const fx = effectFlags();
  const splitCount = fx.splitCount || 2;
  const speed = Math.max(Math.hypot(ball.vx, ball.vy), currentBallSpeed()) * (fx.splitSpeedMult || 1);
  const result = [];
  let angles;

  if (splitCount === 3) angles = [-Math.PI / 3.4, -Math.PI / 2, -Math.PI / 1.7];
  else angles = [-Math.PI / 4, -3 * Math.PI / 4];

  for (const angle of angles) {
    const newBall = createBall(ball.x, ball.y - 2, Math.cos(angle) * speed, Math.sin(angle) * speed, false);
    newBall.splitCooldownUntil = nowMs() + 350;
    result.push(newBall);
  }
  game.maxBalls = Math.max(game.maxBalls, balls.length - 1 + result.length);
  persistSave();
  return result;
}

function handleTriangleCollision(ball) {
  const fx = effectFlags();
  if (!fx.triangle) return null;
  if (nowMs() < ball.splitCooldownUntil || ball.vy <= 0) return null;

  const tri = triangleBounds();
  const triangleZone = { x: tri.cx - tri.width / 2, y: tri.top, width: tri.width, height: tri.height };
  const paddleZone = { x: paddle.x, y: paddle.y, width: paddle.width, height: paddle.height };

  if (!circleRectCollision(ball, triangleZone) && !circleRectCollision(ball, paddleZone)) return null;
  return createSplitBalls(ball);
}

function handleBowlCatch(ball) {
  if (!effectFlags().bowl) return false;
  const bowl = bowlBounds();
  if (!circleRectCollision(ball, bowl) || ball.vy <= 0) return false;
  ball.held = true;
  ball.vx = 0;
  ball.vy = 0;
  syncHeldBallsOnPaddle();
  return true;
}

function handlePaddleBounce(ball) {
  const paddleRect = { x: paddle.x, y: paddle.y, width: paddle.width, height: paddle.height };
  if (!circleRectCollision(ball, paddleRect) || ball.vy <= 0) return null;

  if (handleBowlCatch(ball)) return { balls: [ball] };
  if (effectFlags().triangle) return { balls: createSplitBalls(ball) };

  const hit = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
  const angle = clamp(hit, -1, 1) * (Math.PI / 3);
  const speed = paddleBounceSpeed();
  ball.vx = speed * Math.sin(angle);
  ball.vy = -Math.abs(speed * Math.cos(angle));
  ball.y = paddle.y - ball.radius - 1;
  return { balls: [ball] };
}

function updateItems() {
  for (const item of items) item.y += item.vy;
  items = items.filter((item) => {
    const caught = item.y + item.size >= paddle.y && item.y - item.size <= paddle.y + paddle.height && item.x >= paddle.x && item.x <= paddle.x + paddle.width;
    if (caught) {
      activateItem(item.type);
      return false;
    }
    return item.y - item.size <= H + 30;
  });
}

function updateActiveItem() {
  if (!game.activeItem) return;
  if (nowMs() >= game.activeItem.expiresAt) {
    clearActiveItem();
  }
}

function addNewRow() {
  if (game.stageType === 'boss') return;
  for (const brick of bricks) brick.y += ROW_STEP;

  let created = 0;
  for (let c = 0; c < BRICK.cols; c += 1) {
    if (Math.random() < ROW_FILL_RATE || created < 2) {
      const x = BRICK.left + c * (BRICK.width + BRICK.gap);
      let type = 'green';
      const roll = Math.random();
      if (roll < 0.05) type = 'heart';
      else if (roll < 0.10) type = 'bomb';
      else if (roll < 0.16 && game.level >= 4) type = 'lock';
      bricks.push(createBrick(x, BRICK.top, type));
      created += 1;
    }
  }
}

function checkBrickFloorDanger() {
  const dangerLine = paddle.y - 8;
  if (bricks.some((brick) => brick.y + brick.height >= dangerLine)) triggerGameOver();
}

function updateBalls() {
  const nextBalls = [];

  for (const ball of balls) {
    if (ball.held) {
      nextBalls.push(ball);
      continue;
    }

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x - ball.radius <= 0) {
      ball.x = ball.radius;
      ball.vx *= -1;
    }
    if (ball.x + ball.radius >= W) {
      ball.x = W - ball.radius;
      ball.vx *= -1;
    }
    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.vy *= -1;
    }

    const splitBalls = handleTriangleCollision(ball);
    if (splitBalls) {
      nextBalls.push(...splitBalls);
      continue;
    }

    const bounce = handlePaddleBounce(ball);
    if (bounce) {
      nextBalls.push(...bounce.balls);
      continue;
    }

    handleBrickCollision(ball);

    if (ball.y - ball.radius <= H + 24) nextBalls.push(ball);
  }

  balls = nextBalls;
  game.maxBalls = Math.max(game.maxBalls, balls.length);

  if (!balls.some((ball) => ball.held) && !balls.some((ball) => !ball.held)) {
    triggerGameOver();
  }
}

function updateFloatingAndParticles() {
  const now = nowMs();
  game.floatingTexts = game.floatingTexts.filter((txt) => now <= txt.until);
  for (const txt of game.floatingTexts) txt.y -= 0.3;

  game.particles = game.particles.filter((p) => now - p.createdAt <= p.life);
  for (const p of game.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.02;
  }
}

function update(dt) {
  updateFloatingAndParticles();
  updateActiveItem();
  syncHeldBallsOnPaddle();

  if (game.status === 'love') {
    if (nowMs() >= game.loveMessageUntil) prepareNextLoveCycle();
    updateHud();
    return;
  }

  if (game.status !== 'playing') {
    updateHud();
    return;
  }

  game.rowTimer += dt;
  if (game.rowTimer >= getRowSpawnInterval()) {
    game.rowTimer = 0;
    addNewRow();
  }

  updateItems();
  updateBalls();
  checkBrickFloorDanger();
  updateHud();
}

function drawBackground() {
  const theme = currentTheme();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, theme.bgTop);
  grad.addColorStop(1, theme.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < H; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function roundRect(x, y, width, height, radius, fillStyle, strokeStyle = null) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

function drawBricks() {
  const theme = currentTheme();
  for (const brick of bricks) {
    let fill = theme.brick;
    let stroke = 'rgba(255,255,255,0.08)';
    if (brick.type === 'white') fill = COLORS.whiteBrick;
    if (brick.type === 'lock') fill = COLORS.lockBrick;
    if (brick.type === 'bomb') fill = COLORS.bombBrick;
    if (brick.type === 'heart') fill = COLORS.heartBrick;
    if (brick.type === 'boss') fill = theme.boss;

    roundRect(brick.x, brick.y, brick.width, brick.height, brick.type === 'boss' ? 16 : 6, fill, stroke);

    if (brick.type === 'white' || brick.type === 'lock') {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(brick.hp), brick.x + brick.width / 2, brick.y + brick.height / 2 + 5);
    }

    if (brick.type === 'bomb') {
      ctx.fillStyle = '#fff7ed';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('B', brick.x + brick.width / 2, brick.y + brick.height / 2 + 5);
    }
    if (brick.type === 'heart') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('♥', brick.x + brick.width / 2, brick.y + brick.height / 2 + 5);
    }
    if (brick.type === 'boss') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('사랑의 장벽', brick.x + brick.width / 2, brick.y + 30);
    }
  }
}

function drawItems() {
  const accent = currentTheme().accent;
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = 3;

  for (const item of items) {
    if (item.type === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(item.x, item.y - 16);
      ctx.lineTo(item.x - 14, item.y + 10);
      ctx.lineTo(item.x + 14, item.y + 10);
      ctx.closePath();
      ctx.fill();
    } else if (item.type === 'bowl') {
      ctx.beginPath();
      ctx.arc(item.x, item.y, 16, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(item.x - 15, item.y + 5);
      ctx.lineTo(item.x + 15, item.y + 5);
      ctx.stroke();
    } else if (item.type === 'thick') {
      roundRect(item.x - 16, item.y - 9, 32, 18, 6, accent);
    } else if (item.type === 'long') {
      roundRect(item.x - 24, item.y - 7, 48, 14, 7, accent);
    } else if (item.type === 'heart') {
      ctx.save();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(item.x, item.y + 12);
      ctx.bezierCurveTo(item.x - 18, item.y - 2, item.x - 18, item.y - 18, item.x, item.y - 8);
      ctx.bezierCurveTo(item.x + 18, item.y - 18, item.x + 18, item.y - 2, item.x, item.y + 12);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawPaddle() {
  roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 7, COLORS.paddle);
  const fx = effectFlags();
  const accent = currentTheme().accent;

  if (fx.triangle) {
    const tri = triangleBounds();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(tri.cx, tri.top);
    ctx.lineTo(tri.cx - tri.width / 2, paddle.y);
    ctx.lineTo(tri.cx + tri.width / 2, paddle.y);
    ctx.closePath();
    ctx.fill();
  }
  if (fx.bowl) {
    const bowl = bowlBounds();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bowl.x + bowl.width / 2, bowl.y + 6, bowl.width / 2 - 6, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bowl.x + 6, bowl.y + 12);
    ctx.lineTo(bowl.x + bowl.width - 6, bowl.y + 12);
    ctx.stroke();
  }
  if (fx.thick) {
    roundRect(paddle.x + 10, paddle.y + 4, paddle.width - 20, paddle.height - 8, 6, accent);
  }
}

function drawBalls() {
  for (const ball of balls) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.ball;
    ctx.fill();
  }
  const heldCount = balls.filter((ball) => ball.held).length;
  if (heldCount >= 2 && effectFlags().bowl) {
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`x${heldCount}`, paddle.x + paddle.width / 2, paddle.y - 30);
  }
}

function drawParticles() {
  const now = nowMs();
  for (const p of game.particles) {
    const alpha = 1 - ((now - p.createdAt) / p.life);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.globalAlpha = 1;
  }
}

function drawFloatingTexts() {
  const now = nowMs();
  for (const txt of game.floatingTexts) {
    const alpha = Math.max(0, (txt.until - now) / 900);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = txt.color;
    ctx.font = `bold ${txt.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(txt.text, txt.x, txt.y);
    ctx.globalAlpha = 1;
  }
}

function drawBossBar() {
  if (game.stageType !== 'boss' || game.bossMaxHp <= 0 || !bricks.some((b) => b.type === 'boss')) return;
  const x = 36;
  const y = 96;
  const width = W - 72;
  roundRect(x, y, width, 16, 8, 'rgba(255,255,255,0.14)');
  const ratio = clamp(game.bossHp / game.bossMaxHp, 0, 1);
  roundRect(x, y, width * ratio, 16, 8, currentTheme().boss);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`보스 HP ${Math.max(0, game.bossHp)} / ${game.bossMaxHp}`, W / 2, y + 12);
}

function drawOverlay() {
  if (game.status === 'start') {
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('탭해서 게임 시작', W / 2, H / 2 - 6);
    ctx.font = '16px sans-serif';
    ctx.fillText('손가락으로 패들을 움직여봐', W / 2, H / 2 + 26);
  }

  if (game.status === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('일시정지', W / 2, H / 2);
  }

  if (game.status === 'love') {
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = currentTheme().love;
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText('유미야 사랑해!', W / 2, H / 2);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.ceil((game.loveMessageUntil - nowMs()) / 1000)}초 뒤 다음 라운드`, W / 2, H / 2 + 34);
  }

  if (game.status === 'gameover1') {
    ctx.fillStyle = 'rgba(0,0,0,0.60)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('게임 오버', W / 2, H / 2 - 54);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`당신은 유미에게 ${game.runLove}번 사랑한다고 말했습니다!`, W / 2, H / 2 - 6);
    ctx.font = '16px sans-serif';
    ctx.fillText(`최고 점수 ${game.bestScore} / 최고 레벨 ${game.bestLevel}`, W / 2, H / 2 + 28);
    ctx.fillText('탭하면 다음 메시지', W / 2, H / 2 + 56);
  }

  if (game.status === 'gameover2') {
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('더 많이 사랑을 고백해보세요!', W / 2, H / 2 - 18);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = currentTheme().love;
    ctx.fillText(endingMessage(), W / 2, H / 2 + 18);
    ctx.fillStyle = '#fff';
    ctx.fillText('다시 탭하면 처음 화면으로', W / 2, H / 2 + 54);
  }
}

function drawDangerLine() {
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(0, paddle.y - 8);
  ctx.lineTo(W, paddle.y - 8);
  ctx.stroke();
}

function draw() {
  const shakeActive = nowMs() < game.shakeUntil;
  if (shakeActive) {
    const dx = (Math.random() - 0.5) * 6;
    const dy = (Math.random() - 0.5) * 6;
    ctx.save();
    ctx.translate(dx, dy);
  }

  drawBackground();
  drawDangerLine();
  drawBossBar();
  drawBricks();
  drawItems();
  drawPaddle();
  drawBalls();
  drawParticles();
  drawFloatingTexts();
  drawOverlay();

  if (shakeActive) ctx.restore();
}

function handleTap(clientX, clientY) {
  if (game.status === 'paused') return;

  if (game.status === 'gameover1') {
    game.status = 'gameover2';
    return;
  }
  if (game.status === 'gameover2') {
    fullReset();
    return;
  }
  if (game.status === 'love') return;

  const pos = getPointerCanvasPosition(clientX, clientY);
  if (balls.some((ball) => ball.held)) {
    launchHeldBalls(pos.x, pos.y);
  }
}

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  movePaddleTo(touch.clientX);
  handleTap(touch.clientX, touch.clientY);
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  movePaddleTo(touch.clientX);
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  movePaddleTo(e.clientX);
  handleTap(e.clientX, e.clientY);
});

canvas.addEventListener('mousemove', (e) => {
  if (e.buttons === 1) movePaddleTo(e.clientX);
});

pauseBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (game.status === 'playing') {
    game.previousStatus = 'playing';
    game.status = 'paused';
  } else if (game.status === 'paused') {
    game.status = game.previousStatus || 'playing';
  }
  updateHud();
});

function loop(timestamp) {
  if (!game.lastTime) game.lastTime = timestamp;
  const dt = timestamp - game.lastTime;
  game.lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

fullReset();
requestAnimationFrame(loop);
