// src/state/annotationStore.js

// 储存：frame -> Set("SAT-01|TOKYO")
const perFrame = new Map();
// 撤销栈：{ frame, key, prevHad }
const undoStack = [];

function frameSet(frame) {
  if (!perFrame.has(frame)) perFrame.set(frame, new Set());
  return perFrame.get(frame);
}

export function linkKey(satId, targetId) {
  return `${satId}|${targetId}`;
}

export function hasLink(frame, satId, targetId) {
  return frameSet(frame).has(linkKey(satId, targetId));
}

export function toggleLink(frame, satId, targetId) {
  const set = frameSet(frame);
  const key = linkKey(satId, targetId);
  const prevHad = set.has(key);
  if (prevHad) set.delete(key);
  else set.add(key);
  undoStack.push({ frame, key, prevHad });
  return !prevHad;
}

export function setLink(frame, satId, targetId, value = true) {
  const set = frameSet(frame);
  const key = linkKey(satId, targetId);
  const prevHad = set.has(key);
  if (value) set.add(key); else set.delete(key);
  undoStack.push({ frame, key, prevHad });
}

export function getLinksForFrame(frame) {
  return new Set(frameSet(frame)); // 拷贝
}

export function undoLast() {
  const op = undoStack.pop();
  if (!op) return false;
  const set = frameSet(op.frame);
  if (op.prevHad) set.add(op.key);
  else set.delete(op.key);
  return true;
}

// ====== 导入 / 导出 ======

/** 导出为 JSON 对象：{ frames: { "0":[["SAT-01","TOKYO"],...], "1":[...] } } */
export function serializeAll() {
  const frames = {};
  for (const [frame, set] of perFrame.entries()) {
    frames[String(frame)] = Array.from(set).map(k => k.split("|"));
  }
  return { version: 1, frames };
}

/** 清空全部标注 */
export function clearAll() {
  perFrame.clear();
  undoStack.length = 0;
}

/** 从对象导入。默认合并；merge=false 则先 clear 再导入。 */
export function loadFromObject(obj, { merge = true } = {}) {
  if (!obj || typeof obj !== "object" || !obj.frames || typeof obj.frames !== "object") {
    throw new Error("无效的标注文件：缺少 frames 字段");
  }
  if (!merge) clearAll();

  let total = 0, framesTouched = 0;
  for (const [frameStr, arr] of Object.entries(obj.frames)) {
    const frame = Number(frameStr);
    if (!Number.isFinite(frame)) continue;
    const set = frameSet(frame);
    framesTouched++;
    for (const pair of arr || []) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const [satId, targetId] = pair;
      set.add(linkKey(String(satId), String(targetId)));
      total++;
    }
  }
  return { framesTouched, total };
}
