(function factoryCalcPlanner(rootFactory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = rootFactory();
  } else if (typeof window !== "undefined") {
    window.CalcPlanner = rootFactory();
  }
})(function createCalcPlanner() {
  const DEFAULT_BASE = 10;

  function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function digitAt(value, placeIndex, base) {
    return Math.floor(value / (base ** placeIndex)) % base;
  }

  function computePlaceValue(placeIndex, base) {
    return base ** placeIndex;
  }

  function validateProblem(problem) {
    if (!problem || typeof problem !== "object") {
      throw new Error("problem 必须是对象。");
    }
    const { left, right, op, base = DEFAULT_BASE } = problem;
    if (!isNonNegativeInteger(left) || !isNonNegativeInteger(right)) {
      throw new Error("left/right 必须是非负整数。");
    }
    if (op !== "+" && op !== "-") {
      throw new Error("op 仅支持 + 或 -。");
    }
    if (!Number.isInteger(base) || base < 2) {
      throw new Error("base 必须是 >= 2 的整数。");
    }
  }

  function buildCalcSteps(problem) {
    validateProblem(problem);
    const { left, right, op, base = DEFAULT_BASE } = problem;
    const steps = [];
    const maxDigits = Math.max(1, String(right).length);
    let currentValue = left;

    for (let placeIndex = 0; placeIndex < maxDigits; placeIndex += 1) {
      const placeValue = computePlaceValue(placeIndex, base);
      const lhsDigit = digitAt(currentValue, placeIndex, base);
      const rhsDigit = digitAt(right, placeIndex, base);
      const a = Math.floor(currentValue / placeValue);
      const b = rhsDigit;
      const raw = op === "+" ? (a + b) : (a - b);
      const valueBefore = currentValue;
      const delta = b * placeValue;
      const valueAfter = op === "+" ? (valueBefore + delta) : (valueBefore - delta);
      const digitResult = digitAt(valueAfter, placeIndex, base);

      steps.push({
        id: `c${placeIndex + 1}`,
        placeIndex,
        placeValue,
        op,
        a,
        b,
        displayCall: {
          fn: "display",
          args: { a, b, k: placeIndex }
        },
        lhsDigit,
        rhsDigit,
        carryIn: 0,
        borrowIn: 0,
        raw,
        digitResult,
        carryOut: 0,
        borrowOut: 0,
        valueBefore,
        valueAfter
      });

      currentValue = valueAfter;
    }

    return steps;
  }

  return {
    buildCalcSteps
  };
});

