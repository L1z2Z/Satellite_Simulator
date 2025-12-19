// src/view3d/FovCones.js
import { Color, Cartesian3, Quaternion, Math as CesiumMath } from "cesium";

const TOP_RADIUS_EPS = 1.0; // 避免 topRadius=0 的退化几何问题

export default class FovCones {
  constructor(viewer, { defaultConeLength = 400_000 } = {}) {
    this.viewer = viewer;
    this.entities = new Map(); // satId -> coneEntity
    this.defaultConeLength = defaultConeLength;
  }

  static _orientationFromDir(dir /* normalized world vector */) {
    // 把局部 +Z 轴旋转到 dir
    const z = new Cartesian3(0, 0, 1);
    const axis = Cartesian3.cross(z, dir, new Cartesian3());
    const dot = Cartesian3.dot(z, dir);
    const eps = 1e-6;
    if (Cartesian3.magnitude(axis) < eps) {
      if (dot > 0.9999) {return Quaternion.IDENTITY;}
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
        position: Cartesian3.ZERO,
        cylinder: {
          length: this.defaultConeLength,
          topRadius: TOP_RADIUS_EPS,
          bottomRadius: TOP_RADIUS_EPS * 2,
          numberOfVerticalLines: 0,
          material: Color.fromBytes(50, 200, 255, 90),
          outline: true,
          outlineColor: Color.fromBytes(50, 200, 255, 150),
        },
      });
      this.entities.set(satId, ent);
    }
    return this.entities.get(satId);
  }

  /**
   * @param {{id:string, position:Cartesian3}} sat
   * @param {number} fovHalfAngleDeg
   * @param {{aimPos?:Cartesian3, length?:number}} aim
   *  - aimPos：中心线与地面交点（有连线时就是目标点；无连线时可传天底点）
   *  - length：锥体长度，建议 = distance(satPos, aimPos)
   */
  updatePerSatellite(sat, fovHalfAngleDeg, aim = {}) {
    const satPos = sat.position;

    // 目标方向：sat -> aimPos。若未提供 aimPos，则退回指向地心
    let dirToAim;
    if (aim.aimPos) {
      dirToAim = Cartesian3.subtract(aim.aimPos, satPos, new Cartesian3());
      if (Cartesian3.magnitude(dirToAim) < 1e-6) {
        dirToAim = Cartesian3.multiplyByScalar(satPos, -1, new Cartesian3());
      }
    } else {
      dirToAim = Cartesian3.multiplyByScalar(satPos, -1, new Cartesian3());
    }
    Cartesian3.normalize(dirToAim, dirToAim);

    // 让“锥尖在卫星上”：局部 +Z 指向卫星（即反向）
    const axisToSat = Cartesian3.multiplyByScalar(dirToAim, -1, new Cartesian3());
    const orient = FovCones._orientationFromDir(axisToSat);

    // 锥体长度：优先用 aim.length，否则用默认长度
    const length =
      Number.isFinite(aim.length) && aim.length > 10 ? aim.length : this.defaultConeLength;

    // 锥体中心：从卫星沿 dirToAim 前进 length/2
    const half = length / 2;
    const center = Cartesian3.add(
      satPos,
      Cartesian3.multiplyByScalar(dirToAim, half, new Cartesian3()),
      new Cartesian3()
    );

    // 底半径：length * tan(halfAngle)
    const desired = length * Math.tan(CesiumMath.toRadians(fovHalfAngleDeg));
    const bottomRadius = Math.max(desired, TOP_RADIUS_EPS * 2);

    const ent = this._ensureCone(sat.id);
    ent.position = center;
    ent.orientation = orient;
    ent.cylinder.length = length;
    ent.cylinder.topRadius = TOP_RADIUS_EPS;
    ent.cylinder.bottomRadius = bottomRadius;
  }

  /**
   * @param {Array<{id:string, position:Cartesian3}>} satellites
   * @param {number} fovHalfAngleDeg
   * @param {Map<string,{aimPos:Cartesian3,length:number,aimDir:Cartesian3}>} aimMap
   */
  updateAll(satellites, fovHalfAngleDeg, aimMap) {
    satellites.forEach((s) => {
      const aim = aimMap?.get(s.id) || {};
      this.updatePerSatellite(s, fovHalfAngleDeg, aim);
    });
  }
}
