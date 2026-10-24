import { describe, expect, it } from "vitest";
import { BungieError } from "../bungie/errors";
import { runQueue, type QueueTask } from "./queue";

const opts = (sleeps: number[] = []) => ({
  delayBetweenCallsMs: 250,
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  sleep: async (ms: number) => void sleeps.push(ms),
});

const ok = (id: string, log: string[] = []): QueueTask => ({
  actionId: id,
  itemInstanceId: id,
  run: async () => void log.push(id),
});
const failing = (id: string, code: number, times = Infinity, log: string[] = []): QueueTask => {
  let left = times;
  return {
    actionId: id,
    itemInstanceId: id,
    run: async () => {
      log.push(id);
      if (left-- > 0) throw new BungieError("x", code, 200);
    },
  };
};

describe("cola de acciones", () => {
  it("ejecuta en serie y en orden, con pausa entre llamadas pero no antes de la primera", async () => {
    const log: string[] = [];
    const sleeps: number[] = [];
    const { results, stopped } = await runQueue([ok("a", log), ok("b", log), ok("c", log)], opts(sleeps));
    expect(log).toEqual(["a", "b", "c"]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(stopped).toBeNull();
    expect(sleeps).toEqual([250, 250]);
  });

  it("nunca ejecuta dos tareas a la vez", async () => {
    let running = 0;
    let peak = 0;
    const task = (id: string): QueueTask => ({
      actionId: id,
      itemInstanceId: id,
      run: async () => {
        peak = Math.max(peak, ++running);
        await Promise.resolve();
        running--;
      },
    });
    await runQueue([task("a"), task("b"), task("c")], opts());
    expect(peak).toBe(1);
  });

  it("reintenta con backoff ante límites de peticiones y termina bien", async () => {
    const sleeps: number[] = [];
    const log: string[] = [];
    const { results } = await runQueue([failing("a", 1672, 2, log)], opts(sleeps));
    expect(results[0].ok).toBe(true);
    expect(log).toHaveLength(3);
    // pausa de reintento 1s y 2s, más la pausa entre llamadas (250) antes de cada reintento
    expect(sleeps.filter((s) => s >= 1000)).toEqual([1000, 2000]);
  });

  it("agota los reintentos y reporta throttle sin parar la cola", async () => {
    const log: string[] = [];
    const { results, stopped } = await runQueue([failing("a", 1672, Infinity, log), ok("b", log)], opts());
    expect(log.filter((x) => x === "a")).toHaveLength(4); // 1 intento + 3 reintentos
    expect(results[0]).toMatchObject({ ok: false, error: { kind: "throttle" } });
    expect(results[1].ok).toBe(true);
    expect(stopped).toBeNull();
  });

  it("un error de ítem no detiene la cola ni se reintenta", async () => {
    const log: string[] = [];
    const { results, stopped } = await runQueue(
      [failing("a", 1623, Infinity, log), failing("b", 1642, Infinity, log), ok("c", log)],
      opts(),
    );
    expect(log).toEqual(["a", "b", "c"]);
    expect(results.map((r) => r.error?.kind)).toEqual(["not_found", "no_room", undefined]);
    expect(stopped).toBeNull();
  });

  it("un error fatal (actividad en curso) detiene la cola y marca el resto como no ejecutado", async () => {
    const log: string[] = [];
    const { results, stopped } = await runQueue([ok("a", log), failing("b", 1671), ok("c", log), ok("d", log)], opts());
    expect(log).toEqual(["a"]);
    expect(stopped).toMatchObject({ reason: "fatal", error: { kind: "in_activity" } });
    expect(results.map((r) => [r.ok, r.skipped ?? false])).toEqual([
      [true, false],
      [false, false],
      [false, true],
      [false, true],
    ]);
  });

  it("al cancelar a mitad no ejecuta lo pendiente", async () => {
    const controller = new AbortController();
    const log: string[] = [];
    const cancelling: QueueTask = {
      actionId: "b",
      itemInstanceId: "b",
      run: async () => {
        log.push("b");
        controller.abort();
      },
    };
    const { results, stopped } = await runQueue([ok("a", log), cancelling, ok("c", log)], {
      ...opts(),
      signal: controller.signal,
    });
    expect(log).toEqual(["a", "b"]);
    expect(stopped).toEqual({ reason: "cancelled" });
    expect(results[2]).toMatchObject({ ok: false, skipped: true });
  });

  it("avisa del progreso tras cada tarea", async () => {
    const progress: [number, number][] = [];
    await runQueue([ok("a"), ok("b")], { ...opts(), onResult: (_r, done, total) => progress.push([done, total]) });
    expect(progress).toEqual([[1, 2], [2, 2]]);
  });

  describe("dependencias entre pasos (requires)", () => {
    const dep = (task: QueueTask, requires: string[]): QueueTask => ({ ...task, requires });

    it("un paso se salta si falló uno del que depende, y explica la causa del primero", async () => {
      const log: string[] = [];
      const { results, stopped } = await runQueue(
        [failing("a", 1642, Infinity, log), dep(ok("b", log), ["a"])],
        opts(),
      );
      expect(log).toEqual(["a"]); // «b» ni se llama
      expect(results[1]).toMatchObject({ ok: false, skipped: true, error: { kind: "no_room", code: 1642 } });
      expect(results[1].error?.message).toMatch(/No se intentó porque falló el paso anterior/);
      expect(stopped).toBeNull(); // no es un error fatal: la cola sigue
    });

    it("si el paso del que depende sale bien, se ejecuta con normalidad", async () => {
      const log: string[] = [];
      await runQueue([ok("a", log), dep(ok("b", log), ["a"])], opts());
      expect(log).toEqual(["a", "b"]);
    });

    it("sin `requires`, un paso se intenta aunque el anterior haya fallado (p. ej. devolver el arma al alijo)", async () => {
      const log: string[] = [];
      await runQueue([failing("lock", 1623, Infinity, log), ok("back", log)], opts());
      expect(log).toEqual(["lock", "back"]);
    });

    it("depender solo del primer paso: si el segundo falla, el tercero igualmente corre", async () => {
      const log: string[] = [];
      const { results } = await runQueue(
        [ok("move", log), dep(failing("lock", 1623, Infinity, log), ["move"]), dep(ok("back", log), ["move"])],
        opts(),
      );
      expect(log).toEqual(["move", "lock", "back"]);
      expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    });

    it("la dependencia se propaga en cadena", async () => {
      const log: string[] = [];
      const { results } = await runQueue(
        [failing("a", 1623, Infinity, log), dep(ok("b", log), ["a"]), dep(ok("c", log), ["b"])],
        opts(),
      );
      expect(log).toEqual(["a"]);
      expect(results.map((r) => !!r.skipped)).toEqual([false, true, true]);
    });

    it("una dependencia desconocida no bloquea nada", async () => {
      const log: string[] = [];
      await runQueue([dep(ok("a", log), ["no-existe"])], opts());
      expect(log).toEqual(["a"]);
    });
  });

  it("cola vacía", async () => {
    expect(await runQueue([], opts())).toEqual({ results: [], stopped: null });
  });
});
