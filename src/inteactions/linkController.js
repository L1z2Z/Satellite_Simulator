// src/interactions/linkController.js
import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian3,
  Color,
} from "cesium";

// 工具：从实体ID推回领域ID
function parseDomainId(entityId) {
  if (entityId.startsWith("T-")) {return { kind: "target", id: entityId.slice(2) };}
  return { kind: "sat", id: entityId };
}

function pickGlobePosition(viewer, movement) {
  const { scene, camera } = viewer;
  const ray = camera.getPickRay(movement.endPosition ?? movement.position);
  if (!ray) {return null;}
  return scene.globe.pick(ray, scene);
}

export default class LinkController {
  constructor(viewer, { onToggleLink }) {
    this.viewer = viewer;
    this.onToggleLink = onToggleLink;
    this.handler = new ScreenSpaceEventHandler(viewer.canvas);

    this.dragging = false;
    this.start = null;
    this.tempLine = null;

    // 相机控制器引用 + 临时锁定机制
    this.ctrl = viewer.scene.screenSpaceCameraController;
    this._prevCam = null;
    this._camLockCount = 0;
    this._unlockOnWindowUp = () => {
      if (this.dragging) {
        this.dragging = false;
        if (this.tempLine) { this.viewer.entities.remove(this.tempLine); this.tempLine = null; }
        this._unlockCamera();
        this.start = null;
      }
    };
    window.addEventListener("mouseup", this._unlockOnWindowUp);

    this._bind();
  }

  destroy() {
    this.handler?.destroy();
    if (this.tempLine) {this.viewer.entities.remove(this.tempLine);}
    window.removeEventListener("mouseup", this._unlockOnWindowUp);
    this._unlockCamera(true); // 强制恢复
  }

  // 锁相机（禁用左键旋转等）
  _lockCamera() {
    if (this._camLockCount++ === 0) {
      this._prevCam = {
        enableRotate: this.ctrl.enableRotate,
        enableTranslate: this.ctrl.enableTranslate,
        enableTilt: this.ctrl.enableTilt,
        enableLook: this.ctrl.enableLook,
      };
      this.ctrl.enableRotate = false;    // 关键：禁用左键旋转
      this.ctrl.enableTranslate = false; // 防止误右键平移（保险）
      this.ctrl.enableTilt = false;      // 防止中键俯仰（保险）
      this.ctrl.enableLook = false;      // 防止键盘/组合键 look
      // 可选：改变鼠标指针提示正在“抓取”
      this.viewer.container.style.cursor = "grabbing";
    }
  }

  // 解锁相机（恢复原状态）
  _unlockCamera(force = false) {
    if (force) {this._camLockCount = 1;}
    if (--this._camLockCount <= 0) {
      this._camLockCount = 0;
      if (this._prevCam) {
        this.ctrl.enableRotate = this._prevCam.enableRotate;
        this.ctrl.enableTranslate = this._prevCam.enableTranslate;
        this.ctrl.enableTilt = this._prevCam.enableTilt;
        this.ctrl.enableLook = this._prevCam.enableLook;
        this._prevCam = null;
      }
      this.viewer.container.style.cursor = "default";
    }
  }

  // === 像素半径吸附命中（用于拖拽终点/移动预览） ===
  // requiredKind: 'sat' | 'target' | null(两类都可)
  _pickEntityWithinRadius(windowPos, requiredKind = null) {
    const { scene } = this.viewer;
    const time = this.viewer.clock.currentTime;

    // 1) 先尝试精确 pick（如果正好点中就直接用）
    const exact = scene.pick(windowPos);
    if (exact && exact.id) {
      const d0 = parseDomainId(exact.id.id);
      if (d0 && (!requiredKind || d0.kind === requiredKind)) {
        return { ...d0, entity: exact.id };
      }
    }

    // 2) 走吸附：遍历 entities，找到屏幕坐标在半径内的最近对象
    const ents = this.viewer.entities.values;
    let best = null;
    let bestDist = Infinity;

    for (let i = 0; i < ents.length; i++) {
      const ent = ents[i];
      if (!ent || !ent.id) {continue;}

      const d = parseDomainId(ent.id);
      if (!d) {continue;} // 非交互对象（如 FOV-*、polyline 等）跳过
      if (requiredKind && d.kind !== requiredKind) {continue;}

      // 需要实体具备 position
      const posProp = ent.position;
      if (!posProp) {continue;}
      const p3 = posProp.getValue ? posProp.getValue(time) : posProp;
      if (!p3) {continue;}

      const win = SceneTransforms.wgs84ToWindowCoordinates(scene, p3, new Cartesian2());
      if (!win) {continue;}

      const dx = win.x - windowPos.x;
      const dy = win.y - windowPos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist && dist <= PICK_RADIUS_PX) {
        bestDist = dist;
        best = { ...d, entity: ent, screen: win };
      }
    }

    return best; // 可能为 null
  }
  // === 优化结束 ===

  _bind() {
    const scene = this.viewer.scene;

    // 鼠标按下：确定起点，并“锁相机”
    this.handler.setInputAction((movement) => {
      const picked = scene.pick(movement.position);
      if (!picked || !picked.id) {return;}
      const ent = picked.id;
      const domain = parseDomainId(ent.id);
      if (!domain) {return;}

      this.dragging = true;
      this.start = { ...domain, entity: ent };

      // 开始拖拽时锁相机（停止左键旋转）
      this._lockCamera();

      const from = ent.position.getValue?.(scene?.frameState?.time) || ent.position;
      this.tempLine = this.viewer.entities.add({
        polyline: {
          positions: [from, from],
          width: 2,
          material: Color.fromCssColorString("#ffd700"),
        },
      });
    }, ScreenSpaceEventType.LEFT_DOWN);

    // 鼠标移动：更新临时线终点
    this.handler.setInputAction((movement) => {
      if (!this.dragging || !this.tempLine) {return;}
      const from = this.start.entity.position.getValue?.(scene?.frameState?.time) || this.start.entity.position;
      const to = pickGlobePosition(this.viewer, movement) || from;
      this.tempLine.polyline.positions = [from, to];
    }, ScreenSpaceEventType.MOUSE_MOVE);

    // 鼠标松开：尝试建立/删除标注，并“解锁相机”
    this.handler.setInputAction((movement) => {
      if (!this.dragging) {return;}
      const picked = scene.pick(movement.position);
      const shift = movement.shiftKey === true || movement?.shiftKey === 1;

      if (this.tempLine) { this.viewer.entities.remove(this.tempLine); this.tempLine = null; }

      // ★ 关键：结束拖拽时解锁相机（恢复原行为）
      this._unlockCamera();

      this.dragging = false;

      const end = picked && picked.id ? parseDomainId(picked.id.id) : null;
      if (!end || end.kind === this.start.kind) {
        this.start = null;
        return;
      }
      const satId = this.start.kind === "sat" ? this.start.id : end.id;
      const targetId = this.start.kind === "target" ? this.start.id : end.id;

      this.onToggleLink(satId, targetId, { remove: shift });
      this.start = null;
    }, ScreenSpaceEventType.LEFT_UP);
  }
}
