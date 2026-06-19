import { beforeEach, describe, expect, it, vi } from "vitest";

import { probeCliCapabilities, setProbeRunner, type ProbeRunner } from "../../../src/workspace-ui/server/cli-import.js";

function runWith(runner: ProbeRunner, cliName = "fixturectl") {
  setProbeRunner(runner);
  return probeCliCapabilities({ cliName, declaredCliNames: new Set(["fixturectl"]) });
}

describe("server CLI capability probe", () => {
  beforeEach(() => {
    setProbeRunner(null);
  });

  it("returns a capabilities payload without trying capacities", () => {
    const runner = vi.fn<ProbeRunner>().mockReturnValue({ status: 0, stdout: '{"ok":true}', stderr: "" });

    const result = runWith(runner);

    expect(result).toEqual({ ok: true, payload: { ok: true }, usedSubcommand: "capabilities", error: "" });
    expect(runner).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledWith("fixturectl", ["capabilities"], expect.objectContaining({ shell: false, timeout: 90_000, windowsHide: true, encoding: "utf8" }));
  });

  it("falls back to capacities when capabilities exits non-zero", () => {
    const runner = vi
      .fn<ProbeRunner>()
      .mockReturnValueOnce({ status: 2, stdout: "", stderr: "no capabilities" })
      .mockReturnValueOnce({ status: 0, stdout: '{"fallback":true}', stderr: "" });

    const result = runWith(runner);

    expect(result).toEqual({ ok: true, payload: { fallback: true }, usedSubcommand: "capacities", error: "" });
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("reports the last attempted failure when both subcommands fail", () => {
    const runner = vi
      .fn<ProbeRunner>()
      .mockReturnValueOnce({ status: 1, stdout: "", stderr: "no capabilities" })
      .mockReturnValueOnce({ status: 3, stdout: "", stderr: "no capacities" });

    const result = runWith(runner);

    expect(result.ok).toBe(false);
    expect(result.usedSubcommand).toBe("capacities");
    expect(result.error).toContain("no capacities");
  });

  it("does not fall back when capabilities exits zero with invalid JSON", () => {
    const runner = vi.fn<ProbeRunner>().mockReturnValue({ status: 0, stdout: "not json", stderr: "" });

    const result = runWith(runner);

    expect(result.ok).toBe(false);
    expect(result.usedSubcommand).toBe("capabilities");
    expect(result.error).toMatch(/Invalid JSON from fixturectl/);
    expect(runner).toHaveBeenCalledOnce();
  });

  it("does not fall back when capabilities exits zero with a non-object root", () => {
    for (const stdout of ["[]", '"string"']) {
      const runner = vi.fn<ProbeRunner>().mockReturnValue({ status: 0, stdout, stderr: "" });

      const result = runWith(runner);

      expect(result.ok).toBe(false);
      expect(result.usedSubcommand).toBe("capabilities");
      expect(result.error).toBe("Invalid JSON from fixturectl: root is not an object");
      expect(runner).toHaveBeenCalledOnce();
    }
  });

  it("rejects invalid CLI names without spawning", () => {
    const runner = vi.fn<ProbeRunner>();

    const result = runWith(runner, "bad name");

    expect(result).toEqual({ ok: false, usedSubcommand: "", error: "invalid CLI name" });
    expect(runner).not.toHaveBeenCalled();
  });

  it("rejects undeclared CLI names without spawning", () => {
    const runner = vi.fn<ProbeRunner>();
    setProbeRunner(runner);

    const result = probeCliCapabilities({ cliName: "otherctl", declaredCliNames: new Set(["fixturectl"]) });

    expect(result).toEqual({ ok: false, usedSubcommand: "", error: "CLI name not declared by workspace" });
    expect(runner).not.toHaveBeenCalled();
  });

  it("returns a clear timeout error", () => {
    const timeout = Object.assign(new Error("spawnSync fixturectl ETIMEDOUT"), { code: "ETIMEDOUT" });
    const runner = vi.fn<ProbeRunner>().mockReturnValue({ status: null, stdout: "", stderr: "", error: timeout });

    const result = runWith(runner);

    expect(result.ok).toBe(false);
    expect(result.usedSubcommand).toBe("capacities");
    expect(result.error).toContain("timed out");
  });
});
