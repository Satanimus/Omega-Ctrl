$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

npm install
if ($LASTEXITCODE -ne 0) { throw "npm install falló" }

npx tauri build --no-bundle
if ($LASTEXITCODE -ne 0) { throw "tauri build falló" }

$release = "src-tauri\target\release"
$carpeta = "OmegaCtrl-portable"

if (Test-Path $carpeta) { Remove-Item $carpeta -Recurse -Force }
New-Item -ItemType Directory -Path $carpeta | Out-Null

Copy-Item "$release\Omega Ctrl.exe" $carpeta

if (Test-Path "$release\themes") {
    Copy-Item "$release\themes" "$carpeta\themes" -Recurse
} else {
    Copy-Item "src-tauri\resources\themes" "$carpeta\themes" -Recurse
}

if (Test-Path "$release\interception.dll") {
    Copy-Item "$release\interception.dll" $carpeta
} else {
    Copy-Item "src-tauri\resources\interception.dll" $carpeta
}

Write-Host "Listo: $carpeta"
