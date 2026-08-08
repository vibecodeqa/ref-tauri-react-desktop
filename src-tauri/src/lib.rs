//! Tauri shell.
//!
//! This file is intentionally thin. It owns exactly three commands, and each one does the
//! same two things: pick the vault root (the frontend never supplies a path) and hand the
//! frontend's arguments to [`vault`], which validates them. All of the interesting
//! behaviour — and all of the tests for it — lives in `vault.rs`, which has no Tauri
//! dependency and can therefore be exercised by `cargo test` without a display server.

mod vault;

use std::path::PathBuf;

use tauri::Manager;

use vault::{Note, NoteMeta, VaultError};

/// The single directory this application is allowed to write to.
///
/// Derived from the OS application-data directory, never from anything the webview sends.
fn vault_root(app: &tauri::AppHandle) -> Result<PathBuf, VaultError> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("notes"))
        .map_err(|_| VaultError::io("Application data directory is unavailable."))
}

#[tauri::command]
fn save_note(app: tauri::AppHandle, name: String, body: String) -> Result<NoteMeta, VaultError> {
    vault::save_note(&vault_root(&app)?, &name, &body)
}

#[tauri::command]
fn read_note(app: tauri::AppHandle, name: String) -> Result<Note, VaultError> {
    vault::read_note(&vault_root(&app)?, &name)
}

#[tauri::command]
fn list_notes(app: tauri::AppHandle) -> Result<Vec<NoteMeta>, VaultError> {
    vault::list_notes(&vault_root(&app)?)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_note, read_note, list_notes])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
