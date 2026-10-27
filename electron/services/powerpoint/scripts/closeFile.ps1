# Run by PowerPointService.ts when switching to a different file, or on app shutdown. Best
# effort - a hidden PowerPoint left running is wasteful, not broken, so failures here are never
# treated as fatal by the Node side.

param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

try {
  $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
} catch {
  exit 0 # nothing running, nothing to close
}

foreach ($p in @($app.Presentations)) {
  $id = if ($p.Path) { $p.FullName } else { $p.Name }
  if ($id -eq $Path) { $p.Close() }
}

# If that was the only presentation left open, quit the (hidden) Application too, instead of
# leaving a zombie PowerPoint process running in the background forever.
if ($app.Presentations.Count -eq 0) {
  $app.Quit()
}
exit 0
