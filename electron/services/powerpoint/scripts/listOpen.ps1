# Run by PowerPointService.ts's listOpen() - the presentations open in the person's own (visible)
# PowerPoint, for them to pick one to link. Never starts PowerPoint: none open, empty list.

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false # the app reads stdout as UTF-8 (accented paths)

$result = [ordered]@{ presentations = @() }

try {
  $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
} catch {
  $result | ConvertTo-Json -Compress -Depth 5
  exit 0
}

$list = @()
foreach ($p in @($app.Presentations)) {
  # No window: not something the person opened (e.g. a copy an older version of this app left
  # open hidden) - nothing they would recognize in the list.
  if ($p.Windows.Count -eq 0) { continue }
  # Same id convention as every other script here: the saved file path, or the in-memory name of
  # a deck never saved.
  $id = if ($p.Path) { $p.FullName } else { $p.Name }
  $list += [pscustomobject]@{ path = $id; name = $p.Name }
}
$result.presentations = $list

$result | ConvertTo-Json -Compress -Depth 5
exit 0
