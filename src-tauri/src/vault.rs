//! The trusted backend boundary.
//!
//! Everything in this module assumes its caller is hostile: the webview is untrusted, so
//! a note name arriving over IPC is an attacker-controlled string until it has been
//! through [`validate_note_name`]. Nothing here takes a path from the frontend — the
//! frontend never learns one — and every write is confined to a single vault root chosen
//! by the Rust side.
//!
//! The functions are deliberately free of any Tauri types so they can be unit tested
//! without a running app; `lib.rs` is the thin `#[tauri::command]` shell over them.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Maximum note name length, in characters. Mirrored by `MAX_NOTE_NAME_LEN` in
/// `src/ipc/contract.ts`.
pub const MAX_NOTE_NAME_LEN: usize = 64;

/// Maximum note body size, in UTF-8 bytes. Mirrored by `MAX_NOTE_BYTES`.
pub const MAX_NOTE_BYTES: usize = 8 * 1024;

/// Maximum number of notes one vault will hold. Mirrored by `MAX_NOTES`.
pub const MAX_NOTES: usize = 200;

/// The one extension the vault reads or writes.
pub const NOTE_EXTENSION: &str = "txt";

/// The error shape serialised across IPC. Codes are stable; messages are for humans and
/// deliberately never include a host path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VaultError {
    pub code: String,
    pub message: String,
}

impl VaultError {
    pub(crate) fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }

    fn invalid_name(message: impl Into<String>) -> Self {
        Self::new("invalid_name", message)
    }

    fn invalid_body(message: impl Into<String>) -> Self {
        Self::new("invalid_body", message)
    }

    pub(crate) fn io(message: impl Into<String>) -> Self {
        Self::new("io_error", message)
    }
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for VaultError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub name: String,
    pub bytes: usize,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Note {
    pub meta: NoteMeta,
    pub body: String,
}

/// Accepts a note name, or explains why it is refused.
///
/// The allowed character set is `[a-z0-9._-]` with an alphanumeric first character. That
/// alone excludes `/`, `\`, NUL, `:` and a leading `.`, so no traversal or absolute path
/// can survive it. The explicit `..` rejection below is redundant today and is kept
/// deliberately: it is the check that still holds if someone later widens the character
/// set.
pub fn validate_note_name(name: &str) -> Result<&str, VaultError> {
    if name.is_empty() {
        return Err(VaultError::invalid_name("Note name must not be empty."));
    }
    if name.chars().count() > MAX_NOTE_NAME_LEN {
        return Err(VaultError::invalid_name(format!(
            "Note name must be at most {MAX_NOTE_NAME_LEN} characters."
        )));
    }
    if name.contains("..") {
        return Err(VaultError::invalid_name("Note name must not contain '..'."));
    }

    let mut chars = name.chars();
    let first = chars.next().expect("name is non-empty");
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return Err(VaultError::invalid_name(
            "Note name must start with a lowercase letter or a digit.",
        ));
    }
    for c in chars {
        let allowed = c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-');
        if !allowed {
            return Err(VaultError::invalid_name(
                "Note name may only contain a-z, 0-9, '.', '_' and '-'.",
            ));
        }
    }

    Ok(name)
}

/// Accepts a note body, or explains why it is refused.
pub fn validate_note_body(body: &str) -> Result<(), VaultError> {
    if body.len() > MAX_NOTE_BYTES {
        return Err(VaultError::new(
            "note_too_large",
            format!(
                "Note body must be at most {MAX_NOTE_BYTES} bytes (got {}).",
                body.len()
            ),
        ));
    }
    if body
        .chars()
        .any(|c| (c.is_control() && !matches!(c, '\n' | '\r' | '\t')) || c == '\u{7f}')
    {
        return Err(VaultError::invalid_body(
            "Note body must not contain control characters.",
        ));
    }
    Ok(())
}

/// Maps a validated name onto a path inside `root`.
///
/// Defence in depth: after joining, the result must still be a *direct child* of `root`.
/// If a future change to [`validate_note_name`] ever let a separator through, this check
/// fails closed instead of writing outside the vault.
pub fn resolve_note_path(root: &Path, name: &str) -> Result<PathBuf, VaultError> {
    let name = validate_note_name(name)?;
    let path = root.join(format!("{name}.{NOTE_EXTENSION}"));
    if path.parent() != Some(root) {
        return Err(VaultError::invalid_name(
            "Resolved note path escaped the vault root.",
        ));
    }
    if path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(VaultError::invalid_name(
            "Resolved note path contains a parent-directory component.",
        ));
    }
    Ok(path)
}

fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        })
}

/// Writes a note into the vault, creating the vault root if needed.
pub fn save_note(root: &Path, name: &str, body: &str) -> Result<NoteMeta, VaultError> {
    let path = resolve_note_path(root, name)?;
    validate_note_body(body)?;

    fs::create_dir_all(root).map_err(|e| VaultError::io(e.to_string()))?;

    if !path.exists() && count_notes(root)? >= MAX_NOTES {
        return Err(VaultError::new(
            "vault_full",
            format!("Vault already holds the maximum of {MAX_NOTES} notes."),
        ));
    }

    fs::write(&path, body).map_err(|e| VaultError::io(e.to_string()))?;
    let metadata = fs::metadata(&path).map_err(|e| VaultError::io(e.to_string()))?;

    Ok(NoteMeta {
        name: name.to_string(),
        bytes: body.len(),
        modified_ms: modified_ms(&metadata),
    })
}

/// Reads a note out of the vault.
pub fn read_note(root: &Path, name: &str) -> Result<Note, VaultError> {
    let path = resolve_note_path(root, name)?;
    let metadata = match fs::metadata(&path) {
        Ok(metadata) => metadata,
        Err(_) => return Err(VaultError::new("not_found", "No such note.")),
    };
    if !metadata.is_file() {
        return Err(VaultError::new("not_found", "No such note."));
    }
    // Refuse to load anything that grew past the cap out of band.
    if metadata.len() as usize > MAX_NOTE_BYTES {
        return Err(VaultError::new(
            "note_too_large",
            format!("Stored note exceeds the {MAX_NOTE_BYTES} byte cap."),
        ));
    }
    let body = fs::read_to_string(&path).map_err(|e| VaultError::io(e.to_string()))?;

    Ok(Note {
        meta: NoteMeta {
            name: name.to_string(),
            bytes: body.len(),
            modified_ms: modified_ms(&metadata),
        },
        body,
    })
}

fn count_notes(root: &Path) -> Result<usize, VaultError> {
    Ok(list_notes(root)?.len())
}

/// Lists the notes in the vault, name-sorted. Anything in the directory that is not a
/// well-named `.txt` file is ignored rather than reported.
pub fn list_notes(root: &Path) -> Result<Vec<NoteMeta>, VaultError> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let entries = fs::read_dir(root).map_err(|e| VaultError::io(e.to_string()))?;

    let mut notes = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| VaultError::io(e.to_string()))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some(NOTE_EXTENSION) {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if validate_note_name(stem).is_err() {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        notes.push(NoteMeta {
            name: stem.to_string(),
            bytes: metadata.len() as usize,
            modified_ms: modified_ms(&metadata),
        });
    }
    notes.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(notes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn vault() -> TempDir {
        TempDir::new().expect("temp dir")
    }

    #[test]
    fn accepts_plain_names() {
        for name in ["a", "note", "release-checklist", "2026.01_draft", "x9"] {
            assert!(validate_note_name(name).is_ok(), "expected {name} to be ok");
        }
    }

    #[test]
    fn rejects_parent_directory_traversal() {
        for name in ["..", "../etc/passwd", "a/../../b", "notes/..", ".."] {
            let err = validate_note_name(name).expect_err("traversal must be rejected");
            assert_eq!(err.code, "invalid_name", "for {name}");
        }
    }

    #[test]
    fn rejects_path_separators_and_absolute_paths() {
        for name in [
            "a/b",
            "a\\b",
            "/etc/passwd",
            "\\\\server\\share",
            "c:notes",
            "~/secrets",
            "./hidden",
        ] {
            let err = validate_note_name(name).expect_err("separator must be rejected");
            assert_eq!(err.code, "invalid_name", "for {name}");
        }
    }

    #[test]
    fn rejects_empty_control_and_uppercase_names() {
        for name in ["", "Note", "no te", "nul\u{0}byte", "emoji\u{1f600}"] {
            let err = validate_note_name(name).expect_err("must be rejected");
            assert_eq!(err.code, "invalid_name", "for {name:?}");
        }
    }

    #[test]
    fn rejects_oversized_names() {
        let long = "a".repeat(MAX_NOTE_NAME_LEN + 1);
        let err = validate_note_name(&long).expect_err("oversized name must be rejected");
        assert_eq!(err.code, "invalid_name");
        assert!(validate_note_name(&"a".repeat(MAX_NOTE_NAME_LEN)).is_ok());
    }

    #[test]
    fn rejects_oversized_bodies() {
        let big = "x".repeat(MAX_NOTE_BYTES + 1);
        let err = validate_note_body(&big).expect_err("oversized body must be rejected");
        assert_eq!(err.code, "note_too_large");
        assert!(validate_note_body(&"x".repeat(MAX_NOTE_BYTES)).is_ok());
    }

    #[test]
    fn body_size_is_measured_in_bytes_not_chars() {
        // A 3-byte character repeated past the byte cap but under the char count cap.
        let multibyte = "\u{4e2d}".repeat(MAX_NOTE_BYTES / 2);
        assert!(multibyte.chars().count() < MAX_NOTE_BYTES);
        let err = validate_note_body(&multibyte).expect_err("byte cap must apply");
        assert_eq!(err.code, "note_too_large");
    }

    #[test]
    fn rejects_control_characters_in_body() {
        let err = validate_note_body("ok\u{0}bad").expect_err("NUL must be rejected");
        assert_eq!(err.code, "invalid_body");
        assert!(validate_note_body("line one\nline two\r\n\ttabbed").is_ok());
    }

    #[test]
    fn resolved_path_stays_inside_the_vault_root() {
        let dir = vault();
        let path = resolve_note_path(dir.path(), "notes.2026").expect("valid name resolves");
        assert_eq!(path.parent(), Some(dir.path()));
        assert_eq!(
            path.file_name().and_then(|n| n.to_str()),
            Some("notes.2026.txt")
        );
    }

    #[test]
    fn traversal_never_produces_a_path() {
        let dir = vault();
        for name in ["../escape", "..", "a/../../b"] {
            assert!(resolve_note_path(dir.path(), name).is_err(), "for {name}");
        }
    }

    #[test]
    fn save_then_read_round_trips() {
        let dir = vault();
        let root = dir.path().join("notes");

        let meta = save_note(&root, "checklist", "ship it").expect("save");
        assert_eq!(meta.name, "checklist");
        assert_eq!(meta.bytes, 7);

        let note = read_note(&root, "checklist").expect("read");
        assert_eq!(note.body, "ship it");
        assert_eq!(note.meta.name, "checklist");
    }

    #[test]
    fn save_refuses_to_write_outside_the_vault() {
        let dir = vault();
        let root = dir.path().join("notes");
        let sentinel = dir.path().join("escaped.txt");

        let err = save_note(&root, "../escaped", "pwned").expect_err("must refuse");
        assert_eq!(err.code, "invalid_name");
        assert!(
            !sentinel.exists(),
            "nothing may be written outside the root"
        );
    }

    #[test]
    fn save_refuses_oversized_bodies_without_touching_disk() {
        let dir = vault();
        let root = dir.path().join("notes");
        let big = "x".repeat(MAX_NOTE_BYTES + 1);

        let err = save_note(&root, "huge", &big).expect_err("must refuse");
        assert_eq!(err.code, "note_too_large");
        assert!(!root.join("huge.txt").exists());
    }

    #[test]
    fn read_reports_missing_notes_without_leaking_a_path() {
        let dir = vault();
        let err = read_note(&dir.path().join("notes"), "absent").expect_err("must fail");
        assert_eq!(err.code, "not_found");
        assert!(!err.message.contains('/'), "message must not carry a path");
    }

    #[test]
    fn list_is_sorted_and_ignores_foreign_files() {
        let dir = vault();
        let root = dir.path().join("notes");
        save_note(&root, "beta", "b").expect("save beta");
        save_note(&root, "alpha", "a").expect("save alpha");
        fs::write(root.join("ignored.md"), "not a note").expect("write foreign file");
        fs::write(root.join("BAD NAME.txt"), "not a note").expect("write bad name");

        let names: Vec<String> = list_notes(&root)
            .expect("list")
            .into_iter()
            .map(|n| n.name)
            .collect();
        assert_eq!(names, vec!["alpha".to_string(), "beta".to_string()]);
    }

    #[test]
    fn list_of_a_missing_vault_is_empty_not_an_error() {
        let dir = vault();
        assert!(list_notes(&dir.path().join("never-created"))
            .expect("list")
            .is_empty());
    }
}
