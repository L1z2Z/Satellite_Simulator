// src/services/videoRecorder.js

export function chooseSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export default class CanvasRecorder {
  constructor(
    canvas,
    { mimeType = chooseSupportedMimeType(), fps = 30, bitsPerSecond } = {},
  ) {
    if (!canvas || !canvas.captureStream) {
      throw new Error("当前环境不支持 canvas.captureStream()");
    }
    if (!mimeType) {
      throw new Error(
        "当前浏览器不支持可用的视频编码（MediaRecorder MIME type）。",
      );
    }
    this.canvas = canvas;
    this.stream = canvas.captureStream(fps);
    this.recorder = new MediaRecorder(this.stream, { mimeType, bitsPerSecond });
    this.chunks = [];
    this._onStopResolvers = [];

    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.recorder.mimeType });
      this._blob = blob;
      this._onStopResolvers.forEach((r) => r(blob));
      this._onStopResolvers = [];
    };
  }

  isRecording() {
    return this.recorder?.state === "recording";
  }

  start() {
    if (this.isRecording()) {
      return;
    }
    this.chunks.length = 0;
    this.recorder.start();
  }

  stop() {
    if (!this.isRecording()) {
      return Promise.resolve(this._blob);
    }
    return new Promise((resolve) => {
      this._onStopResolvers.push(resolve);
      this.recorder.stop();
    });
  }

  async download(filename = `sim-${Date.now()}.webm`) {
    const blob = this._blob || (await this.stop());
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }
}
