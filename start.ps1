Set-Location -LiteralPath $PSScriptRoot
Start-Process "http://127.0.0.1:41739" | Out-Null
node .\server.mjs
