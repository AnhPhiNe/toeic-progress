Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

foreach ($size in @(192, 512)) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.ScaleTransform($size / 512, $size / 512)

  $shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $shape.AddArc(0, 0, 224, 224, 180, 90)
  $shape.AddArc(288, 0, 224, 224, 270, 90)
  $shape.AddArc(288, 288, 224, 224, 0, 90)
  $shape.AddArc(0, 288, 224, 224, 90, 90)
  $shape.CloseFigure()
  $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Point]::new(0, 0), [System.Drawing.Point]::new(512, 512),
    [System.Drawing.ColorTranslator]::FromHtml('#2563EB'),
    [System.Drawing.ColorTranslator]::FromHtml('#3730A3'))
  $graphics.FillPath($gradient, $shape)

  $white = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 37)
  $cyan = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#A5F3FC'), 37)
  foreach ($pen in @($white, $cyan)) {
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  }
  $graphics.DrawLine($white, 102, 166, 232, 166)
  $graphics.DrawLine($white, 167, 166, 167, 347)
  $graphics.DrawLine($cyan, 285, 166, 285, 347)
  $graphics.DrawLine($cyan, 285, 166, 357, 166)
  $graphics.DrawBezier($cyan, 357, 166, 453, 166, 453, 296, 357, 296)
  $graphics.DrawLine($cyan, 357, 296, 285, 296)

  $output = Join-Path $projectRoot "frontend/public/icon-$size.png"
  $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
  $white.Dispose(); $cyan.Dispose(); $gradient.Dispose(); $shape.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
