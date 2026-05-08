const { buildCalcSteps } = require("./calc-planner");
const { deriveDisplaySteps } = require("./display-planner");
const { buildRunScript } = require("./script-builder");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyScript(problem) {
  const calcSteps = buildCalcSteps(problem);
  const displaySteps = deriveDisplaySteps(calcSteps, { rodCount: 4, upperBeadCount: 2 });
  const script = buildRunScript(problem, displaySteps, { maxValue: 999 });

  // meta 完整性
  assert(script.meta && typeof script.meta.expression === "string", "meta.expression 缺失");
  assert(typeof script.meta.sceneCount === "number", "meta.sceneCount 缺失");
  assert(typeof script.meta.frameCount === "number", "meta.frameCount 缺失");
  assert(typeof script.meta.animationCount === "number", "meta.animationCount 缺失");
  assert(typeof script.meta.beadFrameCount === "number", "meta.beadFrameCount 缺失");

  // 场/帧 数量一致
  assert(Array.isArray(script.scenes), "scenes 缺失");
  assert(Array.isArray(script.frames), "frames 缺失");
  assert(script.frames.length === displaySteps.length, "frames 总数与 displaySteps 不符");
  assert(script.meta.frameCount === script.frames.length, "meta.frameCount 与实际不符");
  assert(script.meta.sceneCount === script.scenes.length, "meta.sceneCount 与实际不符");

  // 累计校验
  const sumAnim = script.scenes.reduce((s, sc) => s + sc.animationCount, 0);
  const sumBead = script.scenes.reduce((s, sc) => s + sc.beadFrameCount, 0);
  const sumFrame = script.scenes.reduce((s, sc) => s + sc.frameCount, 0);
  assert(sumAnim === script.meta.animationCount, "动画累计与 meta 不符");
  assert(sumBead === script.meta.beadFrameCount, "珠帧累计与 meta 不符");
  assert(sumFrame === script.meta.frameCount, "帧累计与 meta 不符");

  // 每场结构合规
  let runningCount = 0;
  for (const scene of script.scenes) {
    assert(typeof scene.sceneId === "string", "sceneId 缺失");
    assert(typeof scene.fromCalcStep === "string", "scene.fromCalcStep 缺失");
    assert(typeof scene.operatingPlace === "number", "scene.operatingPlace 缺失");
    assert(typeof scene.operatingDigit === "number", "scene.operatingDigit 缺失");
    assert(scene.op === "+" || scene.op === "-", "scene.op 错误");
    assert(typeof scene.technique === "string", "scene.technique 缺失");
    assert(scene.frames[0].type === "focus", "场首帧必须是 focus");
    assert(scene.frames[scene.frames.length - 1].type === "confirm", "场尾帧必须是 confirm");
    runningCount += scene.frames.length;
  }
  assert(runningCount === script.frames.length, "scenes.frames 累计 ≠ flat frames 数");

  // flat frames 与 scenes.frames 顺序对齐
  let cursor = 0;
  for (const scene of script.scenes) {
    for (const f of scene.frames) {
      const flat = script.frames[cursor];
      assert(flat.frameId === f.frameId, `flat 顺序错位 ${flat.frameId} vs ${f.frameId}`);
      assert(flat.sceneId === scene.sceneId, `flat 缺 sceneId 或错配 ${flat.frameId}`);
      cursor += 1;
    }
  }

  // 末帧 valueAfter 是结果（前提：至少存在帧）
  if (script.frames.length > 0) {
    const last = script.frames[script.frames.length - 1];
    const expected = problem.op === "+" ? problem.left + problem.right : problem.left - problem.right;
    assert(last.valueAfter === expected, `末帧 valueAfter 错: ${last.valueAfter} != ${expected}`);
  }
}

const cases = [
  { left: 12, op: "+", right: 23 },
  { left: 27, op: "+", right: 18 },
  { left: 23, op: "-", right: 18 },
  { left: 50, op: "-", right: 27 },
  { left: 407, op: "+", right: 586 },
  { left: 999, op: "+", right: 1 },
  { left: 1000, op: "-", right: 1 },
  { left: 100, op: "-", right: 0 },
  { left: 50, op: "+", right: 100 }
];

cases.forEach(verifyScript);

function runRandom(rounds = 1500) {
  for (let i = 0; i < rounds; i += 1) {
    const plus = Math.random() < 0.5;
    const left = Math.floor(Math.random() * 1000);
    const rightRaw = Math.floor(Math.random() * 1000);
    const problem = plus
      ? { left, op: "+", right: rightRaw }
      : { left, op: "-", right: Math.min(left, rightRaw) };
    verifyScript(problem);
  }
}

runRandom();
console.log("script-builder tests passed (fixed + random).");

console.log("\n========= 分镜结构示例 =========");

function dumpScript(problem, label) {
  const calcSteps = buildCalcSteps(problem);
  const displaySteps = deriveDisplaySteps(calcSteps, { rodCount: 4, upperBeadCount: 2 });
  const script = buildRunScript(problem, displaySteps);
  console.log(`\n--- ${label}: ${script.meta.expression} ---`);
  console.log(`  meta: 场=${script.meta.sceneCount}, 帧=${script.meta.frameCount}, 动画=${script.meta.animationCount}, 珠帧=${script.meta.beadFrameCount}`);
  for (const scene of script.scenes) {
    const head = `${scene.sceneId} [k${scene.operatingPlace} ${scene.op}${scene.operatingDigit} ${scene.technique}]  ${scene.valueBefore}→${scene.valueAfter}`;
    const stat = `帧=${scene.frameCount}, 动画=${scene.animationCount}, 珠帧=${scene.beadFrameCount}`;
    console.log(`  ${head}  (${stat})`);
    for (const f of scene.frames) {
      const dt = f.type === "move"
        ? `Δ上=${f.upperDelta} Δ下=${f.lowerDelta} 帧=${f.beadOps.length}`
        : `val=${f.valueAfter}`;
      console.log(`    · ${f.frameId} ${f.type}@k${f.placeIndex}  ${f.narration}  | ${dt}`);
    }
  }
}

dumpScript({ left: 4, op: "+", right: 3 }, "凑五加");
dumpScript({ left: 27, op: "+", right: 18 }, "多位含进位");
dumpScript({ left: 50, op: "-", right: 27 }, "多位含退位");
dumpScript({ left: 999, op: "+", right: 1 }, "连环进位");
dumpScript({ left: 50, op: "+", right: 100 }, "含跳过位（b=0 不产场）");

console.log("\n========= 随机 3000 题分镜统计 =========");
{
  const acc = { cases: 0, scenes: 0, frames: 0, animations: 0, beadFrames: 0 };
  for (let i = 0; i < 3000; i += 1) {
    const plus = Math.random() < 0.5;
    const left = Math.floor(Math.random() * 1000);
    const rightRaw = Math.floor(Math.random() * 1000);
    const problem = plus
      ? { left, op: "+", right: rightRaw }
      : { left, op: "-", right: Math.min(left, rightRaw) };
    const calcSteps = buildCalcSteps(problem);
    const displaySteps = deriveDisplaySteps(calcSteps, { rodCount: 4, upperBeadCount: 2 });
    const s = buildRunScript(problem, displaySteps);
    acc.cases += 1;
    acc.scenes += s.meta.sceneCount;
    acc.frames += s.meta.frameCount;
    acc.animations += s.meta.animationCount;
    acc.beadFrames += s.meta.beadFrameCount;
  }
  console.log(`  共 ${acc.cases} 题：场=${acc.scenes}，帧=${acc.frames}，动画=${acc.animations}，珠帧=${acc.beadFrames}`);
  console.log(`  人均: 场=${(acc.scenes / acc.cases).toFixed(2)}，帧=${(acc.frames / acc.cases).toFixed(2)}，动画=${(acc.animations / acc.cases).toFixed(2)}，珠帧=${(acc.beadFrames / acc.cases).toFixed(2)}`);
  console.log(`  场均: 帧=${(acc.frames / Math.max(1, acc.scenes)).toFixed(2)}，动画=${(acc.animations / Math.max(1, acc.scenes)).toFixed(2)}，珠帧=${(acc.beadFrames / Math.max(1, acc.scenes)).toFixed(2)}`);
  console.log(`  动画均: 珠帧=${(acc.beadFrames / Math.max(1, acc.animations)).toFixed(2)}`);
}
