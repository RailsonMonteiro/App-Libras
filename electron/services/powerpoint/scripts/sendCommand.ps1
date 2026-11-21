# Run by PowerPointService.ts's control() - drives the slide show of the linked presentation in the
# person's own PowerPoint (what the presenter remote's buttons do), then reports where it ended up
# so the app follows exactly the slide PowerPoint is showing. Exits 1 when the presentation is no
# longer open.

param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [Parameter(Mandatory = $true)]
  # "position" changes nothing - it only reports where the slide show is (PowerPoint acted on a
  # key by itself, see PresenterRemote.ts).
  [ValidateSet('start', 'end', 'next', 'previous', 'first', 'last', 'position')]
  [string]$Command
)

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false # the app reads stdout as UTF-8 (accented paths)

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

# Accessing SlideShowWindow throws when this presentation is not being shown.
function Get-ShowWindow($presentation) {
  try { return $presentation.SlideShowWindow } catch { return $null }
}

$window = Get-ShowWindow $pres

switch ($Command) {
  'start' { if (-not $window) { $window = $pres.SlideShowSettings.Run() } }
  'end' {
    if ($window) { $window.View.Exit() }
    $window = $null
  }
  # Moving only makes sense in a running slide show - outside one, nothing to do.
  'next' { if ($window) { $window.View.Next() } }
  'previous' { if ($window) { $window.View.Previous() } }
  'first' { if ($window) { $window.View.First() } }
  'last' { if ($window) { $window.View.Last() } }
}

$index = $null
if ($window) {
  try { $index = $window.View.CurrentShowPosition } catch { $window = $null }
}

[pscustomobject]@{ presenting = [bool]$window; index = $index } | ConvertTo-Json -Compress
exit 0
