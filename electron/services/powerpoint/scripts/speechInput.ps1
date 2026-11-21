# Run (long-lived) by SpeechService.ts while "Ouvir microfone" is on - turns what is said into the
# default microphone into text, one phrase at a time, with Windows' own speech recognition
# (Windows.Media.SpeechRecognition, Portuguese dictation - nothing to install). Dictation runs on
# Microsoft's online speech service: Windows only allows it with "Reconhecimento de fala online"
# turned on (Configurações > Privacidade e segurança > Fala).
#
# One phrase at a time (RecognizeAsync in a loop) instead of a continuous session: Windows
# PowerShell cannot subscribe to WinRT events, which a continuous session needs.
# Must run with -MTA (SpeechService.ts does): in the default STA, RecognizeAsync never returns.
#
# stdout, one JSON object per line:
#   {"type":"ready"}                       listening
#   {"type":"text","text":"..."}           a phrase was said
#   {"type":"error","code":"privacy"}      online speech recognition is off (exits 4)
#   {"type":"error","code":"microphone"}   no microphone, or access to it is blocked (exits 5)
#   {"type":"error","code":"other","message":"..."}                                   (exits 1)
# Stops by itself when the app (ParentPid) is gone, so it never keeps the microphone open.

param(
  [Parameter(Mandatory = $true)]
  [int]$ParentPid
)

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false # the app reads stdout as UTF-8

$ErrorActionPreference = 'Stop'

function Write-Line($object) {
  [Console]::Out.WriteLine(($object | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

function Test-Parent {
  return [bool](Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

# Waits for a WinRT async call a second at a time, checking in between that the app is still
# there - a phrase can take long to come when nobody is speaking.
function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  while (-not $task.Wait(1000)) {
    if (-not (Test-Parent)) { exit 0 }
  }
  return $task.Result
}

function Get-Root($exception) {
  while ($exception.InnerException) { $exception = $exception.InnerException }
  return $exception
}

[void][Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType = WindowsRuntime]
[void][Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

try {
  $recognizer = [Windows.Media.SpeechRecognition.SpeechRecognizer]::new([Windows.Globalization.Language]::new('pt-BR'))
} catch {
  # No Portuguese speech pack: whatever the person's Windows speaks.
  $recognizer = [Windows.Media.SpeechRecognition.SpeechRecognizer]::new()
}
# No constraint added: Windows uses its free dictation grammar.
$compiled = Await ($recognizer.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
if ($compiled.Status -ne [Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus]::Success) {
  Write-Line @{ type = 'error'; code = 'other'; message = "Compile: $($compiled.Status)" }
  exit 1
}
# Silence before anyone speaks just restarts the wait; a short pause ends the phrase.
$recognizer.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(30)
$recognizer.Timeouts.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(700)

Write-Line @{ type = 'ready' }

while (Test-Parent) {
  try {
    $result = Await ($recognizer.RecognizeAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionResult])
  } catch {
    $root = Get-Root $_.Exception
    $hresult = '0x{0:X8}' -f $root.HResult
    if ($hresult -eq '0x80045509') {
      Write-Line @{ type = 'error'; code = 'privacy' }
      exit 4
    }
    # Access denied (microphone blocked in Privacidade), or no capture device at all.
    if ($hresult -eq '0x80070005' -or $hresult -eq '0x80045501' -or $hresult -eq '0xC00D36FA') {
      Write-Line @{ type = 'error'; code = 'microphone' }
      exit 5
    }
    Write-Line @{ type = 'error'; code = 'other'; message = "$hresult $($root.Message)".Trim() }
    exit 1
  }

  # Not an exception: Windows reports a missing or busy microphone as the result's status.
  if ($result.Status -eq [Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus]::MicrophoneUnavailable) {
    Write-Line @{ type = 'error'; code = 'microphone' }
    exit 5
  }

  $text = "$($result.Text)".Trim()
  if ($result.Status -eq [Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus]::Success -and
      $text -and $result.Confidence -ne [Windows.Media.SpeechRecognition.SpeechRecognitionConfidence]::Rejected) {
    Write-Line @{ type = 'text'; text = $text }
  }
}
exit 0
