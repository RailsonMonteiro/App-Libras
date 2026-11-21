# Run (long-lived) by PresenterInput.ts - reports key presses together with the device they came
# from (Windows Raw Input), so the app can act on the presenter remote only and leave the keyboard
# alone. Nothing is taken away from other programs: every key still reaches the focused window.
#
# Privacy: only reports what the app needs - keys from the linked remote, PowerPoint's own slide
# show keys while its slide show window is in front (to follow it), and everything while the
# person is binding a key in the app (the "binding" mode). Never anything else.
#
# stdin, one command per line: "binding 1" / "binding 0", "device <id>" / "device" (none).
# stdout, one JSON object per key press: {"device":"...","key":"PageDown","slideShow":true}.
# Exits when stdin closes (the app quit).

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false # the app reads stdout as UTF-8 (accented paths)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false

$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

public class PresenterInput : NativeWindow {
  const int WM_INPUT = 0x00FF;
  const uint RID_INPUT = 0x10000003;
  const uint RIDI_DEVICENAME = 0x20000007;
  const int RIM_TYPEKEYBOARD = 1;
  const int RIDEV_INPUTSINK = 0x00000100;
  const ushort RI_KEY_BREAK = 1;

  [StructLayout(LayoutKind.Sequential)]
  struct RAWINPUTDEVICE { public ushort UsagePage; public ushort Usage; public int Flags; public IntPtr Target; }
  [StructLayout(LayoutKind.Sequential)]
  struct RAWINPUTHEADER { public int Type; public int Size; public IntPtr Device; public IntPtr WParam; }
  [StructLayout(LayoutKind.Sequential)]
  struct RAWKEYBOARD { public ushort MakeCode; public ushort Flags; public ushort Reserved; public ushort VKey; public uint Message; public uint ExtraInformation; }

  [DllImport("user32.dll", SetLastError = true)]
  static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] devices, uint count, uint size);
  [DllImport("user32.dll")]
  static extern uint GetRawInputData(IntPtr rawInput, uint command, IntPtr data, ref uint size, uint headerSize);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern uint GetRawInputDeviceInfo(IntPtr device, uint command, StringBuilder data, ref uint size);
  [DllImport("user32.dll")]
  static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetClassName(IntPtr window, StringBuilder name, int max);

  // PowerPoint's own slide show keys (next/previous/end/first/last) - followed even from the
  // keyboard, since PowerPoint acts on them by itself whenever its slide show is in front.
  static readonly HashSet<int> SlideShowKeys = new HashSet<int> {
    0x21, 0x22, 0x25, 0x26, 0x27, 0x28, 0x20, 0x0D, 0x08, 0x4E, 0x50, 0x1B, 0x24, 0x23
  };
  static readonly HashSet<int> Modifiers = new HashSet<int> {
    0x10, 0x11, 0x12, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0x5B, 0x5C, 0xFF
  };

  static volatile bool binding = false;
  static volatile string linkedDevice = null;

  readonly Dictionary<IntPtr, string> deviceIds = new Dictionary<IntPtr, string>();
  readonly HashSet<string> held = new HashSet<string>();

  public static void Run() {
    Thread reader = new Thread(ReadCommands);
    reader.IsBackground = true;
    reader.Start();

    PresenterInput window = new PresenterInput();
    window.CreateHandle(new CreateParams());
    RAWINPUTDEVICE[] devices = new RAWINPUTDEVICE[1];
    devices[0].UsagePage = 0x01;
    devices[0].Usage = 0x06; // keyboards - presenter remotes present themselves as one
    devices[0].Flags = RIDEV_INPUTSINK;
    devices[0].Target = window.Handle;
    if (!RegisterRawInputDevices(devices, 1, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE)))) {
      Environment.Exit(2);
    }
    Application.Run();
  }

  static void ReadCommands() {
    while (true) {
      string line = Console.In.ReadLine();
      if (line == null) Environment.Exit(0);
      line = line.Trim();
      if (line == "binding 1") binding = true;
      else if (line == "binding 0") binding = false;
      else if (line == "device") linkedDevice = null;
      else if (line.StartsWith("device ")) linkedDevice = line.Substring(7);
    }
  }

  protected override void WndProc(ref Message m) {
    if (m.Msg == WM_INPUT) {
      try { OnInput(m.LParam); } catch { }
    }
    base.WndProc(ref m);
  }

  void OnInput(IntPtr handle) {
    uint headerSize = (uint)Marshal.SizeOf(typeof(RAWINPUTHEADER));
    uint size = 0;
    GetRawInputData(handle, RID_INPUT, IntPtr.Zero, ref size, headerSize);
    if (size == 0) return;
    IntPtr buffer = Marshal.AllocHGlobal((int)size);
    try {
      if (GetRawInputData(handle, RID_INPUT, buffer, ref size, headerSize) != size) return;
      RAWINPUTHEADER header = (RAWINPUTHEADER)Marshal.PtrToStructure(buffer, typeof(RAWINPUTHEADER));
      if (header.Type != RIM_TYPEKEYBOARD) return;
      RAWKEYBOARD keyboard = (RAWKEYBOARD)Marshal.PtrToStructure(
        new IntPtr(buffer.ToInt64() + headerSize), typeof(RAWKEYBOARD));
      OnKey(header.Device, keyboard);
    } finally {
      Marshal.FreeHGlobal(buffer);
    }
  }

  void OnKey(IntPtr device, RAWKEYBOARD keyboard) {
    int vk = keyboard.VKey;
    if (Modifiers.Contains(vk)) return;
    string id = DeviceId(device);
    string heldKey = id + "|" + vk;
    if ((keyboard.Flags & RI_KEY_BREAK) != 0) {
      held.Remove(heldKey);
      return;
    }
    // Holding a button down repeats it - one press is one command.
    if (!held.Add(heldKey)) return;

    bool slideShow = SlideShowInFront();
    bool fromRemote = linkedDevice != null && id == linkedDevice;
    if (!binding && !fromRemote && !(slideShow && SlideShowKeys.Contains(vk))) return;

    Console.Out.WriteLine("{\"device\":\"" + Escape(id) + "\",\"key\":\"" + KeyName(vk) +
      "\",\"slideShow\":" + (slideShow ? "true" : "false") + "}");
    Console.Out.Flush();
  }

  /** The same remote keeps its id across USB ports and restarts: its vendor/product ids when the
   *  device name has them, its full name otherwise. */
  string DeviceId(IntPtr device) {
    if (device == IntPtr.Zero) return "";
    string id;
    if (deviceIds.TryGetValue(device, out id)) return id;
    uint size = 1024;
    StringBuilder name = new StringBuilder((int)size);
    GetRawInputDeviceInfo(device, RIDI_DEVICENAME, name, ref size);
    string full = name.ToString().ToUpperInvariant();
    Match match = Regex.Match(full, "VID[_&]([0-9A-F]+)[_&]PID[_&]([0-9A-F]+)");
    id = match.Success ? "VID_" + match.Groups[1].Value + "&PID_" + match.Groups[2].Value : full;
    deviceIds[device] = id;
    return id;
  }

  static bool SlideShowInFront() {
    StringBuilder name = new StringBuilder(64);
    GetClassName(GetForegroundWindow(), name, name.Capacity);
    return name.ToString() == "screenClass"; // PowerPoint's slide show window
  }

  static string Escape(string value) {
    return value.Replace("\\", "\\\\").Replace("\"", "\\\"");
  }

  /** Electron accelerator-style names (see src/modules/powerpoint/types/presenterKeys.ts). */
  static string KeyName(int vk) {
    if (vk >= 0x41 && vk <= 0x5A) return ((char)vk).ToString();
    if (vk >= 0x30 && vk <= 0x39) return ((char)vk).ToString();
    if (vk >= 0x70 && vk <= 0x87) return "F" + (vk - 0x6F);
    if (vk >= 0x60 && vk <= 0x69) return "num" + (vk - 0x60);
    switch (vk) {
      case 0x08: return "Backspace";
      case 0x09: return "Tab";
      case 0x0D: return "Enter";
      case 0x1B: return "Escape";
      case 0x20: return "Space";
      case 0x21: return "PageUp";
      case 0x22: return "PageDown";
      case 0x23: return "End";
      case 0x24: return "Home";
      case 0x25: return "Left";
      case 0x26: return "Up";
      case 0x27: return "Right";
      case 0x28: return "Down";
      case 0x2D: return "Insert";
      case 0x2E: return "Delete";
      case 0xA6: return "BrowserBack";
      case 0xA7: return "BrowserForward";
      case 0xAD: return "VolumeMute";
      case 0xAE: return "VolumeDown";
      case 0xAF: return "VolumeUp";
      case 0xB0: return "MediaNextTrack";
      case 0xB1: return "MediaPreviousTrack";
      case 0xB2: return "MediaStop";
      case 0xB3: return "MediaPlayPause";
      case 0xBB: return "Plus";
      case 0xBC: return ",";
      case 0xBD: return "-";
      case 0xBE: return ".";
      default: return "VK_" + vk.ToString("X2");
    }
  }
}
'@

[PresenterInput]::Run()
