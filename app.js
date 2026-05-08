const ROD_COUNT = 3;
const PLACE_NAMES = ["百位", "十位", "个位"];
const POWERS = [100, 10, 1];
const MAX_VALUE = 999;
const UPPER_BEAD_COUNT = 2;
const LOWER_BEAD_COUNT = 5;
const AUTO_PLAY_START_DELAY = 600;
const DEMO_MOVE_DURATION = 320;
/** 自动播放：顺序逐帧；场切换（上一 confirm → 下一帧） */
const AUTO_PLAY_DELAY_SCENE = Math.max(720, DEMO_MOVE_DURATION + 400);
/** 自动播放：进入或结束于「动画帧」(move) 后的等待 */
const AUTO_PLAY_DELAY_MOVE = Math.max(1400, DEMO_MOVE_DURATION + 900);
/** 自动播放：静止帧之间（如 focus→move、move→confirm） */
const AUTO_PLAY_DELAY_STATIC = 560;
/** 手动「下一步」播完一整场时的帧间节奏（略快于自动） */
const MANUAL_SCENE_DELAY_MOVE = Math.max(1080, DEMO_MOVE_DURATION + 600);
const MANUAL_SCENE_DELAY_STATIC = 380;
const BEAM_TOP_RATIO = 0.45;
const BEAM_HEIGHT_RATIO = 0.035;
const TOP_MARGIN_RATIO = 0.065;
const UPPER_GAP_RATIO = 0.07;
const LOWER_GAP_RATIO = 0.07;

const state = {
  rods: Array.from({ length: ROD_COUNT }, () => ({ upperCount: 0, lowerCount: 0 })),
  targetNumber: null,
  runScript: null,
  demoSteps: [],
  stepIndex: -1,
  autoPlayTimer: null,
  highlightBeads: Array.from({ length: ROD_COUNT }, () => ({ upper: [], lower: [] })),
  clearHighlightTimer: null,
  beadElements: [],
  isAnimating: false,
  animationTimer: null,
  resizeTimer: null,
  scenePlaybackTimer: null,
  scenePlaybackGen: 0,
  autoPlaySeq: 0
};

const refs = {};

function hydrateRefs() {
  Object.assign(refs, {
    modeLearn: document.getElementById("modeLearn"),
    modeDemo: document.getElementById("modeDemo"),
    learnPanel: document.getElementById("learnPanel"),
    demoPanel: document.getElementById("demoPanel"),
    abacus: document.getElementById("abacus"),
    rodLabels: document.getElementById("rodLabels"),
    displayValue: document.getElementById("displayValue"),
    randomTargetBtn: document.getElementById("randomTargetBtn"),
    checkAnswerBtn: document.getElementById("checkAnswerBtn"),
    setByInputBtn: document.getElementById("setByInputBtn"),
    resetLearnBtn: document.getElementById("resetLearnBtn"),
    numberInput: document.getElementById("numberInput"),
    targetPrompt: document.getElementById("targetPrompt"),
    feedback: document.getElementById("feedback"),
    leftInput: document.getElementById("leftInput"),
    opInput: document.getElementById("opInput"),
    rightInput: document.getElementById("rightInput"),
    buildDemoBtn: document.getElementById("buildDemoBtn"),
    prevStepBtn: document.getElementById("prevStepBtn"),
    nextStepBtn: document.getElementById("nextStepBtn"),
    autoPlayBtn: document.getElementById("autoPlayBtn"),
    resetDemoBtn: document.getElementById("resetDemoBtn"),
    expressionText: document.getElementById("expressionText"),
    stepText: document.getElementById("stepText")
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function decomposeDigit(digit) {
  const safeDigit = clamp(digit, 0, 9);
  return {
    upperCount: safeDigit >= 5 ? 1 : 0,
    lowerCount: safeDigit % 5
  };
}

function composeDigit(rodState) {
  return rodState.upperCount * 5 + rodState.lowerCount;
}

function numberToDigits(number) {
  const safe = clamp(Math.floor(number), 0, MAX_VALUE);
  return [
    Math.floor(safe / 100) % 10,
    Math.floor(safe / 10) % 10,
    safe % 10
  ];
}

function setNumberOnAbacus(number, options = {}) {
  const { animate = false } = options;
  const safe = Math.floor(number);
  if (!Number.isFinite(safe) || safe < 0 || safe > MAX_VALUE) {
    return false;
  }
  const digits = numberToDigits(safe);
  for (let i = 0; i < ROD_COUNT; i += 1) {
    state.rods[i] = decomposeDigit(digits[i]);
  }
  renderAbacus({ animate });
  return true;
}

function getCurrentNumber() {
  let value = 0;
  for (let i = 0; i < ROD_COUNT; i += 1) {
    value += composeDigit(state.rods[i]) * POWERS[i];
  }
  return value;
}

function getRawNumberFromRods() {
  let value = 0;
  for (let i = 0; i < ROD_COUNT; i += 1) {
    value += (state.rods[i].upperCount * 5 + state.rods[i].lowerCount) * POWERS[i];
  }
  return value;
}

function normalizeManualRods() {
  const raw = getRawNumberFromRods();
  if (raw > MAX_VALUE) {
    return false;
  }
  // 手拨时自动归一化：下5 -> 上1；上2 -> 向高位进1（通过总值重排实现）
  setNumberOnAbacus(raw, { animate: false });
  return true;
}

function buildRod(index) {
  const rod = document.createElement("div");
  rod.className = "rod";
  rod.dataset.rod = String(index);

  for (let i = 0; i < UPPER_BEAD_COUNT; i += 1) {
    const upper = document.createElement("button");
    upper.className = "bead upper";
    upper.textContent = "5";
    upper.dataset.rod = String(index);
    upper.dataset.type = "upper";
    upper.dataset.idx = String(i);
    upper.title = `${PLACE_NAMES[index]}：上珠（5）`;
    rod.appendChild(upper);
  }

  for (let i = 0; i < LOWER_BEAD_COUNT; i += 1) {
    const lower = document.createElement("button");
    lower.className = "bead lower";
    lower.textContent = "1";
    lower.dataset.rod = String(index);
    lower.dataset.type = "lower";
    lower.dataset.idx = String(i);
    lower.title = `${PLACE_NAMES[index]}：下珠（1）`;
    rod.appendChild(lower);
  }

  return rod;
}

function initAbacus() {
  refs.abacus.innerHTML = "";
  state.beadElements = [];
  for (let rodIdx = 0; rodIdx < ROD_COUNT; rodIdx += 1) {
    const rodEl = buildRod(rodIdx);
    refs.abacus.appendChild(rodEl);
    state.beadElements[rodIdx] = {
      uppers: [...rodEl.querySelectorAll(".bead.upper")],
      lowers: [...rodEl.querySelectorAll(".bead.lower")]
    };
  }
}

function getLayoutMetrics() {
  const sampleRod = refs.abacus.querySelector(".rod");
  const sampleBead = refs.abacus.querySelector(".bead");
  const rodHeight = sampleRod ? sampleRod.clientHeight : 340;
  const beadHeight = sampleBead ? sampleBead.clientHeight : 28;
  const beamTop = rodHeight * BEAM_TOP_RATIO;
  const beamHeight = Math.max(8, rodHeight * BEAM_HEIGHT_RATIO);
  const topMargin = rodHeight * TOP_MARGIN_RATIO;
  const upperGap = rodHeight * UPPER_GAP_RATIO;
  const lowerGap = rodHeight * LOWER_GAP_RATIO;
  return { rodHeight, beadHeight, beamTop, beamHeight, topMargin, upperGap, lowerGap };
}

function renderLabels() {
  refs.rodLabels.innerHTML = "";
  for (const label of PLACE_NAMES) {
    const div = document.createElement("div");
    div.textContent = label;
    refs.rodLabels.appendChild(div);
  }
}

function renderAbacus(options = {}) {
  const { animate = false } = options;
  refs.abacus.classList.toggle("animate-move", animate);
  const metrics = getLayoutMetrics();
  refs.abacus.style.setProperty("--beam-top-ratio", `${BEAM_TOP_RATIO * 100}%`);
  refs.abacus.style.setProperty("--beam-height", `${metrics.beamHeight}px`);
  for (let rodIdx = 0; rodIdx < ROD_COUNT; rodIdx += 1) {
    const rodState = state.rods[rodIdx];
    const beadEls = state.beadElements[rodIdx];
    beadEls.uppers.forEach((upperEl, idx) => {
      const isActive = idx >= UPPER_BEAD_COUNT - rodState.upperCount;
      const activeOrder = idx - (UPPER_BEAD_COUNT - rodState.upperCount);
      const activeTop = metrics.beamTop - metrics.beadHeight - activeOrder * metrics.upperGap;
      const inactiveTop = metrics.topMargin + idx * metrics.upperGap;
      upperEl.style.top = `${isActive ? activeTop : inactiveTop}px`;
      upperEl.classList.remove("highlight-change-bead");
      if (state.highlightBeads[rodIdx]?.upper.includes(idx)) {
        upperEl.classList.add("highlight-change-bead");
      }
    });

    beadEls.lowers.forEach((el, idx) => {
      const active = idx < rodState.lowerCount;
      // 下珠靠梁与离梁都要分层显示，避免多颗珠子重叠看起来像“消失”
      const activeTop = metrics.beamTop + metrics.beamHeight + idx * metrics.lowerGap;
      const lowerBase = metrics.rodHeight - metrics.topMargin - metrics.beadHeight;
      const inactiveTop = lowerBase - (LOWER_BEAD_COUNT - 1 - idx) * metrics.lowerGap;
      el.style.top = `${active ? activeTop : inactiveTop}px`;
      el.classList.remove("highlight-change-bead");
      if (state.highlightBeads[rodIdx]?.lower.includes(idx)) {
        el.classList.add("highlight-change-bead");
      }
    });
  }
  refs.displayValue.textContent = `当前数值：${getCurrentNumber()}`;
}

function handleBeadClick(event) {
  if (state.isAnimating) {
    return;
  }
  const beforeValue = getCurrentNumber();
  const bead = event.target.closest(".bead");
  if (!bead) return;
  const rodIdx = Number(bead.dataset.rod);
  const rod = state.rods[rodIdx];
  if (!rod) return;

  if (bead.dataset.type === "upper") {
    const idx = Number(bead.dataset.idx);
    const threshold = UPPER_BEAD_COUNT - rod.upperCount;
    if (idx < threshold) {
      rod.upperCount = UPPER_BEAD_COUNT - idx;
    } else {
      rod.upperCount = UPPER_BEAD_COUNT - idx - 1;
    }
    rod.upperCount = clamp(rod.upperCount, 0, UPPER_BEAD_COUNT);
  } else {
    const idx = Number(bead.dataset.idx);
    if (idx < rod.lowerCount) {
      rod.lowerCount = idx;
    } else {
      rod.lowerCount = idx + 1;
    }
    rod.lowerCount = clamp(rod.lowerCount, 0, LOWER_BEAD_COUNT);
  }
  const ok = normalizeManualRods();
  if (!ok) {
    setNumberOnAbacus(beforeValue, { animate: false });
    setFeedback(`已到最大可表示数 ${MAX_VALUE}，本次拨珠未生效。`, false);
  } else if (!refs.learnPanel.classList.contains("hidden")) {
    setFeedback(`当前数值：${getCurrentNumber()}`, true);
  }
}

function setFeedback(text, ok) {
  refs.feedback.textContent = text;
  refs.feedback.classList.remove("success", "error");
  refs.feedback.classList.add(ok ? "success" : "error");
}

function switchMode(mode) {
  const learn = mode === "learn";
  refs.modeLearn.classList.toggle("active", learn);
  refs.modeDemo.classList.toggle("active", !learn);
  refs.learnPanel.classList.toggle("hidden", !learn);
  refs.demoPanel.classList.toggle("hidden", learn);
}

function randomTarget() {
  state.targetNumber = Math.floor(Math.random() * 1000);
  refs.targetPrompt.textContent = `请拨出数字：${state.targetNumber}`;
  setFeedback("", true);
}

function checkAnswer() {
  if (state.targetNumber === null) {
    setFeedback("请先点击“随机拨数”出题。", false);
    return;
  }
  const current = getCurrentNumber();
  if (current === state.targetNumber) {
    setFeedback(`回答正确！你拨出了 ${current}。`, true);
  } else {
    setFeedback(`还不对，当前是 ${current}，目标是 ${state.targetNumber}。`, false);
  }
}

function validateRange(num) {
  return Number.isInteger(num) && num >= 0 && num <= 999;
}

function addStep(valueAfter, place, narration, formula = "") {
  return { valueAfter, place, narration, formula };
}

function getOperationPlaceOrder() {
  // 运算按个位 -> 十位 -> 百位，更符合加减法教学中的进位/借位顺序。
  return [2, 1, 0];
}

function getChangedBeads(prevValue, nextValue) {
  const changedBeads = Array.from({ length: ROD_COUNT }, () => ({ upper: [], lower: [] }));
  if (prevValue === null || prevValue === undefined) return changedBeads;

  const prevDigits = numberToDigits(prevValue);
  const nextDigits = numberToDigits(nextValue);

  for (let i = 0; i < ROD_COUNT; i += 1) {
    const prevRod = decomposeDigit(prevDigits[i]);
    const nextRod = decomposeDigit(nextDigits[i]);

    if (prevRod.upperCount !== nextRod.upperCount) {
      const startUpper = Math.min(prevRod.upperCount, nextRod.upperCount);
      const endUpper = Math.max(prevRod.upperCount, nextRod.upperCount);
      for (let j = startUpper; j < endUpper; j += 1) {
        changedBeads[i].upper.push(UPPER_BEAD_COUNT - 1 - j);
      }
    }
    if (prevRod.lowerCount !== nextRod.lowerCount) {
      const start = Math.min(prevRod.lowerCount, nextRod.lowerCount);
      const end = Math.max(prevRod.lowerCount, nextRod.lowerCount);
      for (let idx = start; idx < end; idx += 1) {
        changedBeads[i].lower.push(idx);
      }
    }
  }

  return changedBeads;
}

function describeChangedBeads(changedBeads) {
  const parts = [];
  for (let i = 0; i < ROD_COUNT; i += 1) {
    const rodChanges = changedBeads[i];
    const unitParts = [];
    if (rodChanges.upper.length > 0) {
      const upperLabels = rodChanges.upper.map((idx) => `上珠${idx + 1}`);
      unitParts.push(upperLabels.join("、"));
    }
    if (rodChanges.lower.length > 0) {
      const labels = rodChanges.lower.map((idx) => `下珠${idx + 1}`);
      unitParts.push(labels.join("、"));
    }
    if (unitParts.length > 0) {
      parts.push(`${PLACE_NAMES[i]}：${unitParts.join("、")}`);
    }
  }
  return parts.length > 0 ? parts.join("；") : "无";
}

function emptyHighlightBeads() {
  return Array.from({ length: ROD_COUNT }, () => ({ upper: [], lower: [] }));
}

function digitAtPlace(value, placeIdx) {
  const digits = numberToDigits(value);
  return digits[placeIdx];
}

function highlightForDigit(placeIdx, digit) {
  const result = emptyHighlightBeads();
  const d = decomposeDigit(digit);
  if (d.upperCount > 0) {
    for (let i = 0; i < d.upperCount; i += 1) {
      result[placeIdx].upper.push(UPPER_BEAD_COUNT - 1 - i);
    }
  }
  for (let i = 0; i < d.lowerCount; i += 1) {
    result[placeIdx].lower.push(i);
  }
  return result;
}

function buildStepsForExpression(a, op, b) {
  const steps = [];
  let current = 0;
  const aDigits = numberToDigits(a);
  const initOrder = [0, 1, 2];
  for (const i of initOrder) {
    const digit = aDigits[i];
    if (digit === 0) continue;
    const prev = current;
    current += digit * POWERS[i];
    steps.push({
      ...addStep(current, "初始化", `初始化：拨出${PLACE_NAMES[i]}的 ${digit}`, `${prev} + ${digit * POWERS[i]} = ${current}`),
      animate: true,
      highlightBeads: getChangedBeads(prev, current)
    });
    steps.push({
      ...addStep(current, "初始化", `确认${PLACE_NAMES[i]}数字 ${digit}`, `${digit}`),
      animate: false,
      highlightBeads: highlightForDigit(i, digit)
    });
  }

  const digits = numberToDigits(b);
  for (const i of getOperationPlaceOrder()) {
    const digit = digits[i];
    if (digit === 0) continue;
    const prev = current;
    const delta = digit * POWERS[i];
    const beforeDigit = digitAtPlace(prev, i);
    const placeCarry = op === "+" && beforeDigit + digit >= 10;
    const placeBorrow = op === "-" && beforeDigit < digit;
    const startHint =
      op === "+"
        ? placeCarry
          ? `${PLACE_NAMES[i]}当前是 ${beforeDigit}，准备加 ${digit}（会向高位进1）`
          : `${PLACE_NAMES[i]}当前是 ${beforeDigit}，准备加 ${digit}`
        : placeBorrow
          ? `${PLACE_NAMES[i]}当前是 ${beforeDigit}，准备减 ${digit}（需要向高位借1）`
          : `${PLACE_NAMES[i]}当前是 ${beforeDigit}，准备减 ${digit}`;
    steps.push({
      ...addStep(prev, PLACE_NAMES[i], startHint, ""),
      animate: false,
      highlightBeads: highlightForDigit(i, beforeDigit)
    });
    current = op === "+" ? prev + delta : prev - delta;
    const afterDigit = digitAtPlace(current, i);
    const placeFormula =
      op === "+"
        ? placeCarry
          ? `${beforeDigit} + ${digit} = ${beforeDigit + digit}，本位记 ${afterDigit}，向高位进1`
          : `${beforeDigit} + ${digit} = ${afterDigit}`
        : placeBorrow
          ? `${beforeDigit + 10} - ${digit} = ${afterDigit}，并向高位借1`
          : `${beforeDigit} - ${digit} = ${afterDigit}`;
    steps.push({
      ...addStep(
        current,
        PLACE_NAMES[i],
        `${PLACE_NAMES[i]}${op === "+" ? "加" : "减"} ${digit}，即${op === "+" ? "加" : "减"} ${delta}`,
        `${placeFormula}（${prev} ${op} ${delta} = ${current}）`
      ),
      animate: true,
      highlightBeads: getChangedBeads(prev, current)
    });
    steps.push({
      ...addStep(current, PLACE_NAMES[i], `${PLACE_NAMES[i]}结果数字 ${afterDigit}`, `${afterDigit}`),
      animate: false,
      highlightBeads: highlightForDigit(i, afterDigit)
    });
  }

  if (steps.length === 0) {
    const result = op === "+" ? a + b : a - b;
    steps.push({
      ...addStep(result, "初始化", `当前算式结果为 ${result}，无需拨珠变化`, `${a} ${op} ${b} = ${result}`),
      animate: false,
      highlightBeads: emptyHighlightBeads()
    });
  }

  return steps;
}

function buildRunScriptForExpression(left, op, right) {
  if (!window.CalcPlanner?.buildCalcSteps || !window.DisplayPlanner?.deriveDisplaySteps || !window.ScriptBuilder?.buildRunScript) {
    throw new Error("脚本生成器未加载完整。");
  }
  const problem = { left, op, right, base: 10 };
  const calcSteps = window.CalcPlanner.buildCalcSteps(problem);
  const displaySteps = window.DisplayPlanner.deriveDisplaySteps(calcSteps, {
    rodCount: ROD_COUNT,
    upperBeadCount: UPPER_BEAD_COUNT
  });
  return window.ScriptBuilder.buildRunScript(problem, displaySteps, { maxValue: MAX_VALUE });
}

function stopScenePlayback() {
  state.scenePlaybackGen += 1;
  if (state.scenePlaybackTimer) {
    window.clearTimeout(state.scenePlaybackTimer);
    state.scenePlaybackTimer = null;
  }
}

function getSceneBoundsForFlatIndex(flatIndex) {
  const steps = state.demoSteps;
  if (!steps.length) return null;
  const safe = clamp(flatIndex, 0, steps.length - 1);
  const sceneId = steps[safe].sceneId || "";
  let start = safe;
  while (start > 0 && (steps[start - 1].sceneId || "") === sceneId) start -= 1;
  let end = safe;
  while (end < steps.length - 1 && (steps[end + 1].sceneId || "") === sceneId) end += 1;
  return { sceneId, start, end };
}

function getSceneProgressLine(flatIndex) {
  const steps = state.demoSteps;
  const script = state.runScript;
  if (!steps.length) return "";
  const bounds = getSceneBoundsForFlatIndex(flatIndex);
  if (!bounds) return `步骤 ${flatIndex + 1}/${steps.length}`;
  const scenes = script?.scenes;
  if (!Array.isArray(scenes) || !scenes.length) {
    return `步骤 ${flatIndex + 1}/${steps.length}`;
  }
  const sceneOrd = scenes.findIndex((s) => s.sceneId === bounds.sceneId) + 1;
  const frameInScene = flatIndex - bounds.start + 1;
  const framesInScene = bounds.end - bounds.start + 1;
  return `场 ${sceneOrd}/${scenes.length} · 帧 ${frameInScene}/${framesInScene} · 全局 ${flatIndex + 1}/${steps.length}`;
}

function computeDelayAfterShowingFrame(flatIndex, mode) {
  const steps = state.demoSteps;
  if (flatIndex >= steps.length - 1) return 0;
  const cur = steps[flatIndex];
  const next = steps[flatIndex + 1];
  const sceneChange = (cur.sceneId || "") !== (next.sceneId || "");
  if (mode === "auto") {
    if (sceneChange) return AUTO_PLAY_DELAY_SCENE;
    if (next.type === "move") return AUTO_PLAY_DELAY_MOVE;
    return AUTO_PLAY_DELAY_STATIC;
  }
  if (sceneChange) return AUTO_PLAY_DELAY_SCENE;
  if (next.type === "move") return MANUAL_SCENE_DELAY_MOVE;
  return MANUAL_SCENE_DELAY_STATIC;
}

function playFlatRange(start, end, mode) {
  stopScenePlayback();
  const gen = state.scenePlaybackGen;
  function tick(idx) {
    if (gen !== state.scenePlaybackGen) return;
    const st = state.demoSteps[idx];
    showStep(idx, { animate: Boolean(st.animate) });
    if (idx >= end) {
      state.scenePlaybackTimer = null;
      return;
    }
    const wait = computeDelayAfterShowingFrame(idx, mode);
    state.scenePlaybackTimer = window.setTimeout(() => tick(idx + 1), wait);
  }
  tick(start);
}

function clearHighlightNow() {
  state.highlightBeads = emptyHighlightBeads();
  renderAbacus({ animate: false });
}

function scheduleHighlightClear() {
  if (state.clearHighlightTimer) {
    window.clearTimeout(state.clearHighlightTimer);
    state.clearHighlightTimer = null;
  }
  state.clearHighlightTimer = window.setTimeout(() => {
    clearHighlightNow();
    state.clearHighlightTimer = null;
  }, 1300);
}

function stopStepAnimation() {
  if (state.animationTimer) {
    window.clearTimeout(state.animationTimer);
    state.animationTimer = null;
  }
  state.isAnimating = false;
  refs.abacus.classList.remove("animate-move");
}

function stopAutoPlay() {
  state.autoPlaySeq += 1;
  if (state.autoPlayTimer) {
    window.clearTimeout(state.autoPlayTimer);
    state.autoPlayTimer = null;
  }
  refs.autoPlayBtn.textContent = "自动播放";
}

function resolveHighlightBeads(step, prevStepObj) {
  const hb = step.highlightBeads;
  if (Array.isArray(hb) && hb.length === ROD_COUNT) return hb;
  const prevVal = prevStepObj ? prevStepObj.valueAfter : null;
  return getChangedBeads(prevVal, step.valueAfter);
}

function showStep(index, options = {}) {
  const { animate = null } = options;
  if (!state.demoSteps.length) return;
  const safe = clamp(index, 0, state.demoSteps.length - 1);
  state.stepIndex = safe;
  const step = state.demoSteps[safe];
  const prevStep = safe > 0 ? state.demoSteps[safe - 1] : null;
  const animateStep = animate === null ? Boolean(step.animate) : animate;
  state.highlightBeads = resolveHighlightBeads(step, prevStep);
  stopStepAnimation();
  setNumberOnAbacus(step.valueAfter, { animate: animateStep });
  if (animateStep) {
    state.isAnimating = true;
    state.animationTimer = window.setTimeout(() => {
      state.isAnimating = false;
      state.animationTimer = null;
      refs.abacus.classList.remove("animate-move");
    }, DEMO_MOVE_DURATION);
  }
  scheduleHighlightClear();
  const formulaText = step.formula ? `（${step.formula}）` : "";
  const changedText = describeChangedBeads(state.highlightBeads);
  const progress = getSceneProgressLine(safe);
  refs.stepText.textContent = `${progress}：${step.narration}${formulaText}，变化算珠：${changedText}，当前值 ${step.valueAfter}`;
}

function buildDemo() {
  stopAutoPlay();
  stopScenePlayback();
  stopStepAnimation();
  const left = Number(refs.leftInput.value);
  const right = Number(refs.rightInput.value);
  const op = refs.opInput.value;

  if (!validateRange(left) || !validateRange(right)) {
    refs.stepText.textContent = "请输入 0~999 的整数。";
    return;
  }
  if (op === "-" && left < right) {
    refs.stepText.textContent = "当前版本先支持不出现负数的减法，请保证第一个数 >= 第二个数。";
    return;
  }

  const result = op === "+" ? left + right : left - right;
  if (result > 999) {
    refs.stepText.textContent = "结果超过 999，请换一组数据。";
    return;
  }

  try {
    state.runScript = buildRunScriptForExpression(left, op, right);
    state.demoSteps = state.runScript.frames;
  } catch (error) {
    state.runScript = null;
    state.demoSteps = [];
    refs.stepText.textContent = `生成演示失败：${error.message}`;
    return;
  }
  if (!state.demoSteps.length) {
    state.stepIndex = -1;
    refs.expressionText.textContent = `题目：${left} ${op} ${right} = ${result}`;
    refs.stepText.textContent = "当前算式无珠面变化步骤（例如加 0）。";
    setNumberOnAbacus(left, { animate: false });
    return;
  }
  state.stepIndex = 0;
  refs.expressionText.textContent = `题目：${left} ${op} ${right} = ${result}`;
  showStep(0, { animate: false });
}

function nextStep() {
  if (!state.demoSteps.length) {
    refs.stepText.textContent = "请先生成演示。";
    return;
  }
  stopAutoPlay();
  const bounds = getSceneBoundsForFlatIndex(state.stepIndex);
  if (!bounds) return;
  const atEndOfScene = state.stepIndex === bounds.end;
  if (!atEndOfScene) {
    playFlatRange(state.stepIndex, bounds.end, "manual");
    return;
  }
  const nextStart = bounds.end + 1;
  if (nextStart >= state.demoSteps.length) {
    refs.stepText.textContent = "已到最后一场。";
    return;
  }
  const nb = getSceneBoundsForFlatIndex(nextStart);
  playFlatRange(nextStart, nb.end, "manual");
}

function prevStep() {
  if (!state.demoSteps.length) {
    refs.stepText.textContent = "请先生成演示。";
    return;
  }
  stopAutoPlay();
  stopScenePlayback();
  const bounds = getSceneBoundsForFlatIndex(state.stepIndex);
  if (!bounds) return;
  if (state.stepIndex > bounds.start) {
    showStep(bounds.start, { animate: false });
    return;
  }
  if (bounds.start <= 0) {
    refs.stepText.textContent = "已到第一场。";
    return;
  }
  const prevEnd = bounds.start - 1;
  const pb = getSceneBoundsForFlatIndex(prevEnd);
  showStep(pb.end, { animate: false });
}

function toggleAutoPlay() {
  if (!state.demoSteps.length) {
    refs.stepText.textContent = "请先生成演示。";
    return;
  }
  if (state.autoPlayTimer) {
    stopAutoPlay();
    refs.stepText.textContent = "自动播放已暂停。";
    return;
  }
  stopScenePlayback();
  refs.autoPlayBtn.textContent = "暂停播放";
  const seqAtStart = state.autoPlaySeq;
  function tick() {
    if (seqAtStart !== state.autoPlaySeq) return;
    if (state.isAnimating) {
      state.autoPlayTimer = window.setTimeout(tick, 80);
      return;
    }
    if (state.stepIndex >= state.demoSteps.length - 1) {
      stopAutoPlay();
      refs.stepText.textContent = "自动播放结束：已到最后一步。";
      return;
    }
    const nextIdx = state.stepIndex + 1;
    const st = state.demoSteps[nextIdx];
    showStep(nextIdx, { animate: Boolean(st.animate) });
    const wait = computeDelayAfterShowingFrame(nextIdx, "auto");
    state.autoPlayTimer = window.setTimeout(tick, wait > 0 ? wait : 40);
  }
  state.autoPlayTimer = window.setTimeout(tick, AUTO_PLAY_START_DELAY);
}

function resetLearn() {
  stopStepAnimation();
  if (state.clearHighlightTimer) {
    window.clearTimeout(state.clearHighlightTimer);
    state.clearHighlightTimer = null;
  }
  state.highlightBeads = emptyHighlightBeads();
  setNumberOnAbacus(0, { animate: false });
  state.targetNumber = null;
  refs.targetPrompt.textContent = "请拨出数字：—";
  setFeedback("", true);
}

function resetDemo() {
  stopAutoPlay();
  stopScenePlayback();
  stopStepAnimation();
  if (state.clearHighlightTimer) {
    window.clearTimeout(state.clearHighlightTimer);
    state.clearHighlightTimer = null;
  }
  state.demoSteps = [];
  state.runScript = null;
  state.stepIndex = -1;
  state.highlightBeads = emptyHighlightBeads();
  refs.expressionText.textContent = "题目：—";
  refs.stepText.textContent = "步骤：请先生成演示";
  setNumberOnAbacus(0, { animate: false });
}

function bindEvents() {
  refs.modeLearn.addEventListener("click", () => switchMode("learn"));
  refs.modeDemo.addEventListener("click", () => switchMode("demo"));
  refs.abacus.addEventListener("click", handleBeadClick);

  refs.randomTargetBtn.addEventListener("click", randomTarget);
  refs.checkAnswerBtn.addEventListener("click", checkAnswer);
  refs.setByInputBtn.addEventListener("click", () => {
    const n = Number(refs.numberInput.value);
    if (!validateRange(n)) {
      setFeedback("请输入 0~999 的整数。", false);
      return;
    }
    stopStepAnimation();
    setNumberOnAbacus(n, { animate: false });
    setFeedback(`已按输入数字 ${n} 自动拨珠。`, true);
  });
  refs.resetLearnBtn.addEventListener("click", resetLearn);

  refs.buildDemoBtn.addEventListener("click", buildDemo);
  refs.prevStepBtn.addEventListener("click", prevStep);
  refs.nextStepBtn.addEventListener("click", nextStep);
  refs.autoPlayBtn.addEventListener("click", toggleAutoPlay);
  refs.resetDemoBtn.addEventListener("click", resetDemo);

  window.addEventListener("resize", () => {
    if (state.resizeTimer) {
      window.clearTimeout(state.resizeTimer);
    }
    state.resizeTimer = window.setTimeout(() => {
      renderAbacus({ animate: false });
      state.resizeTimer = null;
    }, 80);
  });
}

function init() {
  hydrateRefs();
  if (!refs.abacus || !refs.rodLabels || !refs.displayValue) {
    console.error("初始化失败：关键DOM未找到。");
    return;
  }
  renderLabels();
  initAbacus();
  setNumberOnAbacus(0, { animate: false });
  bindEvents();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
