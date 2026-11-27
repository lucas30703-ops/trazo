# Instrucciones para la IA: método de DFD de diseño de Trazo

## Lectura y autoridad

1. Lee [GUIA_DFD_DISENO.md](GUIA_DFD_DISENO.md).
2. Revisa [EJEMPLOS.md](EJEMPLOS.md) antes de proponer los primeros flujos.
3. Lee el contexto del proyecto si existe. Para crearlo, utiliza [CONTEXTO_DFD_PLANTILLA.md](CONTEXTO_DFD_PLANTILLA.md).
4. Consulta el esquema y el código reales de la pantalla afectada. Los ejemplos de este paquete no sustituyen esa evidencia.
5. Para acomodar visualmente el nivel 1, lee [ORDEN_FLUJOS_NIVEL_1.md](ORDEN_FLUJOS_NIVEL_1.md). Trabaja por grupos de curvas, con corredores interiores o exteriores, tramos paralelos y llegadas ordenadas. Conserva la referencia y los rótulos que el usuario haya protegido.

Aplica este perfil cuando el usuario solicite nuestro método de DFD de diseño. Prevalecen sus instrucciones y las convenciones específicas de su docente, seguidas por los acuerdos vigentes del proyecto. Las reglas genéricas de otras notaciones no deben reemplazar este perfil. Si se pide DFD de análisis, no supongas que sus reglas son las mismas: solicita o consulta la convención correspondiente.

## Reglas que debes conservar

- Trabaja por pantallas definidas por el usuario. Los elementos son pantallas, procesos y tablas.
- Conecta pantalla con proceso y tabla con proceso, según la operación. No conectes procesos entre sí.
- Sigue el origen y el uso de cada dato. La pantalla conserva lo consultado y proporciona los criterios de la búsqueda siguiente.
- Usa nombres exactos de tablas y campos. Respeta los sufijos reales, incluido `_h` cuando exista.
- Consulta: `P_campo` desde pantalla, `R_tabla` desde tabla y `P_R_tabla` de vuelta a pantalla.
- Alta: `P_R_tabla` desde pantalla y `R_tabla` hacia tabla; sin retorno de registro ni de clave generada.
- Modificación: clave y campos concretos desde pantalla; los mismos sin `P_` hacia tabla; sin retorno a pantalla.
- Baja física: clave desde pantalla y clave hacia tabla; sin retorno a pantalla.
- `R_tabla` generaliza los registros involucrados; no significa toda la tabla ni exige `SELECT *`.
- `P_` también puede representar sesión, selección o criterios preparados por el programa. No inventes parámetros para completar una flecha.
- Descompón hasta que cada proceso final represente una sentencia SQL. Un JOIN sigue siendo una sentencia; una transacción con varias sentencias no lo es.
- Usa como máximo cinco procesos por especificación. No fuerces niveles ni subdivisiones innecesarias.
- Conserva nombres, direcciones y extremos externos entre padre e hijos. Un flujo puede repetirse en varios hijos.
- Solo en procesos finales: punta con raya para alta hacia tabla y con X para baja física hacia tabla. Consultas y modificaciones usan punta normal.
- No dupliques árboles por rol si comparten consultas. Explica sus condiciones sin inventar un campo `alcance`.
- Usa nombres cortos: «Buscar…», «Consultar…», «Alta de…», «Baja de…», «Modificación de…».

## Forma de colaborar

Responde en español salvo que se solicite otro idioma. Sé breve al conversar y completo al entregar un conjunto de flujos.

Cuando se pidan flujos, entrega **una sola tabla en orden lógico** con paso, especificación o proceso, desde, hacia, flujo exacto y marca. Explica qué dato permite continuar cuando no sea evidente. Los números jerárquicos no son el orden de ejecución.

Una revisión autoriza lectura y análisis. Una petición de pasos autoriza instrucciones. Edita el diagrama o el escrito cuando el usuario lo pida; conserva su estilo y el trabajo ajeno.

Actualiza el contexto Markdown solo por pedido explícito del usuario. Una hipótesis no se convierte en acuerdo por haber sido mencionada. No reabras decisiones aceptadas sin evidencia de un problema real.

No afirmes que leíste código, diagramas o documentos que no pudiste consultar. No presentes una propuesta de SQL como una transcripción del código. No afirmes que el docente aprobó más de lo que el usuario confirmó.

Antes de dar por correcto un diagrama, aplica la auditoría de la guía. Si solo viste una imagen parcial, limita la conclusión a lo visible. No ejecutes consultas ni modifiques la aplicación por estar preparando su DFD.
