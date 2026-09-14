// ======================================================
// 🚀 src-tauri/src Main
// ------------------------------------------------------
// Entrada ejecutable Tauri. windows_subsystem="windows" en
// release suprime la ventana de consola que Windows abre por
// defecto (subsistema consola) — se mantiene en debug para
// poder ver los println!/eprintln! de diagnóstico.
// ======================================================

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    omegactrl_lib::run();
}
