# Run by PowerPointService.ts after link() - reads the text drawn inside slides that have no text
# of their own (slides made of a single picture, as many song decks are), with Windows' own OCR
# (Windows.Media.Ocr - nothing to install; it needs the OCR language that comes with the Windows
# display language). Each slide is exported to a temporary PNG, read, and deleted.
#
# Writes one JSON line per slide as soon as it is read, so the app can use the first ones while
# the rest is still being read: {"index":3,"text":"..."} (1-based index). Exits 3 when no OCR
# language is installed, 1 when the presentation is no longer open.

param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  # Comma-separated 1-based slide numbers, in the order they should be read.
  [Parameter(Mandatory = $true)]
  [string]$Indexes
)

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false # the app reads stdout as UTF-8

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

# WinRT async calls, waited on synchronously - PowerShell 5.1 has no await.
function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  return $task.Result
}

[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
[void][Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

# Portuguese first (the songs' language), else whatever the person's Windows languages offer.
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('pt-BR'))
if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
if (-not $engine) { exit 3 }

try {
  $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
} catch {
  exit 1
}
$pres = $null
foreach ($p in @($app.Presentations)) {
  $id = if ($p.Path) { $p.FullName } else { $p.Name }
  if ($id -eq $Path) { $pres = $p; break }
}
if (-not $pres) { exit 1 }

# Big enough for small print to be read, small enough to stay fast (~0.5s per slide).
$width = 1600
$height = [int]($width * $pres.PageSetup.SlideHeight / $pres.PageSetup.SlideWidth)
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("louvorja-libras-ocr-" + [Guid]::NewGuid().ToString('N') + '.png')

foreach ($raw in $Indexes.Split(',')) {
  $index = [int]$raw
  $text = ''
  try {
    if ($index -ge 1 -and $index -le $pres.Slides.Count) {
      $pres.Slides.Item($index).Export($tmp, 'PNG', $width, $height)
      $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
      $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
      try {
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $text = (($result.Lines | ForEach-Object { $_.Text }) -join "`n").Trim()
      } finally {
        $stream.Dispose()
      }
    }
  } catch {
    # One unreadable slide must not stop the others - it just stays without text.
    $text = ''
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
  }
  [Console]::Out.WriteLine(([pscustomobject]@{ index = $index; text = $text } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
exit 0
