/**
 * Regressão logística com padronização e regularização L2.
 * Escolha deliberada: modelo simples, transparente e difícil de superajustar.
 * Em mercados com relação sinal/ruído tão baixa, um modelo grande só decora ruído.
 */
export class LogisticModel {
  mean: number[] = [];
  std: number[] = [];
  w: number[] = [];
  b = 0;

  constructor(
    private opts: { epochs?: number; lr?: number; l2?: number } = {},
  ) {}

  private z(x: number[]): number[] {
    return x.map((v, j) => Math.max(-5, Math.min(5, (v - this.mean[j]) / this.std[j])));
  }

  fit(X: number[][], y: number[]) {
    const { epochs = 300, lr = 0.1, l2 = 1.0 } = this.opts;
    const n = X.length;
    const d = X[0].length;
    this.mean = Array.from({ length: d }, (_, j) => X.reduce((s, r) => s + r[j], 0) / n);
    this.std = Array.from({ length: d }, (_, j) => {
      const v = X.reduce((s, r) => s + (r[j] - this.mean[j]) ** 2, 0) / n;
      return Math.sqrt(v) || 1;
    });
    const Z = X.map((r) => this.z(r));
    this.w = new Array(d).fill(0);
    this.b = Math.log((y.reduce((s, v) => s + v, 0) + 1) / (n - y.reduce((s, v) => s + v, 0) + 1));

    for (let e = 0; e < epochs; e++) {
      const gw = new Array(d).fill(0);
      let gb = 0;
      for (let i = 0; i < n; i++) {
        let s = this.b;
        for (let j = 0; j < d; j++) s += this.w[j] * Z[i][j];
        const err = 1 / (1 + Math.exp(-s)) - y[i];
        for (let j = 0; j < d; j++) gw[j] += err * Z[i][j];
        gb += err;
      }
      for (let j = 0; j < d; j++) this.w[j] -= lr * (gw[j] / n + (l2 * this.w[j]) / n);
      this.b -= lr * (gb / n);
    }
    return this;
  }

  predict(x: number[]): number {
    const z = this.z(x);
    let s = this.b;
    for (let j = 0; j < z.length; j++) s += this.w[j] * z[j];
    return 1 / (1 + Math.exp(-s));
  }
}
