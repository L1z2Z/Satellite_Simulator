// src/services/frameService.js
// 统一的数据入口：支持 Mock / 后端 / 导入场景（scenario）
import { Cartesian3, Ellipsoid, Math as CesiumMath } from "cesium";
import { NUM_FRAMES as DEFAULT_NUM_FRAMES, mockComputeFrame } from "./simResultAdapter";

let current = 0;
let useMock = true;
// 预留：后端地址
let BASE_URL = "/api";

// ===== 场景（scenario）数据源 =====
// 目标：导入 JSON 后，用其“全卫星全帧轨道位置”驱动仿真
let scenario = null;
// scenario shape (runtime):
// {
//   numFrames: number,
//   fovHalfAngleDeg: number,
//   targets: Array<{id:string, position:Cartesian3}>,
//   satellites: Map<string, Array<Cartesian3>> // id -> positions[frame]
// }

export function configureBackend({ baseUrl, mock = true } = {}) {
  if (baseUrl) {
    BASE_URL = baseUrl;
  }
  useMock = mock;
}

export function hasScenario() {
  return !!scenario;
}

export function clearScenario() {
  scenario = null;
  current = 0;
}

export function getTotalFrames() {
  return scenario?.numFrames ?? DEFAULT_NUM_FRAMES;
}

function _computeFrameFromScenario(frameIndex) {
  if (!scenario) {
    throw new Error("Scenario not loaded");
  }
  const frame = ((frameIndex % scenario.numFrames) + scenario.numFrames) % scenario.numFrames;

  const targets = scenario.targets;
  const satellites = [];
  for (const [id, positions] of scenario.satellites.entries()) {
    satellites.push({ id, position: positions[frame] });
  }

  // links：保持与 mockComputeFrame 的数据结构一致，visible 可留给上层重算
  const links = [];
  for (const s of satellites) {
    for (const t of targets) {
      links.push({
        sat: s.id,
        target: t.id,
        visible: false,
        satPos: s.position,
        tgtPos: t.position,
      });
    }
  }

  return {
    frame,
    satellites,
    targets,
    links,
    fovHalfAngleDeg: scenario.fovHalfAngleDeg,
  };
}

function _asCartesian3(p) {
  if (!p) {return null;}
  if (p instanceof Cartesian3) {return p;}
  if (Array.isArray(p) && p.length === 3) {
    return new Cartesian3(Number(p[0]), Number(p[1]), Number(p[2]));
  }
  if (typeof p === "object" && p !== null && "x" in p && "y" in p && "z" in p) {
    return new Cartesian3(Number(p.x), Number(p.y), Number(p.z));
  }
  return null;
}

function _asTargetPosition(t) {
  if (!t || typeof t !== "object") {return null;}

  // 1) ECEF: {position:[x,y,z]} / {position:{x,y,z}}
  const p = _asCartesian3(t.position);
  if (p) {return p;}

  // 2) Geodetic: {lat, lon, heightMeters?}
  // 允许 heightMeters / h / height 作为高度字段
  const hasLat = "lat" in t;
  const hasLon = "lon" in t;
  if (hasLat && hasLon) {
    const lat = Number(t.lat);
    const lon = Number(t.lon);
    const height = Number(t.heightMeters ?? t.h ?? t.height ?? 0);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(height)) {
      return Cartesian3.fromDegrees(lon, lat, height);
    }
  }

  return null;
}

/**
 * 导入场景 JSON（包含全卫星全帧轨道位置）。
 * 兼容的对象结构：
 * {
 *   type: "sim_scenario",
 *   version: 1,
 *   numFrames,
 *   fovHalfAngleDeg,
 *   targets:[{id, position:[x,y,z]}] 或 targets:[{id, lat, lon, heightMeters?}],
 *   satellites:[{id, positions:[[x,y,z], ...]}]
 * }
 */
export function loadScenarioFromObject(obj) {
  if (!obj || typeof obj !== "object") {
    throw new Error("无效场景文件");
  }
  if (obj.type !== "sim_scenario") {
    throw new Error("不是场景文件（type != sim_scenario）");
  }
  const version = Number(obj.version ?? 0);
  if (version !== 1) {
    throw new Error(`不支持的场景版本：${obj.version}`);
  }

  const numFrames = Number(obj.numFrames);
  if (!Number.isFinite(numFrames) || numFrames <= 0) {
    throw new Error("场景 numFrames 无效");
  }

  const fovHalfAngleDeg = Number(obj.fovHalfAngleDeg);
  if (!Number.isFinite(fovHalfAngleDeg) || fovHalfAngleDeg <= 0) {
    throw new Error("场景 fovHalfAngleDeg 无效");
  }

  const targetsIn = Array.isArray(obj.targets) ? obj.targets : [];
  if (targetsIn.length === 0) {
    throw new Error("场景 targets 为空");
  }
  const targets = targetsIn
    .map((t) => ({ id: String(t.id), position: _asTargetPosition(t) }))
    .filter((t) => t.id && t.position);
  if (targets.length === 0) {
    throw new Error("场景 targets 坐标无效（需要 position 或 lat/lon）");
  }

  const satsIn = Array.isArray(obj.satellites) ? obj.satellites : [];
  if (satsIn.length === 0) {
    throw new Error("场景 satellites 为空");
  }
  const satellites = new Map();
  for (const s of satsIn) {
    const id = String(s.id);
    const posArr = Array.isArray(s.positions) ? s.positions : null;
    if (!id || !posArr || posArr.length < numFrames) {
      throw new Error(`卫星 ${id || "(unknown)"} 的 positions 长度不足`);
    }
    const positions = new Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      const p = _asCartesian3(posArr[i]);
      if (!p) {
        throw new Error(`卫星 ${id} 在 frame=${i} 的 position 无效`);
      }
      positions[i] = p;
    }
    satellites.set(id, positions);
  }

  scenario = { numFrames, fovHalfAngleDeg, targets, satellites };
  current = 0;
  return { numFrames, satCount: satellites.size, tgtCount: targets.length };
}

/**
 * 导出当前场景（若未导入，则从 mock 生成）。
 * 返回 JSON-friendly 对象（Cartesian3 会转为 [x,y,z]）。
 */
export function exportScenarioObject() {
  const numFrames = getTotalFrames();

  const toTargetLLH = (id, position) => {
    const carto = Ellipsoid.WGS84.cartesianToCartographic(position);
    if (!carto) {
      // 极端情况下回退到 ECEF
      return { id, position: [position.x, position.y, position.z] };
    }
    return {
      id,
      lat: CesiumMath.toDegrees(carto.latitude),
      lon: CesiumMath.toDegrees(carto.longitude),
      heightMeters: carto.height,
    };
  };

  // 如果当前已导入场景，直接导出该场景
  if (scenario) {
    return {
      type: "sim_scenario",
      version: 1,
      numFrames: scenario.numFrames,
      fovHalfAngleDeg: scenario.fovHalfAngleDeg,
      // targets 用 lat/lon/heightMeters 导出，和导入格式对齐且更易人工编辑
      targets: scenario.targets.map((t) => toTargetLLH(t.id, t.position)),
      satellites: Array.from(scenario.satellites.entries()).map(([id, positions]) => ({
        id,
        positions: positions.map((p) => [p.x, p.y, p.z]),
      })),
    };
  }

  // 未导入场景：从 mock 生成（包含全卫星全帧轨道）
  const frame0 = mockComputeFrame(0);
  const targets = frame0.targets.map((t) => toTargetLLH(t.id, t.position));

  const satIds = frame0.satellites.map((s) => s.id);
  const satPosMap = new Map(satIds.map((id) => [id, []]));
  for (let f = 0; f < numFrames; f++) {
    const fr = mockComputeFrame(f);
    for (const s of fr.satellites) {
      const arr = satPosMap.get(s.id);
      if (arr) {
        arr.push([s.position.x, s.position.y, s.position.z]);
      }
    }
  }

  return {
    type: "sim_scenario",
    version: 1,
    numFrames,
    fovHalfAngleDeg: frame0.fovHalfAngleDeg,
    targets,
    satellites: satIds.map((id) => ({ id, positions: satPosMap.get(id) })),
  };
}

/**
 * 在不改变 current 的情况下，查看指定帧某卫星的位置（用于绘制轨道采样）。
 */
export function peekSatellitePosition(satId, frameIndex) {
  if (scenario) {
    const positions = scenario.satellites.get(satId);
    if (!positions) {return null;}
    const f = ((frameIndex % scenario.numFrames) + scenario.numFrames) % scenario.numFrames;
    return positions[f];
  }
  const fr = mockComputeFrame(frameIndex);
  const sat = fr.satellites.find((s) => s.id === satId);
  return sat?.position ?? null;
}

export async function getNextFrame() {
  const total = getTotalFrames();
  current = (current + 1) % total;

  if (scenario) {
    return _computeFrameFromScenario(current);
  }

  if (useMock) {
    return mockComputeFrame(current);
  }
  const resp = await fetch(`${BASE_URL}/next-frame`);
  return resp.json();
}

export async function rollbackTo(frameIndex) {
  const total = getTotalFrames();
  current = ((frameIndex % total) + total) % total;

  if (scenario) {
    return _computeFrameFromScenario(current);
  }

  if (useMock) {
    return mockComputeFrame(current);
  }
  const resp = await fetch(`${BASE_URL}/rollback?frame=${frameIndex}`);
  return resp.json();
}

export function getCurrentFrameIndex() {
  return current;
}
