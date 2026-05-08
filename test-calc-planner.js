const { buildCalcSteps } = require("./calc-planner");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function expectedResult(left, op, right) {
  return op === "+" ? left + right : left - right;
}

function verifyStepChain(problem, steps) {
  const { left, right, op } = problem;
  const expected = expectedResult(left, op, right);

  assert(Array.isArray(steps) && steps.length > 0, "steps 不能为空。");

  let prevValueAfter = left;
  const expectedStepCount = Math.max(1, String(right).length);
  assert(steps.length === expectedStepCount, `step 数量错误: got=${steps.length}, expected=${expectedStepCount}`);

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const placeValue = 10 ** step.placeIndex;
    const expectedB = Math.floor(right / placeValue) % 10;
    const expectedA = Math.floor(step.valueBefore / placeValue);

    assert(step.id === `c${i + 1}`, `step id 不连续: ${step.id}`);
    assert(step.valueBefore === prevValueAfter, `valueBefore 链路错误: ${step.id}`);
    assert(step.placeIndex === i, `placeIndex 不连续: ${step.id}`);
    assert(step.placeValue === placeValue, `placeValue 错误: ${step.id}`);
    assert(step.op === op, `op 错误: ${step.id}`);
    assert(step.b === expectedB, `b 错误: ${step.id}`);
    assert(step.a === expectedA, `a 错误: ${step.id}`);
    assert(step.displayCall?.fn === "display", `displayCall.fn 错误: ${step.id}`);
    assert(step.displayCall?.args?.a === step.a, `displayCall.args.a 错误: ${step.id}`);
    assert(step.displayCall?.args?.b === step.b, `displayCall.args.b 错误: ${step.id}`);
    assert(step.displayCall?.args?.k === step.placeIndex, `displayCall.args.k 错误: ${step.id}`);
    assert(step.carryIn === 0 && step.carryOut === 0, `carry 字段应恒为 0: ${step.id}`);
    assert(step.borrowIn === 0 && step.borrowOut === 0, `borrow 字段应恒为 0: ${step.id}`);
    assert(step.digitResult >= 0 && step.digitResult <= 9, `digitResult 超范围: ${step.id}`);

    const delta = step.b * step.placeValue;
    const expectedAfter = op === "+" ? (step.valueBefore + delta) : (step.valueBefore - delta);
    assert(step.valueAfter === expectedAfter, `valueAfter 计算错误: ${step.id}`);
    prevValueAfter = step.valueAfter;
  }

  const last = steps[steps.length - 1];
  assert(last.valueAfter === expected, `最终值错误: got=${last.valueAfter}, expected=${expected}`);
}

function randomInt(maxInclusive) {
  return Math.floor(Math.random() * (maxInclusive + 1));
}

function runRandomTests(rounds = 5000) {
  for (let i = 0; i < rounds; i += 1) {
    const isPlus = Math.random() < 0.5;
    const left = randomInt(999);
    const rightRaw = randomInt(999);
    const op = isPlus ? "+" : "-";
    const right = isPlus ? rightRaw : Math.min(rightRaw, left);
    const problem = { left, op, right };
    const steps = buildCalcSteps(problem);
    verifyStepChain(problem, steps);
  }
}

function runFixedCases() {
  const cases = [
    { left: 12, op: "+", right: 23 },
    { left: 27, op: "+", right: 18 },
    { left: 23, op: "-", right: 18 },
    { left: 50, op: "-", right: 27 },
    { left: 999, op: "+", right: 0 },
    { left: 100, op: "-", right: 100 }
  ];
  cases.forEach((problem) => {
    const steps = buildCalcSteps(problem);
    verifyStepChain(problem, steps);
  });
}

function main() {
  runFixedCases();
  runRandomTests(10000);
  console.log("calc-planner tests passed (fixed + random).");
}

main();

