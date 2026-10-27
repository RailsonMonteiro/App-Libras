# Run by PowerPointSlideImageCache.ts, on demand. Exports one slide of an ALREADY-OPEN (hidden)
# presentation - see loadFile.ps1, which opens it and keeps it open specifically so this script
# never pays PowerPoint's own startup/open cost on every single slide image request. Exits 1
# whenever it cannot be produced - PowerPoint not running, this file not the one open, or the
# index out of range - all normal, not-a-real-error states.

param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [Parameter(Mandatory = $true)]
  [int]$Index,
  [Parameter(Mandatory = $true)]
  [string]$OutPath
)

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
