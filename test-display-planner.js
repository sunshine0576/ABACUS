const { buildCalcSteps } = require("./calc-planner");
const { deriveDisplaySteps } = require("./display-planner");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyMapping(calcSteps, displaySteps) {
  assert(displaySteps.length > 0, "displaySteps 不能为空");
  const grouped = new Map();
  for (const step of displaySteps) {
    if (!grouped.has(step.fromCalcStep)) {
      grouped.set(step.fromCalcStep, []);
    }
    grouped.get(step.fromCalcStep).push(step);
  }

  for (const calc of calcSteps) {
    const actions = grouped.get(calc.id) || [];
    assert(actions.length >= 3, `${calc.id} 映射动作数量不足`);
    assert(actions.some((a) => a.type === "focus"), `${calc.id} 缺少 focus`);
    assert(actions.some((a) => a.type === "move"), `${calc.id} 缺少 move`);
    assert(actions.some((a) => a.type === "confirm"), `${calc.id} 缺少 confirm`);
    const move = actions.find((a) => a.type === "move");
    assert(Boolean(move.animate), `${calc.id} move 必须动画`);
    assert(Array.isArray(move.highlightBeads), `${calc.id} move 缺少 highlightBeads`);
    const confirm = actions.find((a) => a.type === "confirm");
    assert(confirm.valueAfter === calc.valueAfter, `${calc.id} confirm valueAfter 不一致`);
    assert(Array.isArray(confirm.highlightBeads), `${calc.id} confirm 缺少 highlightBeads`);
  }

  for (let i = 1; i <= displaySteps.length; i += 1) {
    assert(displaySteps[i - 1].id === `d${i}`, "DisplayStep id 序列不连续");
  }
}

function runCases() {
  const cases = [
    { left: 12, op: "+", right: 23 },
    { left: 27, op: "+", right: 18 },
    { left: 23, op: "-", right: 18 },
    { left: 50, op: "-", right: 27 },
    { left: 999, op: "+", right: 1 }
  ];

  for (const problem of cases) {
    const calcSteps = buildCalcSteps(problem);
    const displaySteps = deriveDisplaySteps(calcSteps, { includeExplain: true, rodCount: 3, upperBeadCount: 2 });
    verifyMapping(calcSteps, displaySteps);
  }
}

function randomInt(maxInclusive) {
  return Math.floor(Math.random() * (maxInclusive + 1));
}

function runRandom(rounds = 3000) {
  for (let i = 0; i < rounds; i += 1) {
    const plus = Math.random() < 0.5;
    const left = randomInt(999);
    const rightRaw = randomInt(999);
    const problem = plus
      ? { left, op: "+", right: rightRaw }
      : { left, op: "-", right: Math.min(left, rightRaw) };
    const calcSteps = buildCalcSteps(problem);
    const displaySteps = deriveDisplaySteps(calcSteps, { includeExplain: true, rodCount: 3, upperBeadCount: 2 });
    verifyMapping(calcSteps, displaySteps);
  }
}

runCases();
runRandom();
console.log("display-planner tests passed (fixed + random).");

