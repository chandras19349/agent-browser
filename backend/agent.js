// backend/agent.js
const fetch = require('node-fetch');

const tools = {
  extract_prices: async () => {
    // Note: The DOM content will be accessed directly through frontend tools
    return 'Price extraction requested - waiting for frontend execution';
  },
  search_dom: async (keyword) => {
    // Note: The DOM content will be accessed directly through frontend tools
    return `DOM search for "${keyword}" requested - waiting for frontend execution`;
  },
  click_button: async () => {
    return 'Button click requested - waiting for frontend execution';
  },
  scrape_table: async () => {
    return 'Table scrape requested - waiting for frontend execution';
  }
};

async function askAgentReAct(prompt) {
  const messages = [
    {
      role: 'system',
      content: `You are an intelligent browser assistant embedded in a Tauri browser app. 
You can reason and use tools to help users with tasks on webpages.

CURRENT URL: ${process.env.CURRENT_URL || 'unknown'}

AVAILABLE TOOLS:
- extract_prices: Extract all prices from the current page
- search_dom(keyword): Find text matching a pattern and return context
- click_button: Click the first visible button on the page
- scrape_table: Extract and return table data

RESPONSE FORMAT:
Always use this format:
Thought: [your reasoning]
Action: [tool name] OR Action: [tool_name]([argument]) for tools with args
[Wait for observation, then continue]
Thought: [your reasoning based on observation]
Final Answer: [your conclusive answer to the user's query]`
    },
    { role: 'user', content: prompt }
  ];

  for (let i = 0; i < 4; i++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        temperature: 0.3
      })
    });
    
    const data = await res.json();
    if (!data.choices || !data.choices[0]) {
      return 'Error: Failed to get response from AI service';
    }

    const reply = data.choices[0].message.content;
    messages.push({ role: 'assistant', content: reply });

    if (reply.includes('Final Answer:')) break;

    // Extract tool and argument
    const actionMatch = reply.match(/Action: (\w+)(?:\((.+?)\))?/);
    if (actionMatch) {
      const toolName = actionMatch[1];
      const arg = actionMatch[2] || '';
      
      let observation;
      if (tools[toolName]) {
        if (arg) {
          observation = await tools[toolName](arg);
        } else {
          observation = await tools[toolName]();
        }
      } else {
        observation = `Error: Tool "${toolName}" not found`;
      }
      
      messages.push({ role: 'user', content: `Observation: ${observation}` });
    }
  }

  return messages.map((m) => m.content).join('\n\n');
}

(async () => {
  const prompt = process.argv[2];
  const result = await askAgentReAct(prompt);
  console.log(result);
})();
