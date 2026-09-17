// ======================================================
// ui_Statusbar
// ======================================================

import { invoke } from "@tauri-apps/api/core";

import { listen } from "@tauri-apps/api/event";

import type { FilaPerfil } from "../core/core_perfil";

import {
  obtenerConflictos,
  obtenerSnapshotAtajoReservado,
} from "../core/core_conflictos";

import { obtenerAdvertenciasCompilacion } from "../core/core_advertencias_compilacion";

import {
  obtenerTextoEstadoNormal,
  esperarTextoEstadoNormal,
  obtenerTextoNotificacion,
  obtenerTextoNotificacionAtajoReservado,
  obtenerTextoAdvertenciaCompilacion,
} from "../core/core_notificaciones";

let textoActual: HTMLElement | null = null;
let boxModoActual: HTMLElement | null = null;
let modoMotorConocido: string | null = null;
let alCambiarModoMotor: (() => void) | null = null;

// ======================================================
// CREAR STATUSBAR
// ------------------------------------------------------
// alCambiarModo (opcional): se llama cuando el polling detecta que
// el modo motor cambió respecto de la última lectura — cubre el
// caso en que el cambio se pidió desde la Ventana de Configuración
// mientras esta ventana (principal) sigue abierta. motor::
// solicitar_cambio_modo ya detiene el perfil y limpia la caché en el
// backend (ver motor.rs) — esto solo refleja ese apagado en la UI.
// ======================================================

export function crearStatusbar(alCambiarModo?: () => void): HTMLElement {
  const status = document.createElement("footer");

  status.className = "statusbar";

  const texto = document.createElement("span");
  texto.className = "statusbar-texto";
  texto.textContent = obtenerTextoEstadoNormal();

  // Al crear el statusbar la versión puede no estar resuelta todavía
  // (respaldo sincrónico "Perfil activo." mientras tanto) — en cuanto
  // esté lista se refresca, salvo que para entonces ya haya aparecido
  // una notificación real (no se la pisa).
  const textoAlCrear = texto.textContent;

  void esperarTextoEstadoNormal().then((valor) => {
    if (texto.textContent === textoAlCrear) {
      texto.textContent = valor;
    }
  });

  const boxModo = document.createElement("span");
  boxModo.className = "statusbar-box-modo";

  status.append(texto, boxModo);

  textoActual = texto;
  boxModoActual = boxModo;
  alCambiarModoMotor = alCambiarModo ?? null;

  iniciarEstadoModoMotor();

  return status;
}

// ======================================================
// 🛠️ MODO MOTOR (Driver/Simple)
// ------------------------------------------------------
// Al crear el statusbar se hace una consulta única
// (motor_obtener_modo) para pintar el estado inicial. Los
// cambios posteriores (por ejemplo desde la Ventana de
// Configuración, mientras esta ventana principal sigue
// abierta) llegan por el evento "motor_modo_cambio",
// emitido desde motor.rs en guardar_modo().
// ======================================================

let modoMotorIniciado = false;

function iniciarEstadoModoMotor(): void {
  if (modoMotorIniciado) {
    return;
  }

  modoMotorIniciado = true;

  void actualizarBoxModoMotor();

  void listen<string>("motor_modo_cambio", (evento) => {
    aplicarModo(evento.payload);
  });
}

async function actualizarBoxModoMotor(): Promise<void> {
  try {
    const modo = await invoke<string>("motor_obtener_modo");

    aplicarModo(modo);
  } catch {
    // Sin datos nuevos, se deja el último valor mostrado.
  }
}

function aplicarModo(modo: string): void {
  if (!boxModoActual) {
    return;
  }

  boxModoActual.textContent = modo === "Portable" ? "(S)" : "(D)";
  boxModoActual.title =
    modo === "Portable"
      ? "Modo Simple (API Windows)"
      : "Modo Driver (Interception)";

  if (modoMotorConocido !== null && modo !== modoMotorConocido) {
    alCambiarModoMotor?.();
  }

  modoMotorConocido = modo;
}

// ======================================================
// 🔄 ACTUALIZAR STATUSBAR
// ======================================================

export function actualizarStatusbar(filas: FilaPerfil[]): void {
  if (!textoActual) {
    return;
  }

  const conflictos = obtenerConflictos(filas);

  const advertencias = obtenerAdvertenciasCompilacion();

  const conflictosAtajo = obtenerSnapshotAtajoReservado();

  if (
    conflictos.length === 0 &&
    advertencias.length === 0 &&
    conflictosAtajo.length === 0
  ) {
    textoActual.textContent = obtenerTextoEstadoNormal();

    return;
  }

  const textosConflictos = conflictos.map((conflicto) =>
    obtenerTextoNotificacion(conflicto.codigo, {
      filaA: conflicto.numeroA,

      filaB: conflicto.numeroB,

      appA: conflicto.filaA.app,

      appB: conflicto.filaB.app,
    }),
  );

  const textosAtajo = conflictosAtajo.map((conflicto) =>
    obtenerTextoNotificacionAtajoReservado({
      fila: conflicto.numeroFila,

      columna: conflicto.columna,
    }),
  );

  const textosAdvertencias = advertencias.map((advertencia) =>
    obtenerTextoAdvertenciaCompilacion(advertencia.fila, advertencia.mensaje),
  );

  textoActual.textContent = [
    ...textosConflictos,
    ...textosAtajo,
    ...textosAdvertencias,
  ].join("   •   ");
}
