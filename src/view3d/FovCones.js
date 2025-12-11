// src/view3d/FovCones.js
import { Color, Cartesian3, Quaternion } from "cesium";

const TOP_RADIUS_EPS = 1.0; // 关键修复：避免 topRadius 为 0 造成几何退化

export default class FovCones {
  constructor(viewer, { coneLength = 400_000 } = {}) {
    this.viewer = viewer;
    this.entities = new Map(); // satId -> coneEntity
    this.coneLength = coneLength;
  }

  static _orientationFromDir(dir /* normalized world vector */) {
    // 把 +Z 轴旋转到 dir
    const z = new Cartesian3(0, 0, 1);
    const axis = Cartesian3.cross(z, dir, new Cartesian3());
    const dot = Cartesian3.dot(z, dir);
    const eps = 1e-6;
    if (Cartesian3.magnitude(axis) < eps) {
      if (dot > 0.9999) return Quaternion.IDENTITY;
      const any = new Cartesian3(1, 0, 0);
      return Quaternion.fromAxisAngle(any, Math.PI);
    }
    Cartesian3.normalize(axis, axis);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    return Quaternion.fromAxisAngle(axis, angle);
  }

  _ensureCone(satId) {
    if (!this.entities.has(satId)) {
      const ent = this.viewer.entities.add({
        id: `FOV-${satId}`,
        position: Cartesian3.ZERO, // placeholder
        cylinder: {
          length: this.coneLength,
          topRadius: TOP_RADIUS_EPS,     // ← 修复点：不要用 0
          bottomRadius: TOP_RADIUS_EPS,  // 初始化为一个很小的值，后面会更新
          numberOfVerticalLines: 0,
          material: Color.fromBytes(50, 200, 255, 90), // 半透明
          outline: true,
          outlineColor: Color.fromBytes(50, 200, 255, 150),
          // 如仍担心平台差异，可加 slices: 64
        },
      });
      this.entities.set(satId, ent);
    }
    return this.entities.get(satId);
  }

  updatePerSatellite({ id, position }, fovHalfAngleDeg) {
    const toCenter = Cartesian3.multiplyByScalar(position, -1, new Cartesian3());
    const dir = Cartesian3.normalize(toCenter, new Cartesian3()); // 指向地心
    const axisToSat = Cartesian3.multiplyByScalar(dir, -1, new Cartesian3()); // 指向卫星
    const orient = FovCones._orientationFromDir(axisToSat);

    const half = this.coneLength / 2;
    // 锥体中心 = 卫星位置沿“朝向地心方向”移动 half
    const center = Cartesian3.add(
      position,
      Cartesian3.multiplyByScalar(dir, half, new Cartesian3()),
      new Cartesian3()
    );

    // 底半径：确保大于顶半径，且为有限数
    const desired = this.coneLength * Math.tan((fovHalfAngleDeg * Math.PI) / 180);
    const bottomRadius = Math.max(desired, TOP_RADIUS_EPS * 2);

    const ent = this._ensureCone(id);
    ent.position = center;
    ent.orientation = orient;
    ent.cylinder.length = this.coneLength;
    ent.cylinder.topRadius = TOP_RADIUS_EPS;    // 尖指向卫星
    ent.cylinder.bottomRadius = bottomRadius;   // 底面指向地心
  }

  updateAll(satellites, fovHalfAngleDeg) {
    satellites.forEach((s) => this.updatePerSatellite(s, fovHalfAngleDeg));
  }
}
