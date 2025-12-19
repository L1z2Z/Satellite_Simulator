// src/main.js
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";

import { Viewer, Terrain, Cesium3DTileset, Cartesian3, Ion, Ellipsoid, Math as CesiumMath } from "cesium";
import CanvasRecorder, { chooseSupportedMimeType } from "./services/videoRecorder";
import { getNextFrame, rollbackTo, configureBackend, getCurrentFrameIndex } from "./services/frameService";
import TargetsLayer from "./view3d/TargetsLayer";
import SatellitesLayer from "./view3d/SatellitesLayer";
import FovCones from "./view3d/FovCones";
import VisibilityLinks from "./view3d/VisibilityLinks";
import OrbitsLayer from "./view3d/OrbitsLayer";
import { mockComputeFrame, NUM_FRAMES } from "./services/simResultAdapter";
import SensorView from "./ui/SensorView";
//import FovFootprint from "./view3d/FovFootprint";
import LinkController from "./inteactions/linkController";
import { getAllLinks, toggleLink, removeLink, undoLast, linkKey, serializeAll, loadFromObject } from "./state/annotationStore";
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
const orbitsLayer = new OrbitsLayer(viewer);
let orbitsInitialized = false;
// 暂时取消 footprint：注释掉
// const fovFootprint = new FovFootprint(viewer);

// 传感器小窗（第二个 Viewer）
const sensorContainer = document.getElementById("sensorCanvas");
const sensorView = new SensorView(sensorContainer, { show: true }); // 默认显示


// ========== 3) UI & 播放控制 ==========
const frameInfoEl = document.getElementById("frameInfo");
const infoPanelEl = document.getElementById("infoPanel");
const sensorRootEl = document.getElementById("sensorView");
const selSensorSat = document.getElementById("sensorSatSelect");
const btnSensorSnap = document.getElementById("sensorSnap");
const btnSensorToggle = document.getElementById("sensorToggle");

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
let sensorSatId = null;

// ==== 录制：主画布视频 ====
let recorder = null;
const AUTO_RECORD_ON_FORWARD_PLAY = true;

function ensureRecorder() {
  if (typeof MediaRecorder === "undefined") {
    console.warn("当前浏览器不支持 MediaRecorder，无法录制视频。");
    return null;
  }
  if (recorder) {return recorder;}
  const mime = chooseSupportedMimeType();
  try {
    recorder = new CanvasRecorder(viewer.scene.canvas, { mimeType: mime, fps: 30 });
  } catch (e) {
    console.warn("创建录制器失败：", e);
    recorder = null;
  }
  return recorder;
}

async function finalizeRecordingAndDownload() {
  if (recorder && recorder.isRecording()) {
    const ts = new Date();
    const pad = (n)=>String(n).padStart(2,"0");
    const fname = `sim-play-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.webm`;
    await recorder.download(fname);
  }
}

configureBackend({ mock: true }); // 现在走 Mock；接后端时改为 { mock: false, baseUrl: "http://your.api" }

async function renderFrame(frameIndex) {
  const data = await rollbackTo(frameIndex);

  // ===== 初始化虚线轨道（只执行一次）=====
  if (!orbitsInitialized && typeof mockComputeFrame === "function") {
    const satIds = data.satellites.map(s => s.id);

    // 采样点数：尽量接近 360 个点（看起来平滑）
    const step = Math.max(1, Math.floor(NUM_FRAMES / 360));

    for (const satId of satIds) {
      const positions = [];
      for (let f = 0; f < NUM_FRAMES; f += step) {
        const fr = mockComputeFrame(f);
        const sat = fr.satellites.find(ss => ss.id === satId);
        if (sat) {positions.push(sat.position);}
      }
      // 闭合（可选）：让首尾连上
      if (positions.length > 1) {positions.push(positions[0]);}

      orbitsLayer.setOrbit(satId, positions);
    }

    orbitsInitialized = true;
  }

  // ===== 1) 读取“全局标注” =====
  const annSet = getAllLinks(); // 关键：跨帧持久
  const tPosById = new Map(data.targets.map(t => [t.id, t.position]));

  // 将标注按卫星分组 satId -> [targetId...]
  const targetsBySat = new Map();
  for (const k of annSet) {
    const [satId, targetId] = k.split("|");
    if (!targetsBySat.has(satId)) {targetsBySat.set(satId, []);}
    targetsBySat.get(satId).push(targetId);
  }

  // ===== 2) 先计算 aimMap（必须在任何使用之前完成）=====
  const aimMap = new Map(); // satId -> {aimPos, aimDir, length, aimTargetId}
  for (const sat of data.satellites) {
    const satPos = sat.position;
    const linkedTargets = targetsBySat.get(sat.id) || [];

    let aimTargetId = null;
    let aimPos = null;

    // 有连线：选最近目标
    if (linkedTargets.length > 0) {
      let bestD = Infinity;
      for (const tid of linkedTargets) {
        const tp = tPosById.get(tid);
        if (!tp) {continue;}
        const d = Cartesian3.distance(satPos, tp);
        if (d < bestD) {
          bestD = d;
          aimPos = tp;
          aimTargetId = tid;
        }
      }
    }

    // 无连线：天底点（子星点）
    if (!aimPos) {
      aimPos = Ellipsoid.WGS84.scaleToGeodeticSurface(satPos, new Cartesian3(), new Cartesian3());
    }

    let aimDir;
    if (aimPos) {
      aimDir = Cartesian3.normalize(Cartesian3.subtract(aimPos, satPos, new Cartesian3()), new Cartesian3());
    } else {
      aimDir = Cartesian3.normalize(Cartesian3.multiplyByScalar(satPos, -1, new Cartesian3()), new Cartesian3());
    }

    const baseLen = aimPos ? Cartesian3.distance(satPos, aimPos) : 400_000;
    const length = baseLen * 2; // ★ 圆锥高度×2：锥底将穿过目标点继续向下

    aimMap.set(sat.id, { aimPos, aimDir, length, aimTargetId });
  }

  // ===== 3) 合入 annotated + 用 aimDir 重新计算 visible =====
  const linksWithAnno = data.links.map(l => {
    const annotated = annSet.has(linkKey(l.sat, l.target));
    const aim = aimMap.get(l.sat);
    const aimDir = aim?.aimDir
      || Cartesian3.normalize(Cartesian3.multiplyByScalar(l.satPos, -1, new Cartesian3()), new Cartesian3());

    const satToTgt = Cartesian3.normalize(
      Cartesian3.subtract(l.tgtPos, l.satPos, new Cartesian3()),
      new Cartesian3()
    );
    const angle = Cartesian3.angleBetween(satToTgt, aimDir);
    const visible = angle <= CesiumMath.toRadians(data.fovHalfAngleDeg);

    return { ...l, annotated, visible };
  });

  // ===== 4) 更新 3D 图层（锥体/足迹必须传 aimMap）=====
  targetsLayer.upsertTargets(data.targets);
  satsLayer.updateSatellites(data.satellites);

  fovCones.updateAll(data.satellites, data.fovHalfAngleDeg, aimMap);
  //fovFootprint.updateAll(data.satellites, data.fovHalfAngleDeg, aimMap);

  //const filtered = linksWithAnno.filter(applyFilters);
  // 只显示“手动标注”的连线（黄色），隐藏自动可见性连线（红/绿）
  const filtered = linksWithAnno.filter(l => l.annotated).filter(applyFilters);
  linksLayer.render(filtered);

  // ===== 5) 传感器小窗（仅对选中卫星展示中心线交点附近画面）=====
  if (!sensorSatId) {sensorSatId = (data.satellites[0] && data.satellites[0].id) || null;}

  if (selSensorSat) {
    const ids = data.satellites.map(s => s.id);
    if (selSensorSat.dataset._sig !== ids.join(",")) {
      selSensorSat.innerHTML = ids.map(id => `<option value="${id}" ${id === sensorSatId ? "selected" : ""}>${id}</option>`).join("");
      selSensorSat.dataset._sig = ids.join(",");
    }
  }

  const sat = data.satellites.find(s => s.id === sensorSatId) || data.satellites[0];
  if (sat) {
    const aim = aimMap.get(sat.id);
    const aimDir = aim?.aimDir
      || Cartesian3.normalize(Cartesian3.multiplyByScalar(sat.position, -1, new Cartesian3()), new Cartesian3());
    sensorView.setCameraAtSatellite(sat.position, aimDir, data.fovHalfAngleDeg);
  }

  // ===== 6) 面板/统计 =====
  frameInfoEl.textContent = `Frame ${data.frame} / ${NUM_FRAMES - 1}`;

  const visibleCount = linksWithAnno.reduce((s, l) => s + (l.visible ? 1 : 0), 0);
  const annotatedCount = linksWithAnno.reduce((s, l) => s + (l.annotated ? 1 : 0), 0);

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
    const cur = getCurrentFrameIndex();
    // 若已在最后一帧，则自动停止并保存视频，不再回绕到 0
    if (cur >= NUM_FRAMES - 1) {
      playing = false;
      await finalizeRecordingAndDownload();
      return;
    }
    const data = await getNextFrame();
    await renderFrame(data.frame);
  } else {
    const idx = getCurrentFrameIndex() - 1;
    await renderFrame(idx);
  }
}

document.getElementById("btnPrev").addEventListener("click", () => step(-1));
document.getElementById("btnNext").addEventListener("click", () => step(+1));
document.getElementById("btnPlayForward").addEventListener("click", async () => {
  playDir = +1;
  if (!playing) {
    if (AUTO_RECORD_ON_FORWARD_PLAY) {
      const rec = ensureRecorder();
      rec?.start();
    }
    playing = true;
    loop();
  }
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
      removeLink(satId, targetId);
    } else {
      toggleLink(satId, targetId);
    }
    await renderFrame(cur);
  }
});

// 暴露给全局，方便调试 & 避免 ESLint no-unused-vars
window.linkController = linkController;

// 传感器控件：切换卫星 / 截图 / 显隐
selSensorSat?.addEventListener("change", async (e) => {
  sensorSatId = e.target.value;
  await renderFrame(getCurrentFrameIndex());
});
btnSensorSnap?.addEventListener("click", () => {
  const dataUrl = sensorView.snapshot();
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `sensor-view-${Date.now()}.png`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
});
btnSensorToggle?.addEventListener("click", () => {
  const isHidden = sensorRootEl.classList.toggle("hidden");
  sensorView.setEnabled(!isHidden);
  btnSensorToggle.textContent = isHidden ? "显示" : "隐藏";
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
