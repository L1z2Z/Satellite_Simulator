// src/main.js
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";

import { Viewer, Terrain, Ion, Cesium3DTileset } from "cesium";
import { getNextFrame, rollbackTo, configureBackend, getCurrentFrameIndex } from "./services/frameService";
import TargetsLayer from "./view3d/TargetsLayer";
import SatellitesLayer from "./view3d/SatellitesLayer";
import FovCones from "./view3d/FovCones";
import VisibilityLinks from "./view3d/VisibilityLinks";
import LinkController from "./inteactions/linkController";
import { getLinksForFrame, toggleLink, undoLast, linkKey, serializeAll, loadFromObject } from "./state/annotationStore";
import { downloadJSON, readJSONFile } from "./services/annotateService";
import InfoPanel from "./ui/InfoPanel";

// ① 配置你的 Cesium ion token
Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0ZGRlNTA1NS1iNWMwLTQzMmItYmZjYS1jM2I3NzAyMDNiMWIiLCJpZCI6MzY4NjMyLCJpYXQiOjE3NjU0MjUxNDl9.QKEAOA7L30DxgWO2S7VgHFSTdzLwJ_-rJQg2toNUGlk";

// ========== 1) 初始化 Viewer ==========
const viewer = new Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  baseLayerPicker: true,
  terrain: Terrain.fromWorldTerrain(), // 若你没有 token 可注释掉
});

// 加载 Cesium ion 上的 3D 建筑（例如资产 ID 96188）
async function addBuildingsFromIon() {
  try {
    const tileset = await Cesium3DTileset.fromIonAssetId(96188);
    viewer.scene.primitives.add(tileset);
  } catch (e) {
    // 在控制台查看具体错误信息（权限、网络等）
    console.error("加载 3D 建筑 tileset 失败", e);
  }
}

addBuildingsFromIon();

// ========== 2) 组装 3D 图层 ==========
const targetsLayer = new TargetsLayer(viewer);
const satsLayer = new SatellitesLayer(viewer); // 可传 { modelUri } 自定义模型
const fovCones = new FovCones(viewer, { coneLength: 400_000 });
const linksLayer = new VisibilityLinks(viewer);

// ========== 3) UI & 播放控制 ==========
const frameInfoEl = document.getElementById("frameInfo");
const infoPanelEl = document.getElementById("infoPanel");
const infoPanel = new InfoPanel(infoPanelEl, {
  onExport: () => {
    const obj = serializeAll();
    const ts = new Date();
    const pad = (n)=>String(n).padStart(2,"0");
    const fname = `annotations-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`;
    downloadJSON(obj, fname);
  },
  onImport: async (file) => {
    const obj = await readJSONFile(file);
    loadFromObject(obj, { merge: true }); // 合并导入
    await renderFrame(getCurrentFrameIndex());
  },
  onFilterChange: async (f) => {
    filters = { ...filters, ...f };
    await renderFrame(getCurrentFrameIndex());
  }
});


let playing = false;
let playDir = +1; // +1 正播；-1 倒播

configureBackend({ mock: true }); // 现在走 Mock；接后端时改为 { mock: false, baseUrl: "http://your.api" }

// 过滤状态（仅影响渲染）
let filters = {
    showAnnotatedOnly: false,
    showVisibleOnly: false,
    sat: "ALL",
    target: "ALL",
  };
  
  function applyFilters(l) {
    if (filters.showAnnotatedOnly && !l.annotated) {return false;}
    if (filters.showVisibleOnly && !l.visible) {return false;}
    if (filters.sat !== "ALL" && l.sat !== filters.sat) {return false;}
    if (filters.target !== "ALL" && l.target !== filters.target) {return false;}
    return true;
  }

async function renderFrame(frameIndex) {
  const data = await rollbackTo(frameIndex); // 设定到某帧
  // 合入“已标注”状态
  const annSet = getLinksForFrame(data.frame);
  const linksWithAnno = data.links.map(l => ({
    ...l,
    annotated: annSet.has(linkKey(l.sat, l.target))
  }));

  // 1) 基础对象
  targetsLayer.upsertTargets(data.targets);
  satsLayer.updateSatellites(data.satellites);
  fovCones.updateAll(data.satellites, data.fovHalfAngleDeg);
  const filtered = linksWithAnno.filter(applyFilters);
  linksLayer.render(filtered);

  // 2) 面板
  frameInfoEl.textContent = `Frame ${data.frame} / 999`;
  const visibleCount = data.links.reduce((s, l) => s + (l.visible ? 1 : 0), 0);
  const annotatedCount = linksWithAnno.reduce((s, l) => s + (l.annotated ? 1 : 0), 0);
  // 把面板切换为交互版
  infoPanel.render({
    stats: {
      fov: data.fovHalfAngleDeg,
      satCount: data.satellites.length,
      tgtCount: data.targets.length,
      visibleCount,
      annotatedCount,
      filteredCount: filtered.length,
    },
    options: {
      satIds: data.satellites.map(s => s.id),
      targetIds: data.targets.map(t => t.id),
    },
    filters,
  });
}

async function step(dir = +1) {
  if (dir > 0) {
    const data = await getNextFrame();
    await renderFrame(data.frame); // 复用 render 逻辑（内部会 rollback 到同一帧）
  } else {
    const idx = getCurrentFrameIndex() - 1;
    await renderFrame(idx);
  }
}

document.getElementById("btnPrev").addEventListener("click", () => step(-1));
document.getElementById("btnNext").addEventListener("click", () => step(+1));
document.getElementById("btnPlayForward").addEventListener("click", async () => {
  playDir = +1;
  if (!playing) { playing = true; loop(); }
});
document.getElementById("btnPlayBackward").addEventListener("click", async () => {
  playDir = -1;
  if (!playing) { playing = true; loop(); }
});

async function loop() {
  if (!playing) {return;}
  await step(playDir);
  setTimeout(loop, 33); // ~30 FPS
}

viewer.canvas.addEventListener("click", () => { playing = false; });

// 拖拽建立/删除标注
const linkController = new LinkController(viewer, {
  onToggleLink: async (satId, targetId, { remove } = {}) => {
    playing = false; // 标注时停止播放，避免“边动边标”
    const cur = getCurrentFrameIndex();
    if (remove) {
      // 强制删除：如果已存在就反转一次（toggle），不存在就忽略
      toggleLink(cur, satId, targetId); // toggle 即可；不存在时会添加一次，再按需再 toggle
      if (toggleLink(cur, satId, targetId)) {
        // 上面两次调用确保“删除”：第一次切换、第二次切回“无”
      }
    } else {
      toggleLink(cur, satId, targetId); // 切换：无→有 / 有→无
    }
    await renderFrame(cur);
  }
});
  
// 撤销（按下 'z'）
window.addEventListener("keydown", async (e) => {
  if (e.key.toLowerCase() === "z") {
    const ok = undoLast();
    if (ok) {await renderFrame(getCurrentFrameIndex());}
  }
});

// 初始
renderFrame(0);
viewer.camera.flyHome(1.2);
