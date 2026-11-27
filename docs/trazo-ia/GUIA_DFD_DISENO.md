# Guía del método de DFD de diseño

## 1. Qué estamos construyendo

Este método representa cómo una pantalla obtiene, crea, modifica o elimina información de las tablas de un sistema. La explicación debe permitir seguir esta lógica:

> Tengo este dato; lo uso para buscar estos registros; de ellos obtengo el dato que permite continuar.

El usuario delimita las pantallas. La IA lee el código y el esquema, propone los procesos y sus flujos, revisa la coherencia y redacta las especificaciones. Dibujar o editar directamente depende del pedido del usuario.

Una pantalla puede incluir operaciones sobre varias entidades. Por ejemplo, un alta de orden puede contener «Consultar catálogo», «Gestionar cliente», «Gestionar unidad», «Consultar participantes» y «Alta de orden». Las altas y modificaciones de cliente o unidad se especifican dentro de sus agrupadores. Consultar una orden existente y ejecutar sus acciones puede corresponder a otra pantalla. El límite lo acuerda el usuario; no lo determina automáticamente el número de archivos o formularios del código.

Es un perfil específico de DFD de diseño. No se exige un nivel cero ni sustituir las pantallas por actores externos. Tampoco se permiten conexiones entre procesos. Las reglas de un DFD de análisis deben establecerse aparte.

### Fuentes y decisiones

El código, el esquema y las migraciones determinan el funcionamiento real. El historial ayuda a comprender decisiones, pero puede contener propuestas descartadas. Los acuerdos más recientes aceptados sustituyen los anteriores.

Se puede acordar un modelo que agrupe detalles internos. Registra esa decisión en el contexto técnico del proyecto, con su alcance. En las especificaciones académicas describe el modelo adoptado, sin añadir la historia de sus revisiones ni notas repetidas sobre ajustes metodológicos. Si se pregunta por el funcionamiento real, explica la diferencia con precisión.

## 2. Elementos y conexiones

| Elemento | Representa | Nombre |
| --- | --- | --- |
| Pantalla | Información ingresada, seleccionada, mostrada o preparada en el contexto de esa vista. | El que defina el usuario. |
| Proceso | Consulta, alta, modificación, baja o agrupación de estas operaciones. | Nombre corto y número jerárquico. |
| Tabla | Almacén de datos consultado o modificado. | Nombre exacto del esquema. |
| Flujo | Campos o registros que intervienen en una operación. | Notación de la sección siguiente. |

Son válidas las conexiones pantalla → proceso, proceso → pantalla, tabla → proceso y proceso → tabla cuando la operación las justifica.

No conectar proceso con proceso, pantalla con tabla, pantalla con pantalla ni tabla con tabla. No dejar extremos sueltos. Las relaciones entre tablas se utilizan para razonar las consultas; no se dibujan como flechas directas entre almacenes.

Una tabla puede ser solo de lectura dentro de una pantalla. No inventar escrituras para hacerla bidireccional. Los colores no expresan operaciones en este método: las marcas de punta sí lo hacen.

## 3. Nombres de los flujos

| Notación | Significado |
| --- | --- |
| `P_campo` | Valor de un campo disponible desde pantalla para la operación. |
| `R_tabla` | Registro o registros involucrados de esa tabla, considerados de forma general. |
| `P_R_tabla` | Datos preparados para un alta, o registros devueltos a pantalla por una consulta, según la dirección. |
| `campo` | Campo concreto enviado por un proceso hacia una tabla. |

Estas son plantillas. Sustituye `campo` y `tabla` por los nombres reales. Mantén la misma escritura y capitalización de los prefijos entre niveles.

### Qué incluye P

`P_` no significa exclusivamente «escrito a mano». Incluye valores de sesión, registros seleccionados, datos conservados por la pantalla y criterios que el programa prepara para esa vista.

Por ejemplo, `P_activo = 1` puede representar un criterio fijo para consultar un catálogo cuya tabla tenga `activo`. No implica que exista un control visible ni que el navegador envíe literalmente ese parámetro por HTTP.

No agregar `P_activo` a una tabla que carece de `activo`. No inventar `alcance`, `contadores`, `resultado`, `éxito` o nombres similares para evitar examinar los datos reales. Un botón, una redirección o una confirmación visual no son registros de una tabla.

### Qué incluye R

`R_clientes` representa los registros de clientes involucrados en la operación. No significa «todos los clientes», no impone una consulta sin filtros y no exige que el código use `SELECT *`.

En las altas, `P_R_clientes` agrupa los datos necesarios para crear el cliente. No significa que la persona escriba una clave autoincremental, fechas internas o todos los valores predeterminados.

Si la pantalla calcula un total a partir de los registros obtenidos en el modelo adoptado, conserva los paquetes `R_` y `P_R_` que lo sustentan. No inventes un campo llamado `contadores`. Si el código utiliza consultas agregadas distintas, comprueba y acuerda cómo se representarán antes de dar por equivalente otra consulta.

No inventar un paquete `R_resultado` para esconder lecturas de varias tablas. Si se usan varias tablas, conservar sus flujos `R_` correspondientes.

### Claves primarias y foráneas

El nombre del parámetro responde al campo utilizado en la consulta de destino, aunque su valor provenga de otro campo:

| Dato obtenido | Próxima búsqueda | Entrada de pantalla |
| --- | --- | --- |
| `usuarios.id_rol_h` | `roles.id_rol` | `P_id_rol` |
| `roles.id_rol` | `usuarios.id_rol_h` | `P_id_rol_h` |
| `clientes.id_cliente` | `ordenes.id_cliente_h` | `P_id_cliente_h` |
| `ordenes.id_cliente_h` | `clientes.id_cliente` | `P_id_cliente` |

El sufijo `_h` se conserva cuando realmente existe. No lo añadas automáticamente a un esquema que utiliza otros nombres.

No reemplazar `id_usuario` por `id`, `nombre_rol` por `rol` ni una columna por el nombre del control HTML. Si una búsqueda acepta DNI o nombre de usuario, representa ambas columnas reales; no inventes el campo «identificador». Un alias de presentación del SQL tampoco redefine el esquema.

## 4. Patrón de las operaciones finales

| Operación | Pantalla → proceso | Tabla → proceso | Proceso → tabla | Proceso → pantalla | Punta hacia tabla |
| --- | --- | --- | --- | --- | --- |
| Consulta | Criterios `P_` reales. | `R_tabla` | — | `P_R_tabla` | No hay escritura. |
| Alta | `P_R_tabla` | — | `R_tabla` | — | Raya. |
| Modificación | `P_clave` y `P_campos` concretos. | — | Clave y campos sin `P_`. | — | Normal. |
| Baja física | `P_clave` | — | Clave sin `P_`. | — | X. |

Los patrones `P_clave` y `P_campos` no deben quedar como etiquetas literales en el dibujo.

### Consultas

Identifica el criterio y su procedencia. Para una consulta general puede no hacer falta un filtro ingresado por la persona: explica qué conjunto se solicita. Si el programa prepara un criterio real, represéntalo desde pantalla. No inventes una columna o un filtro sin efecto para que exista una flecha.

Si una misma consulta admite listar todos o buscar uno, documenta cómo se interpreta el parámetro opcional. No supongas que un identificador vacío significa «todos» sin que el código o el diseño acordado lo establezca.

Una consulta devuelve `P_R_tabla` a pantalla. Si luego se necesita un dato de ese registro, la pantalla lo proporciona al proceso siguiente. No conectar los dos procesos.

### Altas e identificadores automáticos

El alta recibe `P_R_tabla` y envía `R_tabla` al almacén. No devuelve el registro a pantalla ni recibe un `R_tabla` de vuelta para representar la clave generada.

La generación y obtención de claves quedan dentro del programa. Siguen disponibles para operaciones posteriores, aunque no se dibuje ese mecanismo. No inventar un SELECT posterior ni exigir que el usuario introduzca el identificador automático.

Una lectura de la misma tabla es válida si se necesita una búsqueda real distinta del alta. Por ejemplo, consultar si ya existe una participación antes de registrar una nueva no equivale a recuperar la clave de una inserción.

### Modificaciones y bajas

En la modificación se enumeran la clave que localiza el registro y solo los campos que pueden cambiar. No devolver `P_R_tabla` para significar «guardado», «pantalla actualizada» o «confirmación».

Desactivar un registro mediante `activo = 0` es una modificación de estado. No describirlo como un DELETE ni marcar su flecha con X. Si la cátedra exige otra convención para una baja lógica, acordarla expresamente.

Una baja física usa la clave y X. Si la base elimina filas relacionadas por cascada, explica ese efecto cuando corresponda; no inventes sentencias DELETE del programa para cada cascada. Tampoco inventes un alta de historial que quedaría referenciando un padre eliminado.

### Marcas de punta

Aplica raya o X **solo en la flecha del proceso final hacia la tabla, junto al extremo que llega a ella**. La entrada pantalla → alta no lleva raya. Consultas y modificaciones conservan punta normal.

Los flujos de un agrupador conservan punta normal aunque dentro haya altas o bajas. Un proceso final puede estar en nivel 2, 3 o superior: no hace falta llevarlo al nivel más profundo de los otros procesos para marcarlo.

## 5. Seguir los datos, paso a paso

Para cada pantalla:

1. Establece qué dato ya existe: sesión, selección previa, valor ingresado o criterio preparado.
2. Identifica la tabla y la columna con que se busca.
3. Obtén el registro general `R_tabla` y devuélvelo como `P_R_tabla`.
4. Explica qué campo de ese registro sirve para la próxima consulta, para decidir qué mostrar o para presentar un dato.
5. Continúa hasta reunir lo necesario. Después separa las escrituras según alta, modificación y baja.

No hace falta devolver un identificador ya conocido solo para justificar otra flecha. Sí hace falta que cada criterio posterior tenga un origen comprensible.

Los flujos agrupados de un nivel superior reúnen las necesidades del proceso completo. No significan que todos los identificadores estén disponibles al abrir la pantalla: algunos se obtienen durante las búsquedas sucesivas.

## 6. Jerarquía y criterio para dejar de especificar

El nivel 1 agrupa la funcionalidad de las pantallas. Si una pantalla requiere varios bloques funcionales, se acuerda su división antes de dibujar.

Se usa numeración jerárquica: `3`, `3.1`, `3.1.1`. El diagrama que descompone `3` es nivel 2; el que descompone `3.1` es nivel 3. Los números muestran pertenencia, no una secuencia temporal.

Cada especificación contiene como máximo cinco procesos. Dos, tres o cuatro también son válidos. Si hay más, agrupa responsabilidades relacionadas y continúa en otro nivel. Este límite no obliga a reducir todo el nivel 1 del sistema a cinco pantallas.

**Se deja de descomponer cuando cada proceso final representa una sentencia SQL en el modelo adoptado.**

- Un SELECT con JOIN o subconsultas puede ser una sentencia y un proceso final.
- Una transacción con tres sentencias sigue teniendo tres sentencias.
- Ejecutar la misma sentencia para varios participantes no exige un proceso por cada persona.
- Dos modificaciones compatibles sobre la misma fila pueden modelarse con un solo UPDATE si preserva correctamente los valores que no deben cambiar.
- No agrupar escrituras distintas en tablas distintas alegando que se guardan con un mismo botón.
- No crear un nivel adicional con un único hijo que repite lo que ya era final.

Los procesos finales pueden quedar a distinta profundidad. Los agrupadores solo organizan; sus hijos explican el detalle.

### Excepción que ya utilizamos

En el método de referencia se acordó representar el alta de una unidad y la asignación interna opcional de su código como una sola secuencia de alta: `P_R_unidades_reparables → R_unidades_reparables`. Se omitió separar el INSERT y la actualización interna del código.

Conserva esa decisión si continúas un proyecto que la adoptó. En otro proyecto, una excepción equivalente debe acordarse y registrarse. No convierte cualquier conjunto de SQL en un solo proceso final.

### Agrupar sin duplicar por rol

Si alumno y docente consultan las mismas familias de datos, agrupa por función: «Consultar usuario», «Consultar órdenes», «Consultar unidad», «Consultar novedades». Explica las condiciones de rol o estado en sus especificaciones.

El mismo criterio sirve para distintas modalidades de alta: solicitud, alta directa o carga histórica pueden compartir estructura y diferenciarse por los datos y el estado inicial. Verifica esas diferencias en el sistema; el nombre de la modalidad no demuestra que se ejecuten las mismas escrituras ni que quede aprobada automáticamente.

Separa consultas cuando exista una diferencia real que lo requiera. No añadas un campo ficticio `alcance` ni dupliques un árbol entero solo para cambiar su nombre.

Leer todos los registros no implica poder modificarlos. La visibilidad, la participación y la autorización para aprobar, editar o eliminar deben verificarse por separado.

## 7. Balance entre niveles

La frontera de un proceso padre debe coincidir con la unión de las fronteras de sus hijos. Compara **pantalla o tabla externa, dirección y nombre de cada dato**.

- Una flecha puede contener varios nombres separados por comas.
- Los hijos pueden repartir esos nombres y repetir uno cuando lo necesitan varios procesos.
- No pueden crear nombres nuevos ni cambiar una lectura por escritura.
- El mismo nombre contra otra tabla no basta para considerar balanceados los niveles.
- Que `P_R_tabla` contenga conceptualmente un campo no autoriza a introducir abajo un flujo suelto `P_campo` que no estaba previsto en el padre. Si se necesita como entrada independiente, añádelo también a los padres afectados.

Un agrupador puede recibir `P_R_clientes` para un alta y, además, `P_dni` para buscar y campos concretos para modificar. Su salida `P_R_clientes` se conserva solo si una consulta interna la justifica.

Cuando se cambia una rama, entrega todos los cambios conocidos de una vez: hijos, padres, títulos, referencias, marcas y especificaciones escritas. Si se elimina una consulta, quita sus datos solo donde ya no los necesite ningún otro proceso. No borres una tabla compartida del sistema porque deje de aparecer en una especificación.

## 8. JOIN, filtros y límites del modelo

Nuestro punto de partida son las búsquedas sucesivas, porque permiten explicar de dónde sale cada dato. No añadas JOIN por iniciativa propia para sustituir decisiones ya aceptadas. Puede proponerse cuando el usuario busque otra estructura o una consulta lo justifique.

Un JOIN puede recorrer claves foráneas dentro de una sola sentencia desde un dato inicial conocido. No requiere que la pantalla conozca previamente todos los identificadores relacionados. Aunque reduzca el número de procesos, siguen interviniendo las tablas consultadas y sus flujos `R_`.

Para filtros, comprueba si el SQL selecciona el conjunto o si el programa filtra datos ya consultados. Si se acuerda traer el conjunto autorizado y filtrar en la vista, no crees un proceso SQL por cada filtro. Tampoco inventes columnas como `buscar` ni confundas filtrar una página cargada con buscar en todos los registros.

Respeta los operadores: una búsqueda por nombre **o** apellido no debe describirse como si exigiera ambos. Aclara cuándo hay alternativas y cuándo se combinan criterios con AND.

No asumas que «historial del cliente» consulta una tabla llamada `historial`: podría ser una lista de órdenes. No infieras una relación de propiedad permanente entre cliente y unidad si el vínculo real pasa por las órdenes.

En el método de referencia se excluyeron comprobaciones técnicas repetidas, validaciones y detalles de permisos de los procesos dibujados. Para otro proyecto acuerda ese alcance; excluir su dibujo no elimina las reglas de negocio ni las búsquedas necesarias para obtener información.

## 9. Entregar los flujos

Responde con una sola tabla para el alcance solicitado. Ordénala según se obtienen los datos, aunque los números jerárquicos no coincidan con ese orden.

| Paso | Especificación / proceso | Desde | Hacia | Flujo exacto | Marca |
| --- | --- | --- | --- | --- | --- |
| 1 | Número y nombre. | Pantalla o tabla. | Proceso. | Nombres reales. | Normal, raya o X. |

Usa una fila por conexión y dirección. En correcciones, indica crear, quitar o sustituir, el nivel afectado y el texto completo final. No des solo la entrada final con todos los campos si el usuario está revisando cómo se reúnen.

La explicación breve debe decir para qué se usa el dato: mostrarlo, determinar una condición o conseguir otro registro. No repetir en prosa toda la tabla.

## 10. Redactar las especificaciones

Escribe el detalle de los **procesos finales**, aunque estén a distinta profundidad. Los agrupadores llevan número y título y se desarrollan mediante sus hijos. «Más específico» no significa «el número de nivel más bajo» ni obliga a describir agrupadores como si fueran consultas finales.

Mantén el estilo del documento del usuario. En el formato de referencia se incrementa la sangría de primera línea según la profundidad jerárquica; no se desplaza todo el párrafo como una lista. Usa un incremento uniforme y conserva la numeración del diagrama.

Patrones:

- **Consulta:** «Con `P_dni` disponible por pantalla “Clientes”, busca registros en la tabla `clientes` cuando `P_dni = dni`. Devuelve `P_R_clientes`».
- **Alta:** «Con `P_R_clientes` disponible por pantalla “Clientes”, inserta un nuevo registro en la tabla `clientes`».
- **Modificación:** «Con los datos ingresados por pantalla “Clientes”, actualiza `nombre_completo` y `telefono` en la tabla `clientes`, cuando `P_id_cliente = id_cliente`».
- **Baja:** «Con `P_id_cliente` seleccionado por pantalla “Clientes”, elimina el registro de la tabla `clientes` cuando `P_id_cliente = id_cliente`».

Explica los criterios opcionales, las condiciones de rol o estado y la conservación de campos cuando sean relevantes. No añadas «Devuelve P_R_…» a una escritura. No incluyas código SQL en el escrito si solo se pidió la explicación en prosa.

Si se modifica un Word existente, lee primero los cambios del docente, conserva el contenido aprobado y verifica la presentación del resultado. No deduzcas que todo un sistema fue aprobado a partir de la aprobación de unas pantallas.

## 11. Trabajar con Trazo

### Leer antes de operar

1. Descubre qué herramientas de Trazo están disponibles y lee sus contratos actuales.
2. Identifica el proyecto, la pestaña y el diagrama. Si hay varios candidatos indistinguibles, pide elegir uno.
3. Lee la jerarquía y los datos reales: procesos, pantallas, tablas, etiquetas, extremos, marcas y vínculos padre/hijo.
4. Conserva la revisión o versión leída si la herramienta permite controlar concurrencia.

En integraciones que los expongan pueden existir nombres como `trazo_estado`, `trazo_leer_diagrama` y `trazo_aplicar`. Son referencias para descubrir capacidades, no una garantía de que cada instalación tenga las mismas API o argumentos. No inventes una llamada a partir de estos nombres.

### Respetar el pedido

- «Revisa» implica lectura y devolución de hallazgos.
- «Dame los pasos» implica instrucciones para que el usuario dibuje.
- «Edita» autoriza la edición del alcance solicitado, conservando estilo y trabajo ajeno.

Cuando edites, usa los identificadores reales y la revisión esperada si existe. Haz cambios pequeños y vuelve a leer el resultado. Ante un fallo incierto, comprueba primero qué se aplicó antes de reintentar. No sobrescribas archivos internos de un proyecto abierto para eludir el mecanismo del editor.

Lee y modifica secuencialmente los diagramas de una misma pestaña cuando la integración no admita concurrencia. No ejecutes ordenación automática ni cambies curvas, colores, tamaños o posiciones al revisar lógica.

Si el usuario cambia estilos mientras revisas, compara la estructura y los flujos sin tratar cambios de geometría como cambios lógicos. Relee las partes que cambiaron antes de concluir.

### Si no hay conexión

Trabaja con una exportación compatible o imágenes que el usuario aporte. Distingue el análisis de lo visible de una auditoría completa del proyecto. Una captura recortada no permite confirmar todos los niveles ni identificar con certeza elementos fuera de ella. No inventes identificadores de nodos, revisiones ni capacidades de importación.

### Ordenar visualmente el nivel 1

Cuando el usuario pida acomodar los recorridos, aplica [Cómo ordenar los flujos del nivel 1](ORDEN_FLUJOS_NIVEL_1.md). El patrón acordado agrupa por proceso, aprovecha corredores a ambos lados de las tablas y combina tramos paralelos con giros suaves y llegadas distribuidas. El orden de los anclajes debe acompañar al de los carriles para evitar cruces internos. El color puede identificar al proceso sin representar una operación SQL.

Trabaja desde los ajustes más recientes del usuario. Conserva la curva que haya elegido como referencia y los rótulos que quiera acomodar por su cuenta. Compacta el corredor derecho sin sacrificar separación ni regularidad. Una revisión lógica no autoriza estos cambios visuales.

## 12. Auditoría antes de continuar

| Revisión | Qué comprobar |
| --- | --- |
| Evidencia | Se leyeron el esquema, el código y los diagramas del alcance declarado. |
| Nombres | Cada tabla y columna existe; prefijos y sufijos coinciden entre niveles. |
| Datos | Cada criterio tiene origen y uso; no se exige conocerlo antes de obtenerlo. |
| Operaciones | Cada hoja sigue el patrón de consulta, alta, modificación o baja. |
| Retornos | Solo las consultas devuelven registros; no hay retornos por clave generada. |
| Puntas | Altas finales con raya, bajas físicas finales con X, restantes normales. |
| SQL | Cada hoja corresponde a una sentencia o a una excepción expresamente acordada. |
| Jerarquía | Máximo cinco hijos por especificación; números, títulos y vínculos correctos. |
| Balance | Coinciden extremo externo, dirección y nombre entre padre e hijos. |
| Conexiones | Sin flechas prohibidas, extremos sueltos, etiquetas vacías ni duplicados accidentales. |
| Negocio | Filtros, visibilidad, permisos y relaciones no se infieren del nombre de la pantalla. |
| Escrito | Están todas las hojas vigentes y ninguna especificación retirada. |

Un control automático de nombres no demuestra por sí solo que la lógica sea correcta. Un validador de otra notación puede rechazar convenciones válidas de este método; no alteres los diagramas para satisfacerlo sin revisar sus reglas.

Informa qué se revisó, qué evidencia se usó y qué queda pendiente. No presentes una revisión estática como una prueba de la aplicación, ni una lectura parcial como auditoría integral.

## 13. Mantener el contexto del proyecto

Utiliza la [plantilla de contexto](CONTEXTO_DFD_PLANTILLA.md) y actualízala cuando el usuario lo solicite. Conserva acuerdos vigentes, excepciones, estructura y pendientes. Distingue propuestas, acuerdos del usuario y aprobaciones docentes.

Registra las decisiones de forma que la siguiente IA pueda continuar sin reconstruir todo el chat. Si un documento anterior conserva una regla descartada, señala cuál es vigente; no combines ambas como si fueran compatibles. No modifiques por este trabajo otros intentos, la aplicación ni su base de datos.
