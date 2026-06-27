param(
    [string]$LightsailHost = "43.201.200.99",
    [string]$SshUser = "ec2-user",
    [string]$KeyPath = ""
)

$ErrorActionPreference = "Stop"
$ScriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $KeyPath) {
    $KeyPath = Join-Path (Split-Path -Parent $ScriptRoot) "LightsailDefaultKey-ap-northeast-2.pem"
}
$BackendRoot = Resolve-Path (Join-Path $ScriptRoot "..")
$RemoteRoot = "/home/ec2-user/Student-Data-Management-Application/ticket-backend"
$RemoteTmp = "/tmp/ticket-backend-deploy"

$sshArgs = @("-i", $KeyPath, "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes")

function Invoke-Ssh([string]$Cmd) {
    & ssh @sshArgs "${SshUser}@${LightsailHost}" $Cmd
    if ($LASTEXITCODE -ne 0) { throw "SSH failed: $Cmd" }
}

Write-Host "==> Packaging ticket-backend (excluding node_modules, .env, uploads)"
$archive = Join-Path $env:TEMP "ticket-backend-deploy.tar"
if (Test-Path $archive) { Remove-Item $archive -Force }

Push-Location $BackendRoot
try {
    tar -cf $archive --exclude=node_modules --exclude=.env --exclude=uploads --exclude="*.pem" .
} finally {
    Pop-Location
}

Write-Host "==> Uploading to server"
Invoke-Ssh "mkdir -p $RemoteTmp"
& scp @sshArgs $archive "${SshUser}@${LightsailHost}:$RemoteTmp/ticket-backend-deploy.tar"
if ($LASTEXITCODE -ne 0) { throw "SCP failed" }

Write-Host "==> Extracting and installing dependencies"
Invoke-Ssh "mkdir -p $RemoteRoot && tar -xf $RemoteTmp/ticket-backend-deploy.tar -C $RemoteRoot && cd $RemoteRoot && npm install --production && (pm2 restart sdbms-ticket --update-env || pm2 start server.js --name sdbms-ticket --update-env) && pm2 save && rm -f $RemoteTmp/ticket-backend-deploy.tar"

Write-Host "==> Backend deploy complete"
Invoke-Ssh "curl -s http://127.0.0.1:5001/health"
