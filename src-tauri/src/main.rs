use serde_json;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{command, AppHandle, Manager, State};
use uuid::Uuid;

// Store for pending tool executions
type ToolStore = Mutex<HashMap<String, String>>;

#[command]
async fn ask_agent_simple(prompt: String) -> Result<String, String> {
    // Simple direct AI response without tools
    let api_key = std::env::var("OPENAI_API_KEY")
        .unwrap_or_else(|_| "demo_key".to_string());
    
    if api_key == "demo_key" {
        return Ok(format!("Demo response: I understand you're asking about '{}'. This is a demo response since no OpenAI API key is configured.", prompt));
    }

    let client = reqwest::Client::new();
    
    let res = client.post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "model": "gpt-4o-mini",
            "messages": [
                { "role": "system", "content": "You are a helpful browser assistant. Keep responses concise and helpful." },
                { "role": "user", "content": prompt }
            ],
            "max_tokens": 500
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    
    if let Some(content) = json["choices"][0]["message"]["content"].as_str() {
        Ok(content.to_string())
    } else {
        Err("No response from AI".to_string())
    }
}

#[command]
async fn run_agent_with_tools(
    prompt: String, 
    url: String,
    app: AppHandle,
    tool_store: State<'_, ToolStore>
) -> Result<String, String> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .unwrap_or_else(|_| "demo_key".to_string());
    
    if api_key == "demo_key" {
        return run_demo_agent(prompt, url, app, tool_store).await;
    }

    let client = reqwest::Client::new();
    let mut messages = vec![
        serde_json::json!({
            "role": "system",
            "content": format!(
                "You are an intelligent browser assistant. Current URL: {}

AVAILABLE TOOLS:
- extract_prices: Extract all prices from the current page
- search_dom(keyword): Find text matching a keyword and return context  
- click_button(selector): Click a button or element (optional CSS selector)
- scrape_table: Extract and return table data
- navigate_to(url): Navigate to a different URL

RESPONSE FORMAT:
Always use this exact format:
Thought: [your reasoning]
Action: [tool_name] OR Action: [tool_name](argument)
Observation: [wait for tool result]
Thought: [reasoning based on observation]
Final Answer: [conclusive answer]

Continue this pattern until you have enough information to provide a Final Answer.", 
                url
            )
        }),
        serde_json::json!({
            "role": "user",
            "content": prompt
        })
    ];

    let mut response_parts = Vec::new();
    
    // Allow up to 5 iterations of thought-action-observation
    for iteration in 0..5 {
        let res = client.post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(&api_key)
            .json(&serde_json::json!({
                "model": "gpt-4o-mini",
                "messages": messages,
                "max_tokens": 300,
                "temperature": 0.1
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        
        let ai_response = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("No response")
            .to_string();

        response_parts.push(ai_response.clone());
        messages.push(serde_json::json!({
            "role": "assistant", 
            "content": ai_response
        }));

        // Check if we have a final answer
        if ai_response.contains("Final Answer:") {
            break;
        }

        // Extract and execute action
        if let Some(action_match) = extract_action(&ai_response) {
            let (tool_name, arg) = action_match;
            
            let observation = execute_tool(&tool_name, arg.as_deref(), &app, &tool_store).await?;
            
            response_parts.push(format!("Observation: {}", observation));
            messages.push(serde_json::json!({
                "role": "user",
                "content": format!("Observation: {}", observation)
            }));
        } else if ai_response.contains("Action:") {
            // If action format is wrong, provide guidance
            let observation = "Error: Please use the correct action format: Action: tool_name or Action: tool_name(argument)";
            response_parts.push(format!("Observation: {}", observation));
            messages.push(serde_json::json!({
                "role": "user",
                "content": format!("Observation: {}", observation)
            }));
        }
    }

    Ok(response_parts.join("\n\n"))
}

async fn run_demo_agent(
    prompt: String, 
    url: String,
    app: AppHandle,
    tool_store: State<'_, ToolStore>
) -> Result<String, String> {
    let mut response_parts = Vec::new();
    
    // Demo thought process
    response_parts.push("Thought: I need to analyze this webpage to answer the user's question.".to_string());
    
    // Determine which tool to use based on prompt
    let (tool_name, arg) = if prompt.to_lowercase().contains("price") {
        ("extract_prices", None)
    } else if prompt.to_lowercase().contains("table") {
        ("scrape_table", None)
    } else if prompt.to_lowercase().contains("search") || prompt.to_lowercase().contains("find") {
        ("search_dom", Some("content"))
    } else {
        ("search_dom", Some("html"))
    };
    
    response_parts.push(format!("Action: {}{}", tool_name, 
        if let Some(a) = arg { format!("({})", a) } else { String::new() }));
    
    // Execute the tool
    let observation = execute_tool(tool_name, arg, &app, &tool_store).await?;
    response_parts.push(format!("Observation: {}", observation));
    
    // Final reasoning and answer
    response_parts.push("Thought: Based on the information I gathered, I can now provide a helpful answer.".to_string());
    
    let final_answer = if tool_name == "extract_prices" {
        "Final Answer: I've extracted the pricing information from the page. The results show the available prices and their context."
    } else if tool_name == "scrape_table" {
        "Final Answer: I've extracted the table data from the page, showing the structured information in a readable format."
    } else {
        "Final Answer: I've analyzed the page content and found relevant information to answer your question."
    };
    
    response_parts.push(final_answer.to_string());
    
    Ok(response_parts.join("\n\n"))
}

fn extract_action(text: &str) -> Option<(String, Option<String>)> {
    // Look for "Action: tool_name" or "Action: tool_name(argument)"
    if let Some(action_line) = text.lines().find(|line| line.trim().starts_with("Action:")) {
        let action_part = action_line.trim().strip_prefix("Action:").unwrap().trim();
        
        if let Some(paren_pos) = action_part.find('(') {
            // Has argument: tool_name(arg)
            let tool_name = action_part[..paren_pos].trim().to_string();
            let arg_part = &action_part[paren_pos+1..];
            if let Some(close_paren) = arg_part.find(')') {
                let arg = arg_part[..close_paren].trim();
                return Some((tool_name, if arg.is_empty() { None } else { Some(arg.to_string()) }));
            }
        } else {
            // No argument: just tool_name
            return Some((action_part.to_string(), None));
        }
    }
    None
}

async fn execute_tool(
    tool_name: &str, 
    arg: Option<&str>, 
    app: &AppHandle,
    tool_store: &State<'_, ToolStore>
) -> Result<String, String> {
    let request_id = Uuid::new_v4().to_string();
    
    // Emit tool execution request to frontend
    app.emit_all("execute-tool", serde_json::json!({
        "tool": tool_name,
        "arg": arg,
        "request_id": request_id
    })).map_err(|e| e.to_string())?;
    
    // Wait for response with timeout
    for _ in 0..50 { // 5 second timeout (50 * 100ms)
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        
        let store = tool_store.lock().unwrap();
        if let Some(result) = store.get(&request_id) {
            return Ok(result.clone());
        }
    }
    
    Err("Tool execution timeout".to_string())
}

#[command]
async fn tool_response(
    request_id: String,
    result: String,
    tool_store: State<'_, ToolStore>
) -> Result<(), String> {
    let mut store = tool_store.lock().unwrap();
    store.insert(request_id, result);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ToolStore::default())
        .invoke_handler(tauri::generate_handler![
            ask_agent_simple,
            run_agent_with_tools, 
            tool_response
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}