// src/services/frameService.js
// 统一的数据入口：现在用 Mock，改后端也不影响上层
import { NUM_FRAMES, mockComputeFrame } from "./simResultAdapter";

let current = 0;
let useMock = true;
// 预留：后端地址
let BASE_URL = "/api";

export function configureBackend({ baseUrl, mock = true } = {}) {
  if (baseUrl) {
    BASE_URL = baseUrl;
  }
  useMock = mock;
}

export async function getNextFrame() {
  current = (current + 1) % NUM_FRAMES;
  if (useMock) {
    return mockComputeFrame(current);
  }
  const resp = await fetch(`${BASE_URL}/next-frame`);
  return resp.json();
}

export async function rollbackTo(frameIndex) {
  current = ((frameIndex % NUM_FRAMES) + NUM_FRAMES) % NUM_FRAMES;
  if (useMock) {
    return mockComputeFrame(current);
  }
  const resp = await fetch(`${BASE_URL}/rollback?frame=${frameIndex}`);
  return resp.json();
}

export function getCurrentFrameIndex() {
  return current;
}
