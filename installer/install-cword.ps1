$ErrorActionPreference = 'Stop'

$installDirectory = Join-Path $env:LOCALAPPDATA 'CWord'
$targetPath = Join-Path $installDirectory 'CWord.exe'
$sourcePath = Join-Path $PSScriptRoot 'cword.exe'
$protocolRoot = 'HKCU\Software\Classes\cookapps-cword'

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force

function Set-RegistryValue {
  param(
    [string[]]$Arguments
  )

  & reg.exe @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not register CookApps callback protocol. reg.exe exit code: $LASTEXITCODE"
  }
}

Set-RegistryValue @('ADD', $protocolRoot, '/ve', '/d', 'URL:CWord Protocol', '/f')
Set-RegistryValue @('ADD', $protocolRoot, '/v', 'URL Protocol', '/t', 'REG_SZ', '/d', '', '/f')
Set-RegistryValue @('ADD', "$protocolRoot\DefaultIcon", '/ve', '/d', "$targetPath,0", '/f')
Set-RegistryValue @('ADD', "$protocolRoot\shell\open\command", '/ve', '/d', "`"$targetPath`" `"%1`"", '/f')

Start-Process -FilePath $targetPath
