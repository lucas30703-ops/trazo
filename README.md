# Trazo

Trazo es un editor local en español para dibujar DFD de análisis y de diseño, visualizar esquemas MySQL y generar redes PERT. Guarda los proyectos y sus versiones recuperables en esta PC. Desde el editor podés descargar una copia editable o exportar los diagramas.

## Abrir en Windows

Descargá el paquete portable para Windows x64, extraelo completo en una carpeta donde puedas escribir y abrí **Abrir Trazo.cmd**. Trazo abre el editor en el navegador en `http://127.0.0.1:47822/`. El paquete incluye Node.js. El servidor local queda abierto en su ventana mientras usás el editor.

Para cerrar, esperá **Guardado en esta PC**, cerrá las pestañas y detené el servidor con Ctrl+C. Los proyectos se guardan en `datos/`, junto al lanzador. Para respaldar esa biblioteca, copiá `datos/` con Trazo cerrado. Para llevar un proyecto a otra instalación, usá **Descargar copia editable** e importá el archivo desde el modo correspondiente.

## Compilar desde el código

Usá Node.js 24 LTS y pnpm 11.25.0. Desde la raíz del código fuente, ejecutá:

```sh
pnpm install --frozen-lockfile --ignore-scripts --node-linker=hoisted
pnpm build
pnpm start
```

Si el navegador no se abre, usá la dirección que muestra la terminal. Volvé a ejecutar `pnpm build` después de cambiar el código. La distribución empaquetada se prepara para Windows x64. Quien adapte el proyecto a otro sistema puede partir del mismo código y de estas instrucciones.

### Generar el ZIP de Windows

Desde Windows x64, descargá el [ZIP oficial de Node.js 24.22.3 para Windows x64](https://nodejs.org/dist/v24.22.3/node-v24.22.3-win-x64.zip). Después de compilar, pasá la ruta de ese ZIP a `pnpm package:windows`.

```powershell
pnpm package:windows 'C:\Descargas\node-v24.22.3-win-x64.zip'
```

El script verifica el SHA-256 del runtime y escribe el paquete en `.build/releases/`.

## MCP y guía de DFD

El [MCP local de Trazo](mcp/README.md) permite que un cliente compatible lea y edite **DFD de diseño**. Su instalación es opcional.

La [guía de DFD de diseño para IA](docs/trazo-ia/README.md) incluye el método, ejemplos completos, criterios para ordenar los flujos del nivel 1 y una plantilla para registrar los acuerdos del proyecto.

## Licencia

Trazo se distribuye bajo [PolyForm Noncommercial 1.0.0](LICENSE). La licencia permite usar, modificar y compartir Trazo para fines no comerciales según sus términos. Los [componentes de terceros](licencias/README.md) conservan sus propias licencias.
