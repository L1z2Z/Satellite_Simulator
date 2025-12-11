// src/ui/SensorView.js
import {
  Viewer,
  Math as CesiumMath,
  Transforms,
  Matrix4,
  Matrix3,
  Cartesian3,
  Ellipsoid
} from "cesium";

export default class SensorView {
  constructor(containerEl, { show = true } = {}) {
    this.containerEl = containerEl;
    this.viewer = new Viewer(containerEl, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      selectionIndicator: false,
      fullscreenButton: false,
      shadows: false,
      // 为了支持 canvas.toDataURL 截图，必须保留绘制缓冲区
      contextOptions: {
        webgl: {
          preserveDrawingBuffer: true,
        },
      },
      // 可以复用主视图默认底图；如需自定义影像，可在此配置 imageryProvider
    });
    this.enabled = !!show;
    this.setEnabled(this.enabled);
  }

  setEnabled(v) {
    this.enabled = !!v;
    const root = this.containerEl.parentElement;
    if (!root) return;
    if (this.enabled) root.classList.remove("hidden");
    else root.classList.add("hidden");
  }

  /** 将相机设置到卫星位置，朝向地心；垂直FOV = 2 * halfAngleDeg；aspectRatio 根据容器计算 */
  setCameraAtSatellite(satPosition, halfAngleDeg) {
    const cam = this.viewer.scene.camera;

    // 垂直 FOV
    const fov = CesiumMath.toRadians(2 * halfAngleDeg);
    const rect = this.containerEl.getBoundingClientRect();
    const aspect = Math.max(1e-3, rect.width / Math.max(1, rect.height));
    cam.frustum.fov = fov;
    cam.frustum.aspectRatio = aspect;

    // 近/远裁剪面：依据高度估算
    const R = Ellipsoid.WGS84.maximumRadius; // ≈ 6378137
    const r = Cartesian3.magnitude(satPosition);
    const h = Math.max(10.0, r - R);
    cam.frustum.near = Math.max(10.0, h * 0.02);
    cam.frustum.far = Math.max(cam.frustum.near + 100.0, h * 3.0 + R);

    // 方向：dir = 指向地心；up 取 ENU 的“北”或“上”轴，避免相机翻滚
    const toCenter = Cartesian3.multiplyByScalar(satPosition, -1, new Cartesian3());
    const dir = Cartesian3.normalize(toCenter, new Cartesian3());

    const enu4 = Transforms.eastNorthUpToFixedFrame(satPosition);
    const enu3 = Matrix4.getMatrix3(enu4, new Matrix3());
    const up = Matrix3.getColumn(enu3, 2, new Cartesian3()); // 本地 Up（径向外）

    cam.setView({
      destination: satPosition,
      orientation: { direction: dir, up }
    });
  }

  /** 导出当前小窗画面为 dataURL（PNG） */
  snapshot() {
    const canvas = this.viewer.scene.canvas;
    // 确保有一帧最新内容（如使用 requestRenderMode 时尤为重要）
    this.viewer.scene.requestRender();
    return canvas.toDataURL("image/png");
  }

  destroy() {
    this.viewer?.destroy();
  }
}
