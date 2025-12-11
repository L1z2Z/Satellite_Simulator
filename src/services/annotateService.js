// src/services/annotateService.js

export function downloadJSON(obj, fileName = "annotations.json") {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }
  
  export function readJSONFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const obj = JSON.parse(fr.result);
          resolve(obj);
        } catch (e) { reject(e); }
      };
      fr.onerror = reject;
      fr.readAsText(file, "utf-8");
    });
  }
  