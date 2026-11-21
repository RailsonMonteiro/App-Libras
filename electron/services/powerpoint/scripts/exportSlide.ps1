# Run by PowerPointSlideImageCache.ts, on demand. Exports one slide of the linked presentation,
# already open in the person's own PowerPoint (see listOpen.ps1) - never opens anything itself.
# Exits 1 whenever it cannot be produced - PowerPoint not running, this file no longer open, or
# the index out of range - all normal, not-a-real-error states.

param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [Parameter(Mandatory = $true)]
  [int]$Index,
  [Parameter(Mandatory = $true)]
  [string]$OutPath
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
if ($Index -lt 1 -or $Index -gt $pres.Slides.Count) { exit 1 }

try {
  $pres.Slides.Item($Index).Export($OutPath, 'PNG', 640, 360)
} catch {
  exit 1
}
exit 0
