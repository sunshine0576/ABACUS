# 小学生算盘学习工具

按位差分驱动的小学算盘加减法分镜演示与练习应用。

## 快速使用

桌面浏览器直接打开：

```text
index.html
```

移动端单文件版（同等功能，所有依赖打包成单页）：

```text
abacus-mobile.html
```

应用提供两种模式：

- **认识算盘数字**：随机出题/输入数字 → 用户拨珠 → 校验。
- **加减法演示**：输入 `left op right`（0~999），自动生成可分镜回放的运算演示。
  - **下一步**：按 *场* 推进，一次播完当前运算位（个位/十位/...）的所有动画与确认。
  - **自动播放**：按 *帧* 顺序推进，场切换、进入动画帧、静止帧分别使用不同延迟。
  - **上一步**：场内回到起点，再回到上一场末尾。

## 架构与流水线

```text
Problem
  └─ CalcPlanner.buildCalcSteps(problem)
      └─ DisplayPlanner.deriveDisplaySteps(calcSteps, { rodCount, upperBeadCount })
          └─ ScriptBuilder.buildRunScript(problem, displaySteps, { maxValue })
              └─ Player (app.js / abacus-mobile.html) 仅消费 RunScript
```

设计契约见：

- `CALC_ENGINE_SPEC.md`：计算与脚本生成真源（按位差分、6 大珠算手法、scenes/frames 结构）
- `STEP_SPEC.md`：UI 交互与播放规范（先右后左、先上后下，场/帧节奏）

四级粒度：题 → 场（scene） → 帧（frame） → 珠帧（beadOp）。

## 开发与测试

需要 Node.js 18+。

```bash
node ./run-tests.js
```

或使用 npm 脚本：

```bash
npm test                # 全部
npm run test:calc       # 计算层
npm run test:display    # 显示层
npm run test:script     # 脚本层
npm run test:integration  # 端到端：场/帧/延迟分类
```

## 目录速览

| 文件 | 角色 |
|---|---|
| `calc-planner.js` | 按位单数字驱动的 CalcStep 生成 |
| `display-planner.js` | 按位差分 + 6 大手法分类的 DisplayStep 生成 |
| `script-builder.js` | 分镜结构 + 扁平帧的 RunScript 生成 |
| `app.js` | 桌面端 UI 与播放控制 |
| `abacus-mobile.html` | 移动端单页打包 |
| `index.html` / `styles.css` | 桌面端入口与样式 |
| `test-*.js` | 各层单测与端到端测试 |
| `run-tests.js` | 一键测试入口 |
