# Fuentes de imágenes de eventos

Registro de carteles enlazados desde `src/data/fiestas-2026/events.json`.
Los carteles recibidos localmente se conservan en `src/assets/events/` para que
las fichas no dependan de servidores externos.

## Criterio de verificación

Solo se guardan imágenes que corresponden al evento de Valladolid de 2026 y que
permiten identificarlo como cartel o pieza oficial del propio evento. Se
descartan fotografías de prensa, imágenes genéricas, carteles de otras ediciones
o ciudades y creatividades en las que no se puede comprobar el vínculo con la
actividad.

## Carteles guardados

| ID | Evento | Fuente consultada | Imagen enlazada | Verificación |
| ---: | --- | --- | --- | --- |
| 21 | LORENCITO FESTIVAL: OAZË UNDERGROUND | [Ayuntamiento de Valladolid](https://www.valladolid.es/es/ayuntamiento/notas-prensa/consejo-local-juventud-presenta-programacion-lorencito-fest) | [Cartel oficial](https://www.valladolid.es/es/ayuntamiento/notas-prensa/consejo-local-juventud-presenta-programacion-lorencito-fest.ficheros/1201123-20260710%20presenta%20programaci%C3%B3n%20Lorencito%20Fest%20cartel.jpg/g%2C1201123-20260710%20presenta%20programaci%C3%B3n%20Lorencito%20Fest%20cartel.jpg) | Ya estaba guardado en los datos. |
| 197 | LORENCITO FESTIVAL | Cartel completo recibido localmente; [Ayuntamiento de Valladolid](https://www.valladolid.es/es/ayuntamiento/notas-prensa/consejo-local-juventud-presenta-programacion-lorencito-fest) | `src/assets/events/lorencito-festival-2026.jpg` | Coinciden el 8 de septiembre de 2026, 20:00-01:00, Pistas de las Moreras y los artistas del cartel. |
| 14 | X PUCELAROCK | Cartel recibido localmente | `src/assets/events/pucelarock-2026.jpg` | Coinciden el 4 de septiembre de 2026, las 20:30, Playa de las Moreras y Juantxo Skalari & La Rude Band. |
| 66 | VI PUCELA HEAVY-ROCK FEST | Cartel recibido localmente; [Castilla y León Metal](https://www.castillaleonmetal.es/evento/) y [Metaltrip](https://metaltrip.com/el-pucela-heavy-rock-fest-celebra-su-vi-edicion-en-valladolid/) | `src/assets/events/pucela-heavy-rock-fest-2026.jpg` | El cartel recibido coincide con la VI edición, 5 de septiembre de 2026, Playa de las Moreras y las cuatro bandas del evento. |
| 93 | CAMPEONATO MUNDIAL DE CORTES | [Bacantix / Plaza de Toros de Valladolid](https://www.bacantix.com/entradas/webforms/forms/venta.aspx?codigo=020508001000030000031&id=plvalladolid) | [Cartel](https://www.bacantix.com/Entradas/Imagenes/plvalladolid/020508_000031.jpg?token=%27.date%28%27YmdH%27%29.) | Cartel de Valladolid para el 6 de septiembre de 2026 en la Plaza de Toros. |
| 253 | 9ª EDICIÓN FESTIVAL REGGAE SE DICE ‘REGUE’ | Cartel completo recibido localmente | `src/assets/events/se-dice-regue-2026.jpg` | Coinciden la 9.ª edición, el 10 de septiembre de 2026, Playa de las Moreras y SUMERR & UNRULY YOUTH. |
| 345 | XI FESTIDAGAS 2026 | Cartel recibido localmente; [The Sound of the Embryo](https://www.thesoundoftheembryo.es/cartel-del-festidagas-2026/) | `src/assets/events/festidagas-2026.jpg` | Coinciden edición, fecha, lugar y artistas: Alfredo Piedrafita, Malos Vicios, XpresidentX y Agresiva. |

## Revisados y no incorporados

- **Cristongo / Los del Lío**: la fuente localizada era una fotografía de prensa,
  no un cartel del evento.
- **Ajedrez** y **DANZ**: se localizaron creatividades oficiales relacionadas,
  pero no carteles suficientemente identificables como para guardarlos con el
  mismo nivel de certeza.
- **Festival Reggae Se Dice ‘Regue’ de 2025**: el cartel antiguo indicaba 11 de
  septiembre de 2025 y 8.ª edición; no se asignó a la actividad de 2026.
- Se ignoraron resultados de Heavy-Rock de 2024, imágenes antiguas o de otras
  ciudades y recursos genéricos sin correspondencia verificable.
