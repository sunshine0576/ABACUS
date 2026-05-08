# 算盘项目当前状态与交接文档（v2.0 · 5 档）

> 作用：把目前为止所有改造、契约、坑、跑测方式落到一处，新对话可以从这里直接接着干。
> 下一步任务：**脚本录制（Recording）**——已在末尾给出落地建议与可改造点。

---

## 1. 当前里程碑

| 阶段 | 状态 | 关键提交 |
|---|---|---|
| `calc-planner` 重构为「按位单数字驱动」 | ✓ | `676b4af` 之前 |
| `display-planner` 重构为「按位差分 + 6 大手法」 | ✓ | — |
| `script-builder` 引入 `scenes[] + frames[]` 双视图 | ✓ | — |
| 文档统一到 v2.0（CALC_ENGINE_SPEC / STEP_SPEC） | ✓ | — |
| `app.js` 下一步=按场，自动播放=按帧+差异化延迟 | ✓ | `0a63a16` |
| 端到端集成测试 + 一键测试入口 | ✓ | `d45babc` |
| 算盘扩展为 5 列（万/千/百/十/个，0~99999） | ✓ | `18e6636` |
| 5 列后 `validateRange` 漏改修复 | ✓ | `6d5bc98` |

工作树状态：`main` 与 `origin/main` 同步、clean。

---

## 2. 架构与数据流（v2.0 · 5 档）

```text
Problem  ──>  CalcPlan  ──>  DisplayPlan  ──>  RunScript  ──>  Player(UI)
            (按位单数字)     (按位差分 +     (scenes[] +
             a, b, k)        6 手法分类)    frames[] 双视图)
```

### 四级粒度

| 概念 | 标识 | 含义 |
|---|---|---|
| 题 | `RunScript` | 一道算式 |
| 场 (`scene`) | `sceneId` | 一个 calc step 的全部展示 |
| 帧 (`frame`) | `frameId` | 一个 display step（focus / move / confirm） |
| 珠帧 (`beadOp`) | `beadOps[i]` | 一段 move 内的 `{layer, delta}`（仅 1 或 2 项） |

### 执行顺序公理（不变量）

- **先右后左**：场内 `move.placeIndex` 严格升序（个位 → 高位）
- **先上后下**：单段 `move` 内 `beadOps` 严格 `[upper, lower]`

---

## 3. 关键数据结构（落地版）

### 3.1 CalcStep

```js
{
  id: "c1",
  placeIndex: 0,             // k
  placeValue: 1,             // base ** k
  op: "+",
  a: 27,                     // floor(valueBefore / placeValue)
  b: 8,                      // 右操作数在 k 位的数字
  valueBefore: 27,
  valueAfter: 35,
  displayCall: { fn: "display", args: { a, b, k } }
  // 兼容字段保留但 deprecated：lhsDigit/rhsDigit/raw/digitResult/carry*/borrow* 恒 0
}
```

### 3.2 DisplayStep

```js
// focus
{ id, fromCalcStep, type: "focus", placeIndex, animate: false,
  valueAfter: valueBefore, op, operatingDigit, technique, narration, formula, highlightBeads }

// move（一档变化 = 一段动画）
{ id, fromCalcStep, type: "move", placeIndex, animate: true, valueAfter,
  isMainPlace, fromDigit, toDigit,
  upperDelta, lowerDelta,
  beadOps: [{ layer: "upper", delta }, { layer: "lower", delta }],   // 严格先上后下，仅含非零项
  narration, formula, highlightBeads }

// confirm
{ id, fromCalcStep, type: "confirm", placeIndex, animate: false,
  valueAfter: calc.valueAfter, narration, formula, highlightBeads }
```

`technique` 枚举：`直加 / 凑五加 / 进位加 / 直减 / 破五减 / 退位减`。

### 3.3 RunScript

```js
{
  meta: {
    expression, maxValue, version: "2.0",
    sceneCount, frameCount, animationCount, beadFrameCount
  },
  scenes: [
    {
      sceneId, fromCalcStep,
      operatingPlace, operatingDigit, op, technique,
      valueBefore, valueAfter,
      frameCount, animationCount, beadFrameCount,
      frames: [/* 同 scenes 外的 frames，但仅本场 */]
    }
  ],
  frames: [/* 扁平视图，每帧带 sceneId */]
}
```

`scenes[i].frames` 与 `frames[]` 内的对象**同一引用**；`sceneId` 都已写入。

---

## 4. UI 播放模型（`app.js` / `abacus-mobile.html` 一致）

### 「下一步」= 按场推进

- 从当前帧出发，调用 `playFlatRange(start, sceneEnd, "manual")` 自动连播本场剩余帧。
- 若已在 `confirm`，下一次点击进入下一场首帧并连播到该场 `confirm`。
- 帧间间隔常量：`MANUAL_SCENE_DELAY_MOVE / MANUAL_SCENE_DELAY_STATIC`。

### 「自动播放」= 按全局帧顺序推进

- 每帧播完后，`computeDelayAfterShowingFrame` 给出三种延迟：
  - `AUTO_PLAY_DELAY_SCENE`：下一帧 `sceneId` 不同（场切换）
  - `AUTO_PLAY_DELAY_MOVE`：下一帧是 `move`（含动画余量）
  - `AUTO_PLAY_DELAY_STATIC`：其余（focus→move、move→confirm）
- 用 `state.autoPlaySeq` 让暂停 / 切下一步 / 重建演示能立即作废已排队的回调。

### 「上一步」语义

- 场内任意帧 → 回到本场 `focus`
- 已在 `focus` → 回到上一场 `confirm`
- 边界提示「已到第一场」/「已到最后一场」

### 状态文案

```
场 1/2 · 帧 3/4 · 全局 3/7：{narration}（{formula}），变化算珠：{...}，当前值 35
```

---

## 5. 文件清单

| 文件 | 作用 | 备注 |
|---|---|---|
| `calc-planner.js` | 生成 `CalcPlan` | 90 行，无 carry/borrow 状态 |
| `display-planner.js` | 生成 `DisplayPlan`（按位差分 + 手法分类） | 241 行 |
| `script-builder.js` | 生成 `RunScript`（scenes + frames） | 130+ 行 |
| `app.js` | 桌面端 UI 与播放控制 | 已支持 5 档 / 99999 |
| `abacus-mobile.html` | 移动端单页（依赖外部 calc/display/script JS） | UI 逻辑与 app.js 等价 |
| `index.html` | 桌面端入口 | 资源带 `?v=5col-r2` 版本戳 |
| `styles.css` | 桌面端样式 | `.abacus`、`.rod-labels` 改 `repeat(5, 1fr)`；珠子宽度自适应 |
| `CALC_ENGINE_SPEC.md` | 计算/脚本生成真源 | v2.0 |
| `STEP_SPEC.md` | UI 交互/播放规范 | 含 5 档教学范围 |
| `README.md` | 项目说明 | 含 quick-start |
| `HANDOFF.md`（本文档） | 当前状态与下一步交接 | — |
| `test-calc-planner.js` | 计算层单测 | fixed + 10000 random |
| `test-display-planner.js` | 显示层单测 | fixed + 3000 random + 6 手法分类 + 轨迹与统计输出 |
| `test-script-builder.js` | 脚本层单测 | fixed + 1500 random + 分镜结构 + 3000 题统计 |
| `test-integration.js` | 端到端集成测试 | 模拟 app 的场导航 / 延迟分类不变量 |
| `run-tests.js` | 一键测试入口（支持 `--quiet`） | 全部失败时 exit 1 |
| `package.json` | npm 脚本 | `npm test` |

---

## 6. 跑测与开发

```bash
# 全部测试
node ./run-tests.js
node ./run-tests.js --quiet

# 单独某层
npm run test:calc / test:display / test:script / test:integration
```

### 静态服务器（本地核查）

```bash
python -m http.server 5173 --bind 127.0.0.1
# 访问 http://127.0.0.1:5173/index.html
```

> 浏览器若拿到旧资源，硬刷 `Ctrl+F5` 即可（已加 `?v=...` 版本戳）。

---

## 7. 已知约定 / 边界

- 当前教学范围 `0~99999`（5 档）；超过 `MAX_VALUE` 的结果会在 `buildDemo` 提前拦截。
- 减法当前不支持负数（`left < right` 直接报错）。
- `calc-planner` 在加法末位仍会进位扩到第 N+1 档；但 UI 层 `MAX_VALUE` 限制保证 N 档够用。
- `b=0` 的 calc step 不会产 scene（`displayPlan` 自动跳过）；全 `b=0` 的题（如 `0+0`、`x±0`）会显示「无珠面变化」。
- `DEFAULT_ROD_COUNT = 3` 仍写在 `display-planner.js`，但 UI 总是显式传 `ROD_COUNT=5`，不冲突。

---

## 8. 下一步：脚本录制（Recording）

> 用户要做的下一项任务，下面是建议的接口与改造点，新对话可以直接以此为起点。

### 8.1 录制语义（先对齐再写代码）

需要先和用户确认这几件事，避免做歪：

1. **录制对象是什么？**
   - A. **手动拨珠操作序列**：在「认识算盘数字」模式或自由拨珠下，记录每次珠层动作 → 后续可作为题目素材或回放
   - B. **演示模式的播放轨迹**：直接把当前生成的 `RunScript` 序列化下载（最简，本质就是「保存脚本」）
   - C. **教师手动演示**：在「自由模式」下手动拨珠，录制成可被播放器回放的 `RunScript`（最有意义，但工作量最大）
2. **录制产物格式**：JSON / 自定义紧凑格式 / 视频。建议 JSON（与 `RunScript` 同构或可降级）。
3. **是否带回放**：录制完是否能立刻在同一播放器里回放？
4. **存储位置**：`localStorage` / 文件下载 / 拷贝到剪贴板 / 上传服务端。

### 8.2 推荐落地路径（按工作量从小到大）

#### 路径 A：导出当前 RunScript（30 分钟）

- 在演示面板加「导出脚本」按钮
- 点一下 → `JSON.stringify(state.runScript, null, 2)` → `Blob` → `<a download>` 下载 `.json`
- 同时加「导入脚本」按钮：粘贴 / 上传 JSON → 校验 schema → 直接灌进 `state.runScript`，跳过 `buildRunScriptForExpression` 这步

价值：让题库可保存、可分享。

#### 路径 B：录制手动拨珠为 RunScript（1~2 天）

核心改造点：

1. **新建 `recorder.js`**：在手动模式下监听每次 `handleBeadClick` 的前后状态，差分出 `(placeIndex, fromDigit, toDigit, upperDelta, lowerDelta)`，包成与 `move` 兼容的帧。
2. **场分组策略**：让用户按按钮（"开始录制 / 停止录制 / 切换到下一场"）显式划分场；或者用静默时间窗自动切场。
3. **题面元数据**：录完后弹出表单填 `expression`、`narration`、`technique`（也可通过差分自动猜测）。
4. **导出**：组装成 `RunScript`（scenes + frames）→ JSON 下载。
5. **回放**：用现有 `app.js` 的 `state.runScript = imported` 即可走完整播放管线。

#### 路径 C：教学录制（带文案 / 标签 / 视频帧）（更复杂）

在路径 B 基础上：

- 加同步语音 / 文字旁白录制（Web Speech API / `MediaRecorder`）
- 加分支题型（"试一试" 暂停等待用户拨珠后再继续）
- 加错题统计、回看模式、自动出题

### 8.3 复用既有契约的好处

- `RunScript` schema 已经稳定（v2.0），录制功能只需要**生产符合 schema 的对象**即可，不必改 `app.js` 播放逻辑。
- 集成测试 `test-integration.js` 的不变量函数（`checkSceneStructure / checkSceneNavigation / checkAutoDelays / ...`）可以**直接复用**到录制产物的校验上，写个 `verifyRunScript(script)` 工具函数，所有导入/录制都过一遍。
- `script-builder.js` 的 `enrichScene / groupIntoScenes` 也可以被录制器复用，让录制器只产 `displaySteps`，`buildRunScript` 自己负责打包。

### 8.4 建议在新对话开场怎么提

> 「继续在 abacus 项目里实现『脚本录制』。先按 HANDOFF.md §8 的路径 X 落地，目标是 [一句话目标]。先帮我对齐录制语义、再落代码。」

---

## 9. 极简一览

- **入口**：浏览器打开 `index.html`，命令行 `node run-tests.js`。
- **核心契约**：`Problem → CalcPlan → DisplayPlan → RunScript`，公理「先右后左 / 先上后下」。
- **数据结构稳定点**：`RunScript.scenes[].frames[]`（场首 focus、场尾 confirm、中间 1+ move）。
- **可调常量**：`app.js` 顶部的 `AUTO_PLAY_DELAY_*` / `MANUAL_SCENE_DELAY_*` / `MAX_VALUE` / `ROD_COUNT`。
- **测试不变量**：`test-integration.js` 是录制功能后续的 schema 守门员。
