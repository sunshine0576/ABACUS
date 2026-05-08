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
    if (!Array.isArray(displaySteps)) {
      throw new Error("displaySteps 必须是数组。");
    }
  }

  function frameFromDisplay(step) {
    const base = {
      frameId: step.id,
      fromCalcStep: step.fromCalcStep,
      type: step.type,
      placeIndex: step.placeIndex,
      valueAfter: step.valueAfter,
      animate: Boolean(step.animate),
      highlightBeads: step.highlightBeads || [],
      narration: step.narration || "",
      formula: step.formula || ""
    };
    if (step.type === "move") {
      base.upperDelta = step.upperDelta;
      base.lowerDelta = step.lowerDelta;
      base.beadOps = step.beadOps || [];
      base.fromDigit = step.fromDigit;
      base.toDigit = step.toDigit;
      base.isMainPlace = Boolean(step.isMainPlace);
    }
    if (step.type === "focus") {
      base.technique = step.technique;
      base.op = step.op;
      base.operatingDigit = step.operatingDigit;
    }
    return base;
  }

  function groupIntoScenes(displaySteps) {
    const scenes = [];
    const indexMap = new Map();
    for (const step of displaySteps) {
      let scene;
      if (indexMap.has(step.fromCalcStep)) {
        scene = scenes[indexMap.get(step.fromCalcStep)];
      } else {
        scene = {
          sceneId: `s${scenes.length + 1}`,
          fromCalcStep: step.fromCalcStep,
          frames: []
        };
        indexMap.set(step.fromCalcStep, scenes.length);
        scenes.push(scene);
      }
      scene.frames.push(frameFromDisplay(step));
    }
    return scenes;
  }

  function enrichScene(scene) {
    const focus = scene.frames.find((f) => f.type === "focus");
    const confirm = scene.frames.find((f) => f.type === "confirm");
    const moves = scene.frames.filter((f) => f.type === "move");
    scene.operatingPlace = focus ? focus.placeIndex : null;
    scene.operatingDigit = focus ? focus.operatingDigit : null;
    scene.op = focus ? focus.op : null;
    scene.technique = focus ? focus.technique : null;
    scene.valueBefore = focus ? focus.valueAfter : null;
    scene.valueAfter = confirm ? confirm.valueAfter : (moves.length ? moves[moves.length - 1].valueAfter : null);
    scene.frameCount = scene.frames.length;
    scene.animationCount = moves.length;
    scene.beadFrameCount = moves.reduce((sum, m) => sum + (m.beadOps ? m.beadOps.length : 0), 0);
  }

  function buildRunScript(problem, displaySteps, options = {}) {
    ensureProblem(problem);
    ensureDisplaySteps(displaySteps);
    const { maxValue = 999, version = "2.0" } = options;
    const result = problem.op === "+" ? problem.left + problem.right : problem.left - problem.right;

    const scenes = groupIntoScenes(displaySteps);
    scenes.forEach(enrichScene);

    const flatFrames = [];
    for (const scene of scenes) {
      for (const frame of scene.frames) {
        flatFrames.push({ ...frame, sceneId: scene.sceneId });
      }
    }

    const totalAnimations = scenes.reduce((sum, s) => sum + s.animationCount, 0);
    const totalBeadFrames = scenes.reduce((sum, s) => sum + s.beadFrameCount, 0);

    return {
      meta: {
        expression: `${problem.left} ${problem.op} ${problem.right} = ${result}`,
        maxValue,
        version,
        sceneCount: scenes.length,
        frameCount: flatFrames.length,
        animationCount: totalAnimations,
        beadFrameCount: totalBeadFrames
      },
      scenes,
      frames: flatFrames
    };
  }

  return {
    buildRunScript
  };
});
