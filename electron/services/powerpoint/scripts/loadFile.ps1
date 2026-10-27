# Run by PowerPointService.ts's loadFile(), once per linked file - opens it hidden (no visible
# window, ever) and returns every slide's text in one shot. The file is left open afterwards:
# exportSlide.ps1 reuses this same hidden instance, so a slide image request doesn't pay
# PowerPoint's own ~1-2s startup/open cost on every single slide - closeFile.ps1 closes it once a
# different file is linked or the app quits.

param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

function Get-SlideText($slide) {
  $texts = @()
  foreach ($shape in $slide.Shapes) {
    if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {
      $texts += [pscustomobject]@{ Top = $shape.Top; Left = $shape.Left; Text = $shape.TextFrame.TextRange.Text }
    }
  }
  # Reading order heuristic: top-to-bottom, then left-to-right (a title placeholder sits at the
  # top in the large majority of real layouts). Does not special-case tables, SmartArt or
  # grouped shapes - a deliberate first cut, not an oversight.
  $ordered = $texts | Sort-Object Top, Left
  return (($ordered | ForEach-Object { $_.Text }) -join "`n").Trim()
}

try {
  $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
} catch {
  $app = New-Object -ComObject PowerPoint.Application
}

# A previous call for this exact path (re-linking the same file) leaves it open - close that
# copy first so slides don't pile up as separate, stale COM objects.
foreach ($p in @($app.Presentations)) {
  $id = if ($p.Path) { $p.FullName } else { $p.Name }
  if ($id -eq $Path) { $p.Close() }
}

# ReadOnly: never risk a "keep changes?" prompt with no UI to answer it. WithWindow:$false is the
# actual hiding - Application.Visible alone does not reliably suppress a document window.
$pres = $app.Presentations.Open($Path, $true, $false, $false)

$slides = @()
for ($i = 1; $i -le $pres.Slides.Count; $i++) {
  $slides += [pscustomobject]@{ index = $i; text = Get-SlideText $pres.Slides.Item($i) }
}

[pscustomobject]@{ slides = $slides } | ConvertTo-Json -Compress -Depth 5
exit 0
