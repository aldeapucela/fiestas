---
name: fiestas-event-creator
description: Crear nuevos eventos en el JSON de Fiestas Valladolid cuando el usuario pida añadir una actividad o evento al programa.
---

# Fiestas Event Creator

Usa esta skill cuando el usuario pida crear o añadir un evento al programa de Fiestas Valladolid.

## Fuente de datos

- El JSON principal de eventos es `src/data/fiestas-2026/events.json`.
- No edites `dist/` a mano.
- Antes de preguntar por el evento, lee el JSON actual para conocer:
  - el siguiente `id` disponible;
  - todas las `tags` disponibles;
  - todos los `type` disponibles;
  - todas las `zone` disponibles;
  - la forma real de los campos existentes.

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
