use reqwest::Client;
use serde_json;
use std::process::Command;
use tauri::command;

#[command]
async fn ask_agent(prompt: String) -> Result<String, String> {
    let client = Client::new();
    let api_key = std::env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY not set");

    let res = client.post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "model": "gpt-4o",
            "messages": [
                { "role": "system", "content": "You are a helpful browser assistant." },
                { "role": "user", "content": prompt }
            ]
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("No response")
        .to_string())
}

#[command]
fn run_agent(prompt: String, url: String) -> Result<String, String> {
    let api_key = std::env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY not set");
    
    let output = Command::new("node")
        .arg("/Users/sonukumar/Desktop/YT/agent-browser/backend/agent.js")
        .arg(prompt)
        .env("OPENAI_API_KEY", api_key)
        .env("CURRENT_URL", url)
        .output()
        .map_err(|e| e.to_string())?;
    
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[command]
fn run_tool_and_wait(tool_name: String, arg: Option<String>, _app: tauri::AppHandle) -> Result<String, String> {
    match tool_name.as_str() {
        "click_button" => Ok("Clicked button successfully".to_string()),
        "search_dom" => Ok(format!("Found matches for '{}' in the DOM", arg.unwrap_or_default())),
        "scrape_table" => Ok("Table data extracted: Column1 | Column2 | Column3\nValue1 | Value2 | Value3".to_string()),
        "extract_prices" => Ok("Prices found: $19.99, $29.99, $49.99".to_string()),
        _ => Ok(format!("Unknown tool: {}", tool_name))
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ask_agent, run_agent, run_tool_and_wait])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}