use base64::Engine;
use image::GenericImageView;
use serde::Serialize;
use std::io::{BufRead, BufReader, Cursor, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

/// Reason the AI (rembg) path is unavailable. Surfaced to the UI so the user
/// gets an actionable error instead of a silent "IA indisponível".
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiUnavailableReason {
    /// Python interpreter not found anywhere (PATH, py launcher, common venvs).
    NoPython,
    /// Python was found but is older than 3.10 (rembg requirement).
    PythonTooOld,
    /// Python was found but `rembg` is not importable.
    RembgMissing,
    /// rembg is installed but failed to load (corrupted install, onnx issue).
    RembgBroken,
    /// First probe run; status not yet known.
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiStatus {
    pub available: bool,
    pub reason: AiUnavailableReason,
    pub python: Option<String>,
    pub python_version: Option<String>,
    pub rembg_version: Option<String>,
    pub hint: Option<String>,
}

/// Cached Python command: (program, args) that work on this machine.
/// Populated by `python_rembg_available()` — reused by all callers.
static PYTHON_CMD: OnceLock<(String, Vec<String>)> = OnceLock::new();

/// Cached probe status so repeated Tauri calls don't re-spawn Python.
static AI_STATUS: OnceLock<AiStatus> = OnceLock::new();

fn build_python_cmd() -> Command {
    // Auto-initialize if not yet probed (safety net for direct callers)
    if PYTHON_CMD.get().is_none() {
        python_rembg_available();
    }
    let (prog, args) = PYTHON_CMD.get().expect("python_rembg_available must be called first");
    let mut cmd = Command::new(prog);
    for a in args {
        cmd.arg(a);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn u2net_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    let mut path = PathBuf::from(home);
    path.push(".u2net");
    path
}

fn model_path(name: &str) -> PathBuf {
    let mut path = u2net_dir();
    path.push(name);
    path
}

pub fn check_model_exists(model: &str) -> bool {
    let fname = format!("{}.onnx", model);
    model_path(&fname).exists()
}

/// Public, side-effect-free accessor for the cached probe result.
pub fn ai_status() -> AiStatus {
    AI_STATUS
        .get()
        .cloned()
        .unwrap_or_else(|| AiStatus {
            available: false,
            reason: AiUnavailableReason::Unknown,
            python: None,
            python_version: None,
            rembg_version: None,
            hint: Some("Probe nao executado.".into()),
        })
}

/// Build a list of (program, args) candidate interpreters to try, including
/// common venv / conda locations so users with rembg installed in a project
/// venv still get detected. Order matters: more specific first.
fn build_python_candidates() -> Vec<(String, Vec<String>)> {
    let mut candidates: Vec<(String, Vec<String>)> = Vec::new();

    // 0. Explicit override via env var — highest priority, lets users / CI pin
    //    an interpreter even when none of the heuristics below would find it.
    if let Ok(p) = std::env::var("REMBG_PYTHON") {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            candidates.push((trimmed.to_string(), vec![]));
        }
    }

    // 1. Common Windows launcher + PATH names.
    candidates.push(("py".into(), vec!["-3".into()]));
    candidates.push(("py".into(), vec![]));
    candidates.push(("python".into(), vec![]));
    candidates.push(("python3".into(), vec![]));
    candidates.push(("python".into(), vec!["-3".into()]));

    // 2. Common project venv / conda locations relative to the executable /
    //    cwd. Many users install rembg in a venv next to the app.
    if let Ok(cwd) = std::env::current_dir() {
        for sub in [".venv", "venv", "env"] {
            for py in ["python.exe", "python3.exe", "python"] {
                let p = cwd.join(sub).join(if cfg!(windows) { "Scripts" } else { "bin" }).join(py);
                if p.exists() {
                    candidates.push((p.to_string_lossy().to_string(), vec![]));
                }
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            for sub in [".venv", "venv"] {
for py in ["python.exe", "python3.exe", "python"] {
                    let p = parent.join(sub).join(if cfg!(windows) { "Scripts" } else { "bin" }).join(py);
                    if p.exists() {
                        candidates.push((p.to_string_lossy().to_string(), vec![]));
                    }
                }
            }
        }
    }
    // Conda envs.
    if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
        for env in ["rembg", ".rembg"] {
            for py in ["python.exe", "python3.exe", "python"] {
                let p = PathBuf::from(&home).join(env).join(if cfg!(windows) { "python.exe" } else { "bin/python" });
                if p.exists() {
                    candidates.push((p.to_string_lossy().to_string(), vec![]));
                }
            }
        }
    }

    candidates
}

/// Inner probe: given a candidate (program, args), figure out what we have.
/// Returns the same status struct so the caller can pick the best candidate.
fn probe_candidate(prog: &str, args: &[String]) -> Option<AiStatus> {
    let mut cmd = Command::new(prog);
    for a in args {
        cmd.arg(a);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    // First: get the Python version + check rembg is importable + read its version.
    // One script does everything — much faster than three separate spawns, and
    // it warms ONNX in the same process so subsequent calls are also faster.
    const PROBE_SCRIPT: &str = r#"
import sys
try:
    import rembg
    print("PYVER", sys.version.split()[0])
    print("REMBGVER", getattr(rembg, "__version__", "unknown"))
    print("REMOK")
except ModuleNotFoundError:
    try:
        print("PYVER", sys.version.split()[0])
        print("NOREMBG")
    except Exception as e:
        print("PYERR", str(e))
        sys.exit(1)
except Exception as e:
    try:
        print("PYVER", sys.version.split()[0])
        print("REMBGERR", str(e)[:200])
    except Exception:
        print("REMBGERR", "unknown")
"#;
    let output = cmd.arg("-c").arg(PROBE_SCRIPT).output().ok()?;
    if !output.status.success() && output.stdout.is_empty() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut pyver: Option<String> = None;
    let mut remver: Option<String> = None;
    let mut available = false;
    let mut reason = AiUnavailableReason::Unknown;
    for line in stdout.lines() {
        let line = line.trim();
        if let Some(v) = line.strip_prefix("PYVER ") {
            pyver = Some(v.to_string());
        } else if let Some(v) = line.strip_prefix("REMBGVER ") {
            remver = Some(v.to_string());
        } else if line == "REMOK" {
            available = true;
            reason = AiUnavailableReason::Unknown;
        } else if line == "NOREMBG" {
            reason = AiUnavailableReason::RembgMissing;
        } else if let Some(msg) = line.strip_prefix("REMBGERR ") {
            reason = AiUnavailableReason::RembgBroken;
            // We still want to surface the underlying message via hint below.
            return Some(AiStatus {
                available: false,
                reason,
                python: Some(prog.to_string()),
                python_version: pyver,
                rembg_version: remver,
                hint: Some(format!("rembg instalado mas falhou ao carregar: {}", msg)),
            });
        }
    }
    if pyver.is_none() {
        // Probe script didn't run — Python itself isn't usable (Store alias, etc.)
        return None;
    }
    // Validate Python >= 3.10
    if let Some(v) = &pyver {
        let mut parts = v.split('.');
        let major: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let minor: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        if major < 3 || (major == 3 && minor < 10) {
            reason = AiUnavailableReason::PythonTooOld;
            available = false;
        }
    }
    if reason == AiUnavailableReason::Unknown && !available {
        reason = AiUnavailableReason::NoPython;
    }
    let hint = match reason {
        AiUnavailableReason::RembgMissing => Some(format!(
            "Python {} encontrado em `{}`, mas o pacote `rembg` nao esta instalado. Execute: pip install rembg",
            pyver.as_deref().unwrap_or("?"), prog
        )),
        AiUnavailableReason::PythonTooOld => Some(format!(
            "Python {} encontrado em `{}`, mas rembg requer Python 3.10+. Instale Python 3.10+ ou defina REMBG_PYTHON.",
            pyver.as_deref().unwrap_or("?"), prog
        )),
        AiUnavailableReason::RembgBroken => None,
        _ => None,
    };
    Some(AiStatus {
        available,
        reason,
        python: Some(prog.to_string()),
        python_version: pyver,
        rembg_version: remver,
        hint,
    })
}

pub fn python_rembg_available() -> bool {
    ai_status_full().available
}

/// Probe all candidate interpreters and return the first one with rembg ready.
/// Falls back to the best partial match (Python present, rembg missing) so the
/// UI can show a helpful install hint instead of a dead "IA indisponível".
pub fn ai_status_full() -> AiStatus {
    if let Some(cached) = AI_STATUS.get() {
        return cached.clone();
    }

    let candidates = build_python_candidates();
    // Race all candidates in parallel. Each thread does ONE Python spawn that
    // runs the probe script (version + rembg check in one shot — avoids the
    // ONNX double-load of the previous design).
    let (tx, rx) = std::sync::mpsc::channel::<AiStatus>();
    let mut handles = Vec::new();
    for (prog, args) in candidates.iter() {
        let tx = tx.clone();
        let prog_s = prog.clone();
        let args_v = args.clone();
        handles.push(std::thread::spawn(move || {
            if let Some(status) = probe_candidate(&prog_s, &args_v) {
                let _ = tx.send(status);
            }
        }));
    }
    drop(tx);

    // Drain results. We collect them all (with a generous timeout) so we can
    // pick the BEST match: a working rembg > Python found > no Python.
    let timeout = std::time::Duration::from_secs(45);
    let deadline = std::time::Instant::now() + timeout;
    let mut best: Option<AiStatus> = None;
    loop {
        let now = std::time::Instant::now();
        if now >= deadline {
            break;
        }
        let remaining = deadline - now;
        match rx.recv_timeout(remaining) {
            Ok(status) => {
                let replace = match &best {
                    None => true,
                    Some(current) => status.available && !current.available,
                };
                if replace {
                    best = Some(status);
                }
                if best.as_ref().map(|s| s.available).unwrap_or(false) {
                    // We have a working interpreter — no need to keep waiting
                    // for the others.
                    break;
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    let status = best.unwrap_or(AiStatus {
        available: false,
        reason: AiUnavailableReason::NoPython,
        python: None,
        python_version: None,
        rembg_version: None,
        hint: Some(
            "Python nao encontrado. Instale Python 3.10+ e execute `pip install rembg`, ou defina REMBG_PYTHON com o caminho do interpretador."
                .into(),
        ),
    });

    // Cache the chosen interpreter so subsequent calls reuse it. We resolve the
    // args by re-locating the candidate that produced this status (matched on
    // `python` program string). If not found we fall back to empty args,
    // which works for absolute paths and `python`/`python3` from PATH.
    if status.available {
        if let Some(prog) = &status.python {
            let matched_args = candidates
                .iter()
                .find(|(p, _)| p == prog)
                .map(|(_, a)| a.clone())
                .unwrap_or_default();
            let _ = PYTHON_CMD.set((prog.clone(), matched_args));
        }
    }
    let _ = AI_STATUS.set(status.clone());
    status
}

const WARMUP_PYTHON_SCRIPT: &str = r#"
import os, sys
try:
    from rembg import new_session
    model = os.environ.get('REMBG_MODEL', 'u2net')
    session = new_session(model)
    print("OK")
except Exception as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
"#;

const DOWNLOAD_PYTHON_SCRIPT: &str = r#"
import os, sys
try:
    from rembg import new_session
    model = os.environ.get('REMBG_MODEL', 'u2net')
    # new_session() auto-downloads the model if not cached
    session = new_session(model)
    print("OK")
except Exception as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
"#;

/// Long-running Python process that keeps a rembg session alive.
/// Reads image paths from stdin (one per line), processes them, writes
/// the output path to stdout. Protocol:
///   INIT:  model=<name>\n
///   WORK:  <input_path>\n  ->  <output_path>\n  |  ERR <message>\n
///   QUIT:  __QUIT__\n
const SESSION_SERVER_SCRIPT: &str = r#"
import sys, os
from rembg import remove, new_session

model_name = os.environ.get('REMBG_MODEL', 'u2net')
session = new_session(model_name)
print("READY", flush=True)

for line in sys.stdin:
    path = line.strip()
    if not path:
        continue
    if path == "__QUIT__":
        break
    try:
        out_path = path + ".tmp_bg_output.png"
        with open(path, 'rb') as f:
            data = f.read()
        result = remove(data, session=session)
        with open(out_path, 'wb') as f:
            f.write(result)
        print(out_path, flush=True)
    except Exception as e:
        print(f"ERR {e}", flush=True)
"#;

/// Cached session process: (child, stdin_handle, stdout_reader, model_name).
/// Protected by a Mutex so multiple threads can check/request the session.
static SESSION_PROCESS: Mutex<Option<SessionHandle>> = Mutex::new(None);

struct SessionHandle {
    _child: std::process::Child,
    stdin: std::process::ChildStdin,
    reader: std::io::BufReader<std::process::ChildStdout>,
    model_name: String,
}

fn ensure_session(model: &str) -> Result<std::sync::MutexGuard<'static, Option<SessionHandle>>, String> {
    let mut guard = SESSION_PROCESS.lock().map_err(|e| format!("Lock error: {}", e))?;

    // If we already have a session for this model, reuse it
    if let Some(ref mut handle) = *guard {
        if handle.model_name == model {
            // Verify the process is still alive by checking if READY was received
            // (session was already initialized)
            return Ok(guard);
        }
        // Different model — kill the old process
        let _ = handle.stdin.write_all(b"__QUIT__\n");
        let _ = handle._child.kill();
        let _ = handle._child.wait();
        *guard = None;
    }

    // Spawn a new session process
    let mut cmd = build_python_cmd();
    cmd.env("REMBG_MODEL", model)
        .args(["-c", SESSION_SERVER_SCRIPT])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    let mut child = cmd.spawn()
        .map_err(|e| format!("Erro ao iniciar sessao Python: {}", e))?;

    let stdin = child.stdin.take().ok_or("Sem stdin")?;
    let stdout = child.stdout.take().ok_or("Sem stdout")?;
    let mut reader = BufReader::new(stdout);

    // Wait for "READY" from the Python process
    let mut buf = String::new();
    let timeout = std::time::Duration::from_secs(30);
    let start = std::time::Instant::now();
    loop {
        if start.elapsed() > timeout {
            let _ = child.kill();
            return Err("Timeout ao aguardar modelo ser carregado".into());
        }
        buf.clear();
        let bytes = reader.read_line(&mut buf)
            .map_err(|e| format!("Erro ao ler do Python: {}", e))?;
        if bytes == 0 {
            let _ = child.kill();
            return Err("Python process terminated before READY".into());
        }
        if buf.trim() == "READY" {
            break;
        }
    }

    *guard = Some(SessionHandle {
        _child: child,
        stdin,
        reader,
        model_name: model.to_string(),
    });

    Ok(guard)
}

pub fn download_model(model: &str) -> Result<String, String> {
    let fname = format!("{}.onnx", model);
    let path = model_path(&fname);
    if path.exists() {
        return Ok("EXISTS".to_string());
    }

    let status = build_python_cmd()
        .env("REMBG_MODEL", model)
        .args(["-c", DOWNLOAD_PYTHON_SCRIPT])
        .output()
        .map_err(|e| format!(
            "Erro ao executar Python: {}. Verifique se Python esta instalado.", e
        ))?;

    if status.status.success() {
        Ok("OK".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&status.stderr);
        Err(format!("Erro ao baixar modelo: {}", stderr.trim()))
    }
}

/// Expected model file sizes in bytes (approximate, for progress reporting).
fn expected_model_size(model: &str) -> u64 {
    match model {
        "u2net" => 173_000_000,
        "u2netp" => 4_700_000,
        "silueta" => 43_000_000,
        "u2net_human_seg" => 190_000_000,
        "isnet-general-use" => 176_000_000,
        "isnet-anime" => 176_000_000,
        "birefnet-general" => 250_000_000,
        _ => 100_000_000,
    }
}

/// Spawn an async model download that emits progress events to the frontend.
pub fn start_model_download_thread(
    app: tauri::AppHandle,
    model: String,
) {
    std::thread::spawn(move || {
        let emit = |phase: &str, message: &str, progress: f32| {
            let _ = app.emit("model-download-progress", serde_json::json!({
                "phase": phase,
                "message": message,
                "progress": progress,
            }));
        };

        let fname = format!("{}.onnx", model);
        let path = model_path(&fname);

        // Phase 1: Check
        emit("checking", "Verificando modelo...", 0.0);
        if path.exists() {
            emit("complete", "Modelo ja existe", 1.0);
            return;
        }

        // Phase 2: Download
        emit("downloading", "Baixando modelo...", 0.0);

        // Start the Python download process
        let child_result = {
            let mut cmd = build_python_cmd();
            cmd.env("REMBG_MODEL", &model)
                .args(["-c", DOWNLOAD_PYTHON_SCRIPT])
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            cmd.spawn()
        };

        let mut child = match child_result {
            Ok(c) => c,
            Err(e) => {
                emit("error", &format!("Erro ao iniciar download: {}", e), 0.0);
                return;
            }
        };

        // Monitor file size while Python downloads
        let expected = expected_model_size(&model);
        let mut last_progress = 0.0f32;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(400));
            match child.try_wait() {
                Ok(Some(status)) => {
                    if status.success() {
                        emit("download_complete", "Download concluido", 1.0);
                    } else {
                        let stderr = child.stderr.take()
                            .and_then(|mut s| { let mut buf = String::new(); std::io::Read::read_to_string(&mut s, &mut buf).ok(); Some(buf) })
                            .unwrap_or_default();
                        emit("error", &format!("Erro ao baixar: {}", stderr.trim()), 0.0);
                        return;
                    }
                    break;
                }
                Ok(None) => {
                    // Still running — check file size for progress
                    if let Ok(meta) = std::fs::metadata(&path) {
                        let current = meta.len();
                        let progress = if expected > 0 {
                            (current as f32 / expected as f32).min(0.95)
                        } else {
                            0.5
                        };
                        // Only emit if progress changed significantly
                        if progress - last_progress >= 0.02 || progress >= 0.95 {
                            let mb = current as f64 / 1_048_576.0;
                            let total_mb = expected as f64 / 1_048_576.0;
                            emit("downloading", &format!("Baixando... {:.0}/{:.0} MB", mb, total_mb), progress);
                            last_progress = progress;
                        }
                    }
                }
                Err(_) => {
                    emit("error", "Erro ao verificar progresso", 0.0);
                    return;
                }
            }
        }

        // Phase 3: Warmup (load model into memory)
        emit("loading", "Carregando modelo na memoria...", 0.95);
        let warmup_result = {
            let mut cmd = build_python_cmd();
            cmd.env("REMBG_MODEL", &model)
                .args(["-c", WARMUP_PYTHON_SCRIPT])
                .output()
        };

        match warmup_result {
            Ok(status) if status.status.success() => {
                emit("complete", "Modelo pronto!", 1.0);
            }
            Ok(status) => {
                let stderr = String::from_utf8_lossy(&status.stderr);
                emit("error", &format!("Erro ao carregar modelo: {}", stderr.trim()), 0.0);
            }
            Err(e) => {
                emit("error", &format!("Erro ao carregar modelo: {}", e), 0.0);
            }
        }
    });
}

pub fn warmup_ai_model(model: &str) -> Result<String, String> {
    let fname = format!("{}.onnx", model);
    let mpath = model_path(&fname);
    if !mpath.exists() {
        return Err(format!("Modelo {} nao encontrado. Baixe-o primeiro.", model));
    }

    let status = build_python_cmd()
        .env("REMBG_MODEL", model)
        .args(["-c", WARMUP_PYTHON_SCRIPT])
        .output()
        .map_err(|e| format!("Erro ao executar Python: {}. Verifique se Python esta instalado.", e))?;

    if status.status.success() {
        Ok("OK".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&status.stderr);
        Err(format!("Erro ao carregar modelo: {}", stderr.trim()))
    }
}

fn erode_alpha(img: &mut image::RgbaImage, size: u32) {
    if size == 0 { return; }
    let (w, h) = img.dimensions();
    let mut alpha = vec![255u8; (w * h) as usize];
    let radius = size;
    let kernel_pixels = (radius * 2 + 1) * (radius * 2 + 1);
    let half = kernel_pixels / 2;
    for y in radius..h.saturating_sub(radius) {
        for x in radius..w.saturating_sub(radius) {
            let mut transparent = 0u32;
            for dy in 0..=radius * 2 {
                for dx in 0..=radius * 2 {
                    let px = img.get_pixel(x + dx - radius, y + dy - radius);
                    if px[3] < 128 { transparent += 1; }
                }
            }
            let idx = (y * w + x) as usize;
            alpha[idx] = if transparent > half { 0 } else { 255 };
        }
    }
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            img.get_pixel_mut(x, y)[3] = alpha[idx];
        }
    }
}

fn apply_mask_refine(img: &mut image::RgbaImage, erode_size: i32) {
    if erode_size > 0 {
        erode_alpha(img, erode_size as u32);
    }
}

fn encode_png(img: &image::RgbaImage) -> Result<String, String> {
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| format!("Erro ao codificar PNG: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
}

/// Remove background using a cached session (much faster for repeated calls).
pub fn remove_bg_ai_cached(input_path: &str, model: &str, erode_size: i32) -> Result<String, String> {
    let fname = format!("{}.onnx", model);
    let mpath = model_path(&fname);
    if !mpath.exists() {
        return Err(format!("Modelo {} nao encontrado. Baixe-o primeiro.", model));
    }

    let mut guard = ensure_session(model)?;
    let handle = guard.as_mut().ok_or("Sessao nao disponivel")?;

    // Send the input path
    handle.stdin.write_all(format!("{}\n", input_path).as_bytes())
        .map_err(|e| format!("Erro ao enviar para Python: {}", e))?;
    handle.stdin.flush()
        .map_err(|e| format!("Erro ao flush: {}", e))?;

    // Read the response
    let mut response = String::new();
    handle.reader.read_line(&mut response)
        .map_err(|e| format!("Erro ao ler resposta: {}", e))?;
    let response = response.trim();

    if let Some(err_path) = response.strip_prefix("ERR ") {
        return Err(format!("rembg erro: {}", err_path));
    }

    // response is the output file path
    let output_path = response.to_string();

    let img = image::open(&output_path)
        .map_err(|e| {
            let _ = std::fs::remove_file(&output_path);
            format!("Erro ao ler resultado: {}", e)
        })?;

    let _ = std::fs::remove_file(&output_path);

    let mut rgba = img.to_rgba8();
    apply_mask_refine(&mut rgba, erode_size);

    encode_png(&rgba)
}

/// Kill the cached session process (call when switching models or shutting down).
pub fn kill_session() {
    if let Ok(mut guard) = SESSION_PROCESS.lock() {
        if let Some(mut handle) = guard.take() {
            let _ = handle.stdin.write_all(b"__QUIT__\n");
            let _ = handle._child.kill();
            let _ = handle._child.wait();
        }
    }
}

pub fn chromakey_remove_bg(input_path: &str, threshold: u16, erode_size: i32, target_color: Option<(u8, u8, u8)>) -> Result<String, String> {
    let img = image::open(input_path)
        .map_err(|e| format!("Erro ao abrir imagem: {}", e))?;

    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Imagem vazia ou invalida".into());
    }
    let mut rgba = img.to_rgba8();

    // Determine key color: either user-selected or median of border
    let (bg_r, bg_g, bg_b): (i32, i32, i32) = if let Some((r, g, b)) = target_color {
        (r as i32, g as i32, b as i32)
    } else {
        let border_len = (2 * w + 2 * h) as u64;
        let step = (border_len / 3000).max(1);
        let mut r_vals: Vec<u16> = Vec::with_capacity((border_len / step) as usize);
        let mut g_vals: Vec<u16> = Vec::with_capacity(r_vals.capacity());
        let mut b_vals: Vec<u16> = Vec::with_capacity(r_vals.capacity());

        let mut push_edge = |x: u32, y: u32| {
            let p = rgba.get_pixel(x, y);
            r_vals.push(p[0] as u16);
            g_vals.push(p[1] as u16);
            b_vals.push(p[2] as u16);
        };

        let mut idx: u64 = 0;
        for x in 0..w { if idx % step == 0 { push_edge(x, 0); } idx += 1; }
        for x in 0..w { if idx % step == 0 { push_edge(x, h - 1); } idx += 1; }
        for y in 1..h.saturating_sub(1) { if idx % step == 0 { push_edge(0, y); } idx += 1; }
        for y in 1..h.saturating_sub(1) { if idx % step == 0 { push_edge(w - 1, y); } idx += 1; }

        if r_vals.is_empty() || g_vals.is_empty() || b_vals.is_empty() {
            return Err("Falha ao amostrar bordas da imagem".into());
        }
        let median = |mut vals: Vec<u16>| -> u8 {
            vals.sort_unstable();
            let mid = vals.len() / 2;
            let v = if vals.len() % 2 == 1 { vals[mid] as u32 } else { (vals[mid - 1] as u32 + vals[mid] as u32) / 2 };
            v as u8
        };
        (median(r_vals) as i32, median(g_vals) as i32, median(b_vals) as i32)
    };
    let t = threshold as i32;

    let soft_min = t as f32 * 0.5;
    let soft_max = t as f32 * 1.6;
    let soft_range = (soft_max - soft_min).max(1.0);

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let dr = p[0] as i32 - bg_r;
            let dg = p[1] as i32 - bg_g;
            let db = p[2] as i32 - bg_b;
            // i32 avoids overflow (255*255=65025 > i16::MAX)
            let dist = ((dr * dr + dg * dg + db * db) as f32).sqrt();
            if dist < soft_max {
                let a = ((dist - soft_min) / soft_range).clamp(0.0, 1.0);
                let alpha = (a * 255.0).round() as u8;
                rgba.get_pixel_mut(x, y)[3] = alpha;
            }
        }
    }

    apply_mask_refine(&mut rgba, erode_size);

    encode_png(&rgba)
}

fn parse_hex_color(s: &str) -> Option<(u8, u8, u8)> {
    let c = s.trim().trim_start_matches('#');
    if c.len() == 6 {
        let r = u8::from_str_radix(&c[0..2], 16).ok()?;
        let g = u8::from_str_radix(&c[2..4], 16).ok()?;
        let b = u8::from_str_radix(&c[4..6], 16).ok()?;
        Some((r, g, b))
    } else { None }
}

pub fn chromakey_remove_bg_hex(input_path: &str, threshold: u16, erode_size: i32, hex: Option<String>) -> Result<String, String> {
    let col = hex.and_then(|h| parse_hex_color(&h));
    chromakey_remove_bg(input_path, threshold, erode_size, col)
}
