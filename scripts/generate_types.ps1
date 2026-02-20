$types = @{}
Get-ChildItem -Path ".\items" -Filter "*.json" -File | ForEach-Object {
  try {
    $content = Get-Content -Path $_.FullName -Raw
    $j = $content | ConvertFrom-Json
    $t = $j.type
    if ($t) {
      if (-not $types.ContainsKey($t)) {
        $types[$t] = $_.FullName
      }
    }
  } catch { }
}
$md = "# Item type Values and Examples`n`n"
foreach ($k in $types.Keys | Sort-Object) {
  $file = $types[$k]
  $rel = $file -replace [regex]::Escape((Get-Location).Path + "\\"), ""
  $json = Get-Content $file -Raw | ConvertFrom-Json | Select-Object id,@{Name='name.en';Expression={$_.name.en}},@{Name='name.tr';Expression={$_.name.tr}},type
  $jsonText = $json | ConvertTo-Json -Depth 5
  $md += "## $k`n- Example file: [$rel]($rel)`n`n```json`n$jsonText`n```n`n"
}
Set-Content -Path ".\types.md" -Value $md -Encoding UTF8
Write-Output "types.md generated."