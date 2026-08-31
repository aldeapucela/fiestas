---
name: fiestas-event-creator
description: Crear, corregir o revisar eventos en el JSON de Fiestas Valladolid, especialmente cuando proceden de una importación externa.
---

# Fiestas Event Creator

Usa esta skill cuando el usuario pida crear, corregir o revisar un evento del programa de Fiestas Valladolid, incluidos los eventos obtenidos de una fuente externa.

## Fuente de datos

- El JSON principal de eventos es `src/data/fiestas-2026/events.json`.
- Las fechas concretas verificadas de eventos cuyo origen publica un intervalo están en `src/data/fiestas-2026/verified-event-occurrences.json`.
- No edites `dist/` a mano.
- Antes de preguntar por el evento, lee el JSON actual para conocer:
  - el siguiente `id` disponible;
  - todas las `tags` disponibles;
  - todos los `type` disponibles;
  - todas las `zone` disponibles;
  - la forma real de los campos existentes.

## Validación de fechas con intervalo

Un `startsAt` y un `endsAt` separados por varios días son solo los límites de una actividad o ciclo; nunca prueban que haya una sesión cada día del intervalo.

- Antes de crear o importar fichas para un evento de varios días, revisa la ficha de la fuente y su cartel o programa. Solo para estos eventos multidiarios, si la fuente proporciona una imagen, descárgala temporalmente y mírala visualmente; no des por terminada la revisión solo porque el texto de la ficha tenga un intervalo genérico.
- Para eventos de una sola fecha, no descargues ni inspecciones el cartel salvo que exista una necesidad concreta de verificar un dato que falte.
- Lee el cartel completo, haciendo zoom o recortándolo si hace falta, y extrae la lista exacta de días en los que hay actividad. Si cada día tiene una hora o ubicación distinta, conserva también esos datos por día.
- Si el cartel o la ficha enumera días concretos con huecos, conserva únicamente esos días. No rellenes los huecos por continuidad del intervalo.
- Si existe un cartel legible con las fechas, no dejes el evento pendiente por falta de fechas en el texto: registra las fechas verificadas y continúa con la importación, validando además la ubicación y el horario de cada ocurrencia.
- Solo deja el evento pendiente si no hay cartel o programa, la imagen no se puede leer, las fechas son contradictorias o faltan datos imprescindibles para representar cada ocurrencia sin inventar información.
- Un evento que solo cruza la medianoche sigue siendo una única ficha en la fecha de inicio.
- Cuando la verificación sea manual y reutilizable, registra el `id` remoto, la lista `dates` en formato `YYYY-MM-DD` y el origen de la comprobación en `verified-event-occurrences.json`. No uses una descripción genérica como prueba de periodicidad.
- Al revisar una importación existente, compara también los días ya creados con esa lista y marca para revisión cualquier ficha que no esté respaldada por el programa fuente; no la elimines automáticamente sin confirmación.

## Ocurrencias con datos variables

`verified-event-occurrences.json` puede incluir, además de `dates`, una lista `occurrences`. Cada elemento representa una ocurrencia verificable y puede contener:

- `date` en formato `YYYY-MM-DD`;
- `startTime` y `endTime` cuando aparecen en la fuente;
- `location` cuando cambia respecto a otros días;
- `performances` cuando el cartel asigna actuaciones concretas a ese día o sesión.

Cuando una fuente tenga varias fechas y cambie la hora, el lugar, la sesión o las actuaciones, crea una ficha local por ocurrencia representable. No copies la ubicación u horario de una fecha a otra por comodidad. Si dos actuaciones forman un mismo programa nocturno que cruza la medianoche, conserva la fecha de inicio y agrúpalas en esa ficha salvo que la fuente las presente como sesiones independientes; no inventes una hora de fin.

El importador debe comprobar que las ocurrencias cubren exactamente las fechas verificadas, que no hay duplicados y que cada ubicación usada tiene coordenadas resueltas. Para las ubicaciones ambiguas, busca primero en Nominatim y usa el navegador integrado con Google Maps como contraste o fallback; registra en `coordinates.source` la fuente y la consulta utilizada. Si no se puede distinguir entre dos lugares o falta un dato imprescindible, deja solo esa ocurrencia pendiente y explica el motivo concreto.

## Recogida de datos

Pregunta por cada campo del evento antes de crearlo. Si el usuario ya dio alguno, no lo repitas salvo que sea ambiguo.

Campos a recoger:

- `date`
- `dateLabel`
- `startTime`
- `endTime`
- `title`
- `location`
- `zone`
- `description`
- `summary`
- `performances`
- `organizers`
- `collaborators`
- `coordinates.lat`
- `coordinates.lng`
- `type`
- `ticket.required`
- `ticket.status`
- `ticket.label`
- `ticket.url`
- `ticket.note`
- `tags`
- `image`, solo si aplica o el usuario lo menciona.

Para campos múltiples, pide al usuario que separe los valores con barras verticales (`|`). Tú debes convertirlos en arrays limpios:

- `performances`
- `organizers`
- `collaborators`
- `tags`

Muestra al usuario las opciones disponibles para `tags`, `type` y `zone` sacadas del JSON actual. Si el usuario no indica `zone`, intenta inferirla desde `location` usando eventos existentes con la misma ubicación, barrio o recinto.

## Coordenadas

Pide siempre coordenadas explícitas (`lat` y `lng`). Si no las proporciona:

- intenta inferirlas desde eventos existentes con la misma `location` o `zone`;
- si no hay coincidencia local suficiente, calcula las coordenadas usando la dirección/localización disponible;
- indica claramente si las coordenadas son inferidas.

El campo `coordinates.source` debe describir el origen, por ejemplo `Manual`, `Inferred from matching event location`, `Inferred from event zone`, u otra fuente concreta usada.

## Normalización

Aplica las reglas de normalización del repo antes de escribir el evento:

- capitalización española en títulos y textos: primera palabra en mayúscula, palabras comunes en minúscula y nombres propios respetados;
- números romanos en mayúsculas;
- `tags`, `type` y `zone` deben reutilizar valores existentes cuando sea posible;
- separa `performances`, `organizers`, `collaborators` y `tags` en arrays;
- no dupliques organizadores o colaboradores dentro de `description`, `summary` o `performances` si ya tienen campo propio.

Si existe un script local de normalización aplicable, úsalo después de editar el JSON y revisa que no cause cambios ajenos al evento creado.

## Escritura y verificación

Al crear el evento:

- asigna el siguiente `id` numérico disponible;
- conserva el orden cronológico del JSON si el archivo lo mantiene;
- conserva el estilo de dos espacios del JSON;
- no borres ni reordenes eventos no relacionados sin necesidad.

Después de editar:

- ejecuta `npm run build`;
- revisa el diff del evento creado;
- informa de los campos inferidos, especialmente `zone` y `coordinates`.
- comprueba que ningún evento de varios días se haya expandido sin una lista exacta verificada y que los huecos del intervalo no se hayan convertido en fichas inventadas.
- cuando exista una imagen de fuente, deja constancia de que se ha inspeccionado visualmente y de los días concretos extraídos.
- en importaciones con `occurrences`, revisa el recuento de ocurrencias, las combinaciones distintas de fecha/hora/lugar y la correspondencia entre cada ficha local y su ocurrencia fuente.
