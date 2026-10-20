use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};

static ALLOW_CLOSE: AtomicBool = AtomicBool::new(false);
static INITIAL_DEEP_LINK: Mutex<Option<String>> = Mutex::new(None);

mod bg_removal;
mod license;

#[derive(Serialize)]
pub struct RemoveBgResult {
    pub success: bool,
    pub preview: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    let mut fonts = Vec::new();
    let provider = font_kit::source::SystemSource::new();
    if let Ok(families) = provider.all_families() {
        for name in families {
            fonts.push(name);
        }
    }
    fonts.sort();
    fonts
}

#[tauri::command]
fn check_model_status(model: String) -> bool {
    bg_removal::check_model_exists(&model)
}

#[tauri::command]
fn check_python_rembg() -> bg_removal::AiStatus {
    // Run the (potentially slow) Python probe off the main thread so the UI
    // never freezes while we probe several interpreters in parallel.
    // The probe itself has a 45s timeout; we give the wrapper thread up to
    // 60s to surface a result (avoids a hanging UI when ONNX warmup is slow).
    let (tx, rx) = std::sync::mpsc::channel::<bg_removal::AiStatus>();
    std::thread::spawn(move || {
        let _ = tx.send(bg_removal::ai_status_full());
    });
    rx.recv_timeout(std::time::Duration::from_secs(60))
        .unwrap_or_else(|_| bg_removal::AiStatus {
            available: false,
            reason: bg_removal::AiUnavailableReason::NoPython,
            python: None,
            python_version: None,
            rembg_version: None,
            hint: Some(
                "Probe timed out. Tente novamente, ou defina REMBG_PYTHON com o caminho do interpretador."
                    .into(),
            ),
        })
}

/// Returns the project file path captured from CLI args at startup (when the OS
/// opens a .lovd file), consuming it so it is only handled once. The frontend
/// calls this on mount to guarantee external opens are never missed even if the
/// `open-project-file` event fired before the listener was ready.
#[tauri::command]
fn take_initial_project_path() -> Option<String> {
    INITIAL_DEEP_LINK.lock().unwrap().take()
}

/// Open a `.lovd` project in a brand-new WebView window of the SAME process.
/// Used when a project is already open and the user opens another file from
/// the Explorer — the single-instance callback emits a routing event and the
/// frontend decides to either replace the current project or spawn a window.
#[tauri::command]
fn open_project_in_new_window(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let label = format!("project-{nanos}");
    let win_path = path.clone();
    // The project path is also carried in the URL so the new window can load it
    // deterministically on mount, BEFORE any Tauri event can be missed. The
    // `open-project-file` emit below remains as a safety net for future routes.
    let encoded = urlencoding::encode(&path);
    let url = WebviewUrl::App(format!("index.html?project={encoded}").into());
    // Garante ícone na barra de tarefas também para janelas secundárias.
    // O ícone vem do default_window_icon (definido pelo bundle icon). Se não houver,
    // decodifica o PNG embarcado via `image` crate.
    // Garante ícone na barra de tarefas também para janelas secundárias.
    let icon = app.default_window_icon().cloned().or_else(|| {
        let bytes = include_bytes!("../icons/32x32.png");
        image::load_from_memory(bytes).ok().map(|img| {
            let rgba = img.to_rgba8();
            let (w, h) = rgba.dimensions();
            tauri::image::Image::new_owned(rgba.into_raw(), w, h)
        })
    });
    let builder = if let Some(ic) = icon {
        let b = WebviewWindowBuilder::new(&app, label.clone(), url.clone())
            .title("Lovert Design")
            .inner_size(1280.0, 800.0)
            .on_page_load({
                let wp = win_path.clone();
                move |window, payload| {
                    if payload.event() == tauri::webview::PageLoadEvent::Finished {
                        let _ = window.emit("open-project-file", wp.clone());
                    }
                }
            })
            .icon(ic);
        match b {
            Ok(ok) => ok,
            Err(_) => WebviewWindowBuilder::new(&app, label, url)
                .title("Lovert Design")
                .inner_size(1280.0, 800.0)
                .on_page_load(move |window, payload| {
                    if payload.event() == tauri::webview::PageLoadEvent::Finished {
                        let _ = window.emit("open-project-file", win_path.clone());
                    }
                }),
        }
    } else {
        WebviewWindowBuilder::new(&app, label, url)
            .title("Lovert Design")
            .inner_size(1280.0, 800.0)
            .on_page_load(move |window, payload| {
                if payload.event() == tauri::webview::PageLoadEvent::Finished {
                    let _ = window.emit("open-project-file", win_path.clone());
                }
            })
    };
    let window = builder.build().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn download_model(model: String) -> Result<String, String> {
    bg_removal::download_model(&model)
}

#[tauri::command]
fn start_model_download(app: tauri::AppHandle, model: String) {
    bg_removal::start_model_download_thread(app, model);
}

#[tauri::command]
fn warmup_ai_model(model: String) -> Result<String, String> {
    bg_removal::warmup_ai_model(&model)
}

#[tauri::command]
fn remove_bg(
    input_path: String,
    mode: String,
    threshold: Option<u16>,
    model: Option<String>,
    erode_size: Option<i32>,
    color: Option<String>,
) -> RemoveBgResult {
    let result = if mode == "detection" {
        let model_name = model.as_deref().unwrap_or("u2net");
        let erode = erode_size.unwrap_or(0);
        bg_removal::remove_bg_ai_cached(&input_path, model_name, erode)
    } else {
        let thr = threshold.unwrap_or(60).clamp(1, 255);
        let erode = erode_size.unwrap_or(0);
        bg_removal::chromakey_remove_bg_hex(&input_path, thr, erode, color)
    };

    match result {
        Ok(b64) => RemoveBgResult {
            success: true,
            preview: Some(b64),
            error: None,
        },
        Err(e) => RemoveBgResult {
            success: false,
            preview: None,
            error: Some(e),
        },
    }
}

#[tauri::command]
fn kill_bg_session() {
    bg_removal::kill_session();
}

/// Webhook do Discord para feedbacks.
/// Nunca é hardcoded: vem do segredo `DISCORD_WEBHOOK_URL` (runtime ou
/// compilação). Sem ele o formulário de feedback fica desativado e o binário
/// não contém qualquer URL embutida.
fn discord_webhook_url() -> Option<String> {
    std::env::var("DISCORD_WEBHOOK_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| v.starts_with("https://"))
        .or_else(|| {
            option_env!("DISCORD_WEBHOOK_URL")
                .map(|s| s.trim().to_string())
                .filter(|v| v.starts_with("https://"))
        })
}

#[tauri::command]
fn submit_complaint(message: String) -> bool {
    let Some(webhook_url) = discord_webhook_url() else {
        // Feedback desativado neste build (sem segredo configurado).
        return false;
    };
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok();
    let Some(client) = client else { return false };
    let payload = serde_json::json!({
        "content": format!("🚩 **Novo Feedback**\n\n{}", message)
    });
    match client.post(&webhook_url).json(&payload).send() {
        Ok(resp) => resp.status().is_success(),
        Err(e) => { eprintln!("Webhook error: {}", e); false }
    }
}

/// Extract a clean .lovd file path from various formats (CLI arg, deep link URL, etc.)
fn extract_lovd_path(raw: &str) -> Option<String> {
    let clean = raw.trim().trim_matches('"').trim_matches('\'');

    // Handle file:/// URLs (deep links on Windows use this format)
    let path = if let Some(stripped) = clean.strip_prefix("file:///") {
        // URL-decode the path (handle %20, etc.)
        let decoded = urlencoding::decode(stripped).unwrap_or_default().into_owned();
        // On Windows, file:///C:/... becomes C:/... after stripping
        decoded
    } else if let Some(idx) = clean.find(".lovd") {
        // Raw path — return everything up to and including .lovd
        let end = idx + 5;
        clean[..end].to_string()
    } else {
        return None;
    };

    // Normalize separators for the host platform so the path is valid on both
    // Windows (`\`) and Linux/macOS (`/`).
    let normalized: String = path
        .chars()
        .map(|c| if c == '/' || c == '\\' { std::path::MAIN_SEPARATOR } else { c })
        .collect();
    if normalized.to_lowercase().ends_with(".lovd") {
        Some(normalized)
    } else {
        None
    }
}

pub fn run() {
    // Capture file path from CLI args (used when OS opens a .lovd file with the app)
    let cli_args: Vec<String> = std::env::args().collect();
    let cli_path = cli_args.iter().skip(1).find_map(|a| {
        if a.to_lowercase().ends_with(".lovd") && !a.starts_with('-') {
            Some(a.clone())
        } else {
            None
        }
    });
    if let Some(ref p) = cli_path {
        let _ = INITIAL_DEEP_LINK.lock().unwrap().insert(p.clone());
    }

    tauri::Builder::default()
        // Multi-instance mode: cada duplo-clique no Explorer abre um
        // processo OS independente. O `single-instance` foi removido
        // propositalmente — cada processo lê o seu próprio argv via
        // `INITIAL_DEEP_LINK` / `take_initial_project_path()` e via
        // `?project=` na URL da janela. Sem hand-off entre processos,
        // não há segunda instância "fantasma" travada.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet, allow_close, get_system_fonts, remove_bg, check_model_status, check_python_rembg, download_model, start_model_download, warmup_ai_model, take_initial_project_path, kill_bg_session, open_project_in_new_window,
            license::verify_license_key, license::check_cached_license, license::clear_license_cache, license::deactivate_license,
            license::get_export_count, license::increment_export_count, license::get_export_limit,
            submit_complaint,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let window = app.get_webview_window("main").unwrap();
            let w = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if ALLOW_CLOSE.load(Ordering::SeqCst) {
                        ALLOW_CLOSE.store(false, Ordering::SeqCst);
                        return;
                    }
                    api.prevent_close();
                    let _ = w.emit("close-requested", ());
                }
            });

            // Listen for deep-link events (custom URL scheme, if configured)
            let handle2 = handle.clone();
            app.listen("deep-link://new-url", move |event| {
                let payload = event.payload();
                let paths: Vec<String> = if payload.starts_with('[') {
                    payload.trim_start_matches('[').trim_end_matches(']').split(',')
                        .filter_map(|s| extract_lovd_path(s)).collect()
                } else {
                    extract_lovd_path(payload).into_iter().collect()
                };
                for p in paths {
                    eprintln!("[deep-link] Opening project: {}", p);
                    let _ = handle2.emit("open-project-file-new-window", p);
                }
            });

            // NOTE: the initial CLI path (first instance launched from Explorer)
            // is intentionally NOT consumed here anymore. It stays in
            // `INITIAL_DEEP_LINK` until the frontend calls
            // `take_initial_project_path()`, which is idempotent (.take()).
            // The old 800ms-delayed event emission is gone — it was the root of
            // the lost-project race when the frontend mounted slowly.

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn allow_close(window: tauri::Window) {
    ALLOW_CLOSE.store(true, Ordering::SeqCst);
    // Close from Rust so the second CloseRequested sees ALLOW_CLOSE immediately
    let _ = window.close();
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
