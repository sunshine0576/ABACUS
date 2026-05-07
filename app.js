const ROD_COUNT = 3;
const PLACE_NAMES = ["百位", "十位", "个位"];
const POWERS = [100, 10, 1];
const MAX_VALUE = 999;
const UPPER_BEAD_COUNT = 2;
const LOWER_BEAD_COUNT = 5;
const AUTO_PLAY_STEP_DELAY = 1600;
const AUTO_PLAY_START_DELAY = 600;
const DEMO_MOVE_DURATION = 320;
const BEAM_TOP_RATIO = 0.45;
const BEAM_HEIGHT_RATIO = 0.035;
const TOP_MARGIN_RATIO = 0.065;
const UPPER_GAP_RATIO = 0.07;
const LOWER_GAP_RATIO = 0.07;

const state = {
  rods: Array.from({ length: ROD_COUNT }, () => ({ upperCount: 0, lowerCount: 0 })),
  targetNumber: null,
  demoSteps: [],
  stepIndex: -1,
  autoPlayTimer: null,
  highlightBeads: Array.from({ length: ROD_COUNT }, () => ({ upper: [], lower: [] })),
  clearHighlightTimer: null,
  beadElements: [],
  isAnimating: false,
  animationTimer: null,
  resizeTimer: null
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

  return steps;
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
  if (state.autoPlayTimer) {
    window.clearTimeout(state.autoPlayTimer);
    state.autoPlayTimer = null;
  }
  refs.autoPlayBtn.textContent = "自动播放";
}

function showStep(index, options = {}) {
  const { animate = null } = options;
  if (!state.demoSteps.length) return;
  const safe = clamp(index, 0, state.demoSteps.length - 1);
  state.stepIndex = safe;
  const step = state.demoSteps[safe];
  const prevStep = safe > 0 ? state.demoSteps[safe - 1] : null;
  const animateStep = animate === null ? Boolean(step.animate) : animate;
  state.highlightBeads = step.highlightBeads || getChangedBeads(prevStep ? prevStep.valueAfter : null, step.valueAfter);
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
  refs.stepText.textContent = `步骤 ${safe + 1}/${state.demoSteps.length}：${step.narration}${formulaText}，变化算珠：${changedText}，当前值 ${step.valueAfter}`;
}

function buildDemo() {
  stopAutoPlay();
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

  state.demoSteps = buildStepsForExpression(left, op, right);
  state.stepIndex = 0;
  refs.expressionText.textContent = `题目：${left} ${op} ${right} = ${result}`;
  showStep(0, { animate: false });
}

function nextStep() {
  if (!state.demoSteps.length) {
    refs.stepText.textContent = "请先生成演示。";
    return;
  }
  if (state.stepIndex >= state.demoSteps.length - 1) {
    stopAutoPlay();
    refs.stepText.textContent = "已到最后一步。";
    return;
  }
  const shouldAnimate = !state.isAnimating;
  showStep(state.stepIndex + 1, { animate: shouldAnimate });
}

function prevStep() {
  if (!state.demoSteps.length) {
    refs.stepText.textContent = "请先生成演示。";
    return;
  }
  if (state.stepIndex <= 0) {
    refs.stepText.textContent = "已到第一步。";
    return;
  }
  showStep(state.stepIndex - 1, { animate: false });
}

function toggleAutoPlay() {
  if (!state.demoSteps.length) {
    refs.stepText.textContent = "请先生成演示。";
    return;
  }
  if (state.autoPlayTimer) {
    stopAutoPlay();
    return;
  }
  refs.autoPlayBtn.textContent = "暂停播放";
  state.autoPlayTimer = window.setTimeout(function playNext() {
    if (state.isAnimating) {
      state.autoPlayTimer = window.setTimeout(playNext, 80);
      return;
    }
    if (state.stepIndex >= state.demoSteps.length - 1) {
      stopAutoPlay();
      refs.stepText.textContent = "自动播放结束：已到最后一步。";
      return;
    }
    showStep(state.stepIndex + 1, { animate: true });
    state.autoPlayTimer = window.setTimeout(playNext, AUTO_PLAY_STEP_DELAY);
  }, AUTO_PLAY_START_DELAY);
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
  stopStepAnimation();
  if (state.clearHighlightTimer) {
    window.clearTimeout(state.clearHighlightTimer);
    state.clearHighlightTimer = null;
  }
  state.demoSteps = [];
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
