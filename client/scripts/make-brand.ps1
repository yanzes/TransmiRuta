# Genera los assets de marca a partir de una sola foto.
#
# Entrada: client/public/brand/source.png (o .jpg/.jpeg). Una foto 3:2 como la
# del bus con el mapa de Bogota. Salida:
#   public/icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
#   public/brand/logo.png   (cuadrado de la marca TransMilenio, para el encabezado)
#   public/brand/hero.jpg   (16:9 para el banner de bienvenida)
#
# Los recortes son proporciones, no pixeles fijos: funcionan con la foto a
# cualquier resolucion. Uso: npm run brand
#
# Nota: System.Drawing es de Windows; el repo corre en Windows. En otro sistema
# usa `npm run icons`, que dibuja el bus de forma vectorial sin dependencias.

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$brandDir = Join-Path $root "public\brand"
$iconDir = Join-Path $root "public\icons"
New-Item -ItemType Directory -Force -Path $brandDir, $iconDir | Out-Null

$source = $null
foreach ($name in @("source.png", "source.jpg", "source.jpeg")) {
  $candidate = Join-Path $brandDir $name
  if (Test-Path $candidate) { $source = $candidate; break }
}

if (-not $source) {
  Write-Host "Falta la imagen de marca."
  Write-Host "Guardala como client\public\brand\source.png y vuelve a correr npm run brand."
  exit 1
}

$img = [System.Drawing.Image]::FromFile((Resolve-Path $source).Path)
$srcW = $img.Width
$srcH = $img.Height

function Save-Region {
  param(
    [int]$Left,
    [int]$Top,
    [int]$Width,
    [int]$Height,
    [int]$OutWidth,
    [int]$OutHeight,
    [string]$Path,
    [string]$Format
  )

  $bmp = New-Object System.Drawing.Bitmap $OutWidth, $OutHeight
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $dest = New-Object System.Drawing.Rectangle 0, 0, $OutWidth, $OutHeight
  $src = New-Object System.Drawing.Rectangle $Left, $Top, $Width, $Height
  $g.DrawImage($img, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  if ($Format -eq "jpg") {
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  } else {
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  $bmp.Dispose()
  $info = Get-Item $Path
  "{0} - {1}x{2}, {3:N1} KB" -f $info.Name, $OutWidth, $OutHeight, ($info.Length / 1KB)
}

# Recortes como fraccion del ancho (el cuadro siempre es cuadrado salvo el hero).
function Square-Box {
  param([double]$Left, [double]$Top, [double]$Side)
  $side = [int]($srcW * $Side)
  $left = [int]($srcW * $Left)
  $top = [int]($srcH * $Top)
  if ($left + $side -gt $srcW) { $left = $srcW - $side }
  if ($top + $side -gt $srcH) { $top = $srcH - $side }
  if ($left -lt 0) { $left = 0 }
  if ($top -lt 0) { $top = 0 }
  return @($left, $top, $side)
}

# Icono: el frente del bus, con sus marcas visibles.
$icon = Square-Box -Left 0.055 -Top 0.19 -Side 0.46
Save-Region -Left $icon[0] -Top $icon[1] -Width $icon[2] -Height $icon[2] -OutWidth 512 -OutHeight 512 -Path (Join-Path $iconDir "icon-512.png") -Format png
Save-Region -Left $icon[0] -Top $icon[1] -Width $icon[2] -Height $icon[2] -OutWidth 192 -OutHeight 192 -Path (Join-Path $iconDir "icon-192.png") -Format png
Save-Region -Left $icon[0] -Top $icon[1] -Width $icon[2] -Height $icon[2] -OutWidth 180 -OutHeight 180 -Path (Join-Path $iconDir "apple-touch-icon.png") -Format png

# Maskable: mas aire alrededor porque el lanzador recorta a circulo.
$mask = Square-Box -Left 0.02 -Top 0.155 -Side 0.53
Save-Region -Left $mask[0] -Top $mask[1] -Width $mask[2] -Height $mask[2] -OutWidth 512 -OutHeight 512 -Path (Join-Path $iconDir "icon-maskable-512.png") -Format png

# Logo del encabezado: la ficha TransMilenio de la esquina superior izquierda.
$logo = Square-Box -Left 0.075 -Top 0.045 -Side 0.13
Save-Region -Left $logo[0] -Top $logo[1] -Width $logo[2] -Height $logo[2] -OutWidth 96 -OutHeight 96 -Path (Join-Path $brandDir "logo.png") -Format png

# Banner de bienvenida: todo el ancho, 16:9, a la altura del bus y el skyline.
$heroH = [int]($srcW * 9 / 16)
$heroTop = [int]($srcH * 0.15)
if ($heroTop + $heroH -gt $srcH) { $heroTop = $srcH - $heroH }
Save-Region -Left 0 -Top $heroTop -Width $srcW -Height $heroH -OutWidth 1536 -OutHeight 864 -Path (Join-Path $brandDir "hero.jpg") -Format jpg

$img.Dispose()
Write-Host ""
Write-Host "Listo. Si cambias el encabezado, recarga el navegador; la PWA toma los iconos nuevos al reinstalarse."
