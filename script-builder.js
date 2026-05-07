(function factoryScriptBuilder(rootFactory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = rootFactory();
  } else if (typeof window !== "undefined") {
    window.ScriptBuilder = rootFactory();
  }
})(function createScriptBuilder() {
  function ensureProblem(problem) {
    if (!problem || typeof problem !== "object") {
      throw new Error("problem 必须是对象。");
    }
    const { left, right, op } = problem;
    if (!Number.isInteger(left) || !Number.isInteger(right)) {
      throw new Error("problem.left/right 必须是整数。");
    }
    if (op !== "+" && op !== "-") {
      throw new Error("problem.op 仅支持 + 或 -。");
    }
  }

  function ensureDisplaySteps(displaySteps) {
    if (!Array.isArray(displaySteps) || displaySteps.length === 0) {
      throw new Error("displaySteps 不能为空。");
    }
  }

  function buildRunScript(problem, displaySteps, options = {}) {
    ensureProblem(problem);
    ensureDisplaySteps(displaySteps);
    const { maxValue = 999, version = "1.0" } = options;
    const result = problem.op === "+" ? problem.left + problem.right : problem.left - problem.right;
    return {
      meta: {
        expression: `${problem.left} ${problem.op} ${problem.right} = ${result}`,
        maxValue,
        version
      },
      frames: displaySteps.map((step) => ({
        frameId: step.id,
        fromCalcStep: step.fromCalcStep,
        type: step.type,
        placeIndex: step.placeIndex,
        valueAfter: step.valueAfter,
        animate: Boolean(step.animate),
        highlightBeads: step.highlightBeads || [],
        narration: step.narration || "",
        formula: step.formula || ""
      }))
    };
  }

  return {
    buildRunScript
  };
});

