# Trazo: documentación para trabajar con una IA

Este paquete enseña el método de **DFD de diseño** utilizado para construir diagramas por pantallas, descomponerlos y redactar sus especificaciones. Se puede copiar junto con Trazo y utilizar con una IA que tenga acceso a estos archivos.

El método tiene convenciones propias de una cátedra. No pretende definir las reglas universales de todos los DFD ni las de un DFD de análisis. La IA debe seguir este método cuando el usuario lo elija, sin sustituirlo por otra notación.

## Empezar

1. Conserva esta carpeta completa para que funcionen sus enlaces.
2. Entrega a tu IA [AGENTS.md](AGENTS.md), la [guía](GUIA_DFD_DISENO.md) y los [ejemplos](EJEMPLOS.md), o permítele leerlos desde tu proyecto.
3. Copia [CONTEXTO_DFD_PLANTILLA.md](CONTEXTO_DFD_PLANTILLA.md) a un archivo de trabajo, por ejemplo `CONTEXTO_DFD.md`. Ese archivo guardará los acuerdos de tu proyecto; no hace falta completar toda la plantilla antes de empezar.
4. Facilita el esquema real de la base de datos y el código de las pantallas que quieras analizar. Si ya existen diagramas, facilita también su lectura mediante Trazo o un archivo exportado.
5. Usa el siguiente mensaje inicial y señala la primera pantalla.

```text
Vamos a elaborar el DFD de diseño de mi sistema con el método de esta carpeta.
Lee AGENTS.md, GUIA_DFD_DISENO.md, EJEMPLOS.md y, si existe, CONTEXTO_DFD.md.
Sigue este método, incluidos sus patrones de flujos y su criterio de descomposición.
Para ordenar visualmente el nivel 1, lee también ORDEN_FLUJOS_NIVEL_1.md.

Yo definiré qué considero una pantalla y qué quiero incluir. Lee el código y el
esquema antes de afirmar cómo funciona una consulta. Ayúdame a seguir la lógica:
qué dato tenemos, qué buscamos con él y qué información obtenemos después.

Cuando pida flujos, entrega una sola tabla completa en pasos lógicos, con desde,
hacia, flujo exacto y marca de la punta. Cuando pida revisar, analiza sin editar.
Actualiza el archivo de acuerdos únicamente cuando yo te lo solicite.

Empezaremos por la pantalla: [nombre].
El código y el esquema están en: [ubicación o archivos adjuntos].
Los diagramas existentes están en: [Trazo, exportación o imágenes].
```

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Instrucciones de entrada para la IA y orden de lectura. |
| [GUIA_DFD_DISENO.md](GUIA_DFD_DISENO.md) | Reglas completas, flujo de trabajo, uso de Trazo, auditoría y redacción. |
| [EJEMPLOS.md](EJEMPLOS.md) | Un ABM completo, búsquedas sucesivas, alternativa con JOIN y errores frecuentes. |
| [ORDEN_FLUJOS_NIVEL_1.md](ORDEN_FLUJOS_NIVEL_1.md) | Cómo agrupar curvas, repartir conexiones, aprovechar ambos lados de las tablas y conservar los rótulos. |
| [CONTEXTO_DFD_PLANTILLA.md](CONTEXTO_DFD_PLANTILLA.md) | Memoria de cada proyecto: esquema, acuerdos, jerarquía y trabajo pendiente. |

## Incluirlo en una distribución

Distribuye esta carpeta como documentación de Trazo y enlaza este README desde la ayuda o las instrucciones de instalación. El paquete es independiente de un proveedor de IA y no necesita datos de una aplicación concreta.

Un archivo llamado `AGENTS.md` no garantiza que todas las IA lo carguen automáticamente. Algunas herramientas lo detectan en determinadas carpetas; otras requieren que el usuario lo adjunte o que la integración lo exponga. Este paquete aporta el contenido que deben leer; no implementa esa integración.

Si el proyecto del usuario ya tiene un `AGENTS.md`, conserva sus instrucciones y añade una referencia a esta carpeta. No lo reemplaces. Para herramientas con otro archivo de instrucciones, utiliza un enlace equivalente.

## Alcance

La guía permite proponer, explicar y revisar diagramas y especificaciones. El acceso directo al editor depende de las herramientas disponibles en cada instalación de Trazo y de la autorización del usuario.

Los ejemplos son didácticos y autocontenidos. Sus tablas, consultas y permisos no son requisitos para otros sistemas. El registro de acuerdos de cada proyecto permite aplicar el mismo método sin inventar su funcionamiento.
