import crypto from 'crypto';
import { redisClient } from './redisClient.js';

interface SessionContext {
  directory: string;
  history: Array<{
    timestamp: string;
    content: string;
  }>;
  metadata: {
    createdAt: string;
    lastAccessed: string;
  };
}

export class SessionManager {
  private static readonly SESSION_PREFIX = 'cline:session:';
  private static readonly CONTEXT_PREFIX = 'cline:context:';
  
  /**
   * Generates a unique session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Creates a hash of the directory path to use as part of the key
   */
  private hashDirectory(directory: string): string {
    return crypto.createHash('sha256').update(directory).digest('hex').substring(0, 8);
  }

  /**
   * Generates a composite key for storing context data
   */
  private getContextKey(directory: string, sessionId: string): string {
    const dirHash = this.hashDirectory(directory);
    return `${SessionManager.CONTEXT_PREFIX}${dirHash}:${sessionId}`;
  }

  /**
   * Creates a new session for a specific directory
   */
  async createSession(directory: string): Promise<string> {
    const sessionId = this.generateSessionId();
    const contextKey = this.getContextKey(directory, sessionId);
    
    const initialContext: SessionContext = {
      directory,
      history: [],
      metadata: {
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      }
    };

    await redisClient.set(contextKey, JSON.stringify(initialContext));
    console.log(`Created new session ${sessionId} for directory ${directory}`);
    
    return sessionId;
  }

  /**
   * Retrieves context for a specific session and directory
   */
  async getContext(directory: string, sessionId: string): Promise<SessionContext | null> {
    const contextKey = this.getContextKey(directory, sessionId);
    const data = await redisClient.get(contextKey);
    
    if (!data) {
      console.log(`No context found for session ${sessionId} in directory ${directory}`);
      return null;
    }

    const context = JSON.parse(data) as SessionContext;
    
    // Update last accessed timestamp
    context.metadata.lastAccessed = new Date().toISOString();
    await redisClient.set(contextKey, JSON.stringify(context));
    
    console.log(`Retrieved context for session ${sessionId} in directory ${directory}`);
    return context;
  }

  /**
   * Updates context for a specific session and directory
   */
  async updateContext(directory: string, sessionId: string, content: string): Promise<void> {
    const contextKey = this.getContextKey(directory, sessionId);
    const existingData = await redisClient.get(contextKey);
    
    if (!existingData) {
      throw new Error(`No context found for session ${sessionId} in directory ${directory}`);
    }

    const context = JSON.parse(existingData) as SessionContext;
    
    // Add new content to history
    context.history.push({
      timestamp: new Date().toISOString(),
      content
    });
    
    // Update last accessed timestamp
    context.metadata.lastAccessed = new Date().toISOString();
    
    await redisClient.set(contextKey, JSON.stringify(context));
    console.log(`Updated context for session ${sessionId} in directory ${directory}`);
  }

  /**
   * Ends a session and removes its context
   */
  async endSession(directory: string, sessionId: string): Promise<void> {
    const contextKey = this.getContextKey(directory, sessionId);
    await redisClient.delete(contextKey);
    console.log(`Ended session ${sessionId} for directory ${directory}`);
  }

  /**
   * Validates if a session exists and is valid for a specific directory
   */
  async validateSession(directory: string, sessionId: string): Promise<boolean> {
    const context = await this.getContext(directory, sessionId);
    return context !== null && context.directory === directory;
  }
}

export const sessionManager = new SessionManager();
