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
    if (op === "-" && left < right) {
      throw new Error("当前减法仅支持 left >= right。");
    }
  }

  function buildCalcSteps(problem) {
    validateProblem(problem);
    const { left, right, op, base = DEFAULT_BASE } = problem;
    const steps = [];
    const maxDigits = Math.max(String(left).length, String(right).length);
    let carry = 0;
    let borrow = 0;
    let valueAfter = 0;

    for (let placeIndex = 0; placeIndex < maxDigits; placeIndex += 1) {
      const placeValue = computePlaceValue(placeIndex, base);
      const lhsDigit = digitAt(left, placeIndex, base);
      const rhsDigit = digitAt(right, placeIndex, base);
      const carryIn = carry;
      const borrowIn = borrow;
      let raw;
      let digitResult;
      let carryOut = 0;
      let borrowOut = 0;

      if (op === "+") {
        raw = lhsDigit + rhsDigit + carryIn;
        digitResult = raw % base;
        carryOut = Math.floor(raw / base);
        borrowOut = 0;
      } else {
        raw = lhsDigit - rhsDigit - borrowIn;
        if (raw < 0) {
          raw += base;
          borrowOut = 1;
        }
        digitResult = raw;
        carryOut = 0;
      }

      const valueBefore = valueAfter;
      valueAfter += digitResult * placeValue;

      steps.push({
        id: `c${placeIndex + 1}`,
        placeIndex,
        placeValue,
        op,
        lhsDigit,
        rhsDigit,
        carryIn,
        borrowIn,
        raw,
        digitResult,
        carryOut,
        borrowOut,
        valueBefore,
        valueAfter
      });

      carry = carryOut;
      borrow = borrowOut;
    }

    if (op === "+" && carry > 0) {
      const placeIndex = maxDigits;
      const placeValue = computePlaceValue(placeIndex, base);
      const valueBefore = valueAfter;
      const digitResult = carry;
      valueAfter += digitResult * placeValue;
      steps.push({
        id: `c${placeIndex + 1}`,
        placeIndex,
        placeValue,
        op,
        lhsDigit: 0,
        rhsDigit: 0,
        carryIn: carry,
        borrowIn: 0,
        raw: carry,
        digitResult,
        carryOut: 0,
        borrowOut: 0,
        valueBefore,
        valueAfter
      });
      carry = 0;
    }

    if (op === "-" && borrow > 0) {
      throw new Error("减法步骤生成失败：最高位仍存在 borrowOut。");
    }

    return steps;
  }

  return {
    buildCalcSteps
  };
});

