// src/services/simResultAdapter.js
import { Cartesian3, Math as CesiumMath } from "cesium";

// ==== 可调参数（与前端渲染一致）====
export const FOV_HALF_ANGLE_DEG = 25;
export const NUM_FRAMES = 150;
export const ALT_METERS = 700_000;

// 目标点（经纬度）
const TARGETS = [
  { id: "TOKYO",   lat: 35.6,    lon: 139.7 },
  { id: "BEIJING", lat: 39.9,    lon: 116.4 },
  { id: "PARIS",   lat: 48.8566, lon: 2.3522 },
  { id: "NYC",     lat: 40.7128, lon: -74.0060 },
];

// 卫星（简化轨道：相位、倾角、每帧角速度）
const SATS = [
  { id: "SAT-01", phaseDeg:   0, inclinationDeg: 30, degPerFrame: 0.6 },
  { id: "SAT-02", phaseDeg: 180, inclinationDeg: 55, degPerFrame: 0.5 },
];

function normalizeLon(lonDeg) {
  return ((lonDeg + 540) % 360) - 180;
}
function llhToCartesian(latDeg, lonDeg, heightMeters) {
  return Cartesian3.fromDegrees(lonDeg, latDeg, heightMeters);
}
function satLLH(frame, sat) {
  const theta = sat.degPerFrame * frame + sat.phaseDeg;
  const lat = Math.sin(CesiumMath.toRadians(theta)) * sat.inclinationDeg;
  const lon = normalizeLon(theta);
  return { lat, lon, h: ALT_METERS };
}
function visibleByNadirFOV(satPos, targetPos, fovHalfAngleDeg) {
  const vSatToTarget = Cartesian3.subtract(targetPos, satPos, new Cartesian3());
  const vSatToCenter = Cartesian3.multiplyByScalar(satPos, -1.0, new Cartesian3());
  const angle = Cartesian3.angleBetween(vSatToTarget, vSatToCenter);
  return angle <= CesiumMath.toRadians(fovHalfAngleDeg);
}

// ==== Mock 生成器 ====
export function mockComputeFrame(frameIndex) {
  const frame = (frameIndex + NUM_FRAMES) % NUM_FRAMES;

  // 目标点（静态）
  const targets = TARGETS.map(t => ({
    id: t.id,
    position: llhToCartesian(t.lat, t.lon, 0),
  }));

  // 卫星（随帧运动）
  const satellites = SATS.map(s => {
    const llh = satLLH(frame, s);
    return {
      id: s.id,
      position: llhToCartesian(llh.lat, llh.lon, llh.h),
    };
  });

  // 连线与可见性
  const links = [];
  satellites.forEach(s => {
    targets.forEach(t => {
      links.push({
        sat: s.id,
        target: t.id,
        visible: visibleByNadirFOV(s.position, t.position, FOV_HALF_ANGLE_DEG),
        satPos: s.position,
        tgtPos: t.position,
      });
    });
  });

  return { frame, satellites, targets, links, fovHalfAngleDeg: FOV_HALF_ANGLE_DEG };
}
