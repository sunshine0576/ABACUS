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

  let prevValueAfter = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    assert(step.id === `c${i + 1}`, `step id 不连续: ${step.id}`);
    assert(step.valueBefore === prevValueAfter, `valueBefore 链路错误: ${step.id}`);
    assert(step.valueAfter >= step.valueBefore, `valueAfter 应非递减: ${step.id}`);
    assert(step.digitResult >= 0 && step.digitResult <= 9, `digitResult 超范围: ${step.id}`);
    assert(!(step.carryOut === 1 && step.borrowOut === 1), `carry/borrow 冲突: ${step.id}`);
    prevValueAfter = step.valueAfter;

    if (i > 0) {
      const prev = steps[i - 1];
      assert(step.carryIn === prev.carryOut, `carry 链路断裂: ${step.id}`);
      assert(step.borrowIn === prev.borrowOut, `borrow 链路断裂: ${step.id}`);
    } else {
      assert(step.carryIn === 0, "首步 carryIn 必须为 0");
      assert(step.borrowIn === 0, "首步 borrowIn 必须为 0");
    }
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

