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
    if (!root) {return;}
    if (this.enabled) {root.classList.remove("hidden");}
    else {root.classList.add("hidden");}
  }

  // 让相机在卫星位置，朝向给定 aimDir（归一化），垂直FOV = 2*halfAngleDeg
  setCameraAtSatellite(satPosition, aimDir, halfAngleDeg) {
    const cam = this.viewer.scene.camera;

    const fov = CesiumMath.toRadians(2 * halfAngleDeg);
    const rect = this.containerEl.getBoundingClientRect();
    const aspect = Math.max(1e-3, rect.width / Math.max(1, rect.height));
    cam.frustum.fov = fov;
    cam.frustum.aspectRatio = aspect;

    // 裁剪面（粗略）
    const R = Ellipsoid.WGS84.maximumRadius;
    const r = Cartesian3.magnitude(satPosition);
    const h = Math.max(10.0, r - R);
    cam.frustum.near = Math.max(10.0, h * 0.02);
    cam.frustum.far = Math.max(cam.frustum.near + 100.0, h * 3.0 + R);

    // 方向：中心线方向
    const dir = Cartesian3.normalize(aimDir, new Cartesian3());

    // 构造一个与 dir 正交且稳定的 up，避免翻滚：
    // upCandidate = 局部Up；right = dir x upCandidate；up = right x dir
    const enu4 = Transforms.eastNorthUpToFixedFrame(satPosition);
    const enu3 = Matrix4.getMatrix3(enu4, new Matrix3());
    const upCandidate = Matrix3.getColumn(enu3, 2, new Cartesian3()); // local Up

    let right = Cartesian3.cross(dir, upCandidate, new Cartesian3());
    if (Cartesian3.magnitude(right) < 1e-6) {
      // 退化时换一个候选轴
      right = Cartesian3.cross(dir, new Cartesian3(1, 0, 0), new Cartesian3());
    }
    Cartesian3.normalize(right, right);
    const up = Cartesian3.normalize(Cartesian3.cross(right, dir, new Cartesian3()), new Cartesian3());

    cam.setView({
      destination: satPosition,
      orientation: { direction: dir, up },
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
