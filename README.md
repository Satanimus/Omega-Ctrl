# Omega Ctrl

Omega Ctrl es una aplicación de escritorio para Windows (Tauri + Rust) que permite remapear teclado y mouse, crear macros, menús flotantes y un portapapeles ampliado, todo organizado en **perfiles** que podés activar/desactivar y personalizar por aplicación.

![Captura general de la ventana principal](docs/screenshots/main.png)

## Características

- **Acciones especiales por fila**: una fila puede disparar:
- 🔠**Remapeo de teclado y mouse**: reasigná cualquier tecla o botón a otra tecla, combinación, o acción especial, con condición Simple / Mantenido / Turbo.
- 🧩**Macro** (grabación y reproducción de secuencias de teclado/mouse).
- 📂**Abrir archivo o aplicación** (con modo de ventana, instancias, o argumento personalizado).
- 🎵**Multimedia** (control de reproducción, volumen, etc.), con alcance global o solo dentro de la app activa.
- ⚡**Menú Express**: un menú flotente radial o en cuadrícula con botones propios, cada uno ejecutando su propia acción.
- 📋**Portapapeles ampliado**: pool de elementos copiados (texto/imagen), fijables y con límite configurable.
- **Perfiles**: cada perfil es un conjunto independiente de remapeos. Se pueden crear, clonar, renombrar, eliminar y activar en cualquier momento desde el panel lateral o la bandeja del sistema.
- **Restricción por aplicación**: cada fila puede limitarse a una app específica (por ejecutable) o aplicar de forma global.
- **Apariencia personalizable**: colores, opacidades y tamaños configurables por variable, con soporte de temas guardables/cargables.
- **Bandeja del sistema**: minimizar a bandeja, mostrar/ocultar ventana, cambiar de perfil desde el menú contextual del ícono.
- **Dos motores de captura de entrada**:
  - **Interception** (requiere instalar el driver [Interception](http://www.oblita.com/interception)): más bajo nivel.
  - **Simple** (hooks nativos de WinAPI): no requiere instalar nada aparte, pensado para uso portable.

## Capturas de pantalla

![Editor de fila / Barra lateral de ayuda](docs/screenshots/selector_ayuda.png)

![Portapapeles con visor imagenes / Menú Express](docs/screenshots/portapapeles_menu.png)

![Selector y editor de temas](docs/screenshots/temas.png)

![Ventana de Configuración — Opciones](docs/screenshots/opciones.png)

![Editor de Macros](docs/screenshots/macros.png)

![Gestor de Coordenadas](docs/screenshots/coordenadas.png)

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

## ⚠️ Limitaciones conocidas

1- ⚠️ Modo Simple (Portable): si usás el Administrador de tareas, ejecutá OmegaCtrl como administrador

En Modo Portable, mientras el Administrador de tareas de Windows esté en primer plano, los clicks pueden dejar de responder en cualquier otra ventana (se soluciona haciendo Alt+Tab). Es una limitación de Windows, no un bug

## Licencia

_(agregar licencia)_
