// src/view3d/SatellitesLayer.js
import { Color, Cartesian2, LabelStyle, Cartesian3, Quaternion } from "cesium";

const DEFAULT_MODEL =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Cube/glTF/Cube.gltf";

export default class SatellitesLayer {
  constructor(viewer, { modelUri = DEFAULT_MODEL } = {}) {
    this.viewer = viewer;
    this.modelUri = modelUri;
    this.entities = new Map(); // id -> entity
  }

  _ensureEntity(sat) {
    if (!this.entities.has(sat.id)) {
      const ent = this.viewer.entities.add({
        id: sat.id,
        position: sat.position,
        // glTF 模型（minimumPixelSize 确保远距离可见；scale 可按需要调）
        model: {
          uri: this.modelUri,
          scale: 2000,
          minimumPixelSize: 40,
          // color: Color.CYAN.withAlpha(0.9), // 如需着色可开启
        },
        label: {
          text: sat.id,
          font: "14px sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          pixelOffset: new Cartesian2(0, -20),
          style: LabelStyle.FILL_AND_OUTLINE,
        },
      });
      this.entities.set(sat.id, ent);
    }
    return this.entities.get(sat.id);
  }

  // 让模型“机身朝向地心”（近似）：把 +Z 轴旋转到 (center - satPos) 方向
  static orientationToNadir(satPos) {
    const z = new Cartesian3(0, 0, 1);
    const toCenter = Cartesian3.multiplyByScalar(satPos, -1, new Cartesian3());
    Cartesian3.normalize(toCenter, toCenter);
    const axis = Cartesian3.cross(z, toCenter, new Cartesian3());
    const dot = Cartesian3.dot(z, toCenter);
    const eps = 1e-6;
    if (Cartesian3.magnitude(axis) < eps) {
      // 同向或反向：反向时绕任意法线 180 度
      if (dot > 0.9999) {return Quaternion.IDENTITY;}
      const any = new Cartesian3(1, 0, 0);
      return Quaternion.fromAxisAngle(any, Math.PI);
    }
    Cartesian3.normalize(axis, axis);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    return Quaternion.fromAxisAngle(axis, angle);
  }

  updateSatellites(satellites) {
    satellites.forEach(s => {
      const ent = this._ensureEntity(s);
      ent.position = s.position;
      ent.orientation = SatellitesLayer.orientationToNadir(s.position);
    });
  }
}
