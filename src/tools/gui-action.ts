import { execFileSync } from "node:child_process";

import type { WorkspaceAnchor } from "../workspace/types.js";

export type AnchorPoint = {
  x: number;
  y: number;
};

export type GuiActionResult = {
  ok: true;
  backend: "windows_user32" | string;
  point: AnchorPoint;
};

export type GuiActionBackend = {
  clickAnchor(request: { anchor: WorkspaceAnchor }): Promise<GuiActionResult>;
  setField(request: { anchor: WorkspaceAnchor; typedText: string; submit?: "enter" | "tab" }): Promise<GuiActionResult>;
};

const DEFAULT_ACTION_DELAY_MS = 250;

const POWERSHELL_GUI_ACTION_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$csharp = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading;

public static class QuailbotGuiAction {
  const uint INPUT_MOUSE = 0;
  const uint INPUT_KEYBOARD = 1;
  const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  const uint MOUSEEVENTF_LEFTUP = 0x0004;
  const uint KEYEVENTF_KEYUP = 0x0002;
  const uint KEYEVENTF_UNICODE = 0x0004;

  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public uint type;
    public InputUnion U;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [DllImport("user32.dll")]
  public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);

  [DllImport("shcore.dll")]
  public static extern int SetProcessDpiAwareness(int awareness);

  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetCursorPos(int x, int y);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

  public static void SetDpiAwareness() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch {}
    try { if (SetProcessDpiAwareness(2) == 0) return; } catch {}
    try { SetProcessDPIAware(); } catch {}
  }

  public static void Delay(int milliseconds) {
    if (milliseconds > 0) Thread.Sleep(milliseconds);
  }

  public static void Click(int x, int y) {
    if (!SetCursorPos(x, y)) throw new Win32Exception(Marshal.GetLastWin32Error());
    Thread.Sleep(50);
    Mouse(MOUSEEVENTF_LEFTDOWN);
    Mouse(MOUSEEVENTF_LEFTUP);
  }

  public static void DoubleClick(int x, int y) {
    Click(x, y);
    Thread.Sleep(50);
    Click(x, y);
  }

  public static void Press(string key) {
    ushort vk = VirtualKey(key);
    KeyDown(vk);
    KeyUp(vk);
  }

  public static void Hotkey(string[] keys) {
    ushort[] vks = new ushort[keys.Length];
    for (int i = 0; i < keys.Length; i++) {
      vks[i] = VirtualKey(keys[i]);
      KeyDown(vks[i]);
    }
    for (int i = vks.Length - 1; i >= 0; i--) KeyUp(vks[i]);
  }

  public static void TypeText(string text) {
    foreach (char ch in text) {
      INPUT down = KeyboardUnicode(ch, 0);
      INPUT up = KeyboardUnicode(ch, KEYEVENTF_KEYUP);
      Send(new INPUT[] { down, up });
      Thread.Sleep(10);
    }
  }

  static void Mouse(uint flags) {
    INPUT input = new INPUT();
    input.type = INPUT_MOUSE;
    input.U.mi.dwFlags = flags;
    Send(new INPUT[] { input });
  }

  static void KeyDown(ushort vk) {
    Send(new INPUT[] { KeyboardVirtual(vk, 0) });
  }

  static void KeyUp(ushort vk) {
    Send(new INPUT[] { KeyboardVirtual(vk, KEYEVENTF_KEYUP) });
  }

  static INPUT KeyboardVirtual(ushort vk, uint flags) {
    INPUT input = new INPUT();
    input.type = INPUT_KEYBOARD;
    input.U.ki.wVk = vk;
    input.U.ki.dwFlags = flags;
    return input;
  }

  static INPUT KeyboardUnicode(char ch, uint extraFlags) {
    INPUT input = new INPUT();
    input.type = INPUT_KEYBOARD;
    input.U.ki.wScan = (ushort)ch;
    input.U.ki.dwFlags = KEYEVENTF_UNICODE | extraFlags;
    return input;
  }

  static void Send(INPUT[] inputs) {
    uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    if (sent != inputs.Length) throw new Win32Exception(Marshal.GetLastWin32Error());
  }

  static ushort VirtualKey(string key) {
    switch (key.ToLowerInvariant()) {
      case "ctrl": case "control": return 0x11;
      case "shift": return 0x10;
      case "alt": return 0x12;
      case "a": return 0x41;
      case "delete": case "del": return 0x2E;
      case "backspace": case "bs": return 0x08;
      case "home": return 0x24;
      case "end": return 0x23;
      case "enter": case "return": return 0x0D;
      case "tab": return 0x09;
      default: throw new ArgumentException("Unsupported key: " + key);
    }
  }
}
'@
Add-Type -TypeDefinition $csharp

$operation = $env:QUAILBOT_GUI_OPERATION
$x = [int]$env:QUAILBOT_GUI_X
$y = [int]$env:QUAILBOT_GUI_Y
$delayMs = [int]$env:QUAILBOT_GUI_DELAY_MS
if ($delayMs -lt 0) { $delayMs = 0 }
$text = ""
if ($env:QUAILBOT_GUI_TEXT_B64) {
  $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:QUAILBOT_GUI_TEXT_B64))
}
$submit = $env:QUAILBOT_GUI_SUBMIT

[QuailbotGuiAction]::SetDpiAwareness()

if ($operation -eq "click") {
  [QuailbotGuiAction]::Click($x, $y)
  [QuailbotGuiAction]::Delay($delayMs)
} elseif ($operation -eq "set_field") {
  [QuailbotGuiAction]::DoubleClick($x, $y)
  [QuailbotGuiAction]::Delay($delayMs)
  [QuailbotGuiAction]::Hotkey([string[]]@("ctrl", "a"))
  [QuailbotGuiAction]::Delay($delayMs)
  [QuailbotGuiAction]::Press("delete")
  [QuailbotGuiAction]::Delay($delayMs)
  [QuailbotGuiAction]::Hotkey([string[]]@("ctrl", "a"))
  [QuailbotGuiAction]::Delay($delayMs)
  [QuailbotGuiAction]::Press("backspace")
  [QuailbotGuiAction]::Delay($delayMs)
  [QuailbotGuiAction]::Press("home")
  [QuailbotGuiAction]::Delay($delayMs)
  [QuailbotGuiAction]::Hotkey([string[]]@("shift", "end"))
  [QuailbotGuiAction]::Delay($delayMs)
  [QuailbotGuiAction]::Press("delete")
  [QuailbotGuiAction]::Delay($delayMs)
  [QuailbotGuiAction]::Hotkey([string[]]@("ctrl", "a"))
  [QuailbotGuiAction]::Delay($delayMs)
  [QuailbotGuiAction]::Press("backspace")
  [QuailbotGuiAction]::Delay($delayMs)
  [QuailbotGuiAction]::TypeText($text)
  [QuailbotGuiAction]::Delay($delayMs)
  if ($submit -eq "enter" -or $submit -eq "tab") {
    [QuailbotGuiAction]::Press($submit)
    [QuailbotGuiAction]::Delay($delayMs)
  }
} else {
  throw "unsupported GUI operation: $operation"
}
`;

export function createDefaultGuiActionBackend(): GuiActionBackend | undefined {
  if (process.platform !== "win32") {
    return undefined;
  }

  return {
    async clickAnchor({ anchor }) {
      const point = requireAnchorPoint(anchor);
      runGuiAction({ operation: "click", point });
      return { ok: true, backend: "windows_user32", point };
    },
    async setField({ anchor, typedText, submit }) {
      const point = requireAnchorPoint(anchor);
      runGuiAction({ operation: "set_field", point, text: typedText, submit });
      return { ok: true, backend: "windows_user32", point };
    },
  };
}

export function anchorPointFromSchema(anchor: WorkspaceAnchor): AnchorPoint | undefined {
  const schema = anchor.schema;
  const x = numberValue(schema.x ?? schema.left);
  const y = numberValue(schema.y ?? schema.top);
  if (x === undefined || y === undefined) {
    return undefined;
  }

  return { x, y };
}

function requireAnchorPoint(anchor: WorkspaceAnchor): AnchorPoint {
  const point = anchorPointFromSchema(anchor);
  if (point === undefined) {
    throw new Error(`Anchor ${anchor.name ?? anchor.ref} must define finite x and y values`);
  }

  return point;
}

function runGuiAction({
  operation,
  point,
  text = "",
  submit,
}: {
  operation: "click" | "set_field";
  point: AnchorPoint;
  text?: string;
  submit?: "enter" | "tab";
}): void {
  const encoded = Buffer.from(POWERSHELL_GUI_ACTION_SCRIPT, "utf16le").toString("base64");
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    {
      env: {
        ...process.env,
        QUAILBOT_GUI_OPERATION: operation,
        QUAILBOT_GUI_X: String(Math.round(point.x)),
        QUAILBOT_GUI_Y: String(Math.round(point.y)),
        QUAILBOT_GUI_TEXT_B64: Buffer.from(text, "utf8").toString("base64"),
        QUAILBOT_GUI_SUBMIT: submit ?? "",
        QUAILBOT_GUI_DELAY_MS: String(DEFAULT_ACTION_DELAY_MS),
      },
      stdio: "pipe",
      timeout: 30_000,
      windowsHide: true,
    },
  );
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
