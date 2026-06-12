param(
    [Parameter(Mandatory = $true)]
    [string]$LightsailHost,

    [string]$SshUser = "ec2-user",
    [string]$KeyPath = "",
    [string]$MainAppUrl = "https://sdms.pydah.edu.in",
    [string]$TicketPublicUrl = "https://maintenance.pydah.edu.in"
)

$ErrorActionPreference = "Stop"
$ScriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $KeyPath) {
    $KeyPath = Join-Path (Split-Path -Parent $ScriptRoot) "LightsailDefaultKey-ap-northeast-2.pem"
}
$RepoRoot = Resolve-Path (Join-Path $ScriptRoot "..\..")
$TicketAppDir = Join-Path $RepoRoot "ticket-app"
$DistDir = Join-Path $TicketAppDir "dist"
$RemoteAppRoot = "/var/www/ticket-app"
$RemoteDeployDir = "/tmp/ticket-deploy"

if (-not (Test-Path $KeyPath)) {
    throw "SSH key not found: $KeyPath"
}

Write-Host "==> Building ticket-app for $TicketPublicUrl"
$envContent = @"
VITE_API_URL=/api
VITE_MAIN_APP_URL=$MainAppUrl
VITE_HRMS_PORTAL_URL=https://hrms.pydah.edu.in
VITE_TICKET_APP_URL=$TicketPublicUrl
"@
Set-Content -Path (Join-Path $TicketAppDir ".env.production") -Value $envContent -Encoding UTF8

Push-Location $TicketAppDir
try {
    if (-not (Test-Path "node_modules")) {
        npm install
    }
    npm run build
} finally {
    Pop-Location
}

if (-not (Test-Path $DistDir)) {
    throw "Build failed: dist folder not found"
}

$sshArgs = @(
    "-i", $KeyPath,
    "-o", "StrictHostKeyChecking=no",
    "-o", "BatchMode=yes"
)

function Invoke-Ssh {
    param([string]$RemoteCommand)
    & ssh @sshArgs "${SshUser}@${LightsailHost}" $RemoteCommand
    if ($LASTEXITCODE -ne 0) { throw "SSH command failed: $RemoteCommand" }
}

function Invoke-Scp {
    param([string]$Source, [string]$Dest)
    & scp @sshArgs -r $Source "${SshUser}@${LightsailHost}:$Dest"
    if ($LASTEXITCODE -ne 0) { throw "SCP failed: $Source -> $Dest" }
}

Write-Host "==> Uploading frontend build"
Invoke-Ssh "mkdir -p $RemoteDeployDir/dist"
Invoke-Scp "$DistDir/*" "$RemoteDeployDir/dist/"
Invoke-Ssh "sudo mkdir -p $RemoteAppRoot && sudo rsync -a --delete $RemoteDeployDir/dist/ $RemoteAppRoot/"

Write-Host "==> Uploading nginx + setup scripts"
Invoke-Scp "$ScriptRoot/nginx-ticket-fullstack.conf" "$RemoteDeployDir/"
Invoke-Scp "$ScriptRoot/setup-server.sh" "$RemoteDeployDir/"
Invoke-Ssh "sed -i 's/\r$//' $RemoteDeployDir/setup-server.sh && chmod +x $RemoteDeployDir/setup-server.sh && APP_ROOT=$RemoteAppRoot TICKET_PUBLIC_URL=$TicketPublicUrl MAIN_APP_URL=$MainAppUrl bash $RemoteDeployDir/setup-server.sh"

Write-Host ""
Write-Host "Deployment successful!"
Write-Host "Ticket app URL: $TicketPublicUrl"
Write-Host "Health check:   http://$LightsailHost/health"
Write-Host ""
Write-Host "Next: set VITE_TICKET_APP_URL=$TicketPublicUrl in main frontend production env and redeploy main portal."
