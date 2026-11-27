# Ejemplos del método

Estos ejemplos enseñan la notación y el razonamiento. Sus esquemas son autocontenidos: verifica el esquema del usuario antes de reutilizar un nombre o una relación.

## 1. ABM de clientes completo

### Esquema y alcance

```text
clientes
  id_cliente       PK, generado por la base
  dni
  nombre_completo
  telefono
```

La pantalla «Clientes» permite buscar por DNI, dar de alta, modificar nombre y teléfono y eliminar un cliente. En este ejemplo la baja es física.

El nivel 1 tiene el proceso **1 Gestionar clientes**. Su nivel 2 contiene cuatro procesos finales:

```text
1 Gestionar clientes
  1.1 Buscar cliente
  1.2 Alta de cliente
  1.3 Modificación de cliente
  1.4 Baja de cliente
```

Cada hoja representa una sentencia. No hace falta nivel 3.

### Todos los flujos

La siguiente tabla reúne ambos niveles. Cada fila es una conexión; una etiqueta puede agrupar varios datos.

| Paso | Nivel | Desde | Hacia | Flujo exacto | Marca |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | Clientes | 1 Gestionar clientes | `P_dni, P_R_clientes, P_id_cliente, P_nombre_completo, P_telefono` | Normal |
| 2 | 1 | clientes | 1 Gestionar clientes | `R_clientes` | Normal |
| 3 | 1 | 1 Gestionar clientes | Clientes | `P_R_clientes` | Normal |
| 4 | 1 | 1 Gestionar clientes | clientes | `R_clientes, id_cliente, nombre_completo, telefono` | Normal: agrupador |
| 5 | 2 | Clientes | 1.1 Buscar cliente | `P_dni` | Normal |
| 6 | 2 | clientes | 1.1 Buscar cliente | `R_clientes` | Normal |
| 7 | 2 | 1.1 Buscar cliente | Clientes | `P_R_clientes` | Normal |
| 8 | 2 | Clientes | 1.2 Alta de cliente | `P_R_clientes` | Normal |
| 9 | 2 | 1.2 Alta de cliente | clientes | `R_clientes` | Raya en clientes |
| 10 | 2 | Clientes | 1.3 Modificación de cliente | `P_id_cliente, P_nombre_completo, P_telefono` | Normal |
| 11 | 2 | 1.3 Modificación de cliente | clientes | `id_cliente, nombre_completo, telefono` | Normal |
| 12 | 2 | Clientes | 1.4 Baja de cliente | `P_id_cliente` | Normal |
| 13 | 2 | 1.4 Baja de cliente | clientes | `id_cliente` | X en clientes |

El flujo de vuelta del agrupador existe porque contiene Buscar cliente. No significa que las otras tres operaciones devuelvan registros.

`P_id_cliente` está disponible al seleccionar el cliente obtenido por la búsqueda. No se exige para dar de alta. Los datos del alta se agrupan en `P_R_clientes`.

### SQL de las hojas

Son sentencias ilustrativas del modelo, no transcripciones de una aplicación. Los parámetros SQL reciben los valores representados por `P_`.

```sql
-- 1.1 Buscar cliente: :dni recibe P_dni.
SELECT id_cliente, dni, nombre_completo, telefono
FROM clientes
WHERE dni = :dni;

-- 1.2 Alta de cliente: datos incluidos en P_R_clientes.
INSERT INTO clientes (dni, nombre_completo, telefono)
VALUES (:dni, :nombre_completo, :telefono);

-- 1.3 Modificación de cliente.
UPDATE clientes
SET nombre_completo = :nombre_completo,
    telefono = :telefono
WHERE id_cliente = :id_cliente;

-- 1.4 Baja de cliente.
DELETE FROM clientes
WHERE id_cliente = :id_cliente;
```

No se añade `LIMIT 1` por costumbre. Si una consulta necesita ese límite, debe existir un motivo. Si el esquema garantiza unicidad, esa restricción es la que determina la cantidad máxima de coincidencias.

### Especificaciones escritas

**1 Gestionar clientes**

**1.1 Buscar cliente:** Con `P_dni` disponible por pantalla «Clientes», busca registros en la tabla `clientes` cuando `P_dni = dni`. Devuelve `P_R_clientes`.

**1.2 Alta de cliente:** Con `P_R_clientes` disponible por pantalla «Clientes», inserta un nuevo registro en la tabla `clientes`.

**1.3 Modificación de cliente:** Con los datos ingresados por pantalla «Clientes», actualiza `nombre_completo` y `telefono` en la tabla `clientes`, cuando `P_id_cliente = id_cliente`.

**1.4 Baja de cliente:** Con `P_id_cliente` seleccionado por pantalla «Clientes», elimina el registro de la tabla `clientes` cuando `P_id_cliente = id_cliente`.

Al llevarlo a Word, el título del agrupador queda en su profundidad y las primeras líneas de los cuatro hijos reciben la sangría del nivel siguiente.

## 2. Búsquedas sucesivas y claves relacionadas

### Esquema

```text
ordenes(id_orden PK, id_cliente_h FK -> clientes.id_cliente,
        id_unidad_h FK -> unidades.id_unidad)
clientes(id_cliente PK, nombre_completo)
unidades(id_unidad PK, id_modelo_h FK -> modelos.id_modelo, patente)
modelos(id_modelo PK, nombre)
```

Este es otro ejemplo independiente. La pantalla «Orden» conoce `id_orden` por una selección previa. Se quiere mostrar la orden, el cliente, la unidad y el modelo.

### Lógica

1. Con `P_id_orden`, busca `R_ordenes` y lo devuelve como `P_R_ordenes`.
2. De ese registro, la pantalla obtiene `id_cliente_h` e `id_unidad_h`.
3. Usa el valor de `id_cliente_h` como `P_id_cliente` para consultar la clave de `clientes`.
4. Usa el valor de `id_unidad_h` como `P_id_unidad` para consultar la clave de `unidades`.
5. De `P_R_unidades` obtiene `id_modelo_h` y lo utiliza como `P_id_modelo` para consultar `modelos`.

No se dibujan flechas entre los procesos. La pantalla conserva los resultados de las consultas y entrega los criterios posteriores.

### Estructura

```text
2 Consultar orden
  2.1 Buscar orden                 [final]
  2.2 Buscar cliente               [final]
  2.3 Consultar unidad             [agrupador]
    2.3.1 Buscar unidad            [final]
    2.3.2 Buscar modelo            [final]
```

Se utiliza esta agrupación para mostrar que las hojas pueden quedar a distinta profundidad. Cuatro consultas también podrían distribuirse como cuatro hojas del nivel 2 si esa estructura resultara suficiente para el proyecto.

### Todos los flujos

| Paso | Nivel | Desde | Hacia | Flujo exacto | Marca |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | Orden | 2 Consultar orden | `P_id_orden, P_id_cliente, P_id_unidad, P_id_modelo` | Normal |
| 2 | 1 | ordenes | 2 Consultar orden | `R_ordenes` | Normal |
| 3 | 1 | clientes | 2 Consultar orden | `R_clientes` | Normal |
| 4 | 1 | unidades | 2 Consultar orden | `R_unidades` | Normal |
| 5 | 1 | modelos | 2 Consultar orden | `R_modelos` | Normal |
| 6 | 1 | 2 Consultar orden | Orden | `P_R_ordenes, P_R_clientes, P_R_unidades, P_R_modelos` | Normal |
| 7 | 2 | Orden | 2.1 Buscar orden | `P_id_orden` | Normal |
| 8 | 2 | ordenes | 2.1 Buscar orden | `R_ordenes` | Normal |
| 9 | 2 | 2.1 Buscar orden | Orden | `P_R_ordenes` | Normal |
| 10 | 2 | Orden | 2.2 Buscar cliente | `P_id_cliente` | Normal |
| 11 | 2 | clientes | 2.2 Buscar cliente | `R_clientes` | Normal |
| 12 | 2 | 2.2 Buscar cliente | Orden | `P_R_clientes` | Normal |
| 13 | 2 | Orden | 2.3 Consultar unidad | `P_id_unidad, P_id_modelo` | Normal |
| 14 | 2 | unidades | 2.3 Consultar unidad | `R_unidades` | Normal |
| 15 | 2 | modelos | 2.3 Consultar unidad | `R_modelos` | Normal |
| 16 | 2 | 2.3 Consultar unidad | Orden | `P_R_unidades, P_R_modelos` | Normal |
| 17 | 3 | Orden | 2.3.1 Buscar unidad | `P_id_unidad` | Normal |
| 18 | 3 | unidades | 2.3.1 Buscar unidad | `R_unidades` | Normal |
| 19 | 3 | 2.3.1 Buscar unidad | Orden | `P_R_unidades` | Normal |
| 20 | 3 | Orden | 2.3.2 Buscar modelo | `P_id_modelo` | Normal |
| 21 | 3 | modelos | 2.3.2 Buscar modelo | `R_modelos` | Normal |
| 22 | 3 | 2.3.2 Buscar modelo | Orden | `P_R_modelos` | Normal |

La primera fila es el contrato completo del padre. La obtención sucesiva de los valores está explicada en los pasos lógicos; no se supone que todos sean conocidos al ingresar.

### SQL de las cuatro hojas

```sql
-- 2.1
SELECT id_orden, id_cliente_h, id_unidad_h
FROM ordenes
WHERE id_orden = :id_orden;

-- 2.2
SELECT id_cliente, nombre_completo
FROM clientes
WHERE id_cliente = :id_cliente;

-- 2.3.1
SELECT id_unidad, id_modelo_h, patente
FROM unidades
WHERE id_unidad = :id_unidad;

-- 2.3.2
SELECT id_modelo, nombre
FROM modelos
WHERE id_modelo = :id_modelo;
```

## 3. La alternativa con JOIN

Para el esquema del ejemplo 2, si se acordara consultar todo en una sentencia:

```sql
SELECT o.id_orden, o.id_cliente_h, o.id_unidad_h,
       c.nombre_completo,
       u.id_modelo_h, u.patente,
       m.nombre
FROM ordenes AS o
JOIN clientes AS c ON c.id_cliente = o.id_cliente_h
JOIN unidades AS u ON u.id_unidad = o.id_unidad_h
JOIN modelos AS m ON m.id_modelo = u.id_modelo_h
WHERE o.id_orden = :id_orden;
```

Aquí se supone que existen las relaciones indicadas para la orden. En un esquema con relaciones opcionales se debe evaluar, por ejemplo, un LEFT JOIN para no perder órdenes sin alguno de esos datos.

El proceso «Consultar orden» puede ser final porque representa una sentencia. Se parte solo de `P_id_orden`; el SQL resuelve las relaciones.

| Paso | Desde | Hacia | Flujo exacto | Marca |
| --- | --- | --- | --- | --- |
| 1 | Orden | 2 Consultar orden | `P_id_orden` | Normal |
| 2 | ordenes | 2 Consultar orden | `R_ordenes` | Normal |
| 3 | clientes | 2 Consultar orden | `R_clientes` | Normal |
| 4 | unidades | 2 Consultar orden | `R_unidades` | Normal |
| 5 | modelos | 2 Consultar orden | `R_modelos` | Normal |
| 6 | 2 Consultar orden | Orden | `P_R_ordenes, P_R_clientes, P_R_unidades, P_R_modelos` | Normal |

Esta tabla es una alternativa completa, no un hijo del diagrama anterior. Sustituirlo exigiría actualizar el contrato del padre y retirar sus antiguas descomposiciones y especificaciones. No se mezclan las entradas de la versión sucesiva con las de la versión JOIN.

Una especificación posible sería: «Con `P_id_orden` seleccionado por pantalla “Orden”, consulta la orden y sus registros relacionados de `clientes`, `unidades` y `modelos`, vinculados mediante sus claves, cuando `P_id_orden = ordenes.id_orden`. Devuelve `P_R_ordenes`, `P_R_clientes`, `P_R_unidades` y `P_R_modelos`».

Hay menos procesos, pero siguen existiendo cuatro flujos de lectura de tablas. No se inventa `R_detalle` para ocultarlos.

## 4. Criterios preparados y consultas de catálogo

Supón las tablas `tipos_unidad(id_tipo_unidad, nombre, activo)`, `marcas(id_marca, nombre, activo)` y `modelos(id_modelo, id_marca_h, id_tipo_unidad_h, nombre, activo)`.

La pantalla solicita registros activos con `P_activo = 1`. El agrupador «Consultar catálogo» puede descomponerse en tres hojas: «Consultar tipos», «Consultar marcas» y «Consultar modelos».

`P_activo` puede ir a las tres hojas. Cada tabla aporta su propio `R_` y cada hoja devuelve su propio `P_R_`. El padre reúne esos mismos flujos. Si se agrega un criterio de marca para consultar modelos, hay que añadir `P_id_marca_h` en los niveles que correspondan, porque es el campo de `modelos` usado para buscar.

Para una tabla `roles(id_rol, nombre_rol)` no se puede reutilizar `P_activo`. Si la consulta busca determinados roles por nombre, el criterio es `P_nombre_rol`.

En una autenticación, verifica primero el SQL y el tratamiento de la contraseña. Representar la contraseña como `P_contrasena_hash` fue una convención conceptual expresamente aceptada en el método de referencia; no demuestra que todas las aplicaciones envíen un hash desde el navegador. No impongas ese nombre a otro proyecto sin verificar y acordar qué representa.

## 5. Errores que no hay que repetir

| Caso | Problema | Corrección |
| --- | --- | --- |
| Tabla → alta con `R_clientes`. | Se añadió para recuperar el ID generado. | Quitar ese retorno; la clave se obtiene internamente. |
| Alta → pantalla con `P_R_clientes`. | Se usa como confirmación de guardado. | Quitar; el alta solo escribe. |
| Modificación → pantalla con `P_R_unidades`. | Se presenta como «registro actualizado». | Quitar; una búsqueda real, si existe, se representa aparte. |
| Alta recibe una lista de todos sus campos. | Se usa el criterio anterior al acuerdo de registros generales. | Usar `P_R_tabla`; mantener campos sueltos si también se usan en otra operación. |
| Pantalla envía `P_id_cliente` para filtrar `ordenes.id_cliente_h`. | Nombre de campo de destino incorrecto. | Usar `P_id_cliente_h`, incluido en los padres afectados. |
| Proceso → proceso para pasar una FK. | Conexión prohibida en este método. | Devolver `P_R_` a pantalla y obtener desde ella el criterio siguiente. |
| Aparece `P_activo` solo en nivel 3. | No figura en el contrato del padre. | Agregarlo a los niveles superiores afectados si es un criterio real. |
| Padre no devuelve `P_R_clientes`, pero un hijo sí. | Falta salida en la frontera del padre. | Añadir la salida al padre. |
| El mismo nombre está presente, pero contra otra tabla. | El balance comparó solo etiquetas. | Comparar también extremo y dirección. |
| Marca de alta en un agrupador. | Todavía se descompone. | Punta normal; raya en las escrituras de sus hojas. |
| X para `UPDATE ... SET activo = 0`. | Se confunde modificación con eliminación física. | Punta normal y explicación de cambio de estado. |
| Se conserva un nivel con un único hijo idéntico. | No aporta una descomposición. | Dejar final al padre y actualizar referencias. |
| Se crean paneles completos por rol con los mismos hijos. | Duplicación de consultas compartidas. | Agrupar por función y explicar condiciones. |
| Se cuenta cada fila devuelta como proceso. | Confusión entre registros y sentencias. | Un proceso por sentencia final, no por fila. |

## 6. Cómo corregir sin desbalancear

Ejemplo: retirar el retorno de un alta que era el único motivo de la salida `P_R_unidades` del agrupador.

1. Quitar la flecha alta → pantalla.
2. Comprobar si alguna búsqueda del mismo agrupador devuelve `P_R_unidades`.
3. Si existe, conservar la salida del padre: sigue justificada por esa búsqueda.
4. Si no existe, retirar esa salida de los padres afectados, sin quitar otras etiquetas de sus flechas agrupadas.
5. Eliminar del escrito la frase de devolución del alta; conservar los datos de entrada y la escritura.
6. Volver a comprobar balance, marcas y jerarquía. No cambiar el estilo del dibujo.

No se quita un retorno genuino solo porque tiene el mismo nombre que una escritura. Se clasifica cada operación antes de decidir.
