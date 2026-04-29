/**
 * pdf-parse v2 bundles pdf.js, which expects browser globals. Node/Vercel has no DOMMatrix.
 * Import this module before any `pdf-parse` import (side effect on load).
 */
const g = globalThis as Record<string, unknown>;

if (typeof g.DOMMatrix === "undefined") {
  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    is2D = true;
    isIdentity = true;
    multiply() {
      return this;
    }
    multiplySelf() {
      return this;
    }
    translateSelf() {
      return this;
    }
    scaleSelf() {
      return this;
    }
    invert() {
      return this;
    }
    invertSelf() {
      return this;
    }
    transformPoint() {
      return { x: 0, y: 0 };
    }
    static fromMatrix() {
      return new DOMMatrixPolyfill();
    }
  }
  g.DOMMatrix = DOMMatrixPolyfill;
}

export {};
