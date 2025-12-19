// src/view3d/OrbitsLayer.js
import { Color, PolylineDashMaterialProperty, ArcType } from "cesium";

export default class OrbitsLayer {
  constructor(viewer) {
    this.viewer = viewer;
    this.entities = new Map(); // satId -> entity
  }

  _ensureEntity(satId) {
    if (!this.entities.has(satId)) {
      const ent = this.viewer.entities.add({
        id: `ORB-${satId}`,
        polyline: {
          positions: [],
          width: 2,
          arcType: ArcType.NONE,
          clampToGround: false,
          material: new PolylineDashMaterialProperty({
            color: Color.fromCssColorString("#7dd3fc"),
            dashLength: 16,
          }),
        },
      });
      this.entities.set(satId, ent);
    }
    return this.entities.get(satId);
  }

  setOrbit(satId, positions) {
    const ent = this._ensureEntity(satId);
    ent.polyline.positions = positions;
  }

  clear() {
    for (const ent of this.entities.values()) {
      this.viewer.entities.remove(ent);
    }
    this.entities.clear();
  }
}
