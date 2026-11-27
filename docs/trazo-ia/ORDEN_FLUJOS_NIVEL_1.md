# Cómo ordenar los flujos del nivel 1

Esta guía conserva el criterio visual que usamos para ordenar el nivel 1 en Trazo: **grupos de curvas por proceso, tramos paralelos, transiciones suaves y un diagrama compacto**. Complementa la [guía del método](GUIA_DFD_DISENO.md); no cambia sus reglas lógicas.

Ordenar aquí significa acomodar recorridos, conexiones y separaciones en el lienzo. No significa modificar el orden lógico de las consultas ni la numeración de los procesos.

## 1. Leer el estado que dejó el usuario

Antes de ajustar, relee el nivel 1 completo y la zona afectada. El usuario puede haber movido nodos, anclajes, curvas o rótulos después de tu última intervención. Parte de ese estado, no de una copia anterior.

Identifica:

- Los procesos y las tablas que comparten.
- Los grupos que pasan por cada lado de las tablas.
- Una curva o un grupo de referencia que el usuario haya aprobado.
- Qué se puede cambiar: recorridos, puntos de conexión, rótulos, colores o posiciones de nodos.
- Qué debe quedar intacto, en especial la curva que se utiliza como referencia.

«Revisa» sigue siendo una petición de lectura. «Ordena los flujos» permite ajustar el trazado solicitado; no autoriza a cambiar su contenido, eliminar conexiones o rehacer todo el lienzo. Si el usuario fija puntos de conexión, consérvalos. Si permite redistribuirlos o replantear el recorrido, utiliza ese margen dentro del grupo afectado.

## 2. Distribución general y grupos

En la distribución de referencia, las pantallas están a la izquierda, los procesos en una columna central y las tablas compartidas a la derecha. Los nuevos procesos se incorporan debajo de los anteriores, conservando la organización existente.

No muevas todos los nodos para resolver una curva aislada. Primero aprovecha el espacio que ya existe entre procesos y tablas y junto al lado derecho de los almacenes.

Trata como grupo las conexiones con tablas de un mismo proceso, incluidas lecturas y escrituras. Cada flecha conserva su identidad, dirección, texto y punta. Agrupar visualmente no significa fusionar flechas ni crear un punto de unión de datos.

Si el proceso necesita dos recorridos por disponibilidad de espacio, puede tener un grupo interior y otro exterior. No es obligatorio que todas sus conexiones pasen por el mismo lado.

### Color por proceso

En el estilo que adoptamos, cada proceso de nivel 1 tiene un color y sus flujos de entrada y salida usan ese mismo color, incluso los que proceden de una tabla. Esto ayuda a seguirlos en zonas con cruces.

Conserva la paleta elegida por el usuario. El color identifica el grupo, no significa consulta, alta, modificación ni baja; esas operaciones mantienen sus propias marcas de punta. No recolorees otros niveles o procesos si el pedido solo afecta al recorrido.

## 3. Elegir el corredor

| Corredor | Cuándo aprovecharlo | Recorrido característico |
| --- | --- | --- |
| Interior, a la izquierda de las tablas | Hay espacio libre entre los almacenes y los procesos. Evita sobrecargar el lado derecho. | Transición suave desde las tablas, franja de tramos paralelos y apertura hacia el proceso. |
| Exterior, a la derecha de las tablas | Los flujos deben rodear la columna de tablas para llegar a un proceso situado más abajo. | Salida hacia la derecha, descenso paralelo, giro amplio bajo la zona ocupada y llegada al proceso. |
| Directo | Una tabla cercana puede conectarse sin atravesar un grupo denso. | Curva breve y limpia que no obliga a dar una vuelta exterior. |

Compara estas posibilidades como conjuntos. En nuestro trabajo, llevar todos los flujos a la derecha resultó peor que conservar también grupos interiores. Aprovecha ambos lados donde mejor funcionen; no conviertas la preferencia de un proceso en una regla para todos.

El corredor exterior debe quedar tan cerca de las tablas como permita una separación legible. No dejes una gran franja vacía entre las tablas y el primer grupo mientras el diagrama crece hacia la derecha.

## 4. Construir una familia de curvas

No acomodes cada flecha de forma independiente. Diseña primero la silueta del conjunto y luego distribuye sus miembros:

1. **Toma una referencia.** Si el usuario retocó una curva y pidió usarla como guía, déjala intacta y adapta las restantes a su forma y posición.
2. **Define la franja común.** Reserva un tramo donde todas las curvas del grupo avanzan lado a lado, horizontalmente o con el mismo ángulo.
3. **Asigna un carril a cada flecha.** Mantén el mismo orden relativo a lo largo de la franja. Cada curva necesita su propia separación.
4. **Diseña las transiciones como conjunto.** Haz que las curvas vecinas cambien de dirección de forma progresiva y comparable. Evita que una gire de golpe mientras otra vecina sigue recta durante mucho más recorrido.
5. **Escalona los giros.** En los corredores exteriores, combina descensos paralelos con curvas anidadas que giran a alturas y radios compatibles. Evita curvas enredadas o retornos innecesarios.
6. **Abre el abanico de llegada.** Distribuye los extremos sobre un arco suficiente del proceso para conservar la separación hasta el círculo.
7. **Comprueba todo el recorrido.** Que el tramo vertical esté ordenado no resuelve una mala salida de las tablas ni un amontonamiento en el giro o en la llegada.

Usa curvas suaves. No basta con redondear un codo a 90 grados si la silueta sigue siendo brusca. La transición debe tener recorrido suficiente para cambiar de dirección gradualmente, sin picos, bucles ni quiebres.

Si hay controles Bézier, alinea sus tangentes con el tramo que entra o sale del giro. Curvas vecinas pueden necesitar radios y longitudes diferentes para verse regulares como conjunto. No copies exactamente los mismos controles a conexiones de distinta geometría.

## 5. Ordenar los puntos de conexión

El orden de los anclajes en las tablas, el orden de los carriles y el orden de llegada al círculo deben ser compatibles. Cambiar solo uno de ellos puede aumentar los cruces.

En un corredor exterior con descenso, nos funcionó colocar sobre el borde derecho de una tabla las conexiones que recorren los carriles más exteriores por encima de las que giran antes. Es un criterio geométrico para ese recorrido; compruébalo con las posiciones reales, no lo apliques como un orden alfabético o universal.

En las tablas, separa los extremos que coincidan o queden casi superpuestos. En el proceso, reparte las llegadas sobre el arco disponible, en lugar de concentrarlas en un único punto o en un tramo demasiado pequeño.

Si debes invertir las llegadas para quitar cruces, revisa también los carriles. En uno de nuestros ajustes, invertir solo los puntos del círculo duplicaba los cruces; invertir a la vez el orden exterior y las llegadas eliminó los cruces internos del grupo.

Mantén la dirección real: una escritura puede recorrer la misma familia geométrica en sentido contrario a una lectura. La punta siempre corresponde a su destino, no al sentido en que describimos el trazado.

## 6. Separación para curvas y rótulos

La separación se comprueba a lo largo del recorrido y especialmente en tres zonas: salida de las tablas, giros y abanico final. No basta con medir la distancia entre los extremos.

Deja tramos horizontales o de inclinación común donde quepan los rótulos. Abre más el grupo si hay una etiqueta larga, aunque tenga pocas flechas. Un proceso con tres conexiones puede necesitar más espacio para sus textos que otro con varias etiquetas cortas.

Como referencias de los ajustes que nos funcionaron, utilizamos tramos paralelos de aproximadamente **170 a 185 unidades del lienzo** y separaciones próximas a **29 unidades** en algunas franjas interiores. Son ejemplos de escala, no mínimos obligatorios ni valores para copiar en todas las pantallas. Ajusta según tamaños, textos y espacio disponible.

Si el usuario se ocupa de los rótulos, conserva sus textos y ajustes. Mejora el espacio para ellos mediante las curvas; no los reubiques por tu cuenta. Si el pedido incluye acomodarlos, sitúalos en los tramos despejados y evita superposiciones.

Conservar los parámetros de una etiqueta no garantiza conservar su posición visible cuando cambia la curva. Si el editor coloca el texto según un parámetro del recorrido, como `labelT`, verifica dónde terminó después de guardar. No confundas «mismos ajustes» con «mismas coordenadas».

## 7. Compactar sin amontonar

Una vez ordenados los grupos:

1. Acerca el grupo exterior más próximo a las tablas, manteniendo un margen visible respecto de sus bordes.
2. Reduce los huecos sobrantes entre grupos, conservando una separación que permita distinguirlos.
3. Ajusta las salidas y giros para acompañar ese desplazamiento; no traslades solo el tramo vertical y dejes curvas forzadas en los extremos.
4. Revisa el ancho total y el espacio disponible para procesos futuros.
5. Comprueba otra vez las etiquetas y las llegadas: la compactación no debe concentrar lo que acabas de separar.

No persigas una reducción máxima del ancho si empeora la lectura. Buscamos aprovechar el espacio, con grupos distinguibles y curvas de recorrido natural.

## 8. Qué hacer con los cruces

El objetivo principal es que las flechas de un grupo puedan seguirse y no se crucen entre sí. Reordena carriles y anclajes antes de agregar rodeos cada vez más grandes.

Los cruces entre grupos de procesos distintos pueden permanecer cuando comparten tablas y deben alcanzar corredores diferentes. Procura reducirlos y que las curvas se crucen con direcciones claramente distintas, evitando largos tramos casi superpuestos. No introduzcas un quiebre brusco para conseguirlo.

Si despejar una zona exige modificar varios grupos, no prometas resolverla cambiando una sola curva. Revisa el conjunto dentro del alcance autorizado o explica qué ajuste conjunto haría falta.

No declares «sin cruces» cuando solo comprobaste que no hay cruces dentro del grupo ajustado. Distingue cruces internos, cruces entre grupos y cercanía sin intersección.

## 9. Aplicar y comprobar en Trazo

1. Guarda una referencia de la geometría, los anclajes y los ajustes de rótulos actuales. Conserva los identificadores reales de los flujos.
2. Si una zona es densa, compara variantes antes de editar: corredor interior o exterior, orden de carriles, amplitud del giro y puntos de llegada. No basta con cambiar apenas la curva si el problema está en el recorrido completo.
3. Aplica el ajuste al grupo solicitado, usando la revisión vigente del proyecto cuando la API lo permita.
4. Relee el resultado guardado. Cambiar anclajes puede hacer que el editor recalcule posiciones o controles relativos; verifica la geometría efectiva, no solo los argumentos que enviaste.
5. Comprueba separación, regularidad y cruces en todo el grupo y con sus vecinos. Si hay herramientas geométricas, las curvas pueden muestrearse como segmentos para comparar variantes, con una tolerancia declarada. La medición es aproximada y no sustituye la inspección visual de rótulos y puntas.
6. Confirma que no cambió ningún texto, extremo lógico, dirección o marca. Comprueba también la curva de referencia y los rótulos que debían conservarse.
7. Revisa visualmente el lienzo si tienes acceso. Si solo verificaste geometría y datos, informa ese límite sin afirmar que viste el resultado.

No copies coordenadas, identificadores ni revisiones de otro proyecto. Consulta el contrato de las herramientas disponibles; esta guía define el criterio de ordenación, no una API fija.

## 10. Cierre de un ajuste

Informa brevemente qué grupo acomodaste, qué conservaste y qué comprobaste. Si aportas una medida, identifica el tramo, la unidad del lienzo y si es una estimación geométrica. No prometas un porcentaje de mejora sin haberlo medido.

Cuando el usuario pida actualizar el contexto, registra la referencia aprobada, el corredor elegido, los anclajes protegidos y quién acomoda los rótulos en la [plantilla del proyecto](CONTEXTO_DFD_PLANTILLA.md). No conviertas cada coordenada provisional en una regla permanente.
