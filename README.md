# Agentic Browser

A powerful browser assistant with embedded AI capabilities. This project combines a React frontend, Tauri Rust backend, and Node.js agent to create an intelligent browser experience that can answer questions about web pages, interact with page content, and extract information.

## Features

- Embedded browser with navigation controls
- AI assistant that answers questions about web content
- DOM interaction tools (click buttons, search content, extract data)
- Chat interface with syntax highlighting for agent responses
- Responsive UI with collapsible sidebar
- ReAct agent pattern for step-by-step reasoning

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v16 or later)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites/) (`npm install -g @tauri-apps/cli`)
- An OpenAI API Key (for the agent functionality)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/AIAnytime/agent-browser.git
cd agent-browser
```

### 2. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 3. Set Environment Variables

Create a `.env` file in the project root with the following content:

```
OPENAI_API_KEY=your_openai_api_key_here
```

### 4. Run the Application

From the project root directory:

```bash
# Development mode with hot-reloading
npm run tauri dev

# Or build for production
npm run tauri build
```

## Usage Guide

### Navigation

1. When the application starts, you'll see an embedded browser and a sidebar.
2. Use the navigation bar at the top to enter URLs and browse the web.
3. The sidebar contains the AI assistant chat interface.

### Using the AI Assistant

1. While browsing, type your question in the chat input at the bottom of the sidebar.
2. The AI will analyze the current webpage and respond with relevant information.
3. For specific content, you can also right-click on selected text to ask about it directly.

### Available Tools

The AI assistant can use several tools to interact with web pages:

- **search_dom**: Search the page for specific content
- **click_button**: Click buttons or links on the page
- **scrape_table**: Extract table data from the page
- **extract_prices**: Find price information on the page
- **navigate_to**: Navigate to a different URL

## Project Structure

```
agent-browser/
├── src/                   # React frontend code
│   ├── App.tsx           # Main application component
│   └── App.css           # Styles
├── src-tauri/            # Rust backend code
│   └── src/              
│       └── main.rs       # Tauri application entry point
├── backend/              # Node.js agent code
│   ├── agent.js          # ReAct agent implementation
│   └── package.json      # Node dependencies
└── package.json          # Frontend dependencies
```

## Troubleshooting

- **Agent not responding**: Ensure your OpenAI API key is set correctly in the `.env` file.
- **DOM interaction issues**: Check the browser console for errors related to DOM interaction tools.
- **Build errors**: Verify that you have the correct versions of Node.js, Rust, and Tauri CLI installed.

## How It Works

### ReAct Agent Pattern

This browser uses the ReAct (Reasoning + Acting) pattern for AI agents:

1. **Thought**: The AI analyzes the current context and formulates a plan
2. **Action**: The AI executes a tool to gather information or modify the page
3. **Observation**: The AI receives feedback from the executed tool
4. **Final Answer**: After sufficient reasoning, the AI provides a comprehensive answer

Example interaction flow:

```
User: Find the cheapest flight on this page.

AI Thought: I need to read all prices on the page.
Action: extract_prices()
Observation: $99, $105, $129
Thought: $99 is cheapest. I will return it.
Final Answer: The cheapest flight is $99.
```

## Architecture

| Layer               | Technology                               | Role                                      |
| ------------------- | --------------------------------------- | ----------------------------------------- |
| UI Shell            | **Tauri + React**                       | Browser window and interface              |
| Backend             | **Rust**                                | IPC coordination, command execution       |
| Agent               | **Node.js + OpenAI API**                | ReAct agent implementation                |
| Web View            | **Tauri WebView**                       | Embedded browser functionality            |
| Communication       | **Tauri IPC Events**                    | Between React UI, Rust backend, and agent |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for the GPT models powering the agent
- Tauri for the cross-platform windowing solution
- React for the frontend framework

