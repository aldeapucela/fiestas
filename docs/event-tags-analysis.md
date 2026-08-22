# Análisis de etiquetas de eventos

El modelo de datos mantiene una categoría principal por evento mediante `type` y etiquetas secundarias mediante `tags`.
Tras revisar los eventos que estaban en `Otros`, se han reclasificado 59 actividades claras. `Otros` queda reservado para los dos pases de `PROGRAMA PREVENCIÓN ADICCIONES YOUNG ZONE`, que no representan un contenido cultural concreto.

## Tipos actuales

```text
116 Música
 77 Teatro
 64 Infantil y familiar
 33 Peñas
 29 Danza
 23 Folklore
 18 Humor y monólogos
 11 Exposición
 10 Magia
  8 Fuegos artificiales
  7 Talleres
  7 Toros
  5 Deporte
  3 Religioso
  2 Otros
  1 Gastronomía
```

`Otros` pasa de 61 eventos (14,7 %) a 2 (0,5 %).

## Etiquetas probables

Las reglas detectan señales de multietiqueta en títulos, resúmenes, descripción, actuaciones, organizadores y colaboradores.
No se aplican automáticamente a los datos porque algunas coincidencias necesitan revisión editorial.

```text
148 Música
 87 Infantil y familiar
 77 Teatro
 76 Peñas
 37 Danza
 33 Folklore
 18 Humor y monólogos
 17 Talleres
 14 Gastronomía
 13 Exposición
 13 Magia
 9 Deporte
 8 Fuegos artificiales
 7 Toros
 3 Religioso
  2 Otros
```

## Ejemplos claros

- `CONCENTRACIÓN DE PEÑAS DE VALLADOLID...` puede ser `Música` y `Peñas`.
- `PARQUE INFANTIL DE HINCHABLES Y TALLERES` puede ser `Infantil y familiar` y `Talleres`.
- `XLIII FERIA DE FOLKLORE Y GASTRONOMÍA` puede ser `Folklore` y `Gastronomía`.
- `GIGANTES Y CABEZUDOS` puede ser `Folklore` e `Infantil y familiar`.
- `MORERAS BEACH FEST...` puede ser `Música` y `Peñas`.
- `EXPOSICIÓN DE VEHÍCULOS Y MOTOS CLÁSICAS` puede ser `Exposición`, `Deporte` y `Peñas`.

## Reclasificaciones principales

- `LO DE FERIAS: LO QUE PASA EN PUCELA SE QUEDA EN PUCELA`, `DOS ORILLAS GIRA “ENHUMORADOS”` y `CABARET DE LA LUZ DE LAS DELICIAS` pasan a `Humor y monólogos`.
- Los dúos, solistas y propuestas identificables como conciertos pasan a `Música`.
- `SILENCIO, POR FAVOR`, `LA MUJER QUE PLANTA ÁRBOLES` y `LAS QUE TIENE QUE LIMPIAR` pasan a `Teatro`; `EL HECHICERO` pasa a `Magia`.
- `GIRA DE VERANO NINTENDO`, `CUENTO, RECUENTO Y TE CUENTO` y `¿TÚ DE QUÉ CUENTO ERES? PIE IZQUIERDO` pasan a `Infantil y familiar`.
- `EVENTO DE BAILE: DANZ! FIESTAS DE VALLADOLID` pasa a `Danza`; ya tenía esa etiqueta secundaria.

## Implementación

Los 414 eventos tienen ahora un array `tags`.
Si un evento futuro no tiene `tags`, el build usa `[type]`.
El icono sigue saliendo de `type`, que queda como categoría principal. `Humor y monólogos` usa el icono de artes escénicas y la imagen social de teatro mientras no exista una ilustración de categoría propia.
Los filtros y las badges usan todas las etiquetas disponibles.
