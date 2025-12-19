要把总帧数改为 150，需要改 2 处（外加 1 处可选的文案）：

---

# 必改 ①：`src/services/simResultAdapter.js`

把导出的总帧数常量改为 150（其他逻辑会自动跟随这个数取模/推进）。

```diff
- export const NUM_FRAMES = 1000;
+ export const NUM_FRAMES = 150;
```

---

# 必改 ②：`src/main.js`

确保顶部已有（或新增）对 `NUM_FRAMES` 的导入：

```diff
+ import { NUM_FRAMES } from "./services/simResultAdapter";
```

把帧信息的显示从硬编码 `999` 改为由常量计算：

```diff
- frameInfoEl.textContent = `Frame ${data.frame} / 999`;
+ frameInfoEl.textContent = `Frame ${data.frame} / ${NUM_FRAMES - 1}`;
```

> 说明：你之前的视频录制逻辑里已经用 `NUM_FRAMES - 1` 判断“到达最后一帧”并触发保存，无需再改；改了常量后，正向播放会在第 149 帧停止并自动保存。

---

# 可选 ③：`index.html`

初始占位文本可改为与常量一致（只是页面刚加载、首帧渲染前的显示，不改也不影响功能）：

```diff
- <span id="frameInfo">Frame 0 / 999</span>
+ <span id="frameInfo">Frame 0 / 149</span>
```

---

## 需求清单

- **之前实现的**
  - ✅ 正向播放自动开始录制、到末帧自动停止并保存 WebM
  - ✅ 交互标注（拖拽/删除/撤销）、导入/导出 JSON、统计与过滤
  - ✅ FOV 锥体方向修正、地面足迹与传感器小窗（截图已修复）
  - ✅ Google Photorealistic 3D Tiles 3D 底图接入

- **这次实现的**
  - 🆕 将总帧数从 1000 改为 **150**，并同步更新 UI 显示

- **未实现的**
  - ⭕ 倒播录制与“暂停即保存”等可选录制策略
  - ⭕ 与后端联动（`/next-frame`、`/rollback`，携带标注重算）
  - ⭕ 更精确 FOV 足迹（椭球/地形交线）、轨道线/真实姿态
  - ⭕ 无头渲染流水线（Puppeteer/Playwright + ffmpeg）

需要我把“倒播到 0 帧也自动保存”一并加上吗？我可以顺手补一个“录制源选择器（主画布/传感器/合成）”一起做。

---

---

---

新增一个卫星和其对应轨道

只需要改 **1 个地方**就能生效：**Mock 轨道生成处**（也就是你现在项目里生成卫星数据的源头——通常在 `src/services/simResultAdapter.js` 里的 `SATS` 数组）。

下面我按你要求，用“需要删除 / 需要添加 / 修改位置”给出精确修改建议。

---

# 修改位置：`src/services/simResultAdapter.js`

## 1）定位到卫星列表 `const SATS = [...]`

你现在应该类似是这样（示意）：

```js
// src/services/simResultAdapter.js
const SATS = [
  { id: "SAT-01", phaseDeg: 0, inclinationDeg: 30, degPerFrame: 0.6 },
  { id: "SAT-02", phaseDeg: 180, inclinationDeg: 55, degPerFrame: 0.5 },
];
```

---

## 2）需要删除的内容

不需要删除原有卫星，只需要在数组中插入一项即可。

（如果你想把 SAT-03 放在 SAT-01 后面显示更直观，建议插在 SAT-01 后面。）

---

## 3）需要添加的内容（插入 SAT-03）

在 `SATS` 数组里 **紧跟 SAT-01 之后**插入下面这一项：

```js
  // SAT-03：与 SAT-01 几乎同轨；通过 phaseDeg 小偏移实现“紧跟/几乎重合”
  { id: "SAT-03", phaseDeg: 0.8, inclinationDeg: 30, degPerFrame: 0.6 },
```

最终变成：

```diff
const SATS = [
  { id: "SAT-01", phaseDeg:   0, inclinationDeg: 30, degPerFrame: 0.6 },
+ { id: "SAT-03", phaseDeg: 0.8, inclinationDeg: 30, degPerFrame: 0.6 },
  { id: "SAT-02", phaseDeg: 180, inclinationDeg: 55, degPerFrame: 0.5 },
];
```

### 关于“紧跟 SAT-01 后面/靠前一点”的方向说明

你描述里“紧跟 SAT-01 后面”和“起终点比 SAT-01 靠前一点”略有冲突。这里我提供一个明确规则，你按你想要的效果改一个数字即可：

- `phaseDeg: +0.8`：SAT-03 **比 SAT-01 稍微靠前（领先）**一点（同一帧位置更“往前”）
- `phaseDeg: -0.8`：SAT-03 **紧跟在 SAT-01 后面（落后）**一点

你可以先用 `0.8`，如果你观察到 SAT-03 在 SAT-01 前面而你希望它在后面，把 `0.8` 改成 `-0.8` 就行。

> 为什么用 phaseDeg：因为你们的简化轨道里 `thetaDeg = degPerFrame*frame + phaseDeg`，相同 `degPerFrame` + 相同倾角/高度 + 小相位差 = 任意帧间距都很小、轨迹几乎相同。

---

# 你不需要改的地方（正常情况下）

只要你的界面和渲染（目标点、锥体、足迹、遥感小窗、筛选下拉）都是基于 `data.satellites` 动态生成的（你前面已经是这样），那么：

- 卫星实体会自动多出 SAT-03
- FOV 锥体、足迹会自动多出 SAT-03
- 信息面板卫星下拉会自动多出 SAT-03
- 标注逻辑也能对 SAT-03 生效（默认无连线则指向地心）

---

# 如果你改完没出现 SAT-03（快速自查）

说明你的项目里还有另一个“硬编码卫星列表”的位置。你可以全文搜索关键字：

- `"SAT-01"` 或 `const satellites =` 或 `const SATS =`

如果你愿意，把搜索结果贴一下，我会告诉你是否还需要在第二处同步加 SAT-03。

---

# 需求进度清单

- **之前实现的**
  - ✅ 交互标注连线跨帧保存、FOV 朝向标注目标（多目标取最近、无目标指向地心）
  - ✅ FOV 足迹与遥感小窗跟随中心线交点
  - ✅ 导入/导出、统计/过滤、Google Photorealistic 3D Tiles 等（按你当前工程状态）

- **这次实现的**
  - 🆕 新增 **SAT-03**：与 SAT-01 几乎同轨，通过 `phaseDeg` 微偏移实现任意帧间距都很小

- **未实现的**
  - ⭕ 更精确的锥体与地形/椭球相交足迹（真实投影轮廓）
  - ⭕ 后端闭环重算与无头渲染等

如果你把 `simResultAdapter.js` 当前的 `SATS` 段落（或整个文件）贴出来，我也可以按你现有代码的实际结构给你做“逐行精确 patch”（确保你复制粘贴不会偏位置）。
