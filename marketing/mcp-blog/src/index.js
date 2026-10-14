#!/usr/bin/env node
/**
 * Default entry: remote Streamable HTTP connector for Grok bots.
 * Pass --stdio only for local MCP Inspector debugging.
 */
const args = process.argv.slice(2)
if (args.includes('--stdio')) {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const { createBlogMcpServer } = await import('./server.js')
  const server = createBlogMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[pathpilo-blog-mcp] stdio mode (debug only)')
} else {
  await import('./http.js')
}
