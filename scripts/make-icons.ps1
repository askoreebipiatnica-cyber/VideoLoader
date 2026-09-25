Add-Type -AssemblyName System.Drawing
$dir = Join-Path $PSScriptRoot "..\\icons"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
foreach ($size in @(16, 48, 128)) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point($size, $size)),
    [System.Drawing.Color]::FromArgb(10, 132, 255),
    [System.Drawing.Color]::FromArgb(175, 82, 222))
  $r = $size * 0.24
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  # скруглённый квадрат
  $path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
  $path.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
  $path.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90)
  $path.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90)
  $path.CloseFigure()
  $g.FillPath($brush, $path)
  # стрелка вниз (скачивание): стержень + наконечник
  $bw = $size * 0.16            # ширина стержня
  $cx = $size / 2
  $top = $size * 0.24           # верх стержня
  $ahTop = $size * 0.52         # где начинается наконечник
  $bot = $size * 0.76           # низ наконечника
  $half = $size * 0.24          # полуширина наконечника
  $arr = New-Object System.Drawing.Drawing2D.GraphicsPath
  $arr.AddPolygon(@(
    (New-Object System.Drawing.PointF(($cx - $bw), $top)),
    (New-Object System.Drawing.PointF(($cx + $bw), $top)),
    (New-Object System.Drawing.PointF(($cx + $bw), $ahTop)),
    (New-Object System.Drawing.PointF(($cx + $half), $ahTop)),
    (New-Object System.Drawing.PointF($cx, $bot)),
    (New-Object System.Drawing.PointF(($cx - $half), $ahTop)),
    (New-Object System.Drawing.PointF(($cx - $bw), $ahTop))))
  $g.FillPath([System.Drawing.Brushes]::White, $arr)
  $out = Join-Path $dir ("icon{0}.png" -f $size)
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output ("icon " + $size + " ok: " + $out)
}
