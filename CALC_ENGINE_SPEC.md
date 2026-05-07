# 算盘计算引擎设计规范

## 0. 文档分工与优先级

- 本文档定义 **计算与脚本生成真源**：`Problem -> CalcPlan -> DisplayPlan -> RunScript`。
- `STEP_SPEC.md` 定义 **UI 交互与播放行为**：按钮语义、边界提示、手动拨珠体验。
- 两文档冲突时优先级：
  1. 计算正确性、进位借位链路、脚本字段语义，以本文档为准；
  2. 播放节奏、提示文案、交互反馈，以 `STEP_SPEC.md` 为准。
- UI 运行时必须只消费 `RunScript`，不得回流修改计算或脚本语义。

---

## 1. 目标与边界

- 目标：把一个算式分解为可验证的计算步骤，再分解为动画步骤，最终生成执行脚本。
- 运行时边界：播放器只执行脚本，不负责推导、补全或修正任何生成逻辑。
- 适用范围：十进制非负整数加减法，当前默认 `0~999`，可扩展至任意位数。

---

## 2. 总体流水线

统一采用离线生成 + 在线执行模式：

1. `Problem`（题目输入）
2. `CalcPlan`（计算步骤，算术事实层）
3. `DisplayPlan`（动画步骤，教学展示层）
4. `RunScript`（可执行脚本，播放器输入）
5. `Player`（纯执行）

约束：

- 上一层是下一层唯一输入来源；
- 每一层可单元测试；
- `Player` 不允许持有“计算推导代码”。

---

## 3. 数据模型

## 3.1 Problem（输入）

```json
{
  "left": 12,
  "op": "+",
  "right": 23,
  "base": 10
}
```

字段：

- `left`、`right`：整数
- `op`：`+` 或 `-`
- `base`：默认 10

---

## 3.2 CalcStep（最小计算单元）

每个 `CalcStep` 只处理一个位的一次运算事实。

```json
{
  "id": "c1",
  "placeIndex": 0,
  "placeValue": 1,
  "op": "+",
  "baseLhsDigit": 2,
  "effectiveLhsDigit": 2,
  "lhsDigit": 2,
  "rhsDigit": 3,
  "carryIn": 0,
  "borrowIn": 0,
  "raw": 5,
  "digitResult": 5,
  "carryOut": 0,
  "borrowOut": 0,
  "valueBefore": 12,
  "valueAfter": 15
}
```

约束：

- `digitResult` 必须在 `0..9`；
- `carryOut` 与 `borrowOut` 不可同时为 1；
- 当前位的 `carryIn/borrowIn` 必须来自低位 `CalcStep` 的输出；
- `valueAfter` 必须与位结果一致（可被重算验证）。
- `effectiveLhsDigit` 必须是本步真实参与运算的值：
  - 加法：`effectiveLhsDigit = baseLhsDigit + carryIn`
  - 减法：`effectiveLhsDigit = baseLhsDigit - borrowIn`
- 展示层文案与公式优先使用 `effectiveLhsDigit`，避免出现“十位原是2但本步显示2+1”的教学歧义。

---

## 3.3 DisplayStep（展示动作单元）

`DisplayStep` 只能由某个 `CalcStep` 派生。

```json
{
  "id": "d1",
  "fromCalcStep": "c1",
  "type": "focus",
  "placeIndex": 0,
  "animate": false,
  "valueAfter": 12,
  "highlightBeads": { "upper": [], "lower": [0, 1] },
  "narration": "个位当前是2，准备加3",
  "formula": ""
}
```

字段要求：

- `id`：展示步骤唯一标识（顺序编号）
- `fromCalcStep`：来源计算步骤，必填
- `type`：动作类型
- `placeIndex`：动作所属位
- `animate`：是否动画
- `valueAfter`：该动作执行后的数值状态（用于跳步/回放）
- `highlightBeads`：本动作高亮珠子（无则空）
- `narration`：讲解文本
- `formula`：公式文本（可空）

`type` 规范：

- `focus`：起始确认（无动画）
- `move`：执行最小运算动作（有动画）
- `confirm`：结果确认（无动画）
- `explain`：补充讲解（可选，无动画）
- `normalize`：同位归并（可选，有动画）

最小落地约束：

- 每个 `CalcStep` 至少派生 `focus -> move -> confirm` 三段；
- 涉及进位/借位时，可选插入 `explain`；
- 一个 `CalcStep` 可派生多段动画，但不得跨步更改语义。

---

## 3.4 RunScript（播放器脚本）

播放器只吃该结构：

```json
{
  "meta": {
    "expression": "12 + 23 = 35",
    "maxValue": 999,
    "version": "1.0"
  },
  "frames": [
    {
      "frameId": "d1",
      "fromCalcStep": "c1",
      "valueAfter": 12,
      "animate": false,
      "highlightBeads": [],
      "narration": "个位当前是2，准备加3",
      "formula": ""
    }
  ]
}
```

约束：

- `frames` 有序且可直接线性播放；
- 每帧都要给出 `valueAfter`（可回放、可跳步）；
- 必须保留 `fromCalcStep`，便于教学追溯与调试。

---

## 4. 生成算法设计

## 4.1 Problem -> CalcPlan

位序：

- 运算位序统一 `个位 -> 高位`。

伪流程：

```text
parse digits
carry = 0, borrow = 0
for placeIndex in [0..N-1]:
  baseLhs = leftDigit(placeIndex)
  rhs = rightDigit(placeIndex)
  if op == '+':
    effectiveLhs = baseLhs + carry
    raw = effectiveLhs + rhs
    digitResult = raw % 10
    carryOut = floor(raw / 10)
    borrowOut = 0
  else:
    effectiveLhs = baseLhs - borrow
    raw = effectiveLhs - rhs
    if raw < 0:
      raw += 10
      borrowOut = 1
    else:
      borrowOut = 0
    digitResult = raw
    carryOut = 0
  emit CalcStep
  carry = carryOut
  borrow = borrowOut
```

终止校验：

- 加法末位若仍有 `carry`，新增最高位步骤或触发溢出规则；
- 减法末位若仍有 `borrow`，代表结果为负，当前版本可禁用或报错。

---

## 4.2 CalcPlan -> DisplayPlan

默认映射模板：

1. `focus`（起始确认，`animate=false`，`valueAfter=valueBefore`）
2. `move`（最小必要运算，`animate=true`，`valueAfter=valueAfter`）
3. `confirm`（结果确认，`animate=false`，`valueAfter=valueAfter`）

可选映射：

- 有进位/借位时，可在 `focus` 与 `move` 之间插入 `explain`；
- 有归并动作时，可在 `move` 前后插入 `normalize`。

原则：

- 一个 `CalcStep` 可产生多段帧（含多次动画）；
- 所有帧都必须带 `fromCalcStep`；
- 所有帧都只能解释该 `CalcStep`，不得跨步修改计算语义。

---

## 4.3 DisplayPlan -> RunScript

- 扁平化为 `frames[]`；
- 填充每帧 `valueAfter`；
- 输出用于播放器的只读脚本 JSON。

---

## 5. Player（执行器）职责

只做四件事：

1. 读取 `frames[currentIndex]`
2. 把算盘设置到 `valueAfter`
3. 应用 `highlightBeads` 与 `animate`
4. 渲染 `narration/formula`

禁止事项：

- 不允许在播放器内计算“下一步该怎么拨”；
- 不允许因 UI 状态推导进位/借位；
- 不允许修改脚本语义，只能暂停/继续/跳步。

---

## 6. 验证与测试

## 6.1 静态校验（生成后）

- 每个 `DisplayStep.fromCalcStep` 必须存在；
- 每个 `CalcStep` 至少派生 1 个 `DisplayStep`；
- `RunScript.frames` 中 `fromCalcStep` 不得丢失；
- `valueAfter` 全链可重算一致。

## 6.2 案例校验

- `12 + 23`：计算步骤应为 2 步（个位、十位）；
- `27 + 18`：必须出现个位 `carryOut=1`；
- `23 - 18`：必须出现个位 `borrowOut=1`；
- `50 - 27`：借位链路与十位结果一致。
- `27 + 18`：十位展示应使用本步参与值，表达为 `3 + 1 = 4`（不是 `2 + 1 = 4`）。

---

## 9. 珠算中文术语规范

统一用语（展示文案必须遵循）：

- `上`：上珠靠梁，表示 5。
- `下`：下珠靠梁，表示 1。
- `进`：本位满十，向高位进 1。
- `退`：本位从较大值回拨到较小值（归并时常见）。
- `借`：本位不够减，向高位借 1。
- `本位/高位`：当前处理位/其左侧更高位。

禁用建议（避免语义漂移）：

- 避免仅用“移动/变化”描述运算动作，需明确“进/退/借/上/下”。
- 避免把屏幕方向词（上移/下移）混用为珠算动作词。

---

## 7. 扩展策略（多位数）

- 位数组动态长度 `N = max(len(left), len(right))`；
- 算法保持 O(N)；
- 展示层可以分页或虚拟滚动，不影响计算层。

---

## 8. 与现有项目集成建议

建议拆为四个模块：

- `calc-planner.js`：只生成 `CalcPlan`
- `display-planner.js`：`CalcPlan -> DisplayPlan`
- `script-builder.js`：`DisplayPlan -> RunScript`
- `player.js`：只执行 `RunScript`

主流程：

`buildDemo()` 中不再直接拼 UI 步骤，而是调用：

`Problem -> CalcPlan -> DisplayPlan -> RunScript -> Player.load(script)`

