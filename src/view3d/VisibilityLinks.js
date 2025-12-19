// src/view3d/VisibilityLinks.js
import { Color } from "cesium";

export default class VisibilityLinks {
  constructor(viewer) {
    this.viewer = viewer;
    this.pool = [];
  }
  clear() {
    this.pool.forEach((e) => this.viewer.entities.remove(e));
    this.pool.length = 0;
  }
  render(links) {
    this.clear();
    links.forEach((l) => {
      const color = l.annotated
        ? Color.fromCssColorString("#ffd700") // 标注：金色
        : l.visible
          ? Color.fromCssColorString("#31d158") // 可见：绿
          : Color.fromCssColorString("#f43f5e"); // 不可见：红
      const ent = this.viewer.entities.add({
        polyline: {
          positions: [l.satPos, l.tgtPos],
          width: l.annotated ? 3 : 2,
          material: color,
        },
      });
      this.pool.push(ent);
    });
  }
}
