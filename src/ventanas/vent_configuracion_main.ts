// ======================================================
// ⚙️ vent_configuracion_Main
// ------------------------------------------------------
// Punto de entrada de la Ventana de Configuración
// (configuracion.html — página independiente, ver
// vite.config.ts).
//
// General/Teclas comparten la misma mecánica (tabla de 3
// columnas, editar marca en verde, "Aplicar cambios" valida
// y manda un lote, "Restablecer esta pestaña" borra los
// overrides) armada una sola vez en crearPestanaEditable().
// Apariencia y Tema usan en cambio crearPestanaApariencia()
// (árbol Título/Subtítulo/Elemento, ver vent_configuracion_apariencia.ts)
// sobre el mismo catálogo de apariencia.tsv, cada una mostrando
// un subconjunto de Títulos distinto:
//
// • General     → configuracion_listar_general() / _guardar_lote
//   (catálogo de config.rs, ver configuracion_usuario.rs).
// • Teclas      → configuracion_listar_teclas() / _guardar_lote_teclas
//   (catálogo de pulsadores.tsv, agrupado en subtítulos acá
//   mismo — ver categorizarTecla()).
// • Apariencia  → Texto + Dimensiones, con selector de Escala general.
// • Tema        → Color de tema + Color de Texto + Color y opacidad
//   de elementos + Opacidad (indicadores Macro/Coordenada), con el
//   selector Cargar/Guardar/Renombrar/Eliminar tema.
// ======================================================

import { invoke } from "@tauri-apps/api/core";

import {
  crearContenedorPopup,
  mostrarPopup,
  ocultarPopup,
  actualizarContenidoPopup,
} from "../componentes/comp_popup_contenedor";

import {
  crearCapturadorAtajo,
  type AtajoCaptura,
} from "../componentes/comp_capturador";

import type { Entrada } from "../core/core_entrada";
import { triggerAHTML, triggerATexto } from "../core/core_trigger";

import { aplicarOverridesApariencia } from "../core/core_apariencia";
import { crearPestanaApariencia } from "./vent_configuracion_apariencia";
import { crearBoton } from "../componentes/comp_boton";
import {
  crearInterruptor,
  crearGrupoOpciones,
  crearFilaPopup,
} from "../componentes/comp_popup_grupo";

import "../styles/styl_variables.css";
import "../styles/styl_general.css";
import "../styles/styl_botones.css";
import "../styles/styl_layout.css";
import "../styles/styl_configuracion.css";

// La propia Ventana de Configuración también debe reflejar el
// tema personalizado mientras se lo edita (no solo el resto de
// ventanas de la app).
void aplicarOverridesApariencia();

// ======================================================
// 🧭 TIPOS COMPARTIDOS
// ======================================================

type TipoValorConfiguracion =
  | "numero"
  | "numero_par"
  | "texto"
  | "color"
  | "pixeles"
  | "porcentaje"
  | "trigger";

interface FilaConfiguracion {
  clave: string;

  nombreMostrado: string;

  // Subtítulo bajo el que agrupar esta fila (Teclas). null
  // = sin agrupar (General): no se insertan separadores.
  grupo: string | null;

  tipo: TipoValorConfiguracion;

  valorDefecto: string;

  valorPersonalizado: string | null;
}

export interface CambioConfiguracion {
  clave: string;
  valor: string;
}

export interface ErrorConfiguracion {
  clave: string;
  mensaje: string;
}

export interface ResultadoGuardado {
  errores: ErrorConfiguracion[];
}

interface FilaMontada {
  fila: FilaConfiguracion;
  tr: HTMLTableRowElement;

  // Valor personalizado actual (formateado igual que lo que viaja a
  // guardarLote — con sufijo "px"/"%" ya puesto, par "ancho,alto",
  // "mod,mod|gatillo" para trigger). Se actualiza desde el campo
  // dentro del popup Editar (ver botonPersonalizado, más abajo) en
  // vez de leerse de un <input> siempre presente en la fila.
  valorActual: string;

  // Botón fusionado Editar/Valor Personalizado (H11, mismo patrón
  // que vent_configuracion_apariencia.ts): "✎" cuando valorActual
  // coincide con valorDefecto, o el valor ya guardado en su lugar.
  botonPersonalizado: HTMLButtonElement;
}

// ======================================================
// 🏗️ ARMAR DOM BASE (pestañas + paneles)
// ======================================================

const raiz = document.getElementById("configuracion")!;

const card = document.createElement("div");
card.className = "configuracion-card";

const tabs = document.createElement("div");
tabs.className = "configuracion-tabs";

const tabGeneral = crearBotonTab("General", true);
const tabApariencia = crearBotonTab("Apariencia", false);
const tabTeclas = crearBotonTab("Teclas", false);
const tabAvanzado = crearBotonTab("Avanzado", false);

const botonCarpetaUsuario = document.createElement("button");
botonCarpetaUsuario.type = "button";
botonCarpetaUsuario.className = "configuracion-boton-carpeta";
botonCarpetaUsuario.title = "Abrir carpeta de usuario";
botonCarpetaUsuario.textContent = "📁";

botonCarpetaUsuario.addEventListener("click", async () => {
  try {
    await invoke("abrir_carpeta_usuario");
  } catch (error) {
    window.alert(`No se pudo abrir la carpeta de usuario: ${String(error)}`);
  }
});

tabs.append(
  tabGeneral,
  tabApariencia,
  tabTeclas,
  tabAvanzado,
  botonCarpetaUsuario,
);

const cuerpo = document.createElement("div");
cuerpo.className = "configuracion-cuerpo";

const panelGeneral = document.createElement("div");
panelGeneral.className = "configuracion-panel";

const panelApariencia = document.createElement("div");
panelApariencia.className = "configuracion-panel oculto";

const panelTeclas = document.createElement("div");
panelTeclas.className = "configuracion-panel oculto";

const panelAvanzado = document.createElement("div");
panelAvanzado.className = "configuracion-panel oculto";

cuerpo.append(panelGeneral, panelApariencia, panelTeclas, panelAvanzado);

card.append(tabs, cuerpo);
raiz.append(card);

// Capa de popups (crearContenedorPopup) — la ventana principal la monta
// en ui_layout.ts; esta ventana tiene su propio documento/módulo y
// necesita la suya propia, o mostrarPopup() (usado por el botón Editar
// de la pestaña Apariencia) no encuentra dónde montar el contenido y no
// hace nada.
raiz.append(crearContenedorPopup());

function crearBotonTab(texto: string, activa: boolean): HTMLButtonElement {
  const boton = document.createElement("button");

  boton.type = "button";

  boton.className = activa
    ? "configuracion-tab configuracion-tab-activa"
    : "configuracion-tab";

  boton.textContent = texto;

  return boton;
}

// ======================================================
// 🔀 CAMBIO DE PESTAÑA
// ======================================================

const paresTab: ReadonlyArray<readonly [HTMLButtonElement, HTMLDivElement]> = [
  [tabGeneral, panelGeneral],
  [tabApariencia, panelApariencia],
  [tabTeclas, panelTeclas],
  [tabAvanzado, panelAvanzado],
];

function activarTab(botonElegido: HTMLButtonElement): void {
  for (const [boton, panel] of paresTab) {
    const activa = boton === botonElegido;

    boton.classList.toggle("configuracion-tab-activa", activa);

    panel.classList.toggle("oculto", !activa);
  }
}

tabGeneral.addEventListener("click", () => activarTab(tabGeneral));
tabApariencia.addEventListener("click", () => activarTab(tabApariencia));
tabTeclas.addEventListener("click", () => activarTab(tabTeclas));
tabAvanzado.addEventListener("click", () => activarTab(tabAvanzado));

// ======================================================
// 🍞 TOAST (compartido por todas las pestañas)
// ======================================================

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function mostrarToast(texto: string): void {
  let toast = card.querySelector<HTMLDivElement>(".configuracion-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "configuracion-toast";
    card.append(toast);
  }

  toast.textContent = texto;
  toast.classList.add("configuracion-toast-visible");

  if (toastTimer !== null) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toast?.classList.remove("configuracion-toast-visible");
  }, 1500);
}

// ======================================================
// 🔤 FORMATEO / VALIDACIÓN (comparte General y Teclas)
// ======================================================

function formatearValor(tipo: TipoValorConfiguracion, valor: string): string {
  if (tipo === "numero_par") {
    const [ancho, alto] = valor.split(",");
    return `${(ancho ?? "").trim()} × ${(alto ?? "").trim()}`;
  }

  if (tipo === "trigger") {
    const atajo = parsearAtajoDesdeTexto(valor);

    return triggerATexto({ ...atajo, condicion: "simple" });
  }

  return valor;
}

// Espejo simple de validar_segun_tipo() / guardar_lote_pulsadores()
// en configuracion_usuario.rs — el backend siempre revalida por su
// cuenta; esto es solo para dar feedback inmediato sin ida y vuelta.
function validarValor(fila: FilaConfiguracion, valor: string): string | null {
  switch (fila.tipo) {
    case "numero": {
      if (!/^\d+$/.test(valor)) {
        return "Debe ser un número entero";
      }

      return null;
    }

    case "numero_par": {
      const partes = valor.split(",");

      if (
        partes.length !== 2 ||
        !partes.every((parte) => /^\d+$/.test(parte.trim()))
      ) {
        return "Deben ser dos números enteros separados por coma";
      }

      return null;
    }

    case "texto": {
      if (valor.trim().length === 0) {
        return "No puede estar vacío";
      }

      return null;
    }

    case "pixeles": {
      if (!/^\d+px$/.test(valor)) {
        return "Debe ser un tamaño en píxeles (ej. 16px)";
      }

      return null;
    }

    case "color": {
      if (!/^#[0-9a-fA-F]{6}$/.test(valor)) {
        return "Color inválido (formato #RRGGBB)";
      }

      return null;
    }

    case "porcentaje": {
      if (!/^\d{1,3}%$/.test(valor)) {
        return "Debe ser un porcentaje (ej. 45%)";
      }

      const numero = Number(valor.slice(0, -1));

      if (numero < 0 || numero > 100) {
        return "Debe ser un porcentaje entre 0% y 100%";
      }

      return null;
    }

    case "trigger": {
      // Espejo de AtajoSimple::desde_texto(): "mod,mod|gatillo",
      // separador '|' presente y gatillo no vacío. El capturador
      // (comp_capturador.ts) ya arma el texto en este formato, así
      // que esto solo protege contra un valorActual corrupto.
      const partes = valor.split("|");

      if (partes.length !== 2 || partes[1].trim().length === 0) {
        return "Atajo inválido";
      }

      return null;
    }
  }
}

function crearInputNumero(valorInicial: string): HTMLInputElement {
  const input = document.createElement("input");

  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.value = valorInicial;

  return input;
}

function crearInputColor(valorInicial: string): HTMLInputElement {
  const input = document.createElement("input");

  input.type = "color";
  input.value = valorInicial;

  return input;
}

function crearInputPorcentaje(valorInicial: string): HTMLInputElement {
  const input = document.createElement("input");

  input.type = "number";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  input.value = valorInicial;

  return input;
}

// ======================================================
// 🎚️ ATAJO ↔ TEXTO (espejo de AtajoSimple::a_texto() /
// desde_texto() en config.rs) — solo para fila.tipo === "trigger".
// ======================================================

function entradaDesdeTexto(texto: string): Entrada | null {
  const [fuente, codigo] = texto.split(":");

  if (!fuente || !codigo) {
    return null;
  }

  const tipo: Record<string, "Teclado" | "Mouse" | "Multimedia" | "Joystick"> =
    {
      keyboard: "Teclado",
      mouse: "Mouse",
      multimedia: "Multimedia",
      joystick: "Joystick",
    };

  return { tipo: tipo[fuente] ?? "Teclado", codigo, nombre: codigo };
}

function parsearAtajoDesdeTexto(texto: string): AtajoCaptura {
  const [modsTexto, gatilloTexto] = texto.split("|");

  const modificadores = (modsTexto ?? "")
    .split(",")
    .filter((entrada) => entrada.length > 0)
    .map(entradaDesdeTexto)
    .filter((entrada): entrada is Entrada => entrada !== null);

  const gatillo = gatilloTexto ? entradaDesdeTexto(gatilloTexto) : null;

  return { modificadores, gatillo };
}

function atajoATexto(atajo: AtajoCaptura): string {
  const fuente: Record<string, string> = {
    Teclado: "keyboard",
    Mouse: "mouse",
    Multimedia: "multimedia",
    Joystick: "joystick",
  };

  const mods = atajo.modificadores
    .map((entrada) => `${fuente[entrada.tipo]}:${entrada.codigo}`)
    .join(",");

  const gatillo = atajo.gatillo
    ? `${fuente[atajo.gatillo.tipo]}:${atajo.gatillo.codigo}`
    : "";

  return `${mods}|${gatillo}`;
}

// Refresca el botón fusionado Editar/Valor Personalizado (H11): "✎"
// vacío cuando valorActual coincide con valorDefecto (Regla: sin
// diff, no hay nada que mostrar aparte del lápiz — ver
// esPersonalizadoReal en vent_configuracion_apariencia.ts, mismo
// criterio acá), o el valor ya guardado en su lugar (swatch+texto
// para color, trigger-contenido para atajo, texto plano para el
// resto).
function actualizarBotonPersonalizado(
  boton: HTMLButtonElement,
  montada: Pick<FilaMontada, "fila" | "valorActual">,
): void {
  const { fila, valorActual } = montada;

  if (valorActual === fila.valorDefecto) {
    boton.textContent = "✎";
    return;
  }

  if (fila.tipo === "trigger") {
    const atajo = parsearAtajoDesdeTexto(valorActual);

    boton.innerHTML =
      atajo.gatillo !== null
        ? `<div class="trigger-contenido">${triggerAHTML({ ...atajo, condicion: "simple" })}</div>`
        : "✎";

    return;
  }

  boton.replaceChildren();

  if (fila.tipo === "color") {
    const swatch = document.createElement("span");
    swatch.className = "configuracion-arbol-swatch";
    swatch.style.backgroundColor = valorActual;

    boton.append(
      swatch,
      document.createTextNode(formatearValor(fila.tipo, valorActual)),
    );
  } else {
    boton.textContent = formatearValor(fila.tipo, valorActual);
  }
}

// Reemplaza el antiguo doble click en "Valor por defecto" (borraba
// directo, sin poder verse antes de soltar el botón): solo agrega/
// saca la clase que habilita mostrar el botón "X" (Limpiar) en hover
// de la columna Editar/Valor Personalizado — el botón mismo vive
// siempre en el DOM (ver montarFila) para que su posición no salte
// al aparecer.
function actualizarValorLimpiar(
  tdPersonalizado: HTMLElement,
  montada: Pick<FilaMontada, "fila" | "valorActual">,
): void {
  tdPersonalizado.classList.toggle(
    "configuracion-arbol-personalizado-celda--editado",
    montada.valorActual !== montada.fila.valorDefecto,
  );
}

// Campo de edición según tipo, montado dentro del popup que abre el
// botón fusionado (mismo criterio que crearCampoValor en
// vent_configuracion_apariencia.ts, pero una sola fila/valor por
// popup en vez de un grupo de hijos). Para "trigger" reusa el mismo
// Botón Capturador de la ventana principal (🚩 Capturar / Esperando.../
// atajo ya capturado, ver comp_capturador.ts::crearCapturadorAtajo).
function crearCampoValorGeneral(
  fila: FilaConfiguracion,
  valorActual: string,
  onCambiar: (valor: string) => void,
): HTMLElement {
  if (fila.tipo === "trigger") {
    return crearCapturadorAtajo(
      fila.clave as
        | "tecla_guardar_coordenada"
        | "tecla_toggle_perfil"
        | "tecla_grabar_macro",
      parsearAtajoDesdeTexto(valorActual),
      (atajo) => onCambiar(atajoATexto(atajo)),
    );
  }

  if (fila.tipo === "numero_par") {
    const [ancho, alto] = valorActual.split(",");

    const inputAncho = crearInputNumero((ancho ?? "").trim());
    const inputAlto = crearInputNumero((alto ?? "").trim());

    const emitir = (): void =>
      onCambiar(`${inputAncho.value.trim()},${inputAlto.value.trim()}`);

    inputAncho.addEventListener("input", emitir);
    inputAlto.addEventListener("input", emitir);

    const envoltorio = document.createElement("div");
    envoltorio.className = "configuracion-par";
    envoltorio.append(inputAncho, document.createTextNode("×"), inputAlto);

    return envoltorio;
  }

  if (fila.tipo === "pixeles") {
    const input = crearInputNumero(valorActual.replace(/px$/, ""));
    input.addEventListener("input", () => onCambiar(`${input.value.trim()}px`));
    return input;
  }

  if (fila.tipo === "porcentaje") {
    const input = crearInputPorcentaje(valorActual.replace(/%$/, ""));
    input.addEventListener("input", () => onCambiar(`${input.value.trim()}%`));
    return input;
  }

  if (fila.tipo === "color") {
    const input = crearInputColor(valorActual);
    input.addEventListener("input", () => onCambiar(input.value));
    return input;
  }

  if (fila.tipo === "numero") {
    const input = crearInputNumero(valorActual);
    input.addEventListener("input", () => onCambiar(input.value.trim()));
    return input;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.value = valorActual;
  input.addEventListener("input", () => onCambiar(input.value.trim()));
  return input;
}

// ======================================================
// 🏭 FÁBRICA DE PESTAÑA EDITABLE (tabla + acciones)
// ------------------------------------------------------
// Arma una tabla de 3 columnas con su estado (filas
// montadas/editadas), mensaje de error y botones "Guardar
// cambios" / "Restablecer esta pestaña" dentro de `panel`.
// Quien llama solo provee de dónde salen las filas y a qué
// comandos Tauri mandar guardado/restablecido — el resto
// (marcar verde al editar, marcar rojo al fallar validación,
// toast de confirmación) es idéntico para cualquier pestaña
// que lo use.
// ======================================================

interface OpcionesPestana {
  panel: HTMLDivElement;

  // Teclas no necesita la primera columna ("Tecla" — el nombre
  // interno, ej. "Enie"): con Nombre de fábrica + Nombre
  // personalizado alcanza para identificar la fila (ver
  // pestanaTeclas). Con 2 elementos, tdNombre no se crea/monta.
  encabezados: readonly [string, string] | readonly [string, string, string];

  cargarFilas: () => Promise<FilaConfiguracion[]>;

  guardarLote: (cambios: CambioConfiguracion[]) => Promise<ResultadoGuardado>;

  restablecer: () => Promise<void>;

  textoConfirmacionRestablecer: string;

  // Se llama después de un guardado o restablecido exitoso, además
  // del toast de confirmación (solo lo usa Apariencia, para pedirle
  // al backend que recargue el resto de ventanas y así se vea el
  // cambio — ver configuracion_refrescar_ventanas_apariencia).
  despuesDeAplicar?: () => Promise<void>;

  // Texto explicativo de la pestaña, mostrado debajo de la tabla con
  // estilo deshabilitado (ver .configuracion-nota-pestana).
  notaPestana?: string;
}

// Resultado de intentar juntar los cambios pendientes de una pestaña,
// sin aplicarlos todavía — usado por el botón Guardar global (ver
// bloque "BARRA DE ACCIONES GLOBAL") para validar TODAS las pestañas
// antes de guardar ninguna.
interface RecoleccionCambios {
  cambios: CambioConfiguracion[];
  erroresLocales: string[];
}

export interface Pestana {
  cargar: () => Promise<void>;

  // API usada por la barra de acciones global en vez de botones
  // propios de esta pestaña (ver "BARRA DE ACCIONES GLOBAL").
  hayEdicionesPendientes: () => boolean;
  validarYRecolectar: () => RecoleccionCambios;
  aplicarGuardado: (
    cambios: CambioConfiguracion[],
  ) => Promise<ResultadoGuardado>;
  marcarErroresGuardado: (errores: ErrorConfiguracion[]) => void;
  limpiarEstadoTrasGuardado: () => Promise<void>;
  restablecerPestana: () => Promise<void>;
  textoConfirmacionRestablecer: string;
}

function crearPestanaEditable(opciones: OpcionesPestana): Pestana {
  const {
    panel,
    encabezados,
    cargarFilas,
    guardarLote,
    restablecer,
    textoConfirmacionRestablecer,
    despuesDeAplicar,
    notaPestana,
  } = opciones;

  // ----------------------------------------------------
  // DOM propio de esta pestaña
  // ----------------------------------------------------

  const tabla = document.createElement("table");
  tabla.className = "configuracion-tabla";

  const thead = document.createElement("thead");
  const trEncabezado = document.createElement("tr");

  for (const texto of encabezados) {
    const th = document.createElement("th");
    th.textContent = texto;
    trEncabezado.append(th);
  }

  thead.append(trEncabezado);

  const tbody = document.createElement("tbody");

  tabla.append(thead, tbody);

  // La tabla en sí no scrollea (ver configuracion.css) — este
  // contenedor es el que tiene overflow-y y ocupa el espacio
  // disponible del panel, dejando que la tabla crezca a su altura
  // natural adentro.
  const scrollTabla = document.createElement("div");
  scrollTabla.className = "configuracion-tabla-scroll";
  scrollTabla.append(tabla);

  const mensajeError = document.createElement("div");
  mensajeError.className = "configuracion-error oculto";

  panel.append(scrollTabla, mensajeError);

  if (notaPestana) {
    const nota = document.createElement("p");
    nota.className = "configuracion-nota-pestana";
    nota.textContent = notaPestana;
    panel.append(nota);
  }

  // ----------------------------------------------------
  // Estado propio de esta pestaña
  // ----------------------------------------------------

  const filasMontadas = new Map<string, FilaMontada>();
  const filasEditadas = new Set<string>();

  function ocultarError(): void {
    mensajeError.classList.add("oculto");
    mensajeError.textContent = "";
  }

  function mostrarError(texto: string): void {
    mensajeError.textContent = texto;
    mensajeError.classList.remove("oculto");
  }

  function marcarEditando(clave: string, tr: HTMLTableRowElement): void {
    filasEditadas.add(clave);

    tr.classList.remove("configuracion-fila-error");
    tr.classList.add("configuracion-fila-editando");

    ocultarError();
  }

  function limpiarEstadoFilas(): void {
    for (const { tr } of filasMontadas.values()) {
      tr.classList.remove(
        "configuracion-fila-editando",
        "configuracion-fila-error",
      );
    }

    filasEditadas.clear();
  }

  // ----------------------------------------------------
  // Montar filas (+ separador de subtítulo si `grupo` cambia)
  // ----------------------------------------------------

  // Botón desplegable de la fila de Título/Subtítulo (General:
  // "Varios", "Tiempo (ms)"; Teclas: Letras, Números, etc.) — mismo
  // criterio que alternarExpandir() en vent_configuracion_apariencia.ts
  // (pestaña Tema): oculta/muestra las filas normales que siguen,
  // hasta la próxima fila de subtítulo o el final de la tabla. Opera
  // directo sobre el orden real del tbody (sin un índice paralelo)
  // porque acá, a diferencia del árbol de Tema, no hay una lista
  // FilaMontada[] en orden de montaje.
  function alternarExpandirSubtitulo(
    boton: HTMLButtonElement,
    tr: HTMLTableRowElement,
  ): void {
    const contraer = boton.textContent === "▾";

    boton.textContent = contraer ? "▸" : "▾";

    let hermano = tr.nextElementSibling;

    while (hermano && !hermano.classList.contains("configuracion-subtitulo")) {
      hermano.classList.toggle("oculta", contraer);
      hermano = hermano.nextElementSibling;
    }
  }

  // Estado de contraído del último subtítulo montado — arranca en
  // `true` (colapsado por defecto) y se usa para que montarFila()
  // oculte de entrada las filas que le siguen (ver cargar()).
  let ultimoSubtituloContraido = true;

  function montarFilaSubtitulo(texto: string): void {
    ultimoSubtituloContraido = true;

    const tr = document.createElement("tr");
    tr.className = "configuracion-subtitulo configuracion-fila-titulo";

    const td = document.createElement("td");
    td.colSpan = encabezados.length;

    const botonExpandir = document.createElement("button");
    botonExpandir.type = "button";
    botonExpandir.className = "configuracion-arbol-expandir";
    botonExpandir.textContent = "▸";

    const textoSpan = document.createElement("span");
    textoSpan.className = "configuracion-fila-titulo-texto";
    textoSpan.textContent = texto;

    td.append(botonExpandir, textoSpan);

    tr.append(td);

    // Toda la fila actúa como botón (no solo la flecha) — un único
    // listener en la fila cubre clicks en el botón, el texto o
    // cualquier otra parte (el click en el botón hace bubble hasta
    // acá, así que un segundo listener en botonExpandir dispararía
    // el toggle dos veces).
    tr.classList.add("configuracion-fila-titulo-clickeable");
    tr.addEventListener("click", () => {
      alternarExpandirSubtitulo(botonExpandir, tr);
    });

    tbody.append(tr);
  }

  // Solo General/Apariencia usan la columna "Nombre" (primera de
  // 3) — Teclas la omite (2 encabezados: Nombre de fábrica /
  // Nombre personalizado, ver pestanaTeclas).
  const mostrarColumnaNombre = encabezados.length === 3;

  function montarFila(fila: FilaConfiguracion): void {
    const tr = document.createElement("tr");

    const tdNombre = document.createElement("td");
    tdNombre.className = mostrarColumnaNombre
      ? "configuracion-celda configuracion-celda-primera configuracion-nombre"
      : "configuracion-celda configuracion-nombre";
    tdNombre.textContent = fila.nombreMostrado;

    const tdDefecto = document.createElement("td");
    tdDefecto.className = mostrarColumnaNombre
      ? "configuracion-celda configuracion-valor-defecto"
      : "configuracion-celda configuracion-celda-primera configuracion-valor-defecto";

    if (fila.tipo === "color") {
      const envoltorioSwatch = document.createElement("span");
      envoltorioSwatch.className = "configuracion-swatch-wrap";

      const swatch = document.createElement("span");
      swatch.className = "configuracion-swatch";
      swatch.style.backgroundColor = fila.valorDefecto;

      envoltorioSwatch.append(
        swatch,
        document.createTextNode(formatearValor(fila.tipo, fila.valorDefecto)),
      );

      tdDefecto.append(envoltorioSwatch);
    } else {
      tdDefecto.textContent = formatearValor(fila.tipo, fila.valorDefecto);
    }

    // Columna Editar/Valor Personalizado fusionada (mismo patrón que
    // vent_configuracion_apariencia.ts, H11): el botón "✎"/valor
    // ocupa el espacio disponible; el botón "X" (Limpiar) se agrega
    // al lado, ver más abajo.
    const tdPersonalizado = document.createElement("td");
    tdPersonalizado.className = "configuracion-arbol-personalizado-celda";

    const botonPersonalizado = document.createElement("button");
    botonPersonalizado.type = "button";
    botonPersonalizado.className = "configuracion-arbol-personalizado";

    // Botón "X" (Limpiar): reemplaza el antiguo doble click sobre
    // "Valor por defecto" (Regla: ya no se elimina el Valor
    // Personalizado a ciegas con un doble click, hace falta un botón
    // visible). Vive siempre en el DOM, oculto por CSS salvo hover +
    // fila editada (ver .configuracion-arbol-personalizado-celda--editado
    // en styl_configuracion.css) para que ocupe siempre la misma
    // posición a la derecha de la columna.
    const botonLimpiar = crearBoton({
      texto: "X",
      clase: "configuracion-valor-limpiar",
      titulo: "Limpiar",
    });
    botonLimpiar.classList.add("boton-peligro");

    tdPersonalizado.append(botonPersonalizado, botonLimpiar);

    const valorActual = fila.valorPersonalizado ?? fila.valorDefecto;

    // Fila montada real, referenciada por el click del botón fusionado
    // y por el click del botón "X" — se completa antes de armar el
    // contenido del botón porque ambos la necesitan por referencia
    // (no una copia).
    const montada: FilaMontada = {
      fila,
      tr,
      valorActual,
      botonPersonalizado,
    };

    actualizarBotonPersonalizado(botonPersonalizado, montada);
    actualizarValorLimpiar(tdPersonalizado, montada);

    // El botón fusionado (vacío=lápiz o con el Valor Personalizado ya
    // guardado) abre el mini popup sobre la fila; cualquier cambio
    // dentro del popup marca la fila como pendiente de guardar. Se
    // reabre igual estando vacío o con valor.
    botonPersonalizado.addEventListener("click", (evento) => {
      const campo = crearCampoValorGeneral(
        fila,
        montada.valorActual,
        (valor) => {
          montada.valorActual = valor;

          actualizarBotonPersonalizado(botonPersonalizado, montada);
          actualizarValorLimpiar(tdPersonalizado, montada);
          marcarEditando(fila.clave, tr);
        },
      );

      const popup = document.createElement("div");
      popup.className = "popup-editar-apariencia";
      popup.append(campo);

      mostrarPopup(popup, evento.clientX, evento.clientY);
    });

    // Botón "X" (reemplaza el antiguo doble click sobre "Valor por
    // defecto"): borra el Valor Personalizado de la fila,
    // restableciendo valorActual al valor por defecto.
    botonLimpiar.addEventListener("click", () => {
      montada.valorActual = fila.valorDefecto;

      actualizarBotonPersonalizado(botonPersonalizado, montada);
      actualizarValorLimpiar(tdPersonalizado, montada);
      marcarEditando(fila.clave, tr);
    });

    if (mostrarColumnaNombre) {
      tr.append(tdNombre);
    }

    tr.append(tdDefecto, tdPersonalizado);

    if (ultimoSubtituloContraido) {
      tr.classList.add("oculta");
    }

    tbody.append(tr);

    filasMontadas.set(fila.clave, montada);
  }

  // ----------------------------------------------------
  // Cargar (fábrica + overrides)
  // ----------------------------------------------------

  async function cargar(): Promise<void> {
    tbody.innerHTML = "";
    filasMontadas.clear();
    filasEditadas.clear();
    ocultarError();
    ultimoSubtituloContraido = false;

    let filas: FilaConfiguracion[];

    try {
      filas = await cargarFilas();
    } catch (error) {
      mostrarError(`No se pudo cargar: ${String(error)}`);
      return;
    }

    let ultimoGrupo: string | null = null;

    for (const fila of filas) {
      if (fila.grupo !== null && fila.grupo !== ultimoGrupo) {
        montarFilaSubtitulo(fila.grupo);
        ultimoGrupo = fila.grupo;
      }

      montarFila(fila);
    }
  }

  // ----------------------------------------------------
  // Aplicar cambios
  // ----------------------------------------------------

  // ----------------------------------------------------
  // Aplicar cambios (API para la barra global — ver
  // "BARRA DE ACCIONES GLOBAL")
  // ----------------------------------------------------

  function hayEdicionesPendientes(): boolean {
    return filasEditadas.size > 0;
  }

  // Valida y arma la lista de cambios de ESTA pestaña, sin aplicar
  // nada todavía — la barra global junta esto de las 4 pestañas antes
  // de guardar cualquiera (ver Aplicar cambios / errorConsulta P2).
  function validarYRecolectar(): RecoleccionCambios {
    ocultarError();

    const cambios: CambioConfiguracion[] = [];
    const erroresLocales: string[] = [];

    for (const clave of filasEditadas) {
      const montada = filasMontadas.get(clave);

      if (!montada) {
        continue;
      }

      const valor = montada.valorActual;
      const error = validarValor(montada.fila, valor);

      if (error) {
        montada.tr.classList.remove("configuracion-fila-editando");
        montada.tr.classList.add("configuracion-fila-error");

        erroresLocales.push(`${montada.fila.nombreMostrado}: ${error}`);

        continue;
      }

      cambios.push({ clave, valor });
    }

    if (erroresLocales.length > 0) {
      mostrarError(erroresLocales.join(" · "));
    }

    return { cambios, erroresLocales };
  }

  function marcarErroresGuardado(errores: ErrorConfiguracion[]): void {
    for (const error of errores) {
      const montada = filasMontadas.get(error.clave);

      if (montada) {
        montada.tr.classList.remove("configuracion-fila-editando");
        montada.tr.classList.add("configuracion-fila-error");
      }
    }

    mostrarError(
      errores
        .map((error) => {
          const nombre =
            filasMontadas.get(error.clave)?.fila.nombreMostrado ?? error.clave;

          return `${nombre}: ${error.mensaje}`;
        })
        .join(" · "),
    );
  }

  async function limpiarEstadoTrasGuardado(): Promise<void> {
    limpiarEstadoFilas();

    if (despuesDeAplicar) {
      await despuesDeAplicar();
    }
  }

  // ----------------------------------------------------
  // Restablecer esta pestaña (API para la barra global)
  // ----------------------------------------------------

  async function restablecerPestana(): Promise<void> {
    await restablecer();
    await cargar();

    if (despuesDeAplicar) {
      await despuesDeAplicar();
    }
  }

  return {
    cargar,
    hayEdicionesPendientes,
    validarYRecolectar,
    aplicarGuardado: guardarLote,
    marcarErroresGuardado,
    limpiarEstadoTrasGuardado,
    restablecerPestana,
    textoConfirmacionRestablecer,
  };
}

// ======================================================
// ⚙️ PESTAÑA GENERAL
// ======================================================

// Modelo tal cual lo entrega configuracion_listar_general (snake_case).
interface FilaGeneralCruda {
  clave: string;
  nombre_ui: string;
  tipo: string;
  valor_defecto: string;
  valor_personalizado: string | null;
  grupo: string;
}

// Claves de configuracion.tsv que se muestran en la pestaña
// Apariencia (tamaños de botón/texto de MenuExpress y Portapapeles)
// en vez de en General — mismo catálogo backend (config.rs /
// configuracion_listar_general), solo cambia dónde se ven y con qué
// subconjunto se restablece cada "Restablecer esta pestaña" (ver
// configuracion_restablecer_claves). Declarada acá porque General la
// usa para excluirlas de su tabla; Apariencia la importa más abajo.
const CLAVES_TAMANOS_EN_APARIENCIA: readonly string[] = [
  "menu_boton_pequeno",
  "menu_boton_mediano",
  "menu_boton_grande",
  "menu_texto_pequeno",
  "menu_texto_mediano",
  "menu_texto_grande",
  "portapapeles_boton_pequeno",
  "portapapeles_boton_mediano",
  "portapapeles_boton_grande",
];

// El grupo ("Varios"/"Tiempo (ms)") ya viene armado desde el nivel 1
// de configuracion.tsv (ver cargar_catalogo() en
// configuracion_usuario.rs) — el orden de salida del backend define
// el orden de las secciones, no hay sort propio acá.
const pestanaGeneralTabla = crearPestanaEditable({
  panel: panelGeneral,

  encabezados: ["Nombre", "Valor por defecto", "Valor personalizado"],

  cargarFilas: async () => {
    const crudas = await invoke<FilaGeneralCruda[]>(
      "configuracion_listar_general",
    );

    const propiasDeGeneral = crudas.filter(
      (cruda) => !CLAVES_TAMANOS_EN_APARIENCIA.includes(cruda.clave),
    );

    return propiasDeGeneral.map((cruda) => ({
      clave: cruda.clave,
      nombreMostrado: cruda.nombre_ui,
      grupo: cruda.grupo,
      tipo: cruda.tipo as TipoValorConfiguracion,
      valorDefecto: cruda.valor_defecto,
      valorPersonalizado: cruda.valor_personalizado,
    }));
  },

  guardarLote: (cambios) =>
    invoke<ResultadoGuardado>("configuracion_guardar_lote", { cambios }),

  restablecer: async () => {
    const crudas = await invoke<FilaGeneralCruda[]>(
      "configuracion_listar_general",
    );

    const clavesPropias = crudas
      .map((cruda) => cruda.clave)
      .filter((clave) => !CLAVES_TAMANOS_EN_APARIENCIA.includes(clave));

    await invoke("configuracion_restablecer_claves", {
      claves: clavesPropias,
    });
  },

  textoConfirmacionRestablecer:
    "¿Restablecer todos los valores de General a los de fábrica? " +
    "Se pierden los valores personalizados de esta pestaña.",

  notaPestana:
    "¡Personaliza tu experiencia! Edita teclas y atajos del programa. " +
    "Además, puedes ajustar los tiempos para reconocimiento de " +
    "combinación de teclas disparadoras y teclas emuladas a la salida.",
});

// ======================================================
// 🔵 INDICADOR CIRCULAR (filas fijas de Opciones)
// ------------------------------------------------------
// Reemplaza al switch en filas que no tienen uno — mismo ancho que
// .popup-switch-pista para quedar centrado en la misma columna que
// los switches de las demás filas.
// ======================================================

function crearIndicadorPunto(): HTMLDivElement {
  const indicador = document.createElement("div");
  indicador.className = "configuracion-opciones-indicador";

  const punto = document.createElement("span");
  punto.className = "configuracion-opciones-punto";

  indicador.append(punto);

  return indicador;
}

// ======================================================
// 🚀 OPCIONES (subtítulo fijo, pestaña General)
// ------------------------------------------------------
// Único subtítulo para toda la sección fija de la pestaña (Iniciar
// con Windows/Iniciar minimizado/Iniciar con perfil/Mostrar y
// Minimizar a bandeja/Notificaciones/Carpeta de Usuario) — fuera del
// flujo de cambios pendientes, primera sección de la pestaña.
// ======================================================

const subtituloOpciones = document.createElement("span");
subtituloOpciones.className = "configuracion-subtitulo-fija";
subtituloOpciones.textContent = "Opciones";

panelGeneral.prepend(subtituloOpciones);

interface EstadoInicioUI {
  iniciarConWindows: boolean;
  iniciarMinimizado: boolean;
  mostrarEnBandeja: boolean;
  minimizarABandeja: boolean;
  iniciarConPerfil: string;
}

// ======================================================
// 🪟 INICIAR CON WINDOWS / INICIAR MINIMIZADO (fila fija,
// pestaña General)
// ------------------------------------------------------
// Participa del flujo de cambios pendientes/Aplicar (Regla 13): el
// switch solo edita el estado en memoria (Editado); la persistencia
// real (incl. tauri-plugin-autostart) ocurre en guardarInicio(),
// llamado por pestanaGeneral.aplicarGuardado al pulsar "Aplicar
// cambios". "Iniciar minimizado" depende de "Iniciar con Windows"
// (Reglas 6/7/8).
// ======================================================

let iniciarConWindowsActual = false;
let iniciarConWindowsEditado = false;
let iniciarMinimizadoActual = false;
let iniciarMinimizadoEditado = false;

const filaIniciarConWindows = document.createElement("div");
filaIniciarConWindows.className = "configuracion-opciones-fila configuracion-fila-sangria";

const colIniciarConWindows = document.createElement("div");
colIniciarConWindows.className = "configuracion-opciones-col1";

const interruptorIniciarConWindows = crearInterruptor(
  "Iniciar con Windows",
  iniciarConWindowsEditado,
  () => {
    iniciarConWindowsEditado = !iniciarConWindowsEditado;
    interruptorIniciarConWindows.dataset.activo = iniciarConWindowsEditado
      ? "true"
      : "false";

    if (!iniciarConWindowsEditado) {
      // Regla 8: si se apaga mientras estaba en On, no se conserva.
      iniciarMinimizadoEditado = false;
      interruptorIniciarMinimizado.dataset.activo = "false";
    }

    // Regla 7: solo interactuable si "Iniciar con Windows" está On.
    interruptorIniciarMinimizado.disabled = !iniciarConWindowsEditado;
    interruptorIniciarMinimizado.dataset.deshabilitado = iniciarConWindowsEditado
      ? "false"
      : "true";
  },
);

const interruptorIniciarMinimizado = crearInterruptor(
  "Iniciar minimizado",
  iniciarMinimizadoEditado,
  () => {
    iniciarMinimizadoEditado = !iniciarMinimizadoEditado;
    interruptorIniciarMinimizado.dataset.activo = iniciarMinimizadoEditado
      ? "true"
      : "false";
  },
  !iniciarConWindowsEditado,
);

colIniciarConWindows.append(interruptorIniciarConWindows);

filaIniciarConWindows.append(colIniciarConWindows, interruptorIniciarMinimizado);

subtituloOpciones.insertAdjacentElement("afterend", filaIniciarConWindows);

function hayEdicionPendienteInicio(): boolean {
  return (
    iniciarConWindowsEditado !== iniciarConWindowsActual ||
    iniciarMinimizadoEditado !== iniciarMinimizadoActual
  );
}

function restablecerInicio(): void {
  iniciarConWindowsEditado = iniciarConWindowsActual;
  iniciarMinimizadoEditado = iniciarMinimizadoActual;

  interruptorIniciarConWindows.dataset.activo = iniciarConWindowsEditado
    ? "true"
    : "false";
  interruptorIniciarMinimizado.dataset.activo = iniciarMinimizadoEditado
    ? "true"
    : "false";
  interruptorIniciarMinimizado.disabled = !iniciarConWindowsEditado;
  interruptorIniciarMinimizado.dataset.deshabilitado = iniciarConWindowsEditado
    ? "false"
    : "true";
}

function sincronizarInicioTrasGuardado(): void {
  iniciarConWindowsActual = iniciarConWindowsEditado;
  iniciarMinimizadoActual = iniciarMinimizadoEditado;
}

// Persiste "Iniciar con Windows"/"Iniciar minimizado" (incl.
// tauri-plugin-autostart) — llamado desde pestanaGeneral.aplicarGuardado,
// no desde el switch.
async function guardarInicio(): Promise<void> {
  await invoke("establecer_autostart", { activo: iniciarConWindowsEditado });
  await invoke("guardar_iniciar_con_windows", {
    activo: iniciarConWindowsEditado,
  });
  await invoke("guardar_iniciar_minimizado", {
    activo: iniciarMinimizadoEditado,
  });
}

// ======================================================
// 👤 INICIAR CON PERFIL (fila fija, pestaña General)
// ------------------------------------------------------
// Mismo criterio que Iniciar con Windows: el popup solo edita el
// estado en memoria (Editado); guardarIniciarConPerfil() persiste al
// Aplicar cambios. "ultimo" es el valor especial para "El último
// usado" (Regla 15).
// ======================================================

let perfilInicioActual = "ultimo";
let perfilInicioEditado = "ultimo";

const filaIniciarConPerfil = document.createElement("div");
filaIniciarConPerfil.className = "configuracion-opciones-fila configuracion-fila-sangria";

const colIniciarConPerfil = document.createElement("div");
colIniciarConPerfil.className = "configuracion-opciones-col1";

const etiquetaIniciarConPerfil = document.createElement("span");
etiquetaIniciarConPerfil.className = "configuracion-escala-etiqueta";
etiquetaIniciarConPerfil.textContent = "Iniciar con perfil:";

colIniciarConPerfil.append(crearIndicadorPunto(), etiquetaIniciarConPerfil);

const botonIniciarConPerfil = document.createElement("button");
botonIniciarConPerfil.type = "button";
botonIniciarConPerfil.className =
  "ui-btn configuracion-carpeta-usuario-boton configuracion-boton-alineado-izquierda";

function actualizarBotonIniciarConPerfil(): void {
  botonIniciarConPerfil.textContent =
    perfilInicioEditado === "ultimo" ? "El último usado" : perfilInicioEditado;
}

actualizarBotonIniciarConPerfil();

async function abrirPopupIniciarConPerfil(evento: MouseEvent): Promise<void> {
  const lista = document.createElement("div");
  lista.className = "popup-lista";

  const botonUltimoUsado = document.createElement("button");
  botonUltimoUsado.className = "ui-btn";
  botonUltimoUsado.textContent = "El último usado";
  botonUltimoUsado.addEventListener("click", () => {
    perfilInicioEditado = "ultimo";
    actualizarBotonIniciarConPerfil();
    ocultarPopup();
  });
  lista.append(botonUltimoUsado);

  const separador = document.createElement("div");
  separador.className = "app-popup-separador";
  lista.append(separador);

  const titulo = document.createElement("span");
  titulo.className = "app-popup-lista-titulo";
  titulo.textContent = "Perfiles:";
  lista.append(titulo);

  const perfiles = await invoke<string[]>("obtener_perfiles");

  for (const nombre of perfiles) {
    const botonPerfil = document.createElement("button");
    botonPerfil.className = "ui-btn";
    botonPerfil.textContent = nombre;
    botonPerfil.addEventListener("click", () => {
      perfilInicioEditado = nombre;
      actualizarBotonIniciarConPerfil();
      ocultarPopup();
    });
    lista.append(botonPerfil);
  }

  mostrarPopup(lista, evento.clientX, evento.clientY);
}

botonIniciarConPerfil.addEventListener("click", (evento) => {
  abrirPopupIniciarConPerfil(evento);
});

filaIniciarConPerfil.append(colIniciarConPerfil, botonIniciarConPerfil);

function hayEdicionPendienteIniciarConPerfil(): boolean {
  return perfilInicioEditado !== perfilInicioActual;
}

function restablecerIniciarConPerfil(): void {
  perfilInicioEditado = perfilInicioActual;
  actualizarBotonIniciarConPerfil();
}

function sincronizarIniciarConPerfilTrasGuardado(): void {
  perfilInicioActual = perfilInicioEditado;
}

async function guardarIniciarConPerfil(): Promise<void> {
  await invoke("guardar_iniciar_con_perfil", { valor: perfilInicioEditado });
}

// ======================================================
// 📦 MOSTRAR/MINIMIZAR A BANDEJA (fila fija, pestaña General)
// ------------------------------------------------------
// Mismo criterio que Iniciar con Windows: participa del flujo de
// cambios pendientes/Aplicar, con guardarBandeja() llamado desde
// pestanaGeneral.aplicarGuardado. "Mostrar en bandeja de sistema" y
// "Minimizar a bandeja de sistema" nacen ambos en Off (default
// nuevo). "Minimizar a bandeja de sistema" depende de "Mostrar en
// bandeja de sistema".
// ======================================================

let mostrarEnBandejaActual = false;
let mostrarEnBandejaEditado = false;
let minimizarABandejaActual = false;
let minimizarABandejaEditado = false;

const filaBandeja = document.createElement("div");
filaBandeja.className = "configuracion-opciones-fila configuracion-fila-sangria";

const colMostrarEnBandeja = document.createElement("div");
colMostrarEnBandeja.className = "configuracion-opciones-col1";

const interruptorMostrarEnBandeja = crearInterruptor(
  "Mostrar en bandeja de sistema",
  mostrarEnBandejaEditado,
  () => {
    mostrarEnBandejaEditado = !mostrarEnBandejaEditado;
    interruptorMostrarEnBandeja.dataset.activo = mostrarEnBandejaEditado
      ? "true"
      : "false";

    if (!mostrarEnBandejaEditado) {
      // Misma dependencia que Iniciar con Windows/Iniciar minimizado:
      // si se apaga mientras estaba en On, no se conserva.
      minimizarABandejaEditado = false;
      interruptorMinimizarABandeja.dataset.activo = "false";
    }

    interruptorMinimizarABandeja.disabled = !mostrarEnBandejaEditado;
    interruptorMinimizarABandeja.dataset.deshabilitado = mostrarEnBandejaEditado
      ? "false"
      : "true";
  },
);

const interruptorMinimizarABandeja = crearInterruptor(
  "Minimizar a bandeja de sistema",
  minimizarABandejaEditado,
  () => {
    minimizarABandejaEditado = !minimizarABandejaEditado;
    interruptorMinimizarABandeja.dataset.activo = minimizarABandejaEditado
      ? "true"
      : "false";
  },
  !mostrarEnBandejaEditado,
);

colMostrarEnBandeja.append(interruptorMostrarEnBandeja);

filaBandeja.append(colMostrarEnBandeja, interruptorMinimizarABandeja);

filaIniciarConWindows.insertAdjacentElement("afterend", filaBandeja);

function hayEdicionPendienteBandeja(): boolean {
  return (
    mostrarEnBandejaEditado !== mostrarEnBandejaActual ||
    minimizarABandejaEditado !== minimizarABandejaActual
  );
}

function restablecerBandeja(): void {
  mostrarEnBandejaEditado = mostrarEnBandejaActual;
  minimizarABandejaEditado = minimizarABandejaActual;

  interruptorMostrarEnBandeja.dataset.activo = mostrarEnBandejaEditado
    ? "true"
    : "false";
  interruptorMinimizarABandeja.dataset.activo = minimizarABandejaEditado
    ? "true"
    : "false";
  interruptorMinimizarABandeja.disabled = !mostrarEnBandejaEditado;
  interruptorMinimizarABandeja.dataset.deshabilitado = mostrarEnBandejaEditado
    ? "false"
    : "true";
}

function sincronizarBandejaTrasGuardado(): void {
  mostrarEnBandejaActual = mostrarEnBandejaEditado;
  minimizarABandejaActual = minimizarABandejaEditado;
}

async function guardarBandeja(): Promise<void> {
  await invoke("guardar_mostrar_en_bandeja", {
    activo: mostrarEnBandejaEditado,
  });
  await invoke("guardar_minimizar_a_bandeja", {
    activo: minimizarABandejaEditado,
  });
}

// Carga el estado persistido y lo refleja en los 4 interruptores +
// el botón de "Iniciar con perfil" (reemplaza los valores en
// memoria — Actual y Editado — con los guardados, si los hay).
async function cargarEstadoInicio(): Promise<void> {
  const estado = await invoke<EstadoInicioUI>("obtener_estado_inicio");

  iniciarConWindowsActual = estado.iniciarConWindows;
  iniciarConWindowsEditado = iniciarConWindowsActual;
  interruptorIniciarConWindows.dataset.activo = iniciarConWindowsEditado
    ? "true"
    : "false";

  iniciarMinimizadoActual = iniciarConWindowsActual
    ? estado.iniciarMinimizado
    : false;
  iniciarMinimizadoEditado = iniciarMinimizadoActual;
  interruptorIniciarMinimizado.dataset.activo = iniciarMinimizadoEditado
    ? "true"
    : "false";
  interruptorIniciarMinimizado.disabled = !iniciarConWindowsEditado;
  interruptorIniciarMinimizado.dataset.deshabilitado = iniciarConWindowsEditado
    ? "false"
    : "true";

  mostrarEnBandejaActual = estado.mostrarEnBandeja;
  mostrarEnBandejaEditado = mostrarEnBandejaActual;
  interruptorMostrarEnBandeja.dataset.activo = mostrarEnBandejaEditado
    ? "true"
    : "false";

  minimizarABandejaActual = mostrarEnBandejaActual
    ? estado.minimizarABandeja
    : false;
  minimizarABandejaEditado = minimizarABandejaActual;
  interruptorMinimizarABandeja.dataset.activo = minimizarABandejaEditado
    ? "true"
    : "false";
  interruptorMinimizarABandeja.disabled = !mostrarEnBandejaEditado;
  interruptorMinimizarABandeja.dataset.deshabilitado = mostrarEnBandejaEditado
    ? "false"
    : "true";

  perfilInicioActual = estado.iniciarConPerfil;
  perfilInicioEditado = perfilInicioActual;
  actualizarBotonIniciarConPerfil();
}


// ======================================================
// 🔔 NOTIFICACIONES (fila alineada, pestaña General)
// ------------------------------------------------------
// Va después de Mostrar/Minimizar a bandeja, antes de Iniciar con
// perfil. El toggle y la Duración SÍ participan del flujo de
// cambios pendientes/Aplicar (Regla 13) — se combinan con
// pestanaGeneralTabla más abajo para formar la pestanaGeneral
// final. Solo el botón Mostrar/Guardar se aplica al instante
// (Regla 14, mismo criterio que el botón Ubicación del popup Extra
// de Macro, ver comp_popup_macro_extra.ts).
// ======================================================

let mostrarNotificacionesActual = false;
let mostrarNotificacionesEditado = false;

let duracionActual = 0;
let duracionEditado = 0;

const filaNotificaciones = document.createElement("div");
filaNotificaciones.className = "configuracion-opciones-fila configuracion-fila-sangria";

const colMostrarNotificaciones = document.createElement("div");
colMostrarNotificaciones.className = "configuracion-opciones-col1";

// Agrupa Duración y Ubicación (col2), cada uno con su indicador +
// etiqueta + botón, a continuación del switch de Notificaciones.
const grupoDerechoNotificaciones = document.createElement("div");
grupoDerechoNotificaciones.className = "configuracion-opciones-col2";

const grupoDuracion = document.createElement("div");
grupoDuracion.className = "configuracion-opciones-grupo";

const grupoUbicacion = document.createElement("div");
grupoUbicacion.className = "configuracion-opciones-grupo";

const interruptorNotificaciones = crearInterruptor(
  "Mostrar Notificaciones",
  mostrarNotificacionesEditado,
  () => {
    mostrarNotificacionesEditado = !mostrarNotificacionesEditado;
    actualizarInterruptorNotificaciones();
  },
);

function actualizarInterruptorNotificaciones(): void {
  interruptorNotificaciones.dataset.activo = mostrarNotificacionesEditado
    ? "true"
    : "false";
}

const etiquetaDuracionNotificaciones = document.createElement("span");
etiquetaDuracionNotificaciones.className = "configuracion-escala-etiqueta";
etiquetaDuracionNotificaciones.textContent = "Duración:";

const botonDuracionNotificaciones = crearBoton({
  texto: "",
  titulo: "Duración de la notificación (ms)",
  clase: "configuracion-duracion-notificacion",
});

function actualizarBotonDuracionNotificaciones(): void {
  botonDuracionNotificaciones.textContent = `${duracionEditado}ms`;
}

actualizarBotonDuracionNotificaciones();

// Popup de edición numérica (mismo patrón que crearCampoValorGeneral
// para fila.tipo === "numero": actualiza en vivo con cada "input",
// sin botón Confirmar propio — mostrarPopup ya cierra al click afuera).
botonDuracionNotificaciones.addEventListener("click", (evento) => {
  const input = crearInputNumero(String(duracionEditado));
  input.min = "1";

  input.addEventListener("input", () => {
    const valor = Number.parseInt(input.value, 10);

    if (!Number.isFinite(valor) || valor <= 0) {
      return;
    }

    duracionEditado = valor;
    actualizarBotonDuracionNotificaciones();
  });

  const popup = document.createElement("div");
  popup.className = "popup-editar-apariencia";
  popup.append(input);

  mostrarPopup(popup, evento.clientX, evento.clientY);
});

colMostrarNotificaciones.append(interruptorNotificaciones);
grupoDuracion.append(
  crearIndicadorPunto(),
  etiquetaDuracionNotificaciones,
  botonDuracionNotificaciones,
);

// Botón "Mostrar"/"Guardar" — se aplica al instante (no participa
// de cambios pendientes), mismo comportamiento que su homónimo en
// comp_popup_macro_extra.ts pero contra las ventanas de notificación.
let ubicacionNotificacionActiva = false;

const etiquetaUbicacionNotificacion = document.createElement("span");
etiquetaUbicacionNotificacion.className = "configuracion-escala-etiqueta";
etiquetaUbicacionNotificacion.textContent = "Ubicación:";

const botonUbicacionNotificacion = crearBoton({
  texto: "Mostrar",
  clase: "configuracion-boton-alineado-izquierda",
});

function actualizarBotonUbicacionNotificacion(): void {
  botonUbicacionNotificacion.textContent = ubicacionNotificacionActiva
    ? "Guardar"
    : "Mostrar";
}

botonUbicacionNotificacion.addEventListener("click", async () => {
  ubicacionNotificacionActiva = !ubicacionNotificacionActiva;
  actualizarBotonUbicacionNotificacion();

  try {
    if (ubicacionNotificacionActiva) {
      await invoke("abrir_notificacion_ubicacion");
    } else {
      await invoke("cerrar_ventana_notificacion");
    }
  } catch (error) {
    ubicacionNotificacionActiva = !ubicacionNotificacionActiva;
    actualizarBotonUbicacionNotificacion();

    window.alert(
      `No se pudo alternar la ventana de notificación: ${String(error)}`,
    );
  }
});

grupoUbicacion.append(crearIndicadorPunto(), etiquetaUbicacionNotificacion, botonUbicacionNotificacion);
grupoDerechoNotificaciones.append(grupoDuracion, grupoUbicacion);

filaNotificaciones.append(colMostrarNotificaciones, grupoDerechoNotificaciones);
filaBandeja.insertAdjacentElement("afterend", filaNotificaciones);
filaNotificaciones.insertAdjacentElement("afterend", filaIniciarConPerfil);

// Línea separadora entre la sección "Opciones" y la tabla de abajo.
const separadorOpciones = document.createElement("div");
separadorOpciones.className = "configuracion-opciones-separador";
filaIniciarConPerfil.insertAdjacentElement("afterend", separadorOpciones);

async function cargarFilaNotificaciones(): Promise<void> {
  const [mostrar, duracion] = await Promise.all([
    invoke<boolean>("obtener_mostrar_notificaciones"),
    invoke<number>("obtener_duracion_notificacion_ms"),
  ]);

  mostrarNotificacionesActual = mostrar;
  mostrarNotificacionesEditado = mostrar;

  duracionActual = duracion;
  duracionEditado = duracion;

  actualizarInterruptorNotificaciones();
  actualizarBotonDuracionNotificaciones();
}

function hayEdicionPendienteFilaNotificaciones(): boolean {
  return (
    mostrarNotificacionesEditado !== mostrarNotificacionesActual ||
    duracionEditado !== duracionActual
  );
}

function validarYRecolectarFilaNotificaciones(): CambioConfiguracion[] {
  const cambios: CambioConfiguracion[] = [];

  if (mostrarNotificacionesEditado !== mostrarNotificacionesActual) {
    cambios.push({
      clave: "mostrar_notificaciones",
      valor: String(mostrarNotificacionesEditado),
    });
  }

  if (duracionEditado !== duracionActual) {
    cambios.push({
      clave: "duracion_notificacion_ms",
      valor: String(duracionEditado),
    });
  }

  return cambios;
}

function restablecerFilaNotificaciones(): void {
  mostrarNotificacionesEditado = mostrarNotificacionesActual;
  duracionEditado = duracionActual;

  actualizarInterruptorNotificaciones();
  actualizarBotonDuracionNotificaciones();
}

function sincronizarFilaNotificacionesTrasGuardado(): void {
  mostrarNotificacionesActual = mostrarNotificacionesEditado;
  duracionActual = duracionEditado;
}

// ======================================================
// ⚙️ PESTAÑA GENERAL (final, F10)
// ------------------------------------------------------
// Combina pestanaGeneralTabla con la fila de Notificaciones (única
// fila fuera de la tabla que sí participa de cambios pendientes/
// Aplicar, a diferencia de Carpeta de Usuario).
// ======================================================

const pestanaGeneral: Pestana = {
  cargar: async () => {
    await pestanaGeneralTabla.cargar();
    await cargarFilaNotificaciones();
    await cargarEstadoInicio();
  },

  hayEdicionesPendientes: () =>
    pestanaGeneralTabla.hayEdicionesPendientes() ||
    hayEdicionPendienteFilaNotificaciones() ||
    hayEdicionPendienteInicio() ||
    hayEdicionPendienteBandeja() ||
    hayEdicionPendienteIniciarConPerfil(),

  validarYRecolectar: () => {
    const resultado = pestanaGeneralTabla.validarYRecolectar();

    return {
      cambios: [
        ...resultado.cambios,
        ...validarYRecolectarFilaNotificaciones(),
      ],
      erroresLocales: resultado.erroresLocales,
    };
  },

  // Iniciar con Windows/Minimizado, Bandeja e Iniciar con perfil no
  // pasan por clave/valor genérico (invocan comandos Tauri propios,
  // igual que Carpeta de Usuario/Motor en Avanzado) — se aplican acá
  // mismo, después de la tabla/Notificaciones y solo si esa parte no
  // falló.
  aplicarGuardado: async (cambios) => {
    const resultado = await pestanaGeneralTabla.aplicarGuardado(cambios);

    if (resultado.errores.length > 0) {
      return resultado;
    }

    try {
      if (hayEdicionPendienteInicio()) {
        await guardarInicio();
      }

      if (hayEdicionPendienteBandeja()) {
        await guardarBandeja();
      }

      if (hayEdicionPendienteIniciarConPerfil()) {
        await guardarIniciarConPerfil();
      }
    } catch (error) {
      return {
        errores: [{ clave: "inicio", mensaje: String(error) }],
      };
    }

    return resultado;
  },

  marcarErroresGuardado: (errores) =>
    pestanaGeneralTabla.marcarErroresGuardado(errores),

  limpiarEstadoTrasGuardado: async () => {
    await pestanaGeneralTabla.limpiarEstadoTrasGuardado();
    sincronizarFilaNotificacionesTrasGuardado();
    sincronizarInicioTrasGuardado();
    sincronizarBandejaTrasGuardado();
    sincronizarIniciarConPerfilTrasGuardado();
  },

  restablecerPestana: async () => {
    await pestanaGeneralTabla.restablecerPestana();
    restablecerFilaNotificaciones();
    restablecerInicio();
    restablecerBandeja();
    restablecerIniciarConPerfil();
  },

  textoConfirmacionRestablecer:
    pestanaGeneralTabla.textoConfirmacionRestablecer,
};

// ======================================================
// ⌨️ PESTAÑA TECLAS (Etapa 5)
// ------------------------------------------------------
// El backend (configuracion_listar_teclas) no agrupa por
// subtítulo, solo manda "fuente" (keyboard/mouse) como
// pista — la categoría de cada tecla se decide acá mismo,
// con reglas sobre el nombre interno. Una tecla nueva que no
// matchee ninguna regla cae en "Símbolos" (catch-all), así
// que sigue viéndose en la tabla aunque no esté prevista.
// ======================================================

type CategoriaTecla =
  | "Letras"
  | "Números"
  | "Teclado numérico"
  | "Funciones"
  | "Especiales"
  | "Símbolos"
  | "Mouse";

const INTERNOS_ESPECIALES = new Set([
  "Enter",
  "Escape",
  "Backspace",
  "Tab",
  "Space",
  "Left",
  "Up",
  "Right",
  "Down",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Insert",
  "Delete",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "PrintScreen",
  "LeftShift",
  "RightShift",
  "LeftControl",
  "RightControl",
  "LeftAlt",
  "RightAlt",
]);

const INTERNOS_TECLADO_NUMERICO_EXTRA = new Set([
  "Multiply",
  "Add",
  "Subtract",
  "Decimal",
  "Divide",
]);

function categorizarTecla(interno: string, fuente: string): CategoriaTecla {
  if (fuente === "mouse") {
    return "Mouse";
  }

  // "Enie" (la Ñ) es la única letra cuyo interno no es una sola
  // letra A-Z (ver pulsadores.tsv) — se suma acá a mano para que
  // caiga en "Letras" junto a las demás en vez de "Símbolos".
  if (/^[A-Z]$/.test(interno) || interno === "Enie") {
    return "Letras";
  }

  if (/^Num\d$/.test(interno)) {
    return "Números";
  }

  if (
    /^NumPad\d$/.test(interno) ||
    INTERNOS_TECLADO_NUMERICO_EXTRA.has(interno)
  ) {
    return "Teclado numérico";
  }

  if (/^F\d{1,2}$/.test(interno)) {
    return "Funciones";
  }

  if (INTERNOS_ESPECIALES.has(interno)) {
    return "Especiales";
  }

  return "Símbolos";
}

const ORDEN_CATEGORIAS: readonly CategoriaTecla[] = [
  "Letras",
  "Números",
  "Teclado numérico",
  "Funciones",
  "Especiales",
  "Símbolos",
  "Mouse",
];

// Modelo tal cual lo entrega configuracion_listar_teclas (snake_case).
interface FilaTeclaCruda {
  interno: string;
  fuente: string;
  nombre_fabrica: string;
  nombre_personalizado: string | null;
}

const pestanaTeclas = crearPestanaEditable({
  panel: panelTeclas,

  encabezados: ["Nombre de fábrica", "Nombre personalizado"],

  cargarFilas: async () => {
    const crudas = await invoke<FilaTeclaCruda[]>(
      "configuracion_listar_teclas",
    );

    const filas = crudas.map((cruda) => ({
      clave: cruda.interno,
      nombreMostrado: cruda.interno,
      grupo: categorizarTecla(cruda.interno, cruda.fuente) as string,
      tipo: "texto" as TipoValorConfiguracion,
      valorDefecto: cruda.nombre_fabrica,
      valorPersonalizado: cruda.nombre_personalizado,
    }));

    // pulsadores.tsv ya viene ordenado por categoría, pero se
    // reordena acá explícitamente según ORDEN_CATEGORIAS para no
    // depender de ese orden implícito si el .tsv cambia.
    return filas.sort(
      (a, b) =>
        ORDEN_CATEGORIAS.indexOf(a.grupo as CategoriaTecla) -
        ORDEN_CATEGORIAS.indexOf(b.grupo as CategoriaTecla),
    );
  },

  guardarLote: (cambios) =>
    invoke<ResultadoGuardado>("configuracion_guardar_lote_teclas", {
      cambios,
    }),

  restablecer: async () => {
    await invoke("configuracion_restablecer_seccion", {
      prefijo: "pulsador.",
    });
  },

  textoConfirmacionRestablecer:
    "¿Restablecer todos los nombres de Teclas a los de fábrica? " +
    "Se pierden los nombres personalizados de esta pestaña.",

  notaPestana:
    "¿Quieres darle otro nombre a una tecla o botón en la interfaz? " +
    "No afecta el funcionamiento del programa.",
});

// aplicarOverridesApariencia() actualiza ESTA ventana (la Ventana de
// Configuración queda afuera del reload que hace el backend — ver
// configuracion_refrescar_ventanas_apariencia), así que después de
// cualquier cambio hay que llamarla acá a mano, además de pedirle al
// backend que recargue el resto.
async function refrescarTrasCambioApariencia(): Promise<void> {
  await aplicarOverridesApariencia();
  await invoke("configuracion_refrescar_ventanas_apariencia");
}

// (nota etapa H pendiente: la fusión de CLAVES_TAMANOS_EN_APARIENCIA
// al guardar/restablecer, que vivía acá, se reintroduce cuando
// crearPestanaApariencia tenga persistencia real.)
//
// Apariencia (pestaña única, ex Apariencia+Tema fusionadas) = Color
// de tema + Color de Texto + Color y opacidad de elementos + Opacidad
// (indicadores Macro/Coordenada) + Texto + Dimensiones, con el
// selector Cargar/Guardar/Renombrar/Eliminar tema y el selector de
// Escala general juntos arriba de la tabla — ver apariencia.tsv.
const pestanaApariencia = crearPestanaApariencia(
  panelApariencia,
  refrescarTrasCambioApariencia,
  {
    grupos: [
      "color-tema",
      "color-texto",
      "color-opacidad-elementos",
      "opacidad-indicadores",
      "texto",
      "dimensiones",
    ],
    incluirSelectorTema: true,
    incluirEscala: true,
    textoConfirmacionRestablecer:
      "¿Restablecer todos los valores de Apariencia a los de fábrica? " +
      "Se pierden los valores personalizados de esta pestaña.",
    notaPestana:
      "Dale tu estilo a la interfaz... Edita temas y crea nuevas " +
      "combinaciones de colores.",
  },
);

// ======================================================
// 🛠️ PESTAÑA AVANZADO
// ------------------------------------------------------
// Selector de modo de motor (Interception / Portable). No usa
// crearPestanaEditable (no es una tabla), pero expone la misma
// interfaz Pestana para integrarse con la barra de acciones global
// (ver "BARRA DE ACCIONES GLOBAL"): tocar el selector solo marca un
// cambio pendiente, sin aplicar nada hasta "Aplicar cambios".
// ======================================================

// ======================================================
// 📁 CARPETAS — Ruta para carpeta de usuario
// ------------------------------------------------------
// Todo el cambio (destino + decisiones de migración) queda
// pendiente en carpetaUsuarioPendiente hasta "Aplicar cambios"
// (guardarCarpetaUsuario, ver BARRA DE ACCIONES GLOBAL) — la
// única excepción de la pestaña General/Avanzado es la Ubicación
// de Notificaciones, que sigue aplicándose al toque.
//
// El popup del selector es persistente (mismo patrón que los
// popups Extra: comp_popup_abrir_extra.ts) — elegir una carpeta no
// lo cierra, solo lo redibuja mostrando (si aplica) las preguntas
// de migración con una opción preseleccionada. Se cierra solo con
// click afuera o Esc (comportamiento por defecto de mostrarPopup).
// ======================================================

const tituloCarpetas = document.createElement("h3");
tituloCarpetas.className = "configuracion-avanzado-titulo";
tituloCarpetas.textContent = "Carpetas";

interface EstadoCarpetaUsuario {
  tipo: "default" | "instalacion" | "otra";
  ruta: string;
}

type TipoCarpetaUsuario = EstadoCarpetaUsuario["tipo"];

interface VerificacionCarpetaUsuario {
  es_sistema: boolean;
  tiene_usuario_existente: boolean;
}

interface ResultadoCambioCarpetaUsuario {
  ruta_antigua: string | null;
  requiere_renombrar_si_mantiene: boolean;
}

interface CarpetaUsuarioPendiente {
  tipo: TipoCarpetaUsuario;
  ruta: string;
  esSistema: boolean;
  tieneUsuarioExistente: boolean;
  decisionRutaAntigua: "mantener" | "eliminar";
  decisionConflicto: "renombrar" | "eliminar";
}

const ETIQUETAS_TIPO_CARPETA_USUARIO: Record<"default" | "instalacion", string> = {
  default: "%AppData%",
  instalacion: "OmegaCtrl",
};

let estadoActualCarpetaUsuario: EstadoCarpetaUsuario = { tipo: "default", ruta: "" };
let carpetaUsuarioPendiente: CarpetaUsuarioPendiente | null = null;

const filaCarpetaUsuario = document.createElement("div");
filaCarpetaUsuario.className = "configuracion-opciones-fila configuracion-fila-sangria";

const colCarpetaUsuario = document.createElement("div");
colCarpetaUsuario.className = "configuracion-opciones-col1";

const etiquetaCarpetaUsuario = document.createElement("span");
etiquetaCarpetaUsuario.className = "configuracion-escala-etiqueta";
etiquetaCarpetaUsuario.textContent = "Ruta para carpeta de usuario:";

colCarpetaUsuario.append(crearIndicadorPunto(), etiquetaCarpetaUsuario);

const botonSelectorCarpetaUsuario = document.createElement("button");
botonSelectorCarpetaUsuario.type = "button";
botonSelectorCarpetaUsuario.className =
  "ui-btn configuracion-carpeta-usuario-boton configuracion-boton-alineado-izquierda";
botonSelectorCarpetaUsuario.textContent = "Seleccionar Carpeta";

filaCarpetaUsuario.append(colCarpetaUsuario, botonSelectorCarpetaUsuario);

panelAvanzado.append(tituloCarpetas, filaCarpetaUsuario);

function actualizarBotonCarpetaUsuario(): void {
  const mostrado = carpetaUsuarioPendiente ?? estadoActualCarpetaUsuario;

  if (mostrado.tipo === "otra") {
    const nombre =
      mostrado.ruta.split(/[\\/]/).filter(Boolean).pop() ?? mostrado.ruta;

    botonSelectorCarpetaUsuario.textContent = nombre;
  } else {
    botonSelectorCarpetaUsuario.textContent =
      ETIQUETAS_TIPO_CARPETA_USUARIO[mostrado.tipo];
  }

  botonSelectorCarpetaUsuario.title = mostrado.ruta;
}

async function cargarEstadoCarpetaUsuario(): Promise<void> {
  estadoActualCarpetaUsuario = await invoke<EstadoCarpetaUsuario>(
    "obtener_estado_carpeta_usuario",
  );

  carpetaUsuarioPendiente = null;

  actualizarBotonCarpetaUsuario();
}

function hayEdicionPendienteCarpetaUsuario(): boolean {
  return (
    carpetaUsuarioPendiente !== null &&
    (carpetaUsuarioPendiente.tipo !== estadoActualCarpetaUsuario.tipo ||
      carpetaUsuarioPendiente.ruta !== estadoActualCarpetaUsuario.ruta)
  );
}

function restablecerCarpetaUsuario(): void {
  carpetaUsuarioPendiente = null;
  actualizarBotonCarpetaUsuario();
}

// Ejecuta el cambio real (llamado solo desde "Aplicar cambios").
// Orden clave (Regla del usuario): confirmar_cambio_carpeta_usuario
// migra los datos ANTES de guardar el override, y solo si migró sin
// error se limpia la ruta antigua (eliminar/renombrar) — si algo
// falla acá, el error sube tal cual al catch de "Aplicar cambios".
async function guardarCarpetaUsuario(): Promise<void> {
  const pendiente = carpetaUsuarioPendiente;

  if (!pendiente) {
    return;
  }

  if (pendiente.tieneUsuarioExistente) {
    await invoke("resolver_carpeta_usuario_existente", {
      ruta: pendiente.ruta,
      accion: pendiente.decisionConflicto,
    });
  }

  const resultado = await invoke<ResultadoCambioCarpetaUsuario>(
    "confirmar_cambio_carpeta_usuario",
    { ruta: pendiente.ruta, esDefault: pendiente.tipo === "default" },
  );

  if (resultado.ruta_antigua !== null) {
    const rutaAntigua = resultado.ruta_antigua;

    if (pendiente.decisionRutaAntigua === "eliminar") {
      await invoke("eliminar_carpeta_usuario_antigua", { ruta: rutaAntigua });
    } else if (resultado.requiere_renombrar_si_mantiene) {
      await invoke("renombrar_carpeta_usuario_antigua", { ruta: rutaAntigua });
    }
  }

  await cargarEstadoCarpetaUsuario();
}

// Resuelve el destino según el tipo elegido, verifica (escribible +
// es_sistema + ya existe) y arma/limpia carpetaUsuarioPendiente. No
// toca disco más allá de la verificación — la migración real queda
// para guardarCarpetaUsuario().
async function elegirTipoCarpetaUsuario(
  tipo: TipoCarpetaUsuario,
): Promise<void> {
  let destino: string;

  if (tipo === "default") {
    destino = await invoke<string>("obtener_ruta_default_carpeta_usuario");
  } else if (tipo === "instalacion") {
    destino = await invoke<string>(
      "obtener_ruta_instalacion_carpeta_usuario",
    );
  } else {
    const elegida = await invoke<string | null>("seleccionar_carpeta");

    if (elegida === null) {
      return;
    }

    destino = elegida;
  }

  let verificacion: VerificacionCarpetaUsuario;

  try {
    verificacion = await invoke<VerificacionCarpetaUsuario>(
      "verificar_carpeta_usuario",
      { ruta: destino },
    );
  } catch (error) {
    window.alert(`No se pudo usar esa carpeta: ${String(error)}`);
    return;
  }

  if (destino === estadoActualCarpetaUsuario.ruta) {
    carpetaUsuarioPendiente = null;
  } else {
    carpetaUsuarioPendiente = {
      tipo,
      ruta: destino,
      esSistema: verificacion.es_sistema,
      tieneUsuarioExistente: verificacion.tiene_usuario_existente,
      decisionRutaAntigua: "mantener",
      decisionConflicto: "renombrar",
    };
  }

  actualizarBotonCarpetaUsuario();
  actualizarVisibilidadGuardarGlobal();
}

function dibujarPopupCarpetaUsuario(): HTMLElement {
  const popup = document.createElement("div");
  popup.className = "popup-extra";

  const opcionesTipo: { texto: string; valor: TipoCarpetaUsuario }[] = [
    { texto: "%AppData%", valor: "default" },
    { texto: "Carpeta de instalación OmegaCtrl", valor: "instalacion" },
    { texto: "📁 Otra", valor: "otra" },
  ];

  const tipoMostrado =
    carpetaUsuarioPendiente?.tipo ?? estadoActualCarpetaUsuario.tipo;

  popup.append(
    crearFilaPopup(
      "Seleccionar",
      crearGrupoOpciones(
        opcionesTipo,
        tipoMostrado,
        (valor) => {
          elegirTipoCarpetaUsuario(valor).then(redibujarPopupCarpetaUsuario);
        },
        "popup-grupo-vertical",
        true,
      ),
    ),
  );

  if (carpetaUsuarioPendiente) {
    const separador = document.createElement("div");
    separador.className = "app-popup-separador";
    popup.append(separador);

    const subtitulo = document.createElement("div");
    subtitulo.className = "popup-fila-label";
    subtitulo.textContent = "Luego de migrar datos:";
    popup.append(subtitulo);

    const pendiente = carpetaUsuarioPendiente;

    popup.append(
      crearFilaPopup(
        "¿Qué hacer con archivos en ruta antigua?",
        crearGrupoOpciones(
          [
            { texto: "Mantener", valor: "mantener" as const },
            { texto: "Eliminar", valor: "eliminar" as const },
          ],
          pendiente.decisionRutaAntigua,
          (valor) => {
            pendiente.decisionRutaAntigua = valor;
            redibujarPopupCarpetaUsuario();
          },
        ),
      ),
    );

    if (pendiente.tieneUsuarioExistente) {
      popup.append(
        crearFilaPopup(
          "Si ya existe una carpeta de usuario en el destino:",
          crearGrupoOpciones(
            [
              { texto: 'Renombrarla a "Usuario_old"', valor: "renombrar" as const },
              { texto: "Eliminarla", valor: "eliminar" as const },
            ],
            pendiente.decisionConflicto,
            (valor) => {
              pendiente.decisionConflicto = valor;
              redibujarPopupCarpetaUsuario();
            },
          ),
        ),
      );
    }

    if (pendiente.esSistema) {
      const aviso = document.createElement("p");
      aviso.className = "popup-fila-label";
      aviso.textContent =
        "Esa carpeta está dentro de una carpeta de sistema (Program " +
        "Files, Program Files (x86) o Windows). Necesitará modo " +
        "administrador para escribir los perfiles ahí, o elija otra " +
        "carpeta.";
      popup.append(aviso);
    }
  }

  return popup;
}

function redibujarPopupCarpetaUsuario(): void {
  actualizarContenidoPopup(dibujarPopupCarpetaUsuario());
}

botonSelectorCarpetaUsuario.addEventListener("click", (evento) => {
  mostrarPopup(
    dibujarPopupCarpetaUsuario(),
    evento.clientX,
    evento.clientY,
  );
});

const tituloModoMotor = document.createElement("h3");
tituloModoMotor.className = "configuracion-avanzado-titulo";
tituloModoMotor.textContent = "Motor de entrada/salida";

const selectorModoMotor = document.createElement("select");
selectorModoMotor.className = "configuracion-avanzado-select";

const opcionInterception = document.createElement("option");
opcionInterception.value = "Interception";
opcionInterception.textContent = "Driver (Interception)";

const opcionPortable = document.createElement("option");
opcionPortable.value = "Portable";
opcionPortable.textContent = "Portable";

selectorModoMotor.append(opcionInterception, opcionPortable);

panelAvanzado.append(tituloModoMotor, selectorModoMotor);

// Texto explicativo al pie, mismo criterio que las demás pestañas
// (ver .configuracion-nota-pestana) — acá con varios párrafos, así
// que el estilo se aplica al contenedor y cada <p> hijo hereda.
const notaAvanzado = document.createElement("div");
notaAvanzado.className = "configuracion-nota-pestana";

const notaAvanzadoIntro = document.createElement("p");
notaAvanzadoIntro.textContent =
  "¿El modo Portable no es suficiente? Interception es un driver a " +
  "nivel de kernel: intercepta cada evento de teclado/mouse antes de " +
  "que Windows lo entregue a las demás apps, lo que permite un " +
  "bloqueo más confiable que los hooks del modo Portable. A cambio, " +
  "requiere instalarlo con permisos de administrador (y reiniciar), " +
  "y algunos anticheats lo detectan como riesgo de seguridad y lo " +
  "bloquean.";

const notaAvanzadoPaso1 = document.createElement("p");
notaAvanzadoPaso1.textContent =
  "Paso 1: instala el driver Interception desde su repositorio " +
  "oficial: https://github.com/oblitum/Interception";

const notaAvanzadoPaso2 = document.createElement("p");
notaAvanzadoPaso2.textContent =
  "Paso 2: selecciona acá el modo Driver y aplica cambios. ¡Listo!";

notaAvanzado.append(notaAvanzadoIntro, notaAvanzadoPaso1, notaAvanzadoPaso2);

panelAvanzado.append(notaAvanzado);

// Último modo confirmado por el backend (no el elegido en el
// <select>, que puede tener un cambio pendiente sin guardar todavía).
let modoMotorActivo = "Interception";

async function cargarModoMotor(): Promise<void> {
  modoMotorActivo = await invoke<string>("motor_obtener_modo");
  selectorModoMotor.value = modoMotorActivo;
}

function hayEdicionPendienteModoMotor(): boolean {
  return selectorModoMotor.value !== modoMotorActivo;
}

async function guardarModoMotor(): Promise<void> {
  await invoke("motor_solicitar_cambio_modo", {
    modo: selectorModoMotor.value,
  });

  modoMotorActivo = selectorModoMotor.value;
}

async function restablecerModoMotor(): Promise<void> {
  selectorModoMotor.value = modoMotorActivo;
}

const pestanaAvanzado: Pestana = {
  cargar: async () => {
    await cargarModoMotor();
    await cargarEstadoCarpetaUsuario();
  },

  hayEdicionesPendientes: () =>
    hayEdicionPendienteModoMotor() || hayEdicionPendienteCarpetaUsuario(),

  // Sin validación posible (Motor es un <select> de dos opciones
  // fijas, Carpeta de Usuario resuelve todo en el popup): si hay
  // cambio pendiente en cualquiera de las dos, se recolecta como un
  // único "cambio" sin clave real — Aplicar cambios global las aplica
  // llamando a guardarModoMotor()/guardarCarpetaUsuario() en vez de
  // pasar por guardarLote genérico (ver "BARRA DE ACCIONES GLOBAL").
  validarYRecolectar: () => ({ cambios: [], erroresLocales: [] }),
  aplicarGuardado: async () => ({ errores: [] }),
  marcarErroresGuardado: () => {},

  limpiarEstadoTrasGuardado: async () => {},

  restablecerPestana: async () => {
    await restablecerModoMotor();
    restablecerCarpetaUsuario();
  },

  textoConfirmacionRestablecer:
    "¿Descartar los cambios pendientes de Motor de entrada/salida y " +
    "Carpeta de Usuario?",
};

// ======================================================
// 🧭 BARRA DE ACCIONES GLOBAL
// ------------------------------------------------------
// Única y fija para las 4 pestañas. Izquierda: "Restablecer esta
// pestaña", actúa solo sobre la pestaña activa (título/mensaje
// cambia según cuál sea). Derecha: "Cancelar cambios"/"Aplicar
// cambios", ambos globales — actúan sobre los cambios pendientes de
// TODAS las pestañas (no solo la activa) y solo se muestran si hay
// algo pendiente en cualquiera de ellas.
// ======================================================

const TODAS_LAS_PESTANAS: ReadonlyArray<readonly [HTMLButtonElement, Pestana]> =
  [
    [tabGeneral, pestanaGeneral],
    [tabApariencia, pestanaApariencia],
    [tabTeclas, pestanaTeclas],
    [tabAvanzado, pestanaAvanzado],
  ];

const filaAcciones = document.createElement("div");
filaAcciones.className = "configuracion-fila-slot";

const barraGlobal = document.createElement("div");
barraGlobal.className = "configuracion-acciones";

const botonRestablecerGlobal = document.createElement("button");
botonRestablecerGlobal.type = "button";
botonRestablecerGlobal.className = "configuracion-boton";
botonRestablecerGlobal.textContent = "Restablecer esta pestaña";

const grupoAccionesDerecha = document.createElement("div");
grupoAccionesDerecha.className = "configuracion-acciones-derecha";

const botonCancelarGlobal = document.createElement("button");
botonCancelarGlobal.type = "button";
botonCancelarGlobal.className = "configuracion-boton";
botonCancelarGlobal.textContent = "Cancelar cambios";

const botonGuardarGlobal = document.createElement("button");
botonGuardarGlobal.type = "button";
botonGuardarGlobal.className = "configuracion-boton familia-highdark";
botonGuardarGlobal.textContent = "Aplicar cambios";

grupoAccionesDerecha.append(botonCancelarGlobal, botonGuardarGlobal);

barraGlobal.append(botonRestablecerGlobal, grupoAccionesDerecha);

filaAcciones.append(barraGlobal);

// --------------------------------------------------------
// Fila de confirmación (reemplaza el window.confirm() nativo
// de "Restablecer esta pestaña") — misma barra inferior, se
// alarga hacia arriba mostrando el mensaje + Cancelar/
// Confirmar en vez de abrir un popup del sistema aparte.
// --------------------------------------------------------

const filaConfirmacionSlot = document.createElement("div");
filaConfirmacionSlot.className = "configuracion-fila-slot oculto";

const filaConfirmacion = document.createElement("div");
filaConfirmacion.className = "configuracion-confirmacion";

const textoConfirmacion = document.createElement("span");
textoConfirmacion.className = "configuracion-confirmacion-texto";

const botonCancelarConfirmacion = document.createElement("button");
botonCancelarConfirmacion.type = "button";
botonCancelarConfirmacion.className = "configuracion-boton";
botonCancelarConfirmacion.textContent = "Cancelar";

const botonConfirmarConfirmacion = document.createElement("button");
botonConfirmarConfirmacion.type = "button";
botonConfirmarConfirmacion.className =
  "configuracion-boton configuracion-boton-primario";
botonConfirmarConfirmacion.textContent = "Restablecer";

filaConfirmacion.append(
  textoConfirmacion,
  botonCancelarConfirmacion,
  botonConfirmarConfirmacion,
);
filaConfirmacionSlot.append(filaConfirmacion);

const barraAcciones = document.createElement("div");
barraAcciones.className = "configuracion-barra";
barraAcciones.append(filaConfirmacionSlot, filaAcciones);

card.append(barraAcciones);

function pestanaActiva(): Pestana {
  const par = TODAS_LAS_PESTANAS.find(([boton]) =>
    boton.classList.contains("configuracion-tab-activa"),
  );

  return par ? par[1] : pestanaGeneral;
}

botonRestablecerGlobal.addEventListener("click", () => {
  const activa = pestanaActiva();

  textoConfirmacion.textContent = activa.textoConfirmacionRestablecer;

  filaAcciones.classList.add("oculto");
  filaConfirmacionSlot.classList.remove("oculto");
});

botonCancelarConfirmacion.addEventListener("click", () => {
  filaConfirmacionSlot.classList.add("oculto");
  filaAcciones.classList.remove("oculto");
});

botonConfirmarConfirmacion.addEventListener("click", async () => {
  const activa = pestanaActiva();

  botonConfirmarConfirmacion.disabled = true;
  botonCancelarConfirmacion.disabled = true;

  try {
    await activa.restablecerPestana();
    mostrarToast("✅ Restablecido");
  } catch (error) {
    window.alert(`No se pudo restablecer: ${String(error)}`);
  } finally {
    botonConfirmarConfirmacion.disabled = false;
    botonCancelarConfirmacion.disabled = false;

    filaConfirmacionSlot.classList.add("oculto");
    filaAcciones.classList.remove("oculto");
  }
});

// "Cancelar cambios": descarta las ediciones no guardadas de TODAS
// las pestañas (no solo la activa) recargando cada una desde su
// último estado persistido — mismo camino de solo-lectura que usa
// restablecerPestana() para "Restablecer esta pestaña", pero
// aplicado a las 4 pestañas a la vez y sin pedir confirmación.
botonCancelarGlobal.addEventListener("click", async () => {
  botonCancelarGlobal.disabled = true;
  botonGuardarGlobal.disabled = true;

  try {
    for (const [, pestana] of TODAS_LAS_PESTANAS) {
      await pestana.restablecerPestana();
    }
  } catch (error) {
    window.alert(`No se pudo cancelar: ${String(error)}`);
  } finally {
    botonCancelarGlobal.disabled = false;
    botonGuardarGlobal.disabled = false;
    actualizarVisibilidadGuardarGlobal();
  }
});

botonGuardarGlobal.addEventListener("click", async () => {
  const huboCambioModo = hayEdicionPendienteModoMotor();
  const huboCambioCarpetaUsuario = hayEdicionPendienteCarpetaUsuario();

  // Junta y valida los cambios pendientes de las 3 pestañas de
  // tabla. Si CUALQUIERA falla, se bloquea el guardado completo (no
  // se guarda nada, ni siquiera lo válido de otras pestañas) — ver
  // respuesta a la consulta sobre errores en pestaña no activa.
  const recolecciones = [pestanaGeneral, pestanaApariencia, pestanaTeclas].map(
    (pestana) => ({ pestana, resultado: pestana.validarYRecolectar() }),
  );

  const huboErrores = recolecciones.some(
    ({ resultado }) => resultado.erroresLocales.length > 0,
  );

  if (huboErrores) {
    return;
  }

  if (
    !huboCambioModo &&
    !huboCambioCarpetaUsuario &&
    recolecciones.every(
      ({ pestana, resultado }) =>
        resultado.cambios.length === 0 && !pestana.hayEdicionesPendientes(),
    )
  ) {
    return;
  }

  botonGuardarGlobal.disabled = true;

  try {
    for (const { pestana, resultado } of recolecciones) {
      if (resultado.cambios.length === 0 && !pestana.hayEdicionesPendientes()) {
        continue;
      }

      const guardado = await pestana.aplicarGuardado(resultado.cambios);

      if (guardado.errores.length > 0) {
        pestana.marcarErroresGuardado(guardado.errores);
        botonGuardarGlobal.disabled = false;
        return;
      }

      await pestana.limpiarEstadoTrasGuardado();
    }

    // Carpeta de Usuario y el cambio de motor se guardan al final: si
    // algún cambio de las otras pestañas falló, ninguno de los dos
    // llega a tocarse (Regla 12 solo debe dispararse cuando el
    // guardado completo es exitoso).
    if (huboCambioCarpetaUsuario) {
      await guardarCarpetaUsuario();
    }

    if (huboCambioModo) {
      await guardarModoMotor();
    }

    mostrarToast("✅ Guardado");
  } catch (error) {
    window.alert(`No se pudo guardar: ${String(error)}`);
  } finally {
    botonGuardarGlobal.disabled = false;
    actualizarVisibilidadGuardarGlobal();
  }
});

// ======================================================
// 👁️ VISIBILIDAD DE "Aplicar cambios"
// ------------------------------------------------------
// Solo debe verse si hay algo pendiente en CUALQUIERA de las
// pestañas (todas exponen hayEdicionesPendientes() como API pull,
// no hay un evento de cambio centralizado) — se resuelve con un
// polling liviano, mismo criterio que el intervalo de
// vent_captura_main.ts.
// ======================================================

function actualizarVisibilidadGuardarGlobal(): void {
  const hayCambios = TODAS_LAS_PESTANAS.some(([, pestana]) =>
    pestana.hayEdicionesPendientes(),
  );

  grupoAccionesDerecha.classList.toggle("oculto", !hayCambios);
}

setInterval(actualizarVisibilidadGuardarGlobal, 250);
actualizarVisibilidadGuardarGlobal();

// ======================================================
// 🏁 INICIAR
// ======================================================

pestanaGeneral.cargar();
pestanaApariencia.cargar();
pestanaTeclas.cargar();
pestanaAvanzado.cargar();
