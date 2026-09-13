# Omega Ctrl

Omega Ctrl es una aplicación de escritorio para Windows (Tauri + Rust) que permite remapear teclado y mouse, crear macros, menús flotantes y un portapapeles ampliado, todo organizado en **perfiles** que podés activar/desactivar y personalizar por aplicación.

![Captura general de la ventana principal](docs/screenshots/main.png)
> **Captura 1 — Ventana principal.** Debe verse la tabla principal de remapeos con varias filas cargadas (con sus columnas de App, Trigger, Tipo, Acción y Extra visibles), el toolbar superior con el nombre del perfil activo y el indicador de estado (activo/inactivo), y el panel lateral de perfiles a la izquierda con al menos 2-3 perfiles listados.

## Características

- **Remapeo de teclado y mouse**: reasigná cualquier tecla o botón a otra tecla, combinación, o acción especial, con condición Simple / Mantenido / Turbo.
- **Acciones especiales por fila**: además de remapear tecla↔tecla, una fila puede disparar:
  - **Macro** (grabación y reproducción de secuencias de teclado/mouse).
  - **Abrir archivo o aplicación** (con modo de ventana, instancias, o argumento personalizado).
  - **Multimedia** (control de reproducción, volumen, etc.), con alcance global o solo dentro de la app activa.
  - **Menú Express**: un menú flotente radial o en cuadrícula con botones propios, cada uno ejecutando su propia acción.
  - **Portapapeles ampliado**: pool de elementos copiados (texto/imagen), fijables y con límite configurable.
- **Perfiles**: cada perfil es un conjunto independiente de remapeos. Se pueden crear, clonar, renombrar, eliminar y activar en cualquier momento desde el panel lateral o la bandeja del sistema.
- **Restricción por aplicación**: cada fila puede limitarse a una app específica (por ejecutable) o aplicar de forma global.
- **Apariencia personalizable**: colores, opacidades y tamaños configurables por variable, con soporte de temas guardables/cargables.
- **Bandeja del sistema**: minimizar a bandeja, mostrar/ocultar ventana, cambiar de perfil desde el menú contextual del ícono.
- **Dos motores de captura de entrada**:
  - **Interception** (requiere instalar el driver [Interception](http://www.oblita.com/interception)): más bajo nivel.
  - **Portable** (hooks nativos de WinAPI): no requiere instalar nada aparte, pensado para uso portable.

## Capturas de pantalla

![Panel lateral de perfiles](docs/screenshots/perfiles.png)
> **Captura 2 — Panel lateral de perfiles.** Debe verse la lista de perfiles con el perfil activo resaltado/marcado, y el menú (clic derecho o botón "+") con las opciones de crear, clonar, renombrar y eliminar visibles.

![Editor de fila / trigger](docs/screenshots/editor_fila.png)
> **Captura 3 — Edición de una fila.** Debe verse el popup o selector abierto donde se captura una tecla/combinación (trigger) y se elige el tipo de acción (Tecla/Mouse, Macro, Abrir, Multimedia, Menú Express o Portapapeles), idealmente con el popup de captura de tecla en pantalla mostrando una combinación con modificador (ej. Ctrl+Alt+K).

![Menú Express en uso](docs/screenshots/menu_express.png)
> **Captura 4 — Menú Express.** Debe verse un Menú Express real, flotando sobre el escritorio (fondo semi-transparente), con varios botones dentro (mínimo 4-6), en su forma radial o en cuadrícula.

![Ventana de Configuración — pestaña Apariencia](docs/screenshots/configuracion_apariencia.png)
> **Captura 5 — Configuración → Apariencia.** Debe verse la tabla de variables de color/tamaño con al menos una fila con "Valor personalizado" distinto del valor por defecto (para mostrar que la personalización funciona), el selector de tema arriba, y los botones "Restablecer esta pestaña" / "Cancelar cambios" / "Aplicar cambios" abajo.

![Ventana de Configuración — pestaña General](docs/screenshots/configuracion_general.png)
> **Captura 6 — Configuración → General.** Debe verse "Iniciar con Windows", "Iniciar minimizado", "Mostrar/Minimizar a bandeja de sistema" e "Iniciar con perfil" con algún valor ya configurado (no todos en default), para que se entienda qué hace cada opción.

![Portapapeles ampliado](docs/screenshots/portapapeles.png)
> **Captura 7 — Ventana de Portapapeles.** Debe verse la ventana flotante del Portapapeles con varios elementos en el pool (texto e imagen si es posible), y al menos uno marcado como fijado, para diferenciarlo visualmente de los rotativos.

## Requisitos

- Windows 10/11.
- [Node.js](https://nodejs.org/) (LTS reciente).
- [Rust](https://www.rust-lang.org/tools/install) + toolchain de compilación de Tauri (ver [prerrequisitos de Tauri](https://tauri.app/start/prerequisites/)).
- Opcional: driver [Interception](http://www.oblita.com/interception) si querés usar el motor Interception en vez del modo Portable.

## Desarrollo

Clonar el repositorio e instalar dependencias:

```bash
npm install
```

Levantar en modo desarrollo (hot-reload de frontend + backend Rust):

```bash
npm run tauri dev
```

Generar el build de producción (empaqueta el frontend estático, no depende de un servidor de desarrollo):

```bash
npm run tauri build
```

> El ejecutable generado por `tauri dev` (en `src-tauri/target/debug/`) apunta al servidor de desarrollo de Vite y **no funciona de forma standalone** (por ejemplo, al iniciarlo junto con Windows) — para eso usá el build de `tauri build`.

## Estructura del proyecto

- `src/` — frontend (TypeScript, sin framework), organizado por ventana (`ventanas/`), componentes reutilizables (`componentes/`) y lógica de UI/estado (`core/`, `ui/`).
- `src-tauri/src/` — backend Rust: captura de entrada (`entrada.rs`, `back_interception.rs`, `back_windows.rs`), perfiles (`perfil.rs`, `perfil_json.rs`), compilación de remapeos a caché (`compilador.rs`, `cache.rs`), y una ventana/feature por archivo `back_*.rs` (menú express, portapapeles, bandeja, notificaciones, etc.).
- Cada ventana tiene su propio `.html` en la raíz (`index.html`, `configuracion.html`, `menu_express.html`, `portapapeles.html`, `coordenadas.html`, `captura.html`, `indicador_macro.html`, `notificacion.html`).

## Licencia

_(agregar licencia)_
