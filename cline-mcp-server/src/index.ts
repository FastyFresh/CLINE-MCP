#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { sessionManager } from './lib/sessionManager.js';
import { redisClient } from './lib/redisClient.js';

class ClineMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'cline-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_session',
          description: 'Create a new session for a specific directory',
          inputSchema: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: 'The directory path to create a session for',
              },
            },
            required: ['directory'],
          },
        },
        {
          name: 'get_context',
          description: 'Retrieve context for a specific session and directory',
          inputSchema: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: 'The directory path',
              },
              sessionId: {
                type: 'string',
                description: 'The session ID',
              },
            },
            required: ['directory', 'sessionId'],
          },
        },
        {
          name: 'update_context',
          description: 'Update context for a specific session',
          inputSchema: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: 'The directory path',
              },
              sessionId: {
                type: 'string',
                description: 'The session ID',
              },
              content: {
                type: 'string',
                description: 'The content to add to the session history',
              },
            },
            required: ['directory', 'sessionId', 'content'],
          },
        },
        {
          name: 'end_session',
          description: 'End a session and remove its context',
          inputSchema: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: 'The directory path',
              },
              sessionId: {
                type: 'string',
                description: 'The session ID',
              },
            },
            required: ['directory', 'sessionId'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args || typeof args !== 'object') {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments');
      }

      try {
        switch (name) {
          case 'create_session': {
            if (!('directory' in args) || typeof args.directory !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid directory parameter');
            }
            const sessionId = await sessionManager.createSession(args.directory);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ sessionId }),
                },
              ],
            };
          }

          case 'get_context': {
            if (!('directory' in args) || typeof args.directory !== 'string' ||
                !('sessionId' in args) || typeof args.sessionId !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid directory or sessionId parameter');
            }
            const context = await sessionManager.getContext(args.directory, args.sessionId);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(context),
                },
              ],
            };
          }

          case 'update_context': {
            if (!('directory' in args) || typeof args.directory !== 'string' ||
                !('sessionId' in args) || typeof args.sessionId !== 'string' ||
                !('content' in args) || typeof args.content !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid directory, sessionId, or content parameter');
            }
            await sessionManager.updateContext(args.directory, args.sessionId, args.content);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true }),
                },
              ],
            };
          }

          case 'end_session': {
            if (!('directory' in args) || typeof args.directory !== 'string' ||
                !('sessionId' in args) || typeof args.sessionId !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid directory or sessionId parameter');
            }
            await sessionManager.endSession(args.directory, args.sessionId);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true }),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }

  private async cleanup() {
    console.log('Cleaning up...');
    await redisClient.disconnect();
    await this.server.close();
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Cline MCP server running on stdio');
  }
}

const server = new ClineMcpServer();
server.run().catch(console.error);
