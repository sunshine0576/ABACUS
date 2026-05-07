const PLACE_NAMES = ["个位", "十位", "百位", "千位", "万位"];
const DEFAULT_ROD_COUNT = 3;
const DEFAULT_UPPER_BEAD_COUNT = 2;

function placeName(placeIndex) {
  return PLACE_NAMES[placeIndex] || `第${placeIndex + 1}位`;
}

function ensureCalcSteps(calcSteps) {
  if (!Array.isArray(calcSteps) || calcSteps.length === 0) {
    throw new Error("calcSteps 不能为空。");
  }
}

function emptyHighlightBeads(rodCount) {
  return Array.from({ length: rodCount }, () => ({ upper: [], lower: [] }));
}

function decomposeDigit(digit) {
  const safe = Math.max(0, Math.min(9, Math.floor(digit)));
  return {
    upperCount: safe >= 5 ? 1 : 0,
    lowerCount: safe % 5
  };
}

function placeIndexToRodIndex(placeIndex, rodCount) {
  return rodCount - 1 - placeIndex;
}

function highlightForDigit(placeIndex, digit, config) {
  const { rodCount, upperBeadCount } = config;
  const rodIndex = placeIndexToRodIndex(placeIndex, rodCount);
  const output = emptyHighlightBeads(rodCount);
  if (rodIndex < 0 || rodIndex >= rodCount) return output;
  const d = decomposeDigit(digit);
  for (let i = 0; i < d.upperCount; i += 1) {
    output[rodIndex].upper.push(upperBeadCount - 1 - i);
  }
  for (let i = 0; i < d.lowerCount; i += 1) {
    output[rodIndex].lower.push(i);
  }
  return output;
}

function highlightForMove(step, config) {
  const { rodCount, upperBeadCount } = config;
  const rodIndex = placeIndexToRodIndex(step.placeIndex, rodCount);
  const output = emptyHighlightBeads(rodCount);
  if (rodIndex < 0 || rodIndex >= rodCount) return output;
  const prev = decomposeDigit(step.lhsDigit);
  const next = decomposeDigit(step.digitResult);
  if (prev.upperCount !== next.upperCount) {
    const startUpper = Math.min(prev.upperCount, next.upperCount);
    const endUpper = Math.max(prev.upperCount, next.upperCount);
    for (let i = startUpper; i < endUpper; i += 1) {
      output[rodIndex].upper.push(upperBeadCount - 1 - i);
    }
  }
  if (prev.lowerCount !== next.lowerCount) {
    const startLower = Math.min(prev.lowerCount, next.lowerCount);
    const endLower = Math.max(prev.lowerCount, next.lowerCount);
    for (let i = startLower; i < endLower; i += 1) {
      output[rodIndex].lower.push(i);
    }
  }
  return output;
}

function buildMoveNarration(step) {
  const pn = placeName(step.placeIndex);
  const opWord = step.op === "+" ? "加" : "减";
  let text = `${pn}${opWord} ${step.rhsDigit}`;
  if (step.carryOut > 0) {
    text += `，向高位进 ${step.carryOut}`;
  }
  if (step.borrowOut > 0) {
    text += "，向高位借 1";
  }
  return text;
}

function buildMoveFormula(step) {
  if (step.op === "+") {
    return `${step.lhsDigit} + ${step.rhsDigit} + carryIn(${step.carryIn}) = ${step.raw}`;
  }
  if (step.borrowOut > 0) {
    return `${step.lhsDigit} - ${step.rhsDigit} - borrowIn(${step.borrowIn})，借位后结果 ${step.digitResult}`;
  }
  return `${step.lhsDigit} - ${step.rhsDigit} - borrowIn(${step.borrowIn}) = ${step.digitResult}`;
}

function buildConfirmFormula(step) {
  const delta = step.rhsDigit * step.placeValue;
  const op = step.op;
  return `${step.valueBefore} ${op} ${delta} = ${step.valueAfter}`;
}

function deriveDisplaySteps(calcSteps, options = {}) {
  ensureCalcSteps(calcSteps);
  const {
    includeExplain = false,
    rodCount = DEFAULT_ROD_COUNT,
    upperBeadCount = DEFAULT_UPPER_BEAD_COUNT
  } = options;
  const config = { rodCount, upperBeadCount };
  const output = [];
  let idx = 1;

  for (const step of calcSteps) {
    const pn = placeName(step.placeIndex);
    const opWord = step.op === "+" ? "加" : "减";

    output.push({
      id: `d${idx++}`,
      fromCalcStep: step.id,
      type: "focus",
      placeIndex: step.placeIndex,
      animate: false,
      valueAfter: step.valueBefore,
      narration: `${pn}当前是 ${step.lhsDigit}，准备${opWord} ${step.rhsDigit}`,
      formula: "",
      highlightBeads: highlightForDigit(step.placeIndex, step.lhsDigit, config)
    });

    if (includeExplain && (step.carryOut > 0 || step.borrowOut > 0)) {
      output.push({
        id: `d${idx++}`,
        fromCalcStep: step.id,
        type: "explain",
        placeIndex: step.placeIndex,
        animate: false,
        valueAfter: step.valueBefore,
        narration: step.carryOut > 0 ? `${pn}满十，准备向高位进1` : `${pn}不够减，先向高位借1`,
        formula: "",
        highlightBeads: highlightForDigit(step.placeIndex, step.lhsDigit, config)
      });
    }

    output.push({
      id: `d${idx++}`,
      fromCalcStep: step.id,
      type: "move",
      placeIndex: step.placeIndex,
      animate: true,
      valueAfter: step.valueAfter,
      narration: buildMoveNarration(step),
      formula: buildMoveFormula(step),
      highlightBeads: highlightForMove(step, config)
    });

    output.push({
      id: `d${idx++}`,
      fromCalcStep: step.id,
      type: "confirm",
      placeIndex: step.placeIndex,
      animate: false,
      valueAfter: step.valueAfter,
      narration: `${pn}结果是 ${step.digitResult}`,
      formula: buildConfirmFormula(step),
      highlightBeads: highlightForDigit(step.placeIndex, step.digitResult, config)
    });
  }

  return output;
}

function moduleApi() {
  return {
    deriveDisplaySteps
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = moduleApi();
} else if (typeof window !== "undefined") {
  window.DisplayPlanner = moduleApi();
}

