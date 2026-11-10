<#
.SYNOPSIS
  Installs (or removes) the "OmniTask Build Console" shortcut on the Desktop
  and in the Start menu.

.DESCRIPTION
  The shortcut starts the local Build Console:

      node.exe "<repo>\scripts\launch-console.mjs" --detach --browser app

  with the repository as working directory, minimized, with the OmniTask icon.
  Opening it again while the console is running brings the running console
  back instead of starting a second one (the launcher handles that).

  Both shortcuts go to per-user folders, so no administrator rights are
  needed. Running the script again overwrites the same two files.

  The shortcut stores absolute paths (node.exe, this repository, the icon).
  Run the script again after moving the repository or reinstalling Node.

  Works in Windows PowerShell 5.1 and PowerShell 7. ASCII only.

.PARAMETER Remove
  Delete the two shortcuts instead of creating them.

.EXAMPLE
  yarn console:shortcut

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\console-shortcut.ps1 -Remove
#>
[CmdletBinding()]
param(
    [switch]$Remove
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$ShortcutName = 'OmniTask Build Console'
$Description = 'OmniTask Build Console - start, stop and check the local stack'

# $IsWindows does not exist in Windows PowerShell 5.1, so ask .NET instead.
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'This script creates Windows shortcuts and only runs on Windows.'
}

# Desktop resolves to the real folder even when OneDrive has redirected it.
# Programs is the per-user Start menu folder; a .lnk there is a Start menu entry.
$locations = @(
    @{ Label = 'Desktop';    Folder = [Environment]::GetFolderPath('Desktop') },
    @{ Label = 'Start menu'; Folder = [Environment]::GetFolderPath('Programs') }
)

# --- remove --------------------------------------------------------------------

if ($Remove) {
    foreach ($location in $locations) {
        $folder = [string]$location.Folder
        if (-not $folder) { continue }
        $linkPath = Join-Path $folder ($ShortcutName + '.lnk')
        if (Test-Path -LiteralPath $linkPath -PathType Leaf) {
            Remove-Item -LiteralPath $linkPath -Force
            Write-Host ('Removed ' + $location.Label + ' shortcut: ' + $linkPath)
        }
        else {
            Write-Host ('No ' + $location.Label + ' shortcut to remove: ' + $linkPath)
        }
    }
    Write-Host 'A copy pinned to the taskbar is separate: right-click it and choose Unpin.'
    return
}

# --- what the shortcut points at -------------------------------------------------

$repoRoot = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $repoRoot 'scripts\launch-console.mjs'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
    throw ('The console launcher was not found: ' + $launcher)
}

$nodeCommand = Get-Command -Name 'node' -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if (-not $nodeCommand) {
    throw 'Node.js was not found on PATH. Install Node 20 or newer (https://nodejs.org), open a new terminal and run this again.'
}
$nodePath = [string]$nodeCommand.Path
if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw ('Node.js was found on PATH but its file does not exist: ' + $nodePath)
}
if ($nodePath -like '*fnm_multishells*') {
    Write-Warning 'This node.exe belongs to a temporary fnm shell folder. The shortcut stops working when that folder is cleaned up; run this script again from a terminal if that happens.'
}

# The launcher path is quoted because the repository path may contain spaces.
$arguments = '"' + $launcher + '" --detach --browser app'

# Multi-size icon made for the shortcut; the single-size brand icon is the fallback.
# Without either file Windows shows the icon of node.exe.
$iconFile = ''
foreach ($relative in @('scripts\console\omnitask-console.ico', 'public\logo.ico')) {
    $candidate = Join-Path $repoRoot $relative
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        $iconFile = $candidate
        break
    }
}

# --- write the shortcuts ---------------------------------------------------------

$shell = New-Object -ComObject WScript.Shell
$written = 0
foreach ($location in $locations) {
    $folder = [string]$location.Folder
    if (-not $folder) {
        Write-Warning ('Skipped ' + $location.Label + ': Windows did not return a folder for it.')
        continue
    }
    if (-not (Test-Path -LiteralPath $folder -PathType Container)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
    }

    $linkPath = Join-Path $folder ($ShortcutName + '.lnk')
    $existed = Test-Path -LiteralPath $linkPath -PathType Leaf

    # CreateShortcut opens the file when it already exists, so saving again
    # updates it in place and Start menu pins that point at it keep working.
    $shortcut = $shell.CreateShortcut($linkPath)
    $shortcut.TargetPath = $nodePath
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $repoRoot
    $shortcut.Description = $Description
    # 7 = minimized: the launcher's own console window only flashes in the
    # taskbar before the launcher detaches and opens the console window.
    $shortcut.WindowStyle = 7
    if ($iconFile) {
        $shortcut.IconLocation = $iconFile + ',0'
    }
    $shortcut.Save()

    $written = $written + 1
    if ($existed) { $verb = 'Updated' } else { $verb = 'Created' }
    Write-Host ($verb + ' ' + $location.Label + ' shortcut: ' + $linkPath)
}

if ($written -eq 0) {
    throw 'No shortcut was written.'
}

Write-Host ('  Runs      : ' + $nodePath + ' ' + $arguments)
Write-Host ('  Starts in : ' + $repoRoot)
if ($iconFile) {
    Write-Host ('  Icon      : ' + $iconFile)
}
else {
    Write-Host '  Icon      : the icon of node.exe (no .ico found in the repository)'
}
Write-Host 'Find it in Start by typing OmniTask. To pin it: right-click the result, then Pin to Start or Pin to taskbar.'
Write-Host 'To remove both shortcuts: yarn console:shortcut -Remove'
