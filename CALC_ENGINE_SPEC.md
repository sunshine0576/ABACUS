# 算盘计算引擎设计规范（v2.0）

## 0. 文档分工与优先级

- 本文档定义 **计算与脚本生成真源**：`Problem -> CalcPlan -> DisplayPlan -> RunScript`。
- `STEP_SPEC.md` 定义 **UI 交互与播放行为**：按钮语义、边界提示、手动拨珠体验。
- 两文档冲突时优先级：
  1. 计算正确性、按位差分契约、脚本字段语义、动画顺序公理（先右后左 / 先上后下），以本文档为准；
  2. 播放节奏、提示文案、交互反馈，以 `STEP_SPEC.md` 为准。
- UI 运行时必须只消费 `RunScript`，不得回流修改计算或脚本语义。

---

## 1. 目标与边界

- 目标：把一个算式分解为可验证的计算事实，再分解为分镜动画，最终生成执行脚本。
- 运行时边界：播放器只执行脚本，不负责推导、补全或修正任何生成逻辑。
- 适用范围：十进制非负整数加减法，当前默认 `0~999`，可扩展至任意位数。
- 核心公理（v2.0）：
  - **计算最小单元 = 任意数 ± 一位数**：每步只处理 `value ± b·base^k`，`b ∈ [0..9]`。
  - **动画由按位差分驱动**：display 层不重新推导进位/借位，而是从 `valueBefore → valueAfter` 的逐位 `(U,L)` 拆分差直接得出珠子动作。
  - **执行顺序公理**：跨档 **先右后左**（个位 → 高位）；单档内 **先上后下**（先动上珠组、再动下珠组）。

---

## 2. 总体流水线

统一采用离线生成 + 在线执行模式：

1. `Problem`（题目输入）
2. `CalcPlan`（计算事实，按位单数字驱动）
3. `DisplayPlan`（动画事实，按位差分展开）
4. `RunScript`（可执行脚本，分镜结构 + 扁平帧）
5. `Player`（纯执行）

约束：

- 上一层是下一层唯一输入来源；
- 每一层可单元测试；
- `Player` 不允许持有"计算推导代码"。

---

## 3. 数据模型

## 3.1 Problem（输入）

```json
{
  "left": 27,
  "op": "+",
  "right": 18,
  "base": 10
}
```

字段：

- `left`、`right`：非负整数
- `op`：`+` 或 `-`
- `base`：默认 10

---

## 3.2 CalcStep（最小计算单元）

每个 `CalcStep` 只处理 **一个位** 的 **加/减一个一位数 b**。

```json
{
  "id": "c1",
  "placeIndex": 0,
  "placeValue": 1,
  "op": "+",
  "a": 27,
  "b": 8,
  "valueBefore": 27,
  "valueAfter": 35,
  "displayCall": { "fn": "display", "args": { "a": 27, "b": 8, "k": 0 } }
}
```

字段定义：

- `placeIndex` (`k`)：当前位索引（0 = 个位）
- `placeValue`：`base ** k`
- `a`：从第 k 位起的整体值，`a = floor(valueBefore / placeValue)`
- `b`：右操作数在第 k 位的数字，`b ∈ [0, base-1]`
- `valueAfter`：`op === "+" ? valueBefore + b·placeValue : valueBefore - b·placeValue`

约束：

- **计算层不再产出 carry/borrow**。所有进位/借位现象会在 display 层从 `valueBefore → valueAfter` 的按位差分中自然展开。
- 步数：`max(1, digits(right))`，每个位都生成一个 step（即使 `b = 0` 也产生 step，保留 calc 链路完整性，display 层会跳过无变化场）。
- 末步：`steps[N-1].valueAfter === left op right`（可重算验证）。

兼容字段（保留但视为 deprecated，不应在新代码中使用）：

- `lhsDigit`、`rhsDigit`、`raw`、`digitResult` 仅作为人话调试辅助；
- `carryIn / carryOut / borrowIn / borrowOut` 已恒为 `0`。

---

## 3.3 DisplayStep（展示动作单元）

`DisplayStep` 由按位差分自动展开，每个 `CalcStep` 派生 `0` 或 `1+` 段：

- `valueBefore === valueAfter`（即 `b=0` 且无连锁影响）：派生 0 段；
- 否则：派生 `focus` + `N 个 move`（N = 变化档数 ≥ 1）+ `confirm`。

通用字段：

```json
{
  "id": "d1",
  "fromCalcStep": "c1",
  "type": "focus|move|confirm",
  "placeIndex": 0,
  "animate": false,
  "valueAfter": 27,
  "narration": "...",
  "formula": "...",
  "highlightBeads": [
    { "upper": [], "lower": [] }
  ]
}
```

`type` 规范：

- `focus`：起始确认（`animate=false`，`valueAfter=valueBefore`）  
  额外字段：
  - `op`：`+` 或 `-`
  - `operatingDigit`：本场的 `b`
  - `technique`：本场所用珠算手法（详见 §4.2）

- `move`：执行单档拨珠（`animate=true`）  
  额外字段：
  - `placeIndex`：本动画操作的档（**可不等于 calc.k**，进位/借位时为高位）
  - `isMainPlace`：是否主操作位
  - `fromDigit`、`toDigit`：本档变化前后的数字
  - `upperDelta`：上珠数变化（`-1, 0, +1`）
  - `lowerDelta`：下珠数变化（`-4..+4`）
  - `beadOps`：有序珠层动作数组，**先上后下**，仅含非零项
    ```json
    [
      { "layer": "upper", "delta": 1 },
      { "layer": "lower", "delta": -2 }
    ]
    ```
  - `valueAfter`：执行完该 move 后的算盘整体数值（partial value）

- `confirm`：结果确认（`animate=false`，`valueAfter=calc.valueAfter`）

按位差分契约：

- 设 `D(d) = (U, L)`，`U = d ≥ 5 ? 1 : 0`，`L = d % 5`
- `upperDelta = D(toDigit).U - D(fromDigit).U`
- `lowerDelta = D(toDigit).L - D(fromDigit).L`
- `move.placeIndex` 在场内严格升序（先右后左）
- `beadOps` 内严格 `[upper, lower]` 顺序（先上后下）
- 每个 `move.valueAfter` = "在 `valueBefore` 上把第 0..placeIndex 位替换成 `valueAfter` 对应位"——这是手在算盘上做完该档拨珠后真实的物理状态，可以为非单调（例如 `27+5` 在主位完成后短暂为 `22`）。

`highlightBeads`：长度为 `rodCount` 的数组，每项 `{ upper: number[], lower: number[] }` 给出该档需要高亮的珠子索引。约定 `rodIndex = rodCount - 1 - placeIndex`（rod 0 在最左、最高位）。

---

## 3.4 RunScript（播放器脚本）

播放器只吃此结构。`scenes[]` 是分镜结构（按 calc step 分组），`frames[]` 是扁平视图（带 `sceneId`），两者一一对应：

```json
{
  "meta": {
    "expression": "27 + 18 = 45",
    "maxValue": 999,
    "version": "2.0",
    "sceneCount": 2,
    "frameCount": 7,
    "animationCount": 3,
    "beadFrameCount": 3
  },
  "scenes": [
    {
      "sceneId": "s1",
      "fromCalcStep": "c1",
      "operatingPlace": 0,
      "operatingDigit": 8,
      "op": "+",
      "technique": "进位加",
      "valueBefore": 27,
      "valueAfter": 35,
      "frameCount": 4,
      "animationCount": 2,
      "beadFrameCount": 2,
      "frames": [
        { "frameId": "d1", "type": "focus", "...": "..." },
        { "frameId": "d2", "type": "move",  "upperDelta": 0, "lowerDelta": -2, "beadOps": [{"layer":"lower","delta":-2}], "...": "..." },
        { "frameId": "d3", "type": "move",  "upperDelta": 0, "lowerDelta": 1,  "beadOps": [{"layer":"lower","delta":1}],  "...": "..." },
        { "frameId": "d4", "type": "confirm", "...": "..." }
      ]
    }
  ],
  "frames": [
    { "sceneId": "s1", "frameId": "d1", "...": "..." }
  ]
}
```

四级粒度（vocabulary）：

| 概念 | 标识 | 计法 |
|---|---|---|
| 题 | `RunScript` | 一道算式 |
| 场 (`scene`) | `sceneId` | 一个 calc step 内的所有展示动作 |
| 帧 (`frame`) | `frameId` | 一个 display step（focus / move / confirm） |
| 珠帧 (`beadFrame`) | `beadOps[i]` | 一个 move 内的 `{layer, delta}` 动作（仅 1 或 2 项） |

约束：

- `meta.sceneCount === scenes.length`
- `meta.frameCount === frames.length === Σ scene.frameCount`
- `meta.animationCount === Σ scene.animationCount`
- `meta.beadFrameCount === Σ scene.beadFrameCount`
- `frames[]` 顺序 = `scenes` 内 `frames` 顺序的级联
- 每帧仍需带 `fromCalcStep`，便于教学追溯与调试
- 若某 calc step 派生 0 段（`valueBefore === valueAfter`），则不产生 scene
- 末帧 `valueAfter` 必为 `left op right`（除非全题无变化）

---

## 4. 生成算法设计

## 4.1 Problem -> CalcPlan

伪流程：

```text
N = max(1, digits(right))
currentValue = left
for k in [0..N-1]:
  placeValue = base ** k
  b = floor(right / placeValue) % base
  a = floor(currentValue / placeValue)
  valueBefore = currentValue
  valueAfter  = op === "+" ? currentValue + b * placeValue
                           : currentValue - b * placeValue
  emit CalcStep { id, placeIndex: k, placeValue, op, a, b,
                  valueBefore, valueAfter, displayCall }
  currentValue = valueAfter
```

终止校验：

- 加法末位若发生进位扩档，`valueAfter` 自然包含高位的 1（差分由 display 层负责展开）；
- 减法末位若仍 `< 0`，代表结果为负，当前版本可禁用或报错。

---

## 4.2 CalcPlan -> DisplayPlan

伪流程：

```text
for each calcStep in calcPlan:
  if calcStep.valueBefore === calcStep.valueAfter:
    continue                                 # 跳过无变化场
  changes = []
  for i in [0..maxDigits(valueBefore, valueAfter)]:
    fromD = digit(valueBefore, i)
    toD   = digit(valueAfter,  i)
    if fromD !== toD:
      changes.push({ placeIndex: i, fromDigit: fromD, toDigit: toD })
  changes.sort(asc by placeIndex)            # 先右后左

  technique = classify(op, mainChange, hasCarryOrBorrow)
  emit focus { technique, op, operatingDigit: b, ... }

  for change in changes:
    (U,  L)  = decompose(fromDigit)
    (U', L') = decompose(toDigit)
    upperDelta = U' - U
    lowerDelta = L' - L
    beadOps    = [{upper, upperDelta}, {lower, lowerDelta}].filterNonZero()  # 先上后下
    emit move  { placeIndex, fromDigit, toDigit,
                 upperDelta, lowerDelta, beadOps,
                 valueAfter: partialValue(valueBefore, valueAfter, placeIndex) }

  emit confirm { valueAfter: calcStep.valueAfter }
```

辅助函数：

```text
decompose(d):       upper = (d >= 5) ? 1 : 0
                    lower = d % 5
partialValue(B, A, k):
  v = 0
  for i in [0..k]:                # 第 0..k 位取自 valueAfter
    v += digit(A, i) * base^i
  v += floor(B / base^(k+1)) * base^(k+1)   # 第 k+1+ 位仍取自 valueBefore
  return v
```

技法分类（technique）：

| 条件 | 标签 | 解释 |
|---|---|---|
| 加法 + 单档 + 主位 `upperDelta > 0` | `凑五加` | 上珠介入（如 4+3）|
| 加法 + 单档 + 其余 | `直加` | 仅下珠 ±N（如 6+3）|
| 加法 + 跨档 | `进位加` | 含向高位进 1（如 7+5）|
| 减法 + 单档 + 主位 `upperDelta < 0` | `破五减` | 上珠介入（如 7-3）|
| 减法 + 单档 + 其余 | `直减` | 仅下珠 ±N（如 8-3）|
| 减法 + 跨档 | `退位减` | 含向高位借 1（如 12-5）|

执行顺序公理（不变量）：

- 一个场内 `move.placeIndex` 严格升序 → **先右后左**（个位先动，高位后动）；
- 一个 move 内 `beadOps` 严格 `[upper, lower]` → **先上后下**；
- 这两条公理是手把手物理算盘操作的直接编码，跨加减、跨进借位、跨连环情况均成立，无任何特例。

---

## 4.3 DisplayPlan -> RunScript

- 按 `fromCalcStep` 分组生成 `scenes[]`，每场富集元数据（`technique`、`operatingPlace`、`operatingDigit`、`op`、`valueBefore`、`valueAfter`、场内统计）；
- 同一份 frames 同步输出扁平 `frames[]` 视图，每帧追加 `sceneId`，供线性播放器使用；
- 播放器既可按 `scenes[]` 做"按场播放/跳场/场间停顿"，也可直接消费 `frames[]` 做线性播放，两路语义一致。

---

## 5. Player（执行器）职责

只做四件事：

1. 读取下一帧（`scenes[i].frames[j]` 或 `frames[k]`）
2. 把算盘设置到 `valueAfter`
3. 应用 `highlightBeads` 与 `animate`，渲染 `narration / formula`
4. 可选：在场切换时插入停顿或视觉提示

禁止事项：

- 不允许在播放器内重新计算 `upperDelta / lowerDelta / beadOps`；
- 不允许因 UI 状态推导进位/借位；
- 不允许修改脚本语义，只能暂停/继续/跳帧/跳场。

---

## 6. 验证与测试

## 6.1 静态校验（生成后）

- 每个 `frame.fromCalcStep` 必须存在；
- 每个非空 calc step 至少派生 1 个 focus + 1 个 move + 1 个 confirm；
- 每个 move 的 `(upperDelta, lowerDelta)` 必须等于 `decompose(toDigit) - decompose(fromDigit)`；
- 每个 move 的 `beadOps` 长度 = 非零差分数 ∈ {1, 2}，且顺序固定 `[upper, lower]`；
- 场内 `move.placeIndex` 严格升序；
- 末帧 `valueAfter === left op right`；
- `meta` 的 4 个累计计数与实际数组长度对得上。

## 6.2 案例校验

| 算式 | 期望 |
|---|---|
| `4 + 3 = 7` | 1 场，`technique = 凑五加`，主 move `upperDelta=+1, lowerDelta=-2`，珠帧 = 2 |
| `6 + 3 = 9` | 1 场，`直加`，主 move `lowerDelta=+3`，珠帧 = 1 |
| `7 + 5 = 12` | 1 场，`进位加`，2 段 move（个位 `upperDelta=-1`、十位 `lowerDelta=+1`） |
| `7 - 3 = 4` | 1 场，`破五减`，主 move `upperDelta=-1, lowerDelta=+2` |
| `12 - 5 = 7` | 1 场，`退位减`，2 段 move（个位 `upperDelta=+1`、十位 `lowerDelta=-1`） |
| `27 + 18 = 45` | 2 场（个位 `进位加`、十位 `直加`），共 3 段 move |
| `50 - 27 = 23` | 2 场（个位 `退位减`、十位 `直减`），借位档珠帧 = 2 |
| `999 + 1 = 1000` | 1 场，4 段 move（连环进位），珠帧 = 7 |
| `100 - 0 = 100` | 0 场，0 帧（全无变化） |

## 6.3 随机校验

- 0~999 随机 3000~5000 题，不变量全成立；
- 平均参考值（教学节奏预算）：人均 ~2.6 场、~8.9 帧、~3.6 个动画、~4.9 珠帧；动画均珠帧 ≈ 1.35。

---

## 9. 珠算中文术语规范

通用珠态用语（展示文案与术语必须遵循）：

- `上`：上珠靠梁，表示 5。
- `下`：下珠靠梁，表示 1。
- `进`：本位向高位 +1。
- `退`：本位回拨归并（手动模式归一化时使用）。
- `借`：本位向高位 -1。
- `本位/高位`：当前处理位 / 其左侧更高位。

六大珠算手法分类（`focus.technique` 枚举）：

| 标签 | 触发 | 物理动作 |
|---|---|---|
| `直加` | 加法、单档、不动上珠 | 下珠 +N |
| `凑五加` | 加法、单档、上珠 +1 | 上 +1，下 -m（5 介入）|
| `进位加` | 加法、跨档 | 本位减/换位 + 高位 +1 |
| `直减` | 减法、单档、不动上珠 | 下珠 -N |
| `破五减` | 减法、单档、上珠 -1 | 上 -1，下 +m |
| `退位减` | 减法、跨档 | 高位 -1 + 本位补 |

执行顺序术语（不变量）：

- **先右后左**：跨档时，低位先于高位拨；
- **先上后下**：单档内，上珠组动作先于下珠组动作。

禁用建议（避免语义漂移）：

- 避免仅用"移动/变化"描述运算动作，需明确"进/退/借/上/下"；
- 避免把屏幕方向词（上移/下移）混用为珠算动作词。

---

## 7. 扩展策略（多位数）

- 位数动态长度 `N = max(len(left), len(right))`，并允许进位扩展到 `N+1`；
- 算法保持 O(N)；
- 展示层可分页或虚拟滚动，不影响计算层；
- 单 move 永远只动 1 档，不跨档，最多 2 个珠帧。

---

## 8. 与现有项目集成建议

四个模块：

- `calc-planner.js`：只生成 `CalcPlan`（按位单数字驱动）
- `display-planner.js`：`CalcPlan -> DisplayPlan`（按位差分 + 6 手法分类）
- `script-builder.js`：`DisplayPlan -> RunScript`（分镜结构 + 扁平帧）
- `player.js` / `app.js`：只执行 `RunScript`

主流程：

```
Problem
  -> CalcPlanner.buildCalcSteps(problem)
  -> DisplayPlanner.deriveDisplaySteps(calcSteps, { rodCount, upperBeadCount })
  -> ScriptBuilder.buildRunScript(problem, displaySteps, { maxValue })
  -> Player.load(runScript)
```
