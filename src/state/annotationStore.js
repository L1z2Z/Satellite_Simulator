// src/state/annotationStore.js
// 全局储存：Set("SAT-01|BEIJING") —— 跨帧持久，除非手动取消
const globalLinks = new Set();
// 撤销栈：{ key, prevHad }
const undoStack = [];

export function linkKey(satId, targetId) {
  return `${satId}|${targetId}`;
}

export function hasLink(satId, targetId) {
  return globalLinks.has(linkKey(satId, targetId));
}

export function toggleLink(satId, targetId) {
  const key = linkKey(satId, targetId);
  const prevHad = globalLinks.has(key);
  if (prevHad) {globalLinks.delete(key);}
  else {globalLinks.add(key);}
  undoStack.push({ key, prevHad });
  return !prevHad;
}

export function removeLink(satId, targetId) {
  const key = linkKey(satId, targetId);
  const prevHad = globalLinks.has(key);
  if (prevHad) {globalLinks.delete(key);}
  undoStack.push({ key, prevHad });
  return prevHad;
}

export function getAllLinks() {
  return new Set(globalLinks); // 拷贝
}

export function undoLast() {
  const op = undoStack.pop();
  if (!op) {return false;}
  if (op.prevHad) {globalLinks.add(op.key);}
  else {globalLinks.delete(op.key);}
  return true;
}

// ===== 导入/导出 =====
// 新格式：{ version:2, mode:"global", links:[[sat,target], ...] }
// 兼容旧格式：{ version:1, frames:{ "0":[[sat,target],...], ... } } -> 会合并为全局
export function serializeAll() {
  const links = Array.from(globalLinks).map(k => k.split("|"));
  return { version: 2, mode: "global", links };
}

export function clearAll() {
  globalLinks.clear();
  undoStack.length = 0;
}

export function loadFromObject(obj, { merge = true } = {}) {
  if (!obj || typeof obj !== "object") {throw new Error("无效标注文件");}

  if (!merge) {clearAll();}

  // 新格式
  if (Array.isArray(obj.links)) {
    for (const pair of obj.links) {
      if (Array.isArray(pair) && pair.length === 2) {
        globalLinks.add(linkKey(String(pair[0]), String(pair[1])));
      }
    }
    return { total: globalLinks.size };
  }

  // 旧格式兼容：frames 合并进全局
  if (obj.frames && typeof obj.frames === "object") {
    for (const arr of Object.values(obj.frames)) {
      for (const pair of arr || []) {
        if (Array.isArray(pair) && pair.length === 2) {
          globalLinks.add(linkKey(String(pair[0]), String(pair[1])));
        }
      }
    }
    return { total: globalLinks.size };
  }

  throw new Error("无效标注文件：缺少 links 或 frames");
}
