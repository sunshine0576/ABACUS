const { buildCalcSteps } = require("./calc-planner");
const { deriveDisplaySteps } = require("./display-planner");
const { buildRunScript } = require("./script-builder");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyScript(problem) {
  const calcSteps = buildCalcSteps(problem);
  const displaySteps = deriveDisplaySteps(calcSteps, { includeExplain: true, rodCount: 3, upperBeadCount: 2 });
  const script = buildRunScript(problem, displaySteps, { maxValue: 999 });
  assert(script.meta && typeof script.meta.expression === "string", "meta.expression 缺失");
  assert(Array.isArray(script.frames) && script.frames.length === displaySteps.length, "frames 数量不一致");
  const last = script.frames[script.frames.length - 1];
  const expected = problem.op === "+" ? problem.left + problem.right : problem.left - problem.right;
  assert(last.valueAfter === expected, `最终帧值错误: ${last.valueAfter} != ${expected}`);
  for (const frame of script.frames) {
    assert(typeof frame.frameId === "string", "frameId 缺失");
    assert(typeof frame.fromCalcStep === "string", "fromCalcStep 缺失");
    assert(Array.isArray(frame.highlightBeads), "highlightBeads 缺失");
  }
}

const cases = [
  { left: 12, op: "+", right: 23 },
  { left: 27, op: "+", right: 18 },
  { left: 23, op: "-", right: 18 },
  { left: 50, op: "-", right: 27 },
  { left: 407, op: "+", right: 586 }
];

cases.forEach(verifyScript);
console.log("script-builder tests passed.");

