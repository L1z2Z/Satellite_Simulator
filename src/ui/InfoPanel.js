// src/ui/InfoPanel.js

export default class InfoPanel {
  /**
   * @param {HTMLElement} el 容器（index.html 中的 #infoPanel）
   * @param {{ onExport:Function, onImport:Function, onFilterChange:Function }} handlers
   */
  constructor(el, { onExport, onImport, onFilterChange } = {}) {
    this.el = el;
    this.onExport = onExport;
    this.onImport = onImport;
    this.onFilterChange = onFilterChange;

    // 初始过滤状态（主程序会覆盖）
    this.filters = {
      showAnnotatedOnly: false,
      showVisibleOnly: false,
      sat: "ALL",
      target: "ALL",
    };
  }

  /** 更新面板内容与事件绑定 */
  render({ stats, options, filters }) {
    this.filters = { ...this.filters, ...(filters || {}) };

    const satOptions = ["ALL", ...options.satIds];
    const tgtOptions = ["ALL", ...options.targetIds];

    this.el.innerHTML = `
        <div style="font-weight:600;margin-bottom:6px;">信息面板</div>
        <div style="font-size:12px;line-height:1.5;margin-bottom:8px;white-space:normal;">
          <div>FOV 半顶角：<b>${stats.fov}°</b></div>
          <div>卫星：<b>${stats.satCount}</b>，目标：<b>${stats.tgtCount}</b></div>
          <div>可见连线：<b>${stats.visibleCount}</b>，已标注连线：<b>${stats.annotatedCount}</b></div>
          <div>过滤后连线：<b>${stats.filteredCount}</b></div>
        </div>
  
        <div style="font-size:12px;margin-bottom:8px;">
          <label><input id="chkAnnOnly" type="checkbox" ${this.filters.showAnnotatedOnly ? "checked" : ""}/> 仅显示已标注</label><br/>
          <label><input id="chkVisOnly" type="checkbox" ${this.filters.showVisibleOnly ? "checked" : ""}/> 仅显示可见</label>
        </div>
  
        <div style="display:flex; gap:6px; margin-bottom:8px;">
          <label style="font-size:12px;">卫星：
            <select id="selSat" style="max-width:120px;">
              ${satOptions.map((v) => `<option value="${v}" ${v === this.filters.sat ? "selected" : ""}>${v}</option>`).join("")}
            </select>
          </label>
          <label style="font-size:12px;">目标：
            <select id="selTgt" style="max-width:120px;">
              ${tgtOptions.map((v) => `<option value="${v}" ${v === this.filters.target ? "selected" : ""}>${v}</option>`).join("")}
            </select>
          </label>
        </div>
  
        <div style="display:flex; gap:6px;">
          <button id="btnExport">导出JSON</button>
          <button id="btnImport">导入JSON</button>
          <input id="fileImport" type="file" accept="application/json" style="display:none;" />
        </div>
      `;

    // 事件绑定
    const $ = (id) => this.el.querySelector(id);

    $("#chkAnnOnly").onchange = () =>
      this._emitFilterChange({ showAnnotatedOnly: $("#chkAnnOnly").checked });
    $("#chkVisOnly").onchange = () =>
      this._emitFilterChange({ showVisibleOnly: $("#chkVisOnly").checked });
    $("#selSat").onchange = () =>
      this._emitFilterChange({ sat: $("#selSat").value });
    $("#selTgt").onchange = () =>
      this._emitFilterChange({ target: $("#selTgt").value });

    $("#btnExport").onclick = () => this.onExport && this.onExport();
    $("#btnImport").onclick = () => $("#fileImport").click();
    $("#fileImport").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) {
        return;
      }
      await this.onImport?.(file);
      e.target.value = ""; // 允许重复导入同一文件
    };
  }

  _emitFilterChange(patch) {
    this.filters = { ...this.filters, ...patch };
    this.onFilterChange?.(this.filters);
  }
}
