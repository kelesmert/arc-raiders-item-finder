Set-Location "c:\Users\mertk\Desktop\arc item finder"

$combatTypes = @(
  "Ammunition",
  "Assault Rifle",
  "Battle Rifle",
  "Hand Cannon",
  "LMG",
  "Modification",
  "Pistol",
  "Shotgun",
  "SMG",
  "Sniper Rifle",
  "Special"
)

# Mevcut filtered-items.json'u oku
$existingItems = @()
if (Test-Path ".\filtered-items.json") {
  $raw = Get-Content -Path ".\filtered-items.json" -Raw -Encoding UTF8
  $parsed = $raw | ConvertFrom-Json
  if ($parsed -is [System.Array]) {
    $existingItems = $parsed
  } else {
    $existingItems = @($parsed)
  }
}

Write-Host "Mevcut item sayisi: $($existingItems.Count)"

# Mevcut ID'leri topla (tekrar eklemeyi onle)
$existingIds = @{}
foreach ($item in $existingItems) {
  if ($item.id) { $existingIds[$item.id] = $true }
}

# Yeni itemleri topla
$newItems = @()
$itemFiles = Get-ChildItem -Path ".\items" -Filter "*.json" -File | Sort-Object Name

foreach ($file in $itemFiles) {
  try {
    $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
    $item = $content | ConvertFrom-Json

    # Type kontrolu
    if ($combatTypes -notcontains $item.type) { continue }

    # Zaten varsa atla
    if ($existingIds.ContainsKey($item.id)) { continue }

    $row = [ordered]@{
      "id"        = $item.id
      "name.en"   = $item.name.en
      "name.tr"   = $item.name.tr
      "type"      = $item.type
      "rarity"    = $item.rarity
      "value"     = $item.value
      "stackSize" = $item.stackSize
      "weightKg"  = $item.weightKg
    }

    # Opsiyonel alanlar
    if ($item.PSObject.Properties["foundIn"])              { $row["foundIn"]              = $item.foundIn }
    if ($item.PSObject.Properties["craftBench"])            { $row["craftBench"]            = $item.craftBench }
    if ($item.PSObject.Properties["stationLevelRequired"])  { $row["stationLevelRequired"]  = $item.stationLevelRequired }
    if ($item.PSObject.Properties["recipe"])                { $row["recipe"]                = $item.recipe }
    if ($item.PSObject.Properties["recyclesInto"])          { $row["recyclesInto"]          = $item.recyclesInto }
    if ($item.PSObject.Properties["salvagesInto"])          { $row["salvagesInto"]          = $item.salvagesInto }

    $newItems += [pscustomobject]$row
    Write-Host "  + $($item.id) ($($item.type))"
  } catch {
    Write-Warning "Hata: $($file.Name) - $_"
  }
}

Write-Host "`nEklenen yeni item sayisi: $($newItems.Count)"

# Birlestir
$combined = @()
$combined += $existingItems
$combined += $newItems

# Kaydet
$combined | ConvertTo-Json -Depth 20 | Set-Content -Path ".\filtered-items.json" -Encoding UTF8
Write-Host "Toplam item sayisi: $($combined.Count)"
Write-Host "Kaydedildi: filtered-items.json"