import { useState, useEffect, useRef } from 'react';
import './App.css';

// Access Tauri API through the global window object with type safety
declare global {
  interface Window {
    __TAURI__: {
      invoke(command: string, args?: Record<string, unknown>): Promise<any>;
      event: {
        listen(event: string, callback: (event: any) => void): Promise<() => void>;
        emit(event: string, payload?: any): Promise<void>;
      };
    };
  }
}

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [agentResponses, setAgentResponses] = useState<{role: string, content: string}[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('https://www.google.com');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Register agent tools in the window object
  useEffect(() => {
    // Check if running in Tauri context
    const isTauri = !!window.__TAURI__;
    console.log('Running in Tauri context:', isTauri);
    
    if (!isTauri) {
      console.warn('Not running in Tauri context. Some features may not work.');
    }
    
    // Define agent tools that can be called from backend
    (window as any).agentTools = {
      click_button: (selector?: string) => {
        try {
          const iframe = iframeRef.current;
          if (!iframe || !iframe.contentDocument) return 'No iframe content available';
          
          const targetSelector = selector || 'button';
          const btn = iframe.contentDocument.querySelector(targetSelector);
          if (btn) {
            (btn as HTMLElement).click();
            return `Clicked element matching selector: ${targetSelector}`;
          }
          return `No element found matching selector: ${targetSelector}`;
        } catch (error) {
          console.error('Error in click_button:', error);
          return `Error executing click: ${error}`;
        }
      },
      
      search_dom: (keyword: string) => {
        try {
          const iframe = iframeRef.current;
          if (!iframe || !iframe.contentDocument) return 'No iframe content available';
          
          const text = iframe.contentDocument.body.innerText;
          const pattern = new RegExp(`.{0,30}${keyword}.{0,30}`, 'gi');
          const found = text.match(pattern);
          return found ? found.join('\n') : `No match for "${keyword}"`;
        } catch (error) {
          console.error('Error in search_dom:', error);
          return `Error searching DOM: ${error}`;
        }
      },
      
      scrape_table: () => {
        try {
          const iframe = iframeRef.current;
          if (!iframe || !iframe.contentDocument) return 'No iframe content available';
          
          const table = iframe.contentDocument.querySelector('table');
          if (!table) return 'No table found.';
          
          const rows = Array.from(table.querySelectorAll('tr')).map(row =>
            Array.from(row.querySelectorAll('td, th'))
              .map(cell => cell.textContent?.trim())
              .join(' | ')
          );
          
          return rows.join('\n');
        } catch (error) {
          console.error('Error in scrape_table:', error);
          return `Error scraping table: ${error}`;
        }
      },
      
      extract_prices: () => {
        try {
          const iframe = iframeRef.current;
          if (!iframe || !iframe.contentDocument) return 'No iframe content available';
          
          const text = iframe.contentDocument.body.innerText;
          const matches = text.match(/\$\d+(\.\d+)?/g);
          return matches ? matches.join(', ') : 'No prices found';
        } catch (error) {
          console.error('Error in extract_prices:', error);
          return `Error extracting prices: ${error}`;
        }
      },
      
      navigate_to: (url: string) => {
        try {
          setCurrentUrl(url);
          return `Navigating to ${url}`;
        } catch (error) {
          return `Error navigating: ${error}`;
        }
      }
    };
    
    // Listen for tool execution requests from backend only if running in Tauri context
    const setupToolListener = async () => {
      if (!window.__TAURI__) {
        console.warn('Tauri API not available. Tool execution will not work.');
        return;
      }
      
      try {
        await window.__TAURI__.event.listen('agent-tool', async (event) => {
          const { tool, arg, responseEvent } = event.payload;
          console.log('Received tool request:', tool, arg, 'Response event:', responseEvent);
          
          const tools = (window as any).agentTools;
          if (tools && tools[tool]) {
            try {
              const result = await tools[tool](arg);
              console.log('Tool result:', result);
              // Send back result to Rust backend with the specific response event
              await window.__TAURI__.event.emit(responseEvent, result);
            } catch (error) {
              console.error('Error executing tool:', error);
              await window.__TAURI__.event.emit(responseEvent, `Error: ${error}`);
            }
          } else {
            await window.__TAURI__.event.emit(responseEvent, `Error: Tool '${tool}' not found`);
          }
        });
        console.log('Tool listener set up successfully');
      } catch (error) {
        console.error('Error setting up tool listener:', error);
      }
    };
    
    setupToolListener();
  }, []);

  // Handle URL changes in the iframe
  const handleIframeLoad = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        // Try to get the current URL from the iframe
        const iframeSrc = iframeRef.current.contentWindow.location.href;
        if (iframeSrc !== 'about:blank') {
          setCurrentUrl(iframeSrc);
        }
      } catch (e) {
        console.error('Could not access iframe location:', e);
      }
    }
  };

  // Function to simulate agent response in development mode
  const simulateAgentResponse = async (prompt: string): Promise<string> => {
    // Add a small delay to simulate API processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate a mock response based on the prompt
    if (prompt.toLowerCase().includes('about') || prompt.toLowerCase().includes('what is')) {
      return `Thought: I need to analyze what this website is about.

Action: search_dom(heading)

Observation: Found matches for 'AI That Builds Competitive Advantage'

Thought: I can see this is a company website related to AI solutions.

Final Answer: This website appears to be for Kodryx, a company focused on practical AI solutions for businesses. Their tagline is "AI That Builds Competitive Advantage" and they seem to offer AI services that help businesses gain a competitive edge. They emphasize real-world AI applications with measurable impact.`;
    } 
    
    if (prompt.toLowerCase().includes('extract') || prompt.toLowerCase().includes('price')) {
      return `Thought: I'll look for any prices mentioned on this page.

Action: extract_prices

Observation: Prices found: $19.99, $29.99, $49.99

Thought: I found some pricing information on the page.

Final Answer: I found the following prices on this page: $19.99, $29.99, and $49.99. These might be for different subscription tiers or products offered by Kodryx.`;
    }
    
    // Default response for other queries
    return `Thought: I need to understand the query "${prompt}" in the context of this website.

Action: search_dom(kodryx)

Observation: Found matches for 'Kodryx AI Agent' and 'Workflow Automation'

Thought: This gives me some context about the website's focus.

Final Answer: Based on the content I can see, this website is for Kodryx, a company specializing in AI agents and workflow automation. They appear to offer enterprise AI solutions that help businesses improve efficiency and gain competitive advantages through practical AI implementation.`;
  };

  // Function to run the agent with more capability
  const runAgent = async (prompt: string) => {
    if (isLoading || !prompt.trim()) return;
    
    setIsLoading(true);
    
    // Add the user query to the responses
    setAgentResponses(prev => [...prev, { role: 'user', content: prompt }]);
    
    try {
      let response: string;
      
      // Check if Tauri API is available
      if (!window.__TAURI__) {
        console.log('Running in development mode - using simulated agent responses');
        response = await simulateAgentResponse(prompt);
      } else {
        // Call the run_agent command to start the full agent process
        response = await window.__TAURI__.invoke('run_agent', {
          prompt,
          url: currentUrl,
        });
      }
      
      console.log('Agent response:', response);
      
      // Add the response to the chat
      if (response && typeof response === 'string') {
        setAgentResponses(prev => [...prev, { role: 'assistant', content: response }]);
      }
    } catch (error) {
      console.error('Error running agent:', error);
      setAgentResponses(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${error}` 
      }]);
    } finally {
      setIsLoading(false);
      setUserQuery('');
      // Open sidebar if it's closed
      if (!isSidebarOpen) setIsSidebarOpen(true);
    }
  };

  // Add a contextmenu handler to allow asking about selected text
  useEffect(() => {
    const handleContextMenu = async (e: MouseEvent) => {
      e.preventDefault();
      
      const selection = window.getSelection()?.toString() || '';
      if (selection) {
        await runAgent(`Help me understand: ${selection}`);
      }
    };
    
    // Only add context menu handler if running in Tauri context
    if (window.__TAURI__) {
      document.addEventListener('contextmenu', handleContextMenu);
      
      return () => {
        document.removeEventListener('contextmenu', handleContextMenu);
      };
    }
    
    return undefined;
  }, []);

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runAgent(userQuery);
  };

  // Format agent responses with syntax highlighting for different parts
  const formatResponse = (content: string) => {
    return content.split('\n\n').map((paragraph, i) => {
      if (paragraph.startsWith('Thought:')) {
        return (
          <div key={i} className="thought">
            <strong>🤔 {paragraph}</strong>
          </div>
        );
      } else if (paragraph.startsWith('Action:')) {
        return (
          <div key={i} className="action">
            <strong>🔧 {paragraph}</strong>
          </div>
        );
      } else if (paragraph.startsWith('Observation:')) {
        return (
          <div key={i} className="observation">
            <strong>👁️ {paragraph}</strong>
          </div>
        );
      } else if (paragraph.startsWith('Final Answer:')) {
        return (
          <div key={i} className="final-answer">
            <strong>✅ {paragraph}</strong>
          </div>
        );
      } else {
        return <p key={i}>{paragraph}</p>;
      }
    });
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="url-bar">
          <input 
            type="text" 
            value={currentUrl} 
            onChange={(e) => setCurrentUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setCurrentUrl(currentUrl)}
          />
          <button onClick={() => setCurrentUrl(currentUrl)}>Go</button>
        </div>
        <div className="nav-controls">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            {isSidebarOpen ? '👈 Hide Agent' : '👉 Show Agent'}
          </button>
        </div>
      </nav>
      
      {/* Main content area */}
      <div className="content-area">
        {/* Browser iframe */}
        <iframe
          ref={iframeRef}
          src={currentUrl}
          title="webview"
          className="browser-iframe"
          onLoad={handleIframeLoad}
          sandbox="allow-same-origin allow-scripts allow-forms"
        />
        
        {/* Agent sidebar */}
        <div className={`agent-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            <h2>AI Browser Assistant</h2>
            <button className="close-btn" onClick={() => setIsSidebarOpen(false)}>&times;</button>
          </div>
          <div className="agent-chat">
            {agentResponses.length === 0 && (
              <div className="welcome-message">
                <h3>Welcome to Agentic Browser</h3>
                <p>I'm your AI browser assistant. I can help you navigate the web and interact with pages.</p>
                <p>Try these commands:</p>
                <ul>
                  <li>"Search for [topic]"</li>
                  <li>"Summarize this page"</li>
                  <li>"Extract data from this table"</li>
                  <li>"Find prices on this page"</li>
                </ul>
                <p>You can also right-click on any text to ask me about it.</p>
              </div>
            )}
            <div className="messages">
              {agentResponses.map((msg, index) => (
                <div key={index} className={`message ${msg.role}`}>
                  {msg.role === 'user' ? (
                    <div className="user-message">
                      <span className="user-icon">👤</span>
                      <div className="message-content">{msg.content}</div>
                    </div>
                  ) : (
                    <div className="assistant-message">
                      <span className="assistant-icon">🤖</span>
                      <div className="message-content">
                        {formatResponse(msg.content)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="loading-indicator">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="agent-input">
            <input
              type="text"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Ask me anything about this page..."
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !userQuery.trim()}>
              {isLoading ? '...' : 'Send'}
            </button>
          </form>
        </div>
        
        {/* Add a toggle button for the sidebar */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
          style={{ 
            position: 'absolute', 
            right: isSidebarOpen ? 'var(--sidebar-width)' : '0', 
            top: '50%', 
            zIndex: 10,
            transition: 'right 0.3s ease',
            backgroundColor: 'var(--primary-color)',
            color: 'white',
            border: 'none',
            borderRadius: '4px 0 0 4px',
            padding: '10px 5px',
            cursor: 'pointer'
          }}
        >
          {isSidebarOpen ? '→' : '←'}
        </button>
      </div>
    </div>
  );
}

export default App;
