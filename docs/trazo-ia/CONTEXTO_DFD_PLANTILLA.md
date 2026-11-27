# Contexto del DFD: [nombre del proyecto]

Plantilla para copiar y completar. No es un diagrama ni una especificación académica. Actualizar el archivo de trabajo únicamente cuando el usuario lo solicite. Las secciones sin información permanecen como pendientes, no como decisiones implícitas.

## Punto de entrada

- Método elegido: DFD de diseño de Trazo, según `GUIA_DFD_DISENO.md`.
- Idioma de trabajo: [idioma].
- Usuario dibuja / IA edita: [acuerdo vigente; por defecto, revisión sin edición].
- Proyecto y diagramas: [nombre y medio de acceso, sin credenciales].
- Última actualización solicitada por el usuario: [fecha].
- Próxima tarea: [pantalla, proceso o revisión].

## Fuentes verificadas

| Fuente | Ubicación o referencia | Qué se verificó | Fecha o versión |
| --- | --- | --- | --- |
| Esquema | [archivo] | [tablas y relaciones] | [versión] |
| Código | [archivo / función] | [pantalla y operaciones] | [versión] |
| Diagramas | [proyecto / diagrama] | [alcance leído] | [revisión] |
| Especificaciones | [documento] | [secciones vigentes] | [versión] |

No afirmar sincronización entre esquema, código publicado y copia local sin evidencia. Registrar solo los datos técnicos necesarios para continuar; no guardar contraseñas, tokens ni datos personales de prueba.

## Pantallas y alcance

| Pantalla | Qué incluye | Qué queda fuera | Roles y condiciones relevantes |
| --- | --- | --- | --- |
| [nombre] | [funciones] | [límites acordados] | [condiciones verificadas] |

## Esquema necesario

| Tabla | Clave primaria | Claves foráneas y destinos | Otros campos usados |
| --- | --- | --- | --- |
| [nombre exacto] | [campo] | [campo → tabla.campo] | [campos exactos] |

## Procedencia y uso de los datos

| Dato inicial o registro obtenido | Procedencia | Criterio siguiente | Uso |
| --- | --- | --- | --- |
| [dato] | [sesión / entrada / tabla.campo] | [P_campo de destino] | [mostrar / buscar / decidir / escribir] |

Anotar cómo se conserva el dato en pantalla. No confundir un dato de sesión con un valor que la persona debe escribir. No añadir una flecha entre procesos.

## Acuerdos vigentes

| Tema | Decisión aceptada | Alcance | Confirmación |
| --- | --- | --- | --- |
| Notación | [solo si hay una precisión respecto de la guía] | [procesos] | [usuario / docente y fecha] |
| Consultas | [sucesivas / JOIN autorizado para casos concretos] | [procesos] | [confirmación] |
| Filtros | [SQL / vista / criterios opcionales] | [pantallas] | [confirmación] |
| Comprobaciones técnicas | [qué se representa y qué se omite] | [procesos] | [confirmación] |
| Visibilidad y acciones | [reglas verificadas] | [roles y pantallas] | [fuente] |

No completar automáticamente las reglas de un proyecto con las de los ejemplos. Distinguir poder consultar de poder modificar, aprobar o eliminar.

## Excepciones y correspondencia con el código

| Proceso | Regla particular acordada | Correspondencia real | Límite de la excepción |
| --- | --- | --- | --- |
| [número] | [decisión] | [sentencias o comportamiento verificado] | [dónde no se aplica] |

Este registro conserva decisiones técnicas; la especificación académica describe el diseño vigente sin incluir el historial de cambios.

## Jerarquía vigente

```text
[número y nombre del proceso raíz]
  [número y nombre de hijo] [final / agrupador]
    [descendiente si corresponde]
```

| Proceso final | Operación | Tabla o tablas | Criterio / escritura | Marca hacia tabla |
| --- | --- | --- | --- | --- |
| [número y nombre] | [consulta / alta / modificación / baja] | [tablas] | [campos exactos] | [normal / raya / X] |

## Contratos entre niveles

| Proceso padre | Extremo externo | Dirección respecto del proceso | Datos exactos |
| --- | --- | --- | --- |
| [número] | [pantalla o tabla] | [entrada / salida] | [etiquetas de flujo] |

Comparar esta frontera con la unión de sus hijos. Una etiqueta compartida puede repetirse; una nueva entrada independiente debe estar prevista también en los padres afectados.

## Especificaciones escritas

- Documento vigente: [referencia].
- Hojas incluidas: [números].
- Formato: [sangrías, títulos y vocabulario del docente].
- Aprobación docente informada: [qué se aprobó exactamente o «sin confirmar»].
- Pendiente de incorporar: [procesos].

## Organización visual del nivel 1

- Curva o grupo aprobado como referencia: [proceso y flujo; indicar si debe conservarse intacto].
- Grupos interiores y exteriores: [qué proceso utiliza cada corredor].
- Anclajes que se conservan / se pueden redistribuir: [alcance acordado].
- Rótulos: [los acomoda el usuario / la IA; ajustes protegidos].
- Colores por proceso: [paleta vigente, si se utiliza].
- Separación y ancho: [criterios o referencias útiles; sin convertir medidas provisionales en reglas universales].
- Cruces pendientes: [internos o entre grupos; alcance de la última comprobación].

## Última revisión

- Fecha y revisión de los diagramas: [datos].
- Alcance leído: [diagramas y niveles].
- Comprobaciones: [lógica, campos, balance, hojas SQL, marcas y escrito].
- Hallazgos: [problemas concretos o ausencia dentro del alcance leído].
- Limitaciones: [capturas parciales, falta de código u otras].
- Ediciones realizadas: [ninguna / cambios autorizados].

## Pendientes y propuestas no aceptadas

| Tema | Qué falta resolver | Qué puede continuar sin esa decisión |
| --- | --- | --- |
| [tema] | [pregunta concreta] | [trabajo independiente] |

## Criterios retirados

| Criterio anterior | Criterio vigente | Motivo o acuerdo |
| --- | --- | --- |
| [solo decisiones que puedan causar confusión] | [reemplazo] | [referencia] |

Conservar aquí solo lo necesario para evitar regresiones. No convertir cada razonamiento provisional del chat en una regla del proyecto.
