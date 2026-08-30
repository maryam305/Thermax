$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$backendDirectory = Join-Path $projectRoot "thermax_backend"
$frontendDirectory = Join-Path $projectRoot "frontend"
$venvDirectory = Join-Path $projectRoot ".venv"
$venvPython = Join-Path $venvDirectory "Scripts\python.exe"
$bundledDependencies = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$bundledNodeDirectory = Join-Path $bundledDependencies "node\bin"
$bundledToolsDirectory = Join-Path $bundledDependencies "bin\fallback"
$bundledPnpm = Join-Path $bundledToolsDirectory "pnpm.cmd"
$bundledPython = Join-Path $bundledDependencies "python\python.exe"
$nextExecutable = Join-Path $frontendDirectory "node_modules\.bin\next.cmd"

if (Test-Path -LiteralPath $bundledNodeDirectory) {
  $env:Path = "$bundledNodeDirectory;$bundledToolsDirectory;$env:Path"
}

$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
$pnpm = if ($pnpmCommand) { $pnpmCommand.Source } elseif (Test-Path -LiteralPath $bundledPnpm) { $bundledPnpm } else { $null }
$systemPythonCommand = Get-Command python -ErrorAction SilentlyContinue
$bootstrapPython = if (Test-Path -LiteralPath $bundledPython) { $bundledPython } elseif ($systemPythonCommand) { $systemPythonCommand.Source } else { $null }
$environmentFile = Join-Path $projectRoot ".env"

if (Test-Path -LiteralPath $environmentFile) {
  Get-Content -LiteralPath $environmentFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim().Trim('"').Trim("'")
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

if (-not $pnpm) {
  throw "Node.js/pnpm was not found. Install Node.js LTS, then run this launcher again."
}

if (-not $bootstrapPython) {
  throw "Python was not found. Install Python 3.10 or newer, then run this launcher again."
}

if (-not (Test-Path -LiteralPath $venvPython)) {
  Write-Host "Preparing backend dependencies (first run only)..."
  & $bootstrapPython -m venv $venvDirectory
  if ($LASTEXITCODE -ne 0) { throw "Could not create the Python environment." }
  & $venvPython -m pip install -r (Join-Path $projectRoot "requirements.txt")
  if ($LASTEXITCODE -ne 0) { throw "Could not install backend dependencies." }
}

if (-not (Test-Path -LiteralPath (Join-Path $frontendDirectory "node_modules"))) {
  Write-Host "Preparing frontend dependencies (first run only)..."
  & $pnpm --dir $frontendDirectory install
  if ($LASTEXITCODE -ne 0) { throw "Could not install frontend dependencies." }
}

$backendArguments = @("-m", "uvicorn", "main:app", "--port", "8001")
if (Test-Path -LiteralPath $environmentFile) {
  $backendArguments += @("--env-file", $environmentFile)
}
$backend = Start-Process -FilePath $venvPython -ArgumentList $backendArguments -WorkingDirectory $backendDirectory -PassThru -WindowStyle Hidden

try {
  Write-Host "ThermaX is starting at http://localhost:3000"
  Write-Host "The backend is available through the same site at /backend."
  Push-Location $frontendDirectory
  try {
    & $nextExecutable dev --port 3000
  }
  finally {
    Pop-Location
  }
}
finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id
  }
}
