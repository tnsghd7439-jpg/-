@echo off
rem Team6 tools installer/updater. Double-click to install. (PowerShell code below the marker)
set "T6_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:T6_SELF,[Text.Encoding]::UTF8); $i=$t.IndexOf('#'+'PS_START'); & ([scriptblock]::Create($t.Substring($i))) 'install'"
exit /b
#PS_START
param([string]$Mode = 'install')   # install(처음 설치) / manual(수동 확인) / update(PC 켤 때 자동, 창 없음)

# ===== 설정 (팀장님이 배포 전에 한 번만 채우기) =====
$ServerUrl = '여기에_배포서버_웹앱_주소'   # Apps Script 배포 후 받은 https://script.google.com/macros/s/.../exec
$TeamKey   = '여기에_팀_키'               # Code.gs 의 TEAM_KEY 와 같은 값
# ====================================================

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

$Base     = Join-Path $env:LOCALAPPDATA 'Team6Tools'
$StateFile = Join-Path $Base 'state.json'
$LogFile  = Join-Path $Base 'update.log'
$Updater  = Join-Path $Base 'updater.ps1'
$Desktop  = [Environment]::GetFolderPath('Desktop')     # OneDrive 바탕화면도 자동으로 잡힘
$DeskDir  = Join-Path $Desktop '영업6팀 도구'   # 바로가기만 두는 곳 (신입이 옮겨도 됨)
$FilesDir = Join-Path $Base 'files'              # 실제 파일 (자동 업데이트 대상, 신입이 건드리지 않음)
$Quiet    = ($Mode -eq 'update')
$Changes  = New-Object System.Collections.ArrayList
$Errors   = New-Object System.Collections.ArrayList
$Todo     = New-Object System.Collections.ArrayList   # 사람이 직접 해야 할 일

function Say([string]$msg, [string]$color = 'Gray') {
  if (-not $Quiet) { Write-Host "  $msg" -ForegroundColor $color }
}
function Log([string]$msg) {
  try { Add-Content -Path $LogFile -Value ("{0:yyyy-MM-dd HH:mm} {1}" -f (Get-Date), $msg) -Encoding UTF8 } catch {}
}
function Pause-End {
  if (-not $Quiet) { Write-Host ''; Read-Host '  Enter 를 누르면 창이 닫힙니다' | Out-Null }
}

# ---------- 상태 저장 (도구별로 마지막으로 받은 파일의 지문) ----------
$State = @{}
function Load-State {
  if (Test-Path $StateFile) {
    try {
      $o = Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($p in $o.PSObject.Properties) {
        $h = @{}
        foreach ($q in $p.Value.PSObject.Properties) { $h[$q.Name] = $q.Value }
        $State[$p.Name] = $h
      }
    } catch { Log "state.json 읽기 실패: $_" }
  }
}
function Save-State {
  $State | ConvertTo-Json -Depth 5 | Set-Content -Path $StateFile -Encoding UTF8
}
function Get-St([string]$id) {
  if (-not $State.ContainsKey($id)) { $State[$id] = @{} }
  return $State[$id]
}

# ---------- 서버 ----------
function Call-Api([hashtable]$params) {
  $params['key'] = $TeamKey
  $qs = ($params.GetEnumerator() | ForEach-Object { $_.Key + '=' + [uri]::EscapeDataString([string]$_.Value) }) -join '&'
  $sep = '?'
  if ($ServerUrl.Contains('?')) { $sep = '&' }
  $r = Invoke-RestMethod -Uri ($ServerUrl + $sep + $qs) -Method Get -TimeoutSec 300 -UseBasicParsing
  if (-not $r.ok) { throw ("서버 응답: " + $r.error) }
  return $r
}
function Get-ToolBytes($tool) {
  $r = Call-Api @{ action = 'get'; id = $tool.id }
  return ,[Convert]::FromBase64String($r.data)
}

# ---------- 파일 도우미 ----------
function To-RecycleBin([string]$path) {
  if (Test-Path -LiteralPath $path -PathType Container) {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($path, 'OnlyErrorDialogs', 'SendToRecycleBin')
  } elseif (Test-Path -LiteralPath $path) {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($path, 'OnlyErrorDialogs', 'SendToRecycleBin')
  }
}
function Write-Atomic([string]$dest, [byte[]]$bytes) {
  $tmp = $dest + '.download'
  [IO.File]::WriteAllBytes($tmp, $bytes)
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }
  Move-Item -LiteralPath $tmp -Destination $dest
}
# ZIP 풀기 — 윈도우에서 만든 ZIP의 '\' 경로도 폴더로 풀고, 바깥으로 빠지는 경로(..)는 막는다
function Expand-ZipBytes([byte[]]$bytes, [string]$dest) {
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  $ms = New-Object IO.MemoryStream(,$bytes)
  $zip = New-Object IO.Compression.ZipArchive($ms, [IO.Compression.ZipArchiveMode]::Read)
  try {
    foreach ($e in $zip.Entries) {
      $rel = $e.FullName.Replace('\', '/').TrimStart('/')
      if ($rel -eq '' -or $rel.Split('/') -contains '..') { continue }
      $out = Join-Path $dest ($rel.Replace('/', '\'))
      if ($rel.EndsWith('/')) { New-Item -ItemType Directory -Path $out -Force | Out-Null; continue }
      New-Item -ItemType Directory -Path (Split-Path $out) -Force | Out-Null
      $in = $e.Open()
      $fs = [IO.File]::Create($out)
      try { $in.CopyTo($fs) } finally { $fs.Dispose(); $in.Dispose() }
    }
  } finally { $zip.Dispose(); $ms.Dispose() }
}
function New-Shortcut([string]$lnk, [string]$target, [string]$arguments, [string]$workDir, [int]$window = 1) {
  $ws = New-Object -ComObject WScript.Shell
  $s = $ws.CreateShortcut($lnk)
  $s.TargetPath = $target
  $s.Arguments = $arguments
  if ($workDir) { $s.WorkingDirectory = $workDir }
  $s.WindowStyle = $window
  $s.Save()
}
# 실제 파일을 여는 바로가기를 바탕화면 폴더에 만든다.
# 처음 한 번(또는 처음 설치 실행 때)만 만든다 — 신입이 바로가기를 다른 곳으로 옮겼으면 다시 만들지 않는다.
function Ensure-FileShortcut($st, [string]$label, [string]$file) {
  $lnk = Join-Path $DeskDir ($label + '.lnk')
  if ($st['lnk'] -and $Mode -ne 'install') { return }
  if (-not (Test-Path -LiteralPath $lnk)) { New-Shortcut $lnk $file '' (Split-Path $file) 1 }
  $st['lnk'] = 'yes'
}

function Find-Python {
  foreach ($cmd in @('py', 'python')) {
    try {
      $exe = & $cmd -c "import sys; print(sys.executable)" 2>$null
      if ($exe -and (Test-Path $exe) -and ($exe -notlike '*WindowsApps*')) { return $exe }
    } catch {}
  }
  $c = Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe" -ErrorAction SilentlyContinue |
       Sort-Object FullName -Descending | Select-Object -First 1
  if ($c) { return $c.FullName }
  return $null
}

# ---------- 도구 종류별 처리 ----------
function Do-Desktop($t) {
  if (-not $t.md5) { Say "[-] $($t.name): 배포 폴더에 파일이 아직 없습니다" 'Yellow'; return }
  $st = Get-St $t.id
  $dest = Join-Path $FilesDir $t.target
  $label = [IO.Path]::GetFileNameWithoutExtension($t.target)
  if ($st['md5'] -eq $t.md5 -and (Test-Path -LiteralPath $dest)) {
    Ensure-FileShortcut $st $label $dest
    Say "[v] $($t.name): 최신" 'Green'; return
  }
  Write-Atomic $dest (Get-ToolBytes $t)
  Ensure-FileShortcut $st $label $dest
  if ($st['path'] -and $st['path'] -ne $dest) { To-RecycleBin $st['path'] }
  $isNew = -not $st['md5']
  $st['md5'] = $t.md5; $st['path'] = $dest; $st['file'] = $t.fileName
  if ($isNew) { Say "[+] $($t.name): 설치 완료" 'Green' } else { Say "[↑] $($t.name): 새 버전으로 교체" 'Cyan' }
  [void]$Changes.Add($t.name)
}

function Do-Link($t) {
  if (-not $t.url -or $t.url -match '여기에') { Say "[-] $($t.name): 주소가 아직 설정되지 않았습니다" 'Yellow'; return }
  $dest = Join-Path $DeskDir $t.target
  $body = "[InternetShortcut]`r`nURL=$($t.url)`r`n"
  if ((Test-Path -LiteralPath $dest) -and ((Get-Content -LiteralPath $dest -Raw) -eq $body)) { Say "[v] $($t.name): 바로가기 있음" 'Green'; return }
  [IO.File]::WriteAllText($dest, $body, [Text.Encoding]::ASCII)
  Say "[+] $($t.name): 바탕화면 바로가기 생성" 'Green'
  [void]$Changes.Add($t.name)
}

function Do-Extension($t) {
  if (-not $t.md5) { Say "[-] $($t.name): 배포 폴더에 파일이 아직 없습니다" 'Yellow'; return }
  $st = Get-St $t.id
  $dest = Join-Path $Base ('extensions\' + $t.target)
  if ($st['md5'] -eq $t.md5 -and (Test-Path (Join-Path $dest 'manifest.json'))) { Say "[v] $($t.name): 최신 ($($st['version']))" 'Green'; return }
  $tmp = Join-Path $Base ('tmp\' + $t.id)
  Expand-ZipBytes (Get-ToolBytes $t) $tmp
  $man = Get-ChildItem -Path $tmp -Recurse -Filter 'manifest.json' | Select-Object -First 1
  if (-not $man) { throw "ZIP 안에 manifest.json 이 없습니다" }
  $src = $man.DirectoryName
  $ver = (Get-Content $man.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).version
  # 폴더 위치는 그대로 두고 안의 파일만 바꾼다 (크롬에 등록한 경로가 유지됨)
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Get-ChildItem -LiteralPath $dest -Force | Remove-Item -Recurse -Force
  Copy-Item -Path (Join-Path $src '*') -Destination $dest -Recurse -Force
  # 확장프로그램 폴더 밖에 들어 있는 안내 HTML(설치가이드 등)은 바탕화면 폴더로
  Get-ChildItem -Path $tmp -Recurse -Filter '*.html' | Where-Object { -not $_.FullName.StartsWith($src) } | ForEach-Object {
    $label = $t.name + ' ' + $_.BaseName
    $file = Join-Path $FilesDir ($label + '.html')
    Copy-Item -LiteralPath $_.FullName -Destination $file -Force
    Ensure-FileShortcut $st $label $file
    # 예전 방식(바탕화면 폴더에 실제 파일)으로 들어가 있던 것은 정리
    $old = Join-Path $DeskDir ($label + '.html')
    if (Test-Path -LiteralPath $old) { To-RecycleBin $old }
  }
  Remove-Item -LiteralPath $tmp -Recurse -Force
  $isNew = -not $st['md5']
  $st['md5'] = $t.md5; $st['version'] = $ver; $st['path'] = $dest
  if ($isNew) {
    Say "[+] $($t.name) $ver : 파일 준비 완료 (크롬 등록은 아래 안내대로 한 번만)" 'Green'
    [void]$Todo.Add("크롬 확장프로그램 '$($t.name)' 등록 (처음 한 번만):`r`n  1) 크롬 주소창에 chrome://extensions 입력`r`n  2) 오른쪽 위 '개발자 모드' 켜기`r`n  3) '압축해제된 확장 프로그램을 로드합니다' 클릭`r`n  4) 이 폴더 선택: $dest`r`n     (폴더 경로는 클립보드에 복사해 두었습니다. 붙여넣기 하세요)")
    try { Set-Clipboard -Value $dest } catch { try { [Windows.Forms.Clipboard]::SetText($dest) } catch {} }
  } else {
    Say "[↑] $($t.name): $ver 로 교체 — 크롬을 껐다 켜면 반영됩니다" 'Cyan'
    [void]$Changes.Add("$($t.name) $ver (크롬 재시작 필요)")
  }
}

function Do-App($t) {
  $st = Get-St $t.id
  if ($st['installed']) { Say "[v] $($t.name): 설치됨 (업데이트는 앱이 스스로 합니다)" 'Green'; return }
  $existing = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Startup')) |
    ForEach-Object { Join-Path $_ '내 할 일.lnk' } | Where-Object { Test-Path -LiteralPath $_ }
  if ($existing) { $st['installed'] = 'existing'; Say "[v] $($t.name): 이미 설치되어 있어 건너뜁니다" 'Green'; return }
  if ($Mode -eq 'update') { return }   # 창 없는 자동 실행 중에는 설치하지 않음
  if (-not $t.md5) { Say "[-] $($t.name): 배포 폴더에 파일이 아직 없습니다" 'Yellow'; return }
  $dest = Join-Path $Base ('apps\' + $t.target)
  Say "... $($t.name) 내려받는 중"
  Expand-ZipBytes (Get-ToolBytes $t) $dest
  if (-not (Find-Python) -and $t.pythonUrl) {
    Say "... 파이썬이 없어서 내려받습니다 (약 25MB, 1~3분)"
    $py = Join-Path $dest (Split-Path $t.pythonUrl -Leaf)
    Invoke-WebRequest -Uri $t.pythonUrl -OutFile $py -UseBasicParsing -TimeoutSec 600
  }
  Say "... $($t.name) 설치 창을 엽니다 (끝날 때까지 기다려 주세요)"
  $p = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$dest\install.ps1`"") -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "설치 스크립트가 실패했습니다 (코드 $($p.ExitCode))" }
  $st['installed'] = 'yes'; $st['md5'] = $t.md5
  Say "[+] $($t.name): 설치 완료" 'Green'
  [void]$Changes.Add($t.name)
}

function Get-PsPart([string]$text) {
  $i = $text.IndexOf('#' + 'PS_START')
  if ($i -lt 0) { throw '업데이트 프로그램 형식이 올바르지 않습니다' }
  return $text.Substring($i)
}
function Write-Updater([string]$psText) {
  [IO.File]::WriteAllText($Updater, $psText, (New-Object Text.UTF8Encoding($true)))   # BOM 포함 (한글 깨짐 방지)
}

function Do-Self($t) {
  if (-not $t.md5) { return }
  $st = Get-St $t.id
  if ($st['md5'] -eq $t.md5) { return }
  $text = [Text.Encoding]::UTF8.GetString((Get-ToolBytes $t))
  $ps = Get-PsPart $text
  if ($ps -match "\`$ServerUrl\s*=\s*'여기에") {
    # 드라이브에 올린 install.bat 에 설정이 비어 있으면 지금 설정을 그대로 넣는다
    $ps = $ps -replace "\`$ServerUrl\s*=\s*'[^']*'", ("`$ServerUrl = '" + $ServerUrl + "'")
    $ps = $ps -replace "\`$TeamKey\s*=\s*'[^']*'", ("`$TeamKey   = '" + $TeamKey + "'")
  }
  Write-Updater $ps
  $st['md5'] = $t.md5
  Say "[↑] 업데이트 프로그램 새 버전 적용 (다음 실행부터)" 'Cyan'
}

# ---------- 처음 설치 ----------
function Install-Self {
  New-Item -ItemType Directory -Path $Base -Force | Out-Null
  if ($env:T6_SELF -and (Test-Path -LiteralPath $env:T6_SELF)) {
    Write-Updater (Get-PsPart ([IO.File]::ReadAllText($env:T6_SELF, [Text.Encoding]::UTF8)))
  }
  $ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $common = "-NoProfile -ExecutionPolicy Bypass -File `"$Updater`""
  # PC 켤 때 창 없이 자동 확인
  New-Shortcut (Join-Path ([Environment]::GetFolderPath('Startup')) '영업6팀 도구 자동업데이트.lnk') $ps "-WindowStyle Hidden $common update" $Base 7
  # 바탕화면 폴더 안: 지금 바로 확인
  New-Shortcut (Join-Path $DeskDir '지금 업데이트 확인.lnk') $ps "$common manual" $Base 1
  Say "[v] PC를 켤 때마다 자동으로 새 버전을 확인하도록 등록했습니다" 'Green'
}

# 처음 설치 때만: 바탕화면·다운로드 폴더에 흩어진 예전 버전 정리 (휴지통으로 보내므로 되살릴 수 있음)
function Clean-Legacy($tools) {
  $dirs = @($Desktop, (Join-Path $env:USERPROFILE 'Downloads')) | Where-Object { Test-Path $_ }
  $found = @()
  foreach ($t in $tools) {
    foreach ($pat in @($t.legacy)) {
      if (-not $pat) { continue }
      foreach ($d in $dirs) {
        $found += @(Get-ChildItem -LiteralPath $d -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like $pat })
      }
    }
  }
  $found = @($found | Sort-Object FullName -Unique)
  if (-not $found.Count) { return }
  Write-Host ''
  Say "예전 버전으로 보이는 파일이 $($found.Count)개 있습니다:" 'Yellow'
  $found | ForEach-Object { Say ("   - " + $_.FullName) }
  $a = Read-Host '  휴지통으로 보낼까요? (Y = 예 / 그 외 = 그대로 두기)'
  if ($a -match '^[Yy]') {
    foreach ($f in $found) { try { To-RecycleBin $f.FullName } catch { Say "[!] $($f.Name): $_" 'Yellow' } }
    Say "[v] 휴지통으로 보냈습니다 (필요하면 휴지통에서 복원)" 'Green'
  }
}

function Notify([string]$title, [string]$text) {
  try {
    $n = New-Object Windows.Forms.NotifyIcon
    $n.Icon = [Drawing.SystemIcons]::Information
    $n.BalloonTipTitle = $title
    $n.BalloonTipText = $text
    $n.Visible = $true
    $n.ShowBalloonTip(8000)
    Start-Sleep -Seconds 9
    $n.Dispose()
  } catch {}
}

# ---------- 실행 ----------
if (-not $Quiet) {
  Write-Host ''
  Write-Host '  영업6팀 도구 설치·업데이트' -ForegroundColor Cyan
  Write-Host ''
}
if ($ServerUrl -match '여기에' -or $TeamKey -match '여기에') {
  Say '[!] 설정이 비어 있습니다. 팀장님이 install.bat 위쪽의 주소와 팀 키를 채운 파일을 받아 주세요.' 'Red'
  Pause-End; exit 1
}
New-Item -ItemType Directory -Path $Base, $DeskDir, $FilesDir -Force | Out-Null
Load-State
if ($Mode -eq 'install') { Install-Self }

try {
  $list = Call-Api @{ action = 'list' }
} catch {
  Log "목록 받기 실패: $_"
  Say "[!] 서버에 연결하지 못했습니다: $_" 'Red'
  Say '    인터넷 연결을 확인하고 잠시 뒤 다시 실행해 주세요.'
  Pause-End; exit 1
}
$tools = @($list.tools)
if ($Mode -eq 'install') { Clean-Legacy $tools }

foreach ($t in $tools) {
  try {
    switch ($t.type) {
      'desktop'   { Do-Desktop $t }
      'link'      { Do-Link $t }
      'extension' { Do-Extension $t }
      'app'       { Do-App $t }
      'self'      { Do-Self $t }
    }
  } catch {
    [void]$Errors.Add("$($t.name): $_")
    Log "$($t.name) 실패: $_"
    Say "[!] $($t.name): $_" 'Red'
  }
  Save-State
}

if ($Changes.Count) { Log ("변경: " + ($Changes -join ', ')) }
if ($Quiet) {
  if ($Changes.Count) { Notify '영업6팀 도구 업데이트' (($Changes -join "`n") + "`n바탕화면 '영업6팀 도구' 폴더를 확인하세요.") }
  exit 0
}

Write-Host ''
if ($Errors.Count) { Say "완료했지만 $($Errors.Count)개 항목에 문제가 있습니다. 위 빨간 줄을 팀장님께 캡처해서 보내 주세요." 'Yellow' }
else {
  Say '모두 완료했습니다. 바탕화면 [영업6팀 도구] 폴더를 열어 보세요.' 'Cyan'
  Say '폴더 안 아이콘은 바로가기라서 원하는 곳으로 옮기거나 복사해도 항상 최신 버전이 열립니다.' 'Cyan'
}
foreach ($x in $Todo) { Write-Host ''; Say "★ 직접 해야 할 일 — $x" 'Yellow' }
if ($Mode -eq 'install') { try { Start-Process explorer.exe -ArgumentList "`"$DeskDir`"" } catch {} }
Pause-End
