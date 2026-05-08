(function factoryDisplayPlanner(rootFactory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = rootFactory();
  } else if (typeof window !== "undefined") {
    window.DisplayPlanner = rootFactory();
  }
})(function createDisplayPlanner() {
  const PLACE_NAMES = ["个位", "十位", "百位", "千位", "万位"];
  const DEFAULT_ROD_COUNT = 3;
  const DEFAULT_UPPER_BEAD_COUNT = 2;
  const DEFAULT_BASE = 10;

  function placeName(placeIndex) {
    return PLACE_NAMES[placeIndex] || `第${placeIndex + 1}位`;
  }

  function digitAt(value, placeIndex, base) {
    return Math.floor(value / base ** placeIndex) % base;
  }

  function decomposeDigit(digit) {
    const safe = Math.max(0, Math.min(9, Math.floor(digit)));
    return { upper: safe >= 5 ? 1 : 0, lower: safe % 5 };
  }

  function placeIndexToRodIndex(placeIndex, rodCount) {
    return rodCount - 1 - placeIndex;
  }

  function emptyHighlightBeads(rodCount) {
    return Array.from({ length: rodCount }, () => ({ upper: [], lower: [] }));
  }

  function highlightForDigit(placeIndex, digit, config) {
    const { rodCount, upperBeadCount } = config;
    const rodIndex = placeIndexToRodIndex(placeIndex, rodCount);
    const out = emptyHighlightBeads(rodCount);
    if (rodIndex < 0 || rodIndex >= rodCount) return out;
    const d = decomposeDigit(digit);
    for (let i = 0; i < d.upper; i += 1) {
      out[rodIndex].upper.push(upperBeadCount - 1 - i);
    }
    for (let i = 0; i < d.lower; i += 1) {
      out[rodIndex].lower.push(i);
    }
    return out;
  }

  function highlightForRodChange(placeIndex, fromDigit, toDigit, config) {
    const { rodCount, upperBeadCount } = config;
    const rodIndex = placeIndexToRodIndex(placeIndex, rodCount);
    const out = emptyHighlightBeads(rodCount);
    if (rodIndex < 0 || rodIndex >= rodCount) return out;
    const a = decomposeDigit(fromDigit);
    const b = decomposeDigit(toDigit);
    if (a.upper !== b.upper) {
      const lo = Math.min(a.upper, b.upper);
      const hi = Math.max(a.upper, b.upper);
      for (let j = lo; j < hi; j += 1) {
        out[rodIndex].upper.push(upperBeadCount - 1 - j);
      }
    }
    if (a.lower !== b.lower) {
      const lo = Math.min(a.lower, b.lower);
      const hi = Math.max(a.lower, b.lower);
      for (let j = lo; j < hi; j += 1) {
        out[rodIndex].lower.push(j);
      }
    }
    return out;
  }

  function partialValue(valueBefore, valueAfter, uptoPlace, base) {
    let v = 0;
    for (let i = 0; i <= uptoPlace; i += 1) {
      v += digitAt(valueAfter, i, base) * base ** i;
    }
    const cutoff = base ** (uptoPlace + 1);
    v += Math.floor(valueBefore / cutoff) * cutoff;
    return v;
  }

  function maxRelevantDigits(valueBefore, valueAfter) {
    const a = String(valueBefore).length;
    const b = String(valueAfter).length;
    return Math.max(a, b, 1);
  }

  function collectChangedRods(valueBefore, valueAfter, base) {
    const changes = [];
    const limit = maxRelevantDigits(valueBefore, valueAfter);
    for (let i = 0; i < limit; i += 1) {
      const from = digitAt(valueBefore, i, base);
      const to = digitAt(valueAfter, i, base);
      if (from !== to) {
        changes.push({ placeIndex: i, fromDigit: from, toDigit: to });
      }
    }
    changes.sort((x, y) => x.placeIndex - y.placeIndex);
    return changes;
  }

  function classifyTechnique(op, mainChange, hasCarryOrBorrow) {
    if (op === "+") {
      if (hasCarryOrBorrow) return "进位加";
      if (!mainChange) return "无变化";
      const dU = decomposeDigit(mainChange.toDigit).upper - decomposeDigit(mainChange.fromDigit).upper;
      return dU > 0 ? "凑五加" : "直加";
    }
    if (hasCarryOrBorrow) return "退位减";
    if (!mainChange) return "无变化";
    const dU = decomposeDigit(mainChange.toDigit).upper - decomposeDigit(mainChange.fromDigit).upper;
    return dU < 0 ? "破五减" : "直减";
  }

  function describeBeadOps(upperDelta, lowerDelta) {
    const parts = [];
    if (upperDelta !== 0) parts.push(`上${upperDelta > 0 ? "+" : ""}${upperDelta}`);
    if (lowerDelta !== 0) parts.push(`下${lowerDelta > 0 ? "+" : ""}${lowerDelta}`);
    return parts.length ? parts.join("，") : "无";
  }

  function buildBeadOps(upperDelta, lowerDelta) {
    // 规范：先上后下
    const ops = [];
    if (upperDelta !== 0) ops.push({ layer: "upper", delta: upperDelta });
    if (lowerDelta !== 0) ops.push({ layer: "lower", delta: lowerDelta });
    return ops;
  }

  function buildMoveNarration(ctx) {
    const { rodPlace, mainPlace, op, b, fromDigit, toDigit, upperDelta, lowerDelta } = ctx;
    const beads = describeBeadOps(upperDelta, lowerDelta);
    const pn = placeName(rodPlace);
    if (rodPlace === mainPlace) {
      const opWord = op === "+" ? "加" : "减";
      return `${pn}${opWord}${b}：${beads}（${fromDigit}→${toDigit}）`;
    }
    const tag = op === "+" ? "进位" : "借位";
    return `${pn}${tag}：${beads}（${fromDigit}→${toDigit}）`;
  }

  function buildMoveFormula(ctx) {
    const { rodPlace, mainPlace, op, b, fromDigit, toDigit } = ctx;
    if (rodPlace === mainPlace) {
      const raw = op === "+" ? fromDigit + b : fromDigit - b;
      return `${fromDigit} ${op} ${b} = ${raw}（本位记 ${toDigit}）`;
    }
    if (op === "+") return `进位：${fromDigit} + 1 = ${toDigit}`;
    return `借位：${fromDigit} - 1 = ${toDigit}`;
  }

  function deriveDisplaySteps(calcSteps, options = {}) {
    if (!Array.isArray(calcSteps) || calcSteps.length === 0) {
      throw new Error("calcSteps 不能为空。");
    }
    const {
      rodCount = DEFAULT_ROD_COUNT,
      upperBeadCount = DEFAULT_UPPER_BEAD_COUNT,
      base = DEFAULT_BASE
    } = options;
    const config = { rodCount, upperBeadCount };
    const output = [];
    let idx = 1;

    for (const step of calcSteps) {
      const { id: calcId, valueBefore, valueAfter, op, b, placeIndex: mainPlace } = step;
      if (valueBefore === valueAfter) {
        // 该位 b=0 且无连锁影响，跳过此 calc step 的展示。
        continue;
      }
      const lhsDigit = digitAt(valueBefore, mainPlace, base);
      const targetDigit = digitAt(valueAfter, mainPlace, base);
      const changes = collectChangedRods(valueBefore, valueAfter, base);
      const mainChange = changes.find((c) => c.placeIndex === mainPlace);
      const hasCarryOrBorrow = changes.some((c) => c.placeIndex !== mainPlace);
      const technique = classifyTechnique(op, mainChange, hasCarryOrBorrow);

      output.push({
        id: `d${idx++}`,
        fromCalcStep: calcId,
        type: "focus",
        placeIndex: mainPlace,
        animate: false,
        valueAfter: valueBefore,
        op,
        operatingDigit: b,
        technique,
        narration: `${placeName(mainPlace)}当前是 ${lhsDigit}，准备${op === "+" ? "加" : "减"} ${b}（${technique}）`,
        formula: "",
        highlightBeads: highlightForDigit(mainPlace, lhsDigit, config)
      });

      for (const change of changes) {
        const { placeIndex: rodPlace, fromDigit, toDigit } = change;
        const fromBeads = decomposeDigit(fromDigit);
        const toBeads = decomposeDigit(toDigit);
        const upperDelta = toBeads.upper - fromBeads.upper;
        const lowerDelta = toBeads.lower - fromBeads.lower;
        const ctx = { rodPlace, mainPlace, op, b, fromDigit, toDigit, upperDelta, lowerDelta };

        output.push({
          id: `d${idx++}`,
          fromCalcStep: calcId,
          type: "move",
          placeIndex: rodPlace,
          animate: true,
          valueAfter: partialValue(valueBefore, valueAfter, rodPlace, base),
          isMainPlace: rodPlace === mainPlace,
          fromDigit,
          toDigit,
          upperDelta,
          lowerDelta,
          beadOps: buildBeadOps(upperDelta, lowerDelta),
          narration: buildMoveNarration(ctx),
          formula: buildMoveFormula(ctx),
          highlightBeads: highlightForRodChange(rodPlace, fromDigit, toDigit, config)
        });
      }

      output.push({
        id: `d${idx++}`,
        fromCalcStep: calcId,
        type: "confirm",
        placeIndex: mainPlace,
        animate: false,
        valueAfter,
        narration: `${placeName(mainPlace)}结果是 ${targetDigit}`,
        formula: `本位结果：${targetDigit}`,
        highlightBeads: highlightForDigit(mainPlace, targetDigit, config)
      });
    }

    return output;
  }

  return {
    deriveDisplaySteps
  };
});
