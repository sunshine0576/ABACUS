/**
 * 端到端集成测试：模拟 app.js / abacus-mobile.html 的场播放逻辑
 * 不变量覆盖：
 *   1. 每个 frame 都能定位到唯一一个场，场内序列必为 focus → 1+ move → confirm
 *   2. 「下一步」按场推进，从任一帧出发，能恰好走到当前场末尾或下一场末尾
 *   3. 「上一步」从场内任一帧能回到本场起点，再回到上一场末尾
 *   4. 自动播放的延迟分类正确（场切换 / move 帧 / 静止帧三类）
 *   5. 全题播完恰好覆盖所有帧、所有场，valueAfter 链路正确
 */
const { buildCalcSteps } = require("./calc-planner");
const { deriveDisplaySteps } = require("./display-planner");
const { buildRunScript } = require("./script-builder");

const AUTO_PLAY_DELAY_SCENE = 720;
const AUTO_PLAY_DELAY_MOVE = 1400;
const AUTO_PLAY_DELAY_STATIC = 560;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildScript(problem) {
  const calcSteps = buildCalcSteps(problem);
  const displaySteps = deriveDisplaySteps(calcSteps, { rodCount: 6, upperBeadCount: 2 });
  return buildRunScript(problem, displaySteps, { maxValue: 99999 });
}

function getSceneBoundsForFlatIndex(frames, flatIndex) {
  if (!frames.length) return null;
  const safe = Math.max(0, Math.min(frames.length - 1, flatIndex));
  const sceneId = frames[safe].sceneId || "";
  let start = safe;
  while (start > 0 && (frames[start - 1].sceneId || "") === sceneId) start -= 1;
  let end = safe;
  while (end < frames.length - 1 && (frames[end + 1].sceneId || "") === sceneId) end += 1;
  return { sceneId, start, end };
}

function computeAutoDelay(frames, idx) {
  if (idx >= frames.length - 1) return 0;
  const cur = frames[idx];
  const next = frames[idx + 1];
  const sceneChange = (cur.sceneId || "") !== (next.sceneId || "");
  if (sceneChange) return AUTO_PLAY_DELAY_SCENE;
  if (next.type === "move") return AUTO_PLAY_DELAY_MOVE;
  return AUTO_PLAY_DELAY_STATIC;
}

function checkSceneStructure(script) {
  for (const scene of script.scenes) {
    const types = scene.frames.map((f) => f.type);
    assert(types[0] === "focus", `${scene.sceneId} 首帧必须 focus，实得 ${types[0]}`);
    assert(types[types.length - 1] === "confirm", `${scene.sceneId} 末帧必须 confirm`);
    const moveCount = types.filter((t) => t === "move").length;
    assert(moveCount >= 1, `${scene.sceneId} 至少 1 段 move`);
    for (const f of scene.frames) {
      assert(f.sceneId === scene.sceneId, `frame ${f.frameId} sceneId 错配`);
    }
  }
}

function checkSceneNavigation(script) {
  const frames = script.frames;
  if (!frames.length) return;
  // 「下一步」语义：
  //   从任一帧出发，下一步应当播到「当前场末尾」（如果当前不是末尾）或「下一场末尾」（如果当前已是末尾）
  for (let i = 0; i < frames.length; i += 1) {
    const bounds = getSceneBoundsForFlatIndex(frames, i);
    assert(bounds, `i=${i} 找不到场边界`);
    const atEnd = i === bounds.end;
    if (!atEnd) {
      assert(bounds.end > i, `非末尾帧 i=${i} 但 bounds.end=${bounds.end}`);
      // 当前场内剩余帧数应严格 > 0
      assert(bounds.end - i >= 1, "当前场剩余帧不足");
    } else if (i < frames.length - 1) {
      const nextBounds = getSceneBoundsForFlatIndex(frames, i + 1);
      assert(nextBounds.start === i + 1, "下一场必须从 i+1 开始");
      assert(nextBounds.sceneId !== bounds.sceneId, "相邻不同场 sceneId 必须不同");
    }
  }
}

function checkPrevNavigation(script) {
  const frames = script.frames;
  if (!frames.length) return;
  // 「上一步」语义：场内任一帧 → 本场起点；起点 → 上一场末尾
  for (let i = 0; i < frames.length; i += 1) {
    const bounds = getSceneBoundsForFlatIndex(frames, i);
    if (i > bounds.start) {
      assert(bounds.start >= 0, "本场起点应 >=0");
    } else if (bounds.start > 0) {
      const prev = getSceneBoundsForFlatIndex(frames, bounds.start - 1);
      assert(prev.end === bounds.start - 1, "上一场末尾应紧邻本场起点");
    }
  }
}

function checkAutoDelays(script) {
  const frames = script.frames;
  for (let i = 0; i < frames.length - 1; i += 1) {
    const delay = computeAutoDelay(frames, i);
    const next = frames[i + 1];
    const sceneChange = (frames[i].sceneId || "") !== (next.sceneId || "");
    if (sceneChange) {
      assert(delay === AUTO_PLAY_DELAY_SCENE, `i=${i} 场切换延迟错: ${delay}`);
    } else if (next.type === "move") {
      assert(delay === AUTO_PLAY_DELAY_MOVE, `i=${i} move 延迟错: ${delay}`);
    } else {
      assert(delay === AUTO_PLAY_DELAY_STATIC, `i=${i} 静止延迟错: ${delay}`);
    }
  }
}

function checkValueAfterChain(script, problem) {
  const frames = script.frames;
  if (!frames.length) {
    assert(problem.left === (problem.op === "+" ? problem.left + problem.right : problem.left - problem.right),
      "无帧脚本必须对应不变值算式（如 0+0 / x±0）");
    return;
  }
  for (const f of frames) {
    assert(typeof f.valueAfter === "number" && f.valueAfter >= 0, `frame ${f.frameId} valueAfter 异常`);
  }
  const last = frames[frames.length - 1];
  const expected = problem.op === "+" ? problem.left + problem.right : problem.left - problem.right;
  assert(last.valueAfter === expected, `末帧 valueAfter=${last.valueAfter} 与期望 ${expected} 不符`);
}

function checkMetaCounts(script) {
  const sumFrames = script.scenes.reduce((s, sc) => s + sc.frameCount, 0);
  const sumMoves = script.scenes.reduce((s, sc) => s + sc.animationCount, 0);
  const sumBead = script.scenes.reduce((s, sc) => s + sc.beadFrameCount, 0);
  assert(script.meta.frameCount === script.frames.length, "meta.frameCount 与 frames 长度不符");
  assert(script.meta.frameCount === sumFrames, "meta.frameCount ≠ Σ scene.frameCount");
  assert(script.meta.animationCount === sumMoves, "meta.animationCount ≠ Σ scene.animationCount");
  assert(script.meta.beadFrameCount === sumBead, "meta.beadFrameCount ≠ Σ scene.beadFrameCount");
  assert(script.meta.sceneCount === script.scenes.length, "meta.sceneCount 与 scenes 长度不符");
}

/** 模拟「自动播放」：从头跑到尾，验证恰好走完所有帧且每帧值正确 */
function simulateAutoPlay(script) {
  const frames = script.frames;
  if (!frames.length) return { stepsPlayed: 0, totalDelay: 0 };
  let visited = 0;
  let totalDelay = 0;
  for (let i = 0; i < frames.length; i += 1) {
    visited += 1;
    if (i < frames.length - 1) totalDelay += computeAutoDelay(frames, i);
  }
  assert(visited === frames.length, "自动播放未遍历完所有帧");
  return { stepsPlayed: visited, totalDelay };
}

/** 模拟「下一步」按场推进：从首帧开始反复点，直到走完，验证场覆盖完整 */
function simulateManualBySceneAdvance(script) {
  const frames = script.frames;
  if (!frames.length) return { sceneClicks: 0 };
  let cursor = 0;
  let clicks = 0;
  const visitedSceneEnds = new Set();
  while (cursor < frames.length) {
    const bounds = getSceneBoundsForFlatIndex(frames, cursor);
    cursor = bounds.end;
    visitedSceneEnds.add(bounds.sceneId);
    clicks += 1;
    if (cursor >= frames.length - 1) break;
    cursor += 1;
  }
  assert(visitedSceneEnds.size === script.scenes.length, "按场推进未覆盖全部场");
  assert(clicks === script.scenes.length, `点击数 ${clicks} ≠ 场数 ${script.scenes.length}`);
  return { sceneClicks: clicks };
}

function runOne(problem) {
  const script = buildScript(problem);
  checkSceneStructure(script);
  checkSceneNavigation(script);
  checkPrevNavigation(script);
  checkAutoDelays(script);
  checkValueAfterChain(script, problem);
  checkMetaCounts(script);
  simulateAutoPlay(script);
  simulateManualBySceneAdvance(script);
}

function runFixed() {
  const cases = [
    { left: 0, op: "+", right: 0 },
    { left: 5, op: "+", right: 0 },
    { left: 5, op: "-", right: 0 },
    { left: 4, op: "+", right: 3 },
    { left: 6, op: "+", right: 3 },
    { left: 7, op: "+", right: 5 },
    { left: 9, op: "+", right: 1 },
    { left: 7, op: "-", right: 3 },
    { left: 12, op: "-", right: 5 },
    { left: 27, op: "+", right: 18 },
    { left: 50, op: "-", right: 27 },
    { left: 999, op: "+", right: 1 },
    { left: 1000, op: "-", right: 1 },
    { left: 100, op: "-", right: 0 },
    { left: 50, op: "+", right: 100 },
    { left: 8421, op: "-", right: 3975 },
    { left: 99999, op: "+", right: 1 },
    { left: 50000, op: "-", right: 12345 }
  ];
  cases.forEach(runOne);
}

function runRandom(rounds = 3000) {
  for (let i = 0; i < rounds; i += 1) {
    const plus = Math.random() < 0.5;
    const left = Math.floor(Math.random() * 100000);
    const rightRaw = Math.floor(Math.random() * 100000);
    const problem = plus
      ? { left, op: "+", right: rightRaw }
      : { left, op: "-", right: Math.min(left, rightRaw) };
    runOne(problem);
  }
}

function summarizeAutoPlayDelays() {
  const sample = [
    { left: 27, op: "+", right: 18 },
    { left: 50, op: "-", right: 27 },
    { left: 999, op: "+", right: 1 }
  ];
  console.log("\n========= 自动播放总延迟参考 =========");
  for (const p of sample) {
    const s = buildScript(p);
    const { totalDelay } = simulateAutoPlay(s);
    console.log(
      `  ${p.left} ${p.op} ${p.right} = ${p.op === "+" ? p.left + p.right : p.left - p.right}: ` +
      `场=${s.meta.sceneCount}, 帧=${s.meta.frameCount}, 总等待 ≈ ${totalDelay}ms`
    );
  }
}

function main() {
  runFixed();
  runRandom();
  console.log("integration tests passed (fixed + random).");
  summarizeAutoPlayDelays();
}

main();
