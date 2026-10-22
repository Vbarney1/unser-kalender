# Erzeugt die App-Icons (PNG) mit Windows-Bordmitteln.
# Aufruf: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force $outDir | Out-Null

function New-RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $r
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Brush($hex) { New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex)) }

function Make-Icon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#e8505b'))
    $g.ScaleTransform($size / 512, $size / 512)   # wir zeichnen auf einem 512er-Raster

    $g.FillPath((Brush '#ffffff'), (New-RoundRect 96 116 320 296 40))   # Kalenderblatt
    $g.FillPath((Brush '#c43d47'), (New-RoundRect 96 116 320 84 40))    # Kopfleiste
    $g.FillRectangle((Brush '#c43d47'), 96, 160, 320, 40)
    $g.FillPath((Brush '#ffffff'), (New-RoundRect 170 88 26 60 13))     # Ringe
    $g.FillPath((Brush '#ffffff'), (New-RoundRect 316 88 26 60 13))

    # 3 x 2 Felder, drei davon in den Kategoriefarben
    $colors = @('#3b82f6', '#e5e7eb', '#22c55e', '#e5e7eb', '#a855f7', '#e5e7eb')
    for ($i = 0; $i -lt 6; $i++) {
        $col = $i % 3; $row = [math]::Floor($i / 3)
        $g.FillPath((Brush $colors[$i]), (New-RoundRect (136 + $col * 90) (228 + $row * 86) 60 60 14))
    }

    $path = Join-Path $outDir "icon-$size.png"
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output "erstellt: $path"
}

180, 192, 512 | ForEach-Object { Make-Icon $_ }
