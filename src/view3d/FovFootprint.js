// src/view3d/FovFootprint.js
import { Color, Ellipsoid, Cartesian3, EllipseGraphics } from "cesium";

export default class FovFootprint {
  constructor(viewer) {
    this.viewer = viewer;
    this.entities = new Map(); // satId -> entity
  }

  _ensure(satId) {
    if (!this.entities.has(satId)) {
      const ent = this.viewer.entities.add({
        id: `FOOT-${satId}`,
        position: Cartesian3.ZERO,
        ellipse: new EllipseGraphics({
          semiMajorAxis: 10,
          semiMinorAxis: 10,
          height: 0,
          material: Color.fromBytes(50, 200, 255, 70),
          outline: true,
          outlineColor: Color.fromBytes(50, 200, 255, 150),
        }),
      });
      this.entities.set(satId, ent);
    }
    return this.entities.get(satId);
  }

  /**
   * @param {Array<{id:string, position:Cartesian3}>} satellites
   * @param {number} fovHalfAngleDeg
   * @param {Map<string,{aimPos:Cartesian3,length:number}>} aimMap
   */
  updateAll(satellites, fovHalfAngleDeg, aimMap) {
    satellites.forEach((s) => {
      const satPos = s.position;
      const aim = aimMap?.get(s.id);

      // aimPos：优先使用目标点；否则用天底点（子星点）
      let aimPos = aim?.aimPos;
      if (!aimPos) {
        aimPos = Ellipsoid.WGS84.scaleToGeodeticSurface(
          satPos,
          new Cartesian3(),
          new Cartesian3()
        );
        if (!aimPos) {return;}
      }

      // length：优先使用 aim.length；否则用 sat->aim 的距离
      const length =
        Number.isFinite(aim?.length) && aim.length > 10
          ? aim.length
          : Cartesian3.distance(satPos, aimPos);

      const radius = Math.max(10.0, length * Math.tan((fovHalfAngleDeg * Math.PI) / 180));

      const ent = this._ensure(s.id);
      ent.position = aimPos;
      ent.ellipse.semiMajorAxis = radius;
      ent.ellipse.semiMinorAxis = radius;
    });
  }
}
