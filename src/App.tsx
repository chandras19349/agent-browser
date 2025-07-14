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
  const [currentUrl, setCurrentUrl] = useState('https://example.com');
  const [urlInput, setUrlInput] = useState('https://example.com');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Setup tool execution listener
  useEffect(() => {
    const isTauri = !!window.__TAURI__;
    console.log('Running in Tauri context:', isTauri);
    
    if (!isTauri) {
      console.warn('Not running in Tauri context. Some features may not work.');
      return;
    }
    
    const setupToolListener = async () => {
      try {
        await window.__TAURI__.event.listen('execute-tool', async (event) => {
          const { tool, arg, request_id } = event.payload;
          console.log('Executing tool:', tool, 'with arg:', arg, 'request_id:', request_id);
          
          let result: string;
          
          try {
            switch (tool) {
              case 'click_button':
                result = await clickButton(arg);
                break;
              case 'search_dom':
                result = await searchDom(arg || 'content');
                break;
              case 'scrape_table':
                result = await scrapeTable();
                break;
              case 'extract_prices':
                result = await extractPrices();
                break;
              case 'navigate_to':
                result = await navigateTo(arg || '');
                break;
              default:
                result = `Error: Unknown tool '${tool}'`;
            }
          } catch (error) {
            result = `Error executing ${tool}: ${error}`;
          }
          
          // Send result back to backend
          await window.__TAURI__.invoke('tool_response', {
            request_id,
            result
          });
        });
        
        console.log('Tool execution listener set up successfully');
      } catch (error) {
        console.error('Error setting up tool listener:', error);
      }
    };
    
    setupToolListener();
  }, []);

  // Tool implementations
  const clickButton = async (selector?: string): Promise<string> => {
    try {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentDocument) {
        return 'No iframe content available';
      }
      
      const targetSelector = selector || 'button, input[type="button"], input[type="submit"], a';
      const elements = iframe.contentDocument.querySelectorAll(targetSelector);
      
      if (elements.length === 0) {
        return `No clickable elements found matching selector: ${targetSelector}`;
      }
      
      const element = elements[0] as HTMLElement;
      element.click();
      
      return `Successfully clicked element: ${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${element.className ? '.' + element.className.split(' ').join('.') : ''}`;
    } catch (error) {
      return `Error clicking button: ${error}`;
    }
  };

  const searchDom = async (keyword: string): Promise<string> => {
    try {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentDocument) {
        return 'No iframe content available';
      }
      
      const text = iframe.contentDocument.body.innerText || iframe.contentDocument.body.textContent || '';
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      
      const matches = lines.filter(line => 
        line.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (matches.length === 0) {
        return `No matches found for "${keyword}". Page contains ${lines.length} lines of text.`;
      }
      
      const limitedMatches = matches.slice(0, 5); // Limit to first 5 matches
      return `Found ${matches.length} matches for "${keyword}":\n\n${limitedMatches.join('\n')}`;
    } catch (error) {
      return `Error searching DOM: ${error}`;
    }
  };

  const scrapeTable = async (): Promise<string> => {
    try {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentDocument) {
        return 'No iframe content available';
      }
      
      const tables = iframe.contentDocument.querySelectorAll('table');
      if (tables.length === 0) {
        return 'No tables found on this page';
      }
      
      const table = tables[0]; // Get first table
      const rows = Array.from(table.querySelectorAll('tr'));
      
      if (rows.length === 0) {
        return 'Table found but no rows detected';
      }
      
      const tableData = rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        return cells.map(cell => (cell.textContent || '').trim()).join(' | ');
      }).filter(row => row.length > 0);
      
      return `Table data extracted (${tableData.length} rows):\n\n${tableData.join('\n')}`;
    } catch (error) {
      return `Error scraping table: ${error}`;
    }
  };

  const extractPrices = async (): Promise<string> => {
    try {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentDocument) {
        return 'No iframe content available';
      }
      
      const text = iframe.contentDocument.body.innerText || iframe.contentDocument.body.textContent || '';
      
      // Multiple price patterns
      const patterns = [
        /\$\d+(?:\.\d{2})?/g,           // $19.99, $19
        /\d+(?:\.\d{2})?\s*(?:USD|dollars?)/gi, // 19.99 USD, 19 dollars
        /\d+(?:\.\d{2})?\s*€/g,        // 19.99€
        /£\d+(?:\.\d{2})?/g,           // £19.99
        /\d+(?:\.\d{2})?\s*(?:EUR|GBP)/gi // 19.99 EUR
      ];
      
      const allMatches = new Set<string>();
      
      patterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(match => allMatches.add(match.trim()));
        }
      });
      
      if (allMatches.size === 0) {
        return 'No prices found on this page';
      }
      
      const priceList = Array.from(allMatches).slice(0, 10); // Limit to 10 prices
      return `Found ${allMatches.size} prices:\n${priceList.join(', ')}`;
    } catch (error) {
      return `Error extracting prices: ${error}`;
    }
  };

  const navigateTo = async (url: string): Promise<string> => {
    try {
      if (!url) {
        return 'Error: No URL provided';
      }
      
      // Ensure URL has protocol
      const formattedUrl = url.startsWith('http') ? url : `https://${url}`;
      setCurrentUrl(formattedUrl);
      setUrlInput(formattedUrl);
      
      return `Successfully navigated to: ${formattedUrl}`;
    } catch (error) {
      return `Error navigating: ${error}`;
    }
  };

  // Function to handle URL navigation
  const handleNavigate = () => {
    let url = urlInput.trim();
    if (!url) return;
    
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    
    setCurrentUrl(url);
    setUrlInput(url);
  };

  // Handle URL input key press
  const handleUrlKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNavigate();
    }
  };

  // Function to simulate agent response in development mode
  const simulateAgentResponse = async (prompt: string): Promise<string> => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (prompt.toLowerCase().includes('price')) {
      return `Thought: I need to look for any prices mentioned on this page.

Action: extract_prices

Observation: Found 3 prices: $19.99, $29.99, $49.99

Thought: I found some pricing information on the page.

Final Answer: I found the following prices on this page: $19.99, $29.99, and $49.99. These appear to be sample prices for testing purposes.`;
    } 
    
    if (prompt.toLowerCase().includes('table')) {
      return `Thought: I'll extract any table data from this page.

Action: scrape_table

Observation: Table data extracted (3 rows):
Header 1 | Header 2 | Header 3
Value 1 | Value 2 | Value 3
Data A | Data B | Data C

Thought: I successfully extracted the table information.

Final Answer: I found a table with 3 rows and 3 columns. The table contains headers and sample data that appears to be for testing purposes.`;
    }
    
    return `Thought: I need to understand what this page contains to answer the user's question.

Action: search_dom(${prompt.split(' ')[0] || 'content'})

Observation: Found 5 matches for content including page headers and main text sections.

Thought: I can see this page has various content sections.

Final Answer: Based on my analysis, this appears to be a test page with various HTML elements. The page contains standard web content that's useful for testing browser automation and web scraping tools.`;
  };

  // Function to run the agent
  const runAgent = async (prompt: string) => {
    if (isLoading || !prompt.trim()) return;
    
    setIsLoading(true);
    setAgentResponses(prev => [...prev, { role: 'user', content: prompt }]);
    
    try {
      let response: string;
      
      if (!window.__TAURI__) {
        console.log('Running in development mode - using simulated responses');
        response = await simulateAgentResponse(prompt);
      } else {
        // Use the new agent with tools
        response = await window.__TAURI__.invoke('run_agent_with_tools', {
          prompt,
          url: currentUrl,
        });
      }
      
      console.log('Agent response:', response);
      
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
      if (!isSidebarOpen) setIsSidebarOpen(true);
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runAgent(userQuery);
  };

  // Format agent responses with syntax highlighting
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
            value={urlInput} 
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleUrlKeyPress}
            placeholder="Enter URL (e.g., example.com, httpbin.org/html)"
          />
          <button onClick={handleNavigate}>Go</button>
        </div>
        <div className="nav-controls">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            {isSidebarOpen ? '👈 Hide Agent' : '👉 Show Agent'}
          </button>
        </div>
      </nav>
      
      <div className="content-area">
        <iframe
          ref={iframeRef}
          src={currentUrl}
          title="webview"
          className="browser-iframe"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
        
        <div className={`agent-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            <h2>AI Browser Assistant</h2>
            <button className="close-btn" onClick={() => setIsSidebarOpen(false)}>&times;</button>
          </div>
          <div className="agent-chat">
            {agentResponses.length === 0 && (
              <div className="welcome-message">
                <h3>Welcome to Agentic Browser</h3>
                <p>I'm your AI browser assistant. I can help you navigate and interact with web pages.</p>
                <p><strong>Try these commands:</strong></p>
                <ul>
                  <li>"What prices are on this page?"</li>
                  <li>"Extract the table data"</li>
                  <li>"Search for contact information"</li>
                  <li>"Click the first button"</li>
                  <li>"Navigate to wikipedia.org"</li>
                </ul>
                <p><strong>Iframe-friendly test sites:</strong></p>
                <ul>
                  <li>example.com (current default)</li>
                  <li>httpbin.org/html</li>
                  <li>jsonplaceholder.typicode.com</li>
                  <li>httpbin.org/forms/post</li>
                </ul>
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