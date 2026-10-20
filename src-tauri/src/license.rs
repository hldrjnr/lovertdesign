use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

const LICENSE_HEADER: &str = "LOVERT_LICENSE_V1:";

/// Fallback não-sensível usado apenas para ofuscar o cache local da licença
/// quando nenhum `LICENSE_XOR_KEY` é fornecido. Em builds de produção defina o
/// segredo `LICENSE_XOR_KEY` no CI para substituir este valor.
const DEFAULT_CACHE_KEY: &[u8] = b"lovert-design-cache-v1";

/// Lê um valor de configuração, preferindo o ambiente de execução (útil para
/// overrides em dev/CI) e caindo para o valor injetado em tempo de compilação
/// pelos *secrets* do GitHub Actions.
fn config_value(runtime: &str, compile_time: Option<&str>) -> Option<String> {
    std::env::var(runtime)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| {
            compile_time
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        })
}

/// ID do produto Gumroad. Nunca é hardcoded: vem do segredo
/// `GUMROAD_PRODUCT_ID` (runtime ou compilação). Sem ele, o licenciamento
/// fica desativado nesse build.
fn gumroad_product_id() -> Option<String> {
    config_value("GUMROAD_PRODUCT_ID", option_env!("GUMROAD_PRODUCT_ID"))
}

/// Chave usada para ofuscar `license.dat`. Vem do segredo `LICENSE_XOR_KEY`
/// quando definido, senão usa o fallback não-sensível.
fn license_cache_key() -> Vec<u8> {
    config_value("LICENSE_XOR_KEY", option_env!("LICENSE_XOR_KEY"))
        .map(|v| v.into_bytes())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_CACHE_KEY.to_vec())
}

const GUMROAD_URL: &str = "https://api.gumroad.com/v2/licenses/verify";
const DECREMENT_URL: &str = "https://api.gumroad.com/v2/licenses/decrement_uses_count";
const GRACE_PERIOD_DAYS: u64 = 7;
const RECHECK_DAYS: u64 = 30;
const EXPORT_LIMIT: u32 = 5;

#[derive(Serialize, Clone)]
pub struct LicenseResult {
    pub success: bool,
    pub message: String,
    pub uses: Option<u32>,
    pub email: Option<String>,
    pub tier: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct CachedLicense {
    key: String,
    verified_at: u64,
    uses: u32,
    email: String,
    #[serde(default)]
    tier: String,
}

#[derive(Deserialize)]
struct GumroadResponse {
    success: bool,
    uses: Option<u32>,
    email: Option<String>,
    #[serde(default)]
    message: Option<String>,
    purchase: Option<GumroadPurchase>,
}

#[derive(Deserialize)]
struct GumroadPurchase {
    #[serde(default)]
    refunded: Option<bool>,
    #[serde(default)]
    disputed: Option<bool>,
    #[serde(default)]
    variants: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct ExportData {
    count: u32,
}

fn app_data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Erro ao obter diretório da app: {}", e))?;
    std::fs::create_dir_all(&path).map_err(|e| format!("Erro ao criar diretório: {}", e))?;
    Ok(path)
}

fn get_license_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app_data_dir(app_handle)?;
    path.push("license.dat");
    Ok(path)
}

fn get_export_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app_data_dir(app_handle)?;
    path.push("export.dat");
    Ok(path)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

fn encrypt(data: &str) -> String {
    // Prefix legível reduz entropia e tira flag OBFUSCATEDPOLY (alta entropia = packer)
    let key = license_cache_key();
    let payload = format!("{}{}", LICENSE_HEADER, data);
    let bytes: Vec<u8> = payload
        .bytes()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    base64::engine::general_purpose::STANDARD.encode(&bytes)
}

fn decrypt(data: &str) -> Result<String, String> {
    let key = license_cache_key();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Dados inválidos: {}", e))?;
    let result: Vec<u8> = bytes
        .into_iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    let text = String::from_utf8(result).map_err(|_| "Dados inválidos.".to_string())?;
    // Compatibilidade com arquivos antigos sem header
    if let Some(stripped) = text.strip_prefix(LICENSE_HEADER) {
        Ok(stripped.to_string())
    } else {
        Ok(text)
    }
}

fn read_cached_license(app_handle: &tauri::AppHandle) -> Result<CachedLicense, String> {
    let path = get_license_path(app_handle)?;
    let encrypted =
        std::fs::read_to_string(&path).map_err(|_| "Nenhuma licença encontrada.".to_string())?;
    let json = decrypt(&encrypted)?;
    serde_json::from_str(&json).map_err(|_| "Dados de licença corrompidos.".to_string())
}

#[tauri::command]
pub async fn verify_license_key(
    app_handle: tauri::AppHandle,
    license_key: String,
) -> Result<LicenseResult, String> {
    let Some(product_id) = gumroad_product_id() else {
        return Ok(LicenseResult {
            success: false,
            message: "Licenciamento não configurado neste build.".to_string(),
            uses: None,
            email: None,
            tier: None,
        });
    };
    let client = reqwest::Client::new();
    let resp = client
        .post(GUMROAD_URL)
        .form(&[
            ("product_id", product_id.as_str()),
            ("license_key", &license_key),
            ("increment_uses_count", "true"),
        ])
        .send()
        .await
        .map_err(|e| format!("Erro de rede: {}", e))?;

    let gumroad: GumroadResponse = resp
        .json()
        .await
        .map_err(|e| format!("Erro ao processar resposta: {}", e))?;

    if !gumroad.success {
        let msg = gumroad.message.unwrap_or_else(|| "Chave inválida.".to_string());
        return Ok(LicenseResult { success: false, message: msg, uses: None, email: None, tier: None });
    }

    let purchase_refunded = gumroad.purchase.as_ref().and_then(|p| p.refunded).unwrap_or(false);
    let purchase_disputed = gumroad.purchase.as_ref().and_then(|p| p.disputed).unwrap_or(false);
    if purchase_refunded || purchase_disputed {
        return Ok(LicenseResult {
            success: false,
            message: "This license has been revoked or refunded.".to_string(),
            uses: None,
            email: None,
            tier: None,
        });
    }

    let variants = gumroad.purchase.as_ref().and_then(|p| p.variants.as_deref()).unwrap_or("");
    let tier = if variants.contains("Studio License") { "Studio" } else if variants.contains("Creator License") { "Creator" } else { "Creator" };
    let device_limit: u32 = if tier == "Studio" { 5 } else { 2 };
    let current_uses = gumroad.uses.unwrap_or(0);

    if current_uses > device_limit {
        let msg = if tier == "Studio" {
            "Limite de uso de licença excedido.".to_string()
        } else {
            "Sua licença Creator atingiu o limite de dispositivos. Faça upgrade para a licença Studio para adicionar mais dispositivos.".to_string()
        };
        return Ok(LicenseResult {
            success: false,
            message: msg,
            uses: Some(current_uses),
            email: None,
            tier: Some(tier.to_string()),
        });
    }

    let cached = CachedLicense {
        key: license_key,
        verified_at: now_secs(),
        uses: current_uses,
        email: gumroad.email.clone().unwrap_or_default(),
        tier: tier.to_string(),
    };

    let json = serde_json::to_string(&cached).map_err(|e| e.to_string())?;
    let encrypted = encrypt(&json);
    let path = get_license_path(&app_handle)?;
    std::fs::write(&path, encrypted).map_err(|e| e.to_string())?;

    Ok(LicenseResult {
        success: true,
        message: "Licença ativada com sucesso!".to_string(),
        uses: Some(current_uses),
        email: Some(cached.email),
        tier: Some(tier.to_string()),
    })
}

#[tauri::command]
pub fn check_cached_license(app_handle: tauri::AppHandle) -> LicenseResult {
    let cached = match read_cached_license(&app_handle) {
        Ok(c) => c,
        Err(e) => {
            return LicenseResult { success: false, message: e, uses: None, email: None, tier: None }
        }
    };

    let elapsed = (now_secs() - cached.verified_at) / 86400;

    if elapsed > RECHECK_DAYS {
        return LicenseResult {
            success: false,
            message: "Licença expirada. Conecte-se à internet para revalidar.".to_string(),
            uses: Some(cached.uses),
            email: Some(cached.email),
            tier: Some(cached.tier),
        };
    }

    LicenseResult {
        success: true,
        message: if elapsed <= GRACE_PERIOD_DAYS {
            "Licença válida.".to_string()
        } else {
            format!(
                "Aviso: {} dia(s) sem validação online. Restabeleça conexão em breve.",
                elapsed
            )
        },
        uses: Some(cached.uses),
        email: Some(cached.email),
        tier: Some(cached.tier),
    }
}

#[tauri::command]
pub async fn deactivate_license(app_handle: tauri::AppHandle, license_key: String) -> Result<(), String> {
    // Best-effort: se o produto não estiver configurado (sem segredo) ou a rede
    // falhar, continuamos e limpamos sempre o cache local.
    if let Some(product_id) = gumroad_product_id() {
        let client = reqwest::Client::new();
        let _ = client
            .post(DECREMENT_URL)
            .form(&[
                ("product_id", product_id.as_str()),
                ("license_key", &license_key),
            ])
            .send()
            .await;
    }

    let path = get_license_path(&app_handle)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    let export_path = get_export_path(&app_handle)?;
    if export_path.exists() {
        std::fs::remove_file(&export_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn clear_license_cache(app_handle: tauri::AppHandle) -> Result<(), String> {
    let path = get_license_path(&app_handle)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_export_count(app_handle: tauri::AppHandle) -> u32 {
    let path = match get_export_path(&app_handle) {
        Ok(p) => p,
        Err(_) => return 0,
    };
    let encrypted = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return 0,
    };
    let json = match decrypt(&encrypted) {
        Ok(j) => j,
        Err(_) => return 0,
    };
    let data: ExportData = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };
    data.count
}

#[tauri::command]
pub fn increment_export_count(app_handle: tauri::AppHandle) -> Result<u32, String> {
    let current = get_export_count_inner(&app_handle);
    let new_count = current + 1;
    let data = ExportData { count: new_count };
    let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
    let encrypted = encrypt(&json);
    let path = get_export_path(&app_handle)?;
    std::fs::write(&path, encrypted).map_err(|e| e.to_string())?;
    Ok(new_count)
}

fn get_export_count_inner(app_handle: &tauri::AppHandle) -> u32 {
    let path = match get_export_path(app_handle) {
        Ok(p) => p,
        Err(_) => return 0,
    };
    let encrypted = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return 0,
    };
    let json = match decrypt(&encrypted) {
        Ok(j) => j,
        Err(_) => return 0,
    };
    let data: ExportData = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };
    data.count
}

#[tauri::command]
pub fn get_export_limit() -> u32 {
    EXPORT_LIMIT
}
