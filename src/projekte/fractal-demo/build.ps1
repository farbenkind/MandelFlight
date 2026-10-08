param([switch]$WatchBuild)

$ErrorActionPreference = "Stop"
$mutex = New-Object System.Threading.Mutex($false, "Local\MandelFlight.ModCore.Build")
$locked = $false

try {
    try {
        $locked = $mutex.WaitOne(120000)
    } catch [System.Threading.AbandonedMutexException] {
        $locked = $true
        Write-Warning "Vorheriger ModCore-Build wurde abgebrochen; Build-Sperre uebernommen."
    }
    if (!$locked) { throw "ModCore-Build ist noch belegt. Bitte parallele Dev-Server pruefen." }

    Push-Location "$PSScriptRoot\modcore"
    try {
        $buildArgs = @("build", "--target", "web")
        if ($WatchBuild) { $buildArgs += "--no-opt" }
        & wasm-pack @buildArgs
        if ($LASTEXITCODE -ne 0) {
            throw "ModCore WASM Build fehlgeschlagen (Exitcode $LASTEXITCODE)."
        }

        Copy-Item "$PSScriptRoot\modcore\pkg\modcore.js" -Destination "$PSScriptRoot\modcore.js" -Force
        Copy-Item "$PSScriptRoot\modcore\pkg\modcore_bg.wasm" -Destination "$PSScriptRoot\modcore_bg.wasm" -Force
        Write-Host "ModCore WASM erfolgreich gebaut und kopiert."
    } finally {
        Pop-Location
    }
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
