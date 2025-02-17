import { createClient } from 'redis';
import dotenv from 'dotenv';
import { promisify } from 'util';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

class RedisClient {
  private client;
  private connected: boolean = false;

  constructor() {
    this.client = createClient({
      url: REDIS_URL
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
      this.connected = false;
    });

    this.client.on('connect', () => {
      console.log('Connected to Redis at', REDIS_URL);
      this.connected = true;
    });
  }

  async connect() {
    if (!this.connected) {
      await this.client.connect();
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  async set(key: string, value: string, expireSeconds?: number): Promise<void> {
    await this.connect();
    if (expireSeconds) {
      await this.client.set(key, value, { EX: expireSeconds });
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    await this.connect();
    return await this.client.get(key);
  }

  async delete(key: string): Promise<void> {
    await this.connect();
    await this.client.del(key);
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const redisClient = new RedisClient();
