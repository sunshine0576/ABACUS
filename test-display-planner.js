const { buildCalcSteps } = require("./calc-planner");
const { deriveDisplaySteps } = require("./display-planner");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function digitAt(value, placeIndex, base = 10) {
  return Math.floor(value / base ** placeIndex) % base;
}

function decomposeDigit(d) {
  return { upper: d >= 5 ? 1 : 0, lower: d % 5 };
}

function partialValue(valueBefore, valueAfter, uptoPlace, base = 10) {
  let v = 0;
  for (let i = 0; i <= uptoPlace; i += 1) {
    v += digitAt(valueAfter, i, base) * base ** i;
  }
  const cutoff = base ** (uptoPlace + 1);
  v += Math.floor(valueBefore / cutoff) * cutoff;
  return v;
}

function verifyMapping(calcSteps, displaySteps) {
  const allNoOp = calcSteps.every((c) => c.valueBefore === c.valueAfter);
  if (allNoOp) {
    assert(displaySteps.length === 0, "全步无变化时应产出 0 个展示步");
    return;
  }
  assert(displaySteps.length > 0, "displaySteps 不能为空");

  for (let i = 1; i <= displaySteps.length; i += 1) {
    assert(displaySteps[i - 1].id === `d${i}`, `id 不连续: 期望 d${i}, 得到 ${displaySteps[i - 1].id}`);
  }

  const grouped = new Map();
  for (const ds of displaySteps) {
    if (!grouped.has(ds.fromCalcStep)) grouped.set(ds.fromCalcStep, []);
    grouped.get(ds.fromCalcStep).push(ds);
  }

  for (const calc of calcSteps) {
    const acts = grouped.get(calc.id) || [];
    if (calc.valueBefore === calc.valueAfter) {
      assert(acts.length === 0, `${calc.id} 无变化但产出了展示步`);
      continue;
    }
    assert(acts.length >= 3, `${calc.id} 应至少 focus+move+confirm，实得 ${acts.length}`);

    const focus = acts[0];
    const confirm = acts[acts.length - 1];
    assert(focus.type === "focus", `${calc.id} 首动作必须是 focus`);
    assert(confirm.type === "confirm", `${calc.id} 末动作必须是 confirm`);
    assert(focus.valueAfter === calc.valueBefore, `${calc.id} focus 应停在 valueBefore`);
    assert(confirm.valueAfter === calc.valueAfter, `${calc.id} confirm 应停在 valueAfter`);

    const moves = acts.slice(1, -1);
    assert(moves.length >= 1, `${calc.id} 至少 1 段 move`);
    for (const m of moves) {
      assert(m.type === "move", `${calc.id} 中间段必须是 move`);
      assert(Boolean(m.animate), `${calc.id} move 必须 animate`);
      assert(typeof m.upperDelta === "number" && typeof m.lowerDelta === "number", `${calc.id} move 缺少 deltas`);
      assert(Array.isArray(m.beadOps), `${calc.id} move 缺少 beadOps`);
      // 先上后下顺序
      if (m.beadOps.length === 2) {
        assert(m.beadOps[0].layer === "upper" && m.beadOps[1].layer === "lower", `${calc.id} beadOps 必须先上后下`);
      }
      // 珠态差分应正好等于 fromDigit→toDigit 的拆分差
      const fb = decomposeDigit(m.fromDigit);
      const tb = decomposeDigit(m.toDigit);
      assert(tb.upper - fb.upper === m.upperDelta, `${calc.id} upperDelta 不一致`);
      assert(tb.lower - fb.lower === m.lowerDelta, `${calc.id} lowerDelta 不一致`);
      // 仅当 deltas 非零时才登记 beadOp
      const opsCount = (m.upperDelta !== 0 ? 1 : 0) + (m.lowerDelta !== 0 ? 1 : 0);
      assert(m.beadOps.length === opsCount, `${calc.id} beadOps 长度不一致`);
    }

    // 先右后左：placeIndex 单调递增
    for (let i = 1; i < moves.length; i += 1) {
      assert(moves[i].placeIndex > moves[i - 1].placeIndex, `${calc.id} move 必须按 placeIndex 升序（先右后左）`);
    }

    // 链式 partialValue
    for (const m of moves) {
      const expected = partialValue(calc.valueBefore, calc.valueAfter, m.placeIndex);
      assert(m.valueAfter === expected, `${calc.id} move@${m.placeIndex} valueAfter 应为 ${expected}，实得 ${m.valueAfter}`);
    }
    // 最后一段 move 的 valueAfter 必须等于 calc.valueAfter
    assert(moves[moves.length - 1].valueAfter === calc.valueAfter, `${calc.id} 末 move 应等于 calc.valueAfter`);

    // focus 的 technique 字段必须存在且属于已知集合
    const knownTech = new Set(["直加", "直减", "凑五加", "破五减", "进位加", "退位减", "无变化"]);
    assert(knownTech.has(focus.technique), `${calc.id} focus.technique 未知: ${focus.technique}`);
  }
}

function runFixedCases() {
  const cases = [
    { left: 4, op: "+", right: 3 },
    { left: 6, op: "+", right: 3 },
    { left: 7, op: "+", right: 5 },
    { left: 9, op: "+", right: 1 },
    { left: 7, op: "-", right: 3 },
    { left: 12, op: "-", right: 5 },
    { left: 27, op: "+", right: 18 },
    { left: 50, op: "-", right: 27 },
    { left: 12, op: "+", right: 23 },
    { left: 23, op: "-", right: 18 },
    { left: 999, op: "+", right: 1 },
    { left: 1000, op: "-", right: 1 },
    { left: 100, op: "-", right: 0 },
    { left: 50, op: "+", right: 100 }
  ];
  for (const problem of cases) {
    const calcSteps = buildCalcSteps(problem);
    const displaySteps = deriveDisplaySteps(calcSteps, { rodCount: 4, upperBeadCount: 2 });
    verifyMapping(calcSteps, displaySteps);
  }
}

function runRandom(rounds = 3000) {
  for (let i = 0; i < rounds; i += 1) {
    const plus = Math.random() < 0.5;
    const left = Math.floor(Math.random() * 1000);
    const rightRaw = Math.floor(Math.random() * 1000);
    const problem = plus
      ? { left, op: "+", right: rightRaw }
      : { left, op: "-", right: Math.min(left, rightRaw) };
    const calcSteps = buildCalcSteps(problem);
    const displaySteps = deriveDisplaySteps(calcSteps, { rodCount: 4, upperBeadCount: 2 });
    verifyMapping(calcSteps, displaySteps);
  }
}

function specificTechniqueChecks() {
  const cases = [
    { p: { left: 4, op: "+", right: 3 }, expectTech: "凑五加", mainDeltas: { up: +1, low: -2 } },
    { p: { left: 6, op: "+", right: 3 }, expectTech: "直加", mainDeltas: { up: 0, low: +3 } },
    { p: { left: 7, op: "+", right: 5 }, expectTech: "进位加", mainDeltas: { up: -1, low: 0 } },
    { p: { left: 7, op: "-", right: 3 }, expectTech: "破五减", mainDeltas: { up: -1, low: +2 } },
    { p: { left: 8, op: "-", right: 3 }, expectTech: "直减", mainDeltas: { up: 0, low: -3 } },
    { p: { left: 12, op: "-", right: 5 }, expectTech: "退位减", mainDeltas: { up: +1, low: 0 } },
    { p: { left: 9, op: "+", right: 1 }, expectTech: "进位加", mainDeltas: { up: -1, low: -4 } }
  ];
  for (const { p, expectTech, mainDeltas } of cases) {
    const calcSteps = buildCalcSteps(p);
    const displaySteps = deriveDisplaySteps(calcSteps, { rodCount: 4, upperBeadCount: 2 });
    // 找第一个非空 calc 步对应的 focus
    const firstCalc = calcSteps.find((c) => c.valueBefore !== c.valueAfter);
    const acts = displaySteps.filter((d) => d.fromCalcStep === firstCalc.id);
    const focus = acts.find((a) => a.type === "focus");
    assert(focus.technique === expectTech, `${p.left}${p.op}${p.right}: 期望 technique=${expectTech}，得到 ${focus.technique}`);
    const mainMove = acts.find((a) => a.type === "move" && a.isMainPlace);
    assert(mainMove.upperDelta === mainDeltas.up, `${p.left}${p.op}${p.right}: 主位 upperDelta 期望 ${mainDeltas.up}，得到 ${mainMove.upperDelta}`);
    assert(mainMove.lowerDelta === mainDeltas.low, `${p.left}${p.op}${p.right}: 主位 lowerDelta 期望 ${mainDeltas.low}，得到 ${mainMove.lowerDelta}`);
  }
}

function summarizeStats(displaySteps) {
  // 定义：
  //   动画数 = move 类型的 display 步数
  //   每个动画的帧数 = 该 move 的 beadOps.length（非零差分数，1 或 2）
  const moves = displaySteps.filter((d) => d.type === "move");
  const frameCounts = moves.map((m) => m.beadOps.length);
  const totalFrames = frameCounts.reduce((sum, n) => sum + n, 0);
  const oneFrame = frameCounts.filter((n) => n === 1).length;
  const twoFrame = frameCounts.filter((n) => n === 2).length;
  return {
    displayStepCount: displaySteps.length,
    animationCount: moves.length,
    totalFrames,
    oneFrame,
    twoFrame,
    avgFramesPerAnimation: moves.length === 0 ? 0 : totalFrames / moves.length
  };
}

function traceCase(problem, label, accumulator) {
  const calcSteps = buildCalcSteps(problem);
  const displaySteps = deriveDisplaySteps(calcSteps, { rodCount: 4, upperBeadCount: 2 });
  const stats = summarizeStats(displaySteps);
  const expr = `${problem.left} ${problem.op} ${problem.right} = ${problem.op === "+" ? problem.left + problem.right : problem.left - problem.right}`;
  console.log(`\n--- ${label}: ${expr} ---`);
  for (const ds of displaySteps) {
    const tail = ds.type === "move"
      ? `Δ上=${ds.upperDelta} Δ下=${ds.lowerDelta} | 帧数=${ds.beadOps.length} | val→${ds.valueAfter}`
      : `val=${ds.valueAfter}`;
    const tag = ds.type === "focus" ? `[${ds.technique}]` : "";
    console.log(`  ${ds.id}(${ds.type}@k${ds.placeIndex}) ${tag} ${ds.narration} | ${tail}`);
  }
  console.log(`  统计: display=${stats.displayStepCount}, 动画=${stats.animationCount}, 总帧=${stats.totalFrames} (1帧×${stats.oneFrame}, 2帧×${stats.twoFrame}), 平均帧/动画=${stats.avgFramesPerAnimation.toFixed(2)}`);
  if (accumulator) {
    accumulator.cases += 1;
    accumulator.displaySteps += stats.displayStepCount;
    accumulator.animations += stats.animationCount;
    accumulator.frames += stats.totalFrames;
    accumulator.oneFrame += stats.oneFrame;
    accumulator.twoFrame += stats.twoFrame;
  }
}

function aggregateRandomStats(rounds = 3000) {
  const acc = { cases: 0, displaySteps: 0, animations: 0, frames: 0, oneFrame: 0, twoFrame: 0 };
  for (let i = 0; i < rounds; i += 1) {
    const plus = Math.random() < 0.5;
    const left = Math.floor(Math.random() * 1000);
    const rightRaw = Math.floor(Math.random() * 1000);
    const problem = plus
      ? { left, op: "+", right: rightRaw }
      : { left, op: "-", right: Math.min(left, rightRaw) };
    const calcSteps = buildCalcSteps(problem);
    const displaySteps = deriveDisplaySteps(calcSteps, { rodCount: 4, upperBeadCount: 2 });
    const s = summarizeStats(displaySteps);
    acc.cases += 1;
    acc.displaySteps += s.displayStepCount;
    acc.animations += s.animationCount;
    acc.frames += s.totalFrames;
    acc.oneFrame += s.oneFrame;
    acc.twoFrame += s.twoFrame;
  }
  return acc;
}

function main() {
  runFixedCases();
  specificTechniqueChecks();
  runRandom();
  console.log("display-planner tests passed (fixed + random + technique).");

  console.log("\n========= 轨迹输出 =========");
  const acc = { cases: 0, displaySteps: 0, animations: 0, frames: 0, oneFrame: 0, twoFrame: 0 };
  traceCase({ left: 4, op: "+", right: 3 }, "凑五加", acc);
  traceCase({ left: 6, op: "+", right: 3 }, "直加", acc);
  traceCase({ left: 7, op: "+", right: 5 }, "进位加（个位）", acc);
  traceCase({ left: 7, op: "-", right: 3 }, "破五减", acc);
  traceCase({ left: 12, op: "-", right: 5 }, "退位减", acc);
  traceCase({ left: 27, op: "+", right: 18 }, "多位含进位", acc);
  traceCase({ left: 50, op: "-", right: 27 }, "多位含退位", acc);
  traceCase({ left: 999, op: "+", right: 1 }, "连环进位", acc);
  traceCase({ left: 1000, op: "-", right: 1 }, "连环借位", acc);

  console.log("\n========= 重点用例累计 =========");
  console.log(`  共 ${acc.cases} 个用例，display=${acc.displaySteps}，动画=${acc.animations}，总帧=${acc.frames}（1帧×${acc.oneFrame}, 2帧×${acc.twoFrame}），平均帧/动画=${(acc.frames / Math.max(1, acc.animations)).toFixed(2)}`);

  console.log("\n========= 随机 3000 题统计（0~999 加减） =========");
  const r = aggregateRandomStats(3000);
  console.log(`  共 ${r.cases} 题：display=${r.displaySteps}，动画=${r.animations}，总帧=${r.frames}（1帧×${r.oneFrame}, 2帧×${r.twoFrame}），平均帧/动画=${(r.frames / Math.max(1, r.animations)).toFixed(2)}`);
  console.log(`  人均: display=${(r.displaySteps / r.cases).toFixed(2)}，动画=${(r.animations / r.cases).toFixed(2)}，帧=${(r.frames / r.cases).toFixed(2)}`);
}

main();
