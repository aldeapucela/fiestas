# Analisis De Etiquetas De Eventos

El modelo original de datos tenia una sola categoria por evento mediante `type`.
Al revisar los 414 eventos con reglas heuristicas conservadoras por texto, se han añadido etiquetas secundarias claras a 132 eventos.

## Tipos Actuales

```text
 74 Musica
 74 Teatro
 71 Otros
 61 Infantil y familiar
 33 Penas
 28 Danza
 23 Folklore
 11 Exposicion
  8 Fuegos artificiales
  8 Magia
  7 Talleres
  7 Toros
  5 Deporte
  3 Religioso
  1 Gastronomia
```

## Etiquetas Probables

Las reglas detectan senales de multietiqueta en titulos, resumenes, descripcion, actuaciones, organizadores y colaboradores.
No se aplican automaticamente a los datos porque algunas coincidencias necesitan revision editorial.

```text
117 Música
 84 Infantil y familiar
 76 Peñas
 73 Teatro
 61 Otros
 37 Danza
 33 Folklore
 17 Talleres
 14 Gastronomía
 13 Exposición
 11 Magia
  9 Deporte
  8 Fuegos artificiales
  7 Toros
  3 Religioso
```

## Ejemplos Claros

- `CONCENTRACION DE PENAS DE VALLADOLID...` puede ser `Musica` y `Penas`.
- `PARQUE INFANTIL DE HINCHABLES Y TALLERES` puede ser `Infantil y familiar` y `Talleres`.
- `XLIII FERIA DE FOLKLORE Y GASTRONOMIA` puede ser `Folklore` y `Gastronomia`.
- `GIGANTES Y CABEZUDOS` puede ser `Folklore` e `Infantil y familiar`.
- `MORERAS BEACH FEST...` puede ser `Musica` y `Penas`.
- `EXPOSICION DE VEHICULOS Y MOTOS CLASICAS` puede ser `Exposicion`, `Deporte` y `Penas`.

## Implementacion

Los 414 eventos tienen ahora un array `tags`.
Si un evento futuro no tiene `tags`, el build usa `[type]`.
El icono sigue saliendo de `type`, que queda como categoria principal.
Los filtros y las badges usan todas las etiquetas disponibles.
