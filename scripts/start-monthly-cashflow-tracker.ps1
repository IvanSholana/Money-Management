$projectPath = Split-Path -Parent $PSScriptRoot
Set-Location $projectPath

$env:BROWSER = "none"
npm run dev
