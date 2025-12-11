// src/view3d/FovFootprint.js
import {
  Color,
  Ellipsoid,
  Cartesian3,
  EllipseGraphics
} from "cesium";

export default class FovFootprint {
  constructor(viewer) {
    this.viewer = viewer;
    this.entity = null;
  }

  /** 在地表绘制 FOV 足迹（近似：半径 = 高度 * tan(半顶角)） */
  update(satPosition, halfAngleDeg) {
    if (!satPosition) return;

    // 子星点：把卫星位置投影到椭球面
    const surface = Ellipsoid.WGS84.scaleToGeodeticSurface(satPosition, new Cartesian3(), new Cartesian3());
    if (!surface) return;

    // 高度与地面半径
    const R = Ellipsoid.WGS84.maximumRadius; // 粗略足够
    const r = Cartesian3.magnitude(satPosition);
    const h = Math.max(0, r - R);
    const groundRadius = Math.max(10.0, h * Math.tan((halfAngleDeg * Math.PI) / 180));

    if (!this.entity) {
      this.entity = this.viewer.entities.add({
        position: surface,
        ellipse: new EllipseGraphics({
          semiMajorAxis: groundRadius,
          semiMinorAxis: groundRadius,
          height: 0,
          material: Color.fromBytes(50, 200, 255, 70),
          outline: true,
          outlineColor: Color.fromBytes(50, 200, 255, 150)
        })
      });
    } else {
      this.entity.position = surface;
      this.entity.ellipse.semiMajorAxis = groundRadius;
      this.entity.ellipse.semiMinorAxis = groundRadius;
    }
  }
}
