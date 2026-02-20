# Item JSON Fields Reference

Bu projede her item JSON dosyasından çekilecek alanlar:

| Alan | Tip | Açıklama |
|------|-----|----------|
| `id` | string | Eşyanın benzersiz kimliği (ör. `"crude_explosives"`) |
| `name.en` | string | İngilizce adı |
| `name.tr` | string | Türkçe adı |
| `type` | string | Eşya türü (ör. `"Refined Material"`) |
| `rarity` | string | Nadirlik seviyesi (ör. `"Uncommon"`) |
| `foundIn` | string | Bulunabilecek lokasyonlar (ör. `"Industrial, Security"`) |
| `value` | number | Eşya değeri |
| `stackSize` | number | Maksimum yığın boyutu |
| `craftBench` | string | Hangi tezgahta üretileceği (ör. `"refiner"`) |
| `recipe` | object | Üretim tarifi — key: malzeme id, value: miktar (ör. `{ "chemicals": 6 }`) |
| `recyclesInto` | object | Geri dönüşümde elde edilen malzemeler (ör. `{ "chemicals": 3 }`) |
| `salvagesInto` | object | Söküm sonucu elde edilen malzemeler (ör. `{ "chemicals": 2 }`) |

## Notlar

- `recipe` alanındaki key'ler başka item'ların `id`'lerine karşılık gelir.
- Tüm item'larda `recipe`, `recyclesInto`, `salvagesInto` alanları olmayabilir (bazıları üretilemez veya geri dönüştürülemez).
- `craftBench` değeri olmayan item'lar doğrudan üretilemez demektir.
