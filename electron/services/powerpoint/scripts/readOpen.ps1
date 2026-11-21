# Run by PowerPointService.ts's link() - reads every slide's text from a presentation the person
# already has open in their own PowerPoint (see listOpen.ps1), plus where its slide show is right
# now, if it is presenting. Never opens or closes anything: the presentation is theirs. Exits 1
# when it is no longer open.

param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false # the app reads stdout as UTF-8 (accented paths)

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
  exit 1
}

$pres = $null
foreach ($p in @($app.Presentations)) {
  $id = if ($p.Path) { $p.FullName } else { $p.Name }
  if ($id -eq $Path) { $pres = $p; break }
}
if (-not $pres) { exit 1 }

$slides = @()
for ($i = 1; $i -le $pres.Slides.Count; $i++) {
  $slides += [pscustomobject]@{ index = $i; text = Get-SlideText $pres.Slides.Item($i) }
}

# Accessing SlideShowWindow throws when this presentation is not being shown.
$showIndex = $null
try { $showIndex = $pres.SlideShowWindow.View.CurrentShowPosition } catch { }

[pscustomobject]@{ slides = $slides; showIndex = $showIndex } | ConvertTo-Json -Compress -Depth 5
exit 0
