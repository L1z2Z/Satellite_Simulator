// src/view3d/TargetsLayer.js
import { Color, Cartesian2, LabelStyle } from "cesium";

export default class TargetsLayer {
  constructor(viewer) {
    this.viewer = viewer;
    this.entities = new Map(); // id -> entity
  }

  upsertTargets(targets) {
    targets.forEach(t => {
      if (!this.entities.has(t.id)) {
        const ent = this.viewer.entities.add({
          id: `T-${t.id}`,
          position: t.position,
          point: { pixelSize: 8, color: Color.YELLOW },
          label: {
            text: t.id,
            font: "14px sans-serif",
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cartesian2(0, -20),
          },
        });
        this.entities.set(t.id, ent);
      } else {
        this.entities.get(t.id).position = t.position;
      }
    });
  }
}
