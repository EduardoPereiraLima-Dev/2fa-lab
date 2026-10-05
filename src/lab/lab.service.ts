import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LabMessage {
  id: string;
  from: string;
  to: string[];
  subject: string;
  created: string;
  text: string;
  code: string | null;
}

@Injectable()
export class LabService {
  private readonly logger = new Logger(LabService.name);
  readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('MAILPIT_API_URL') || 'http://127.0.0.1:8025').replace(/\/+$/, '');
  }

  async listMessages(limit = 10): Promise<LabMessage[]> {
    const summaries = await this.request<{ messages?: Array<{ ID: string }> }>(
      `/api/v1/messages?limit=${limit}`,
    );

    const messages = summaries?.messages ?? [];
    const hydrated = await Promise.all(
      messages.map((message) => this.hydrate(message.ID)),
    );

    this.logger.log(`${hydrated.length} mensagem(ns) lida(s) do Mailpit`);
    return hydrated;
  }

  private async hydrate(id: string): Promise<LabMessage> {
    const full = await this.request<{
      Subject?: string;
      Created?: string;
      Text?: string;
      From?: { Address?: string };
      To?: Array<{ Address?: string }>;
    }>(`/api/v1/message/${encodeURIComponent(id)}`);

    const text = full?.Text ?? '';

    return {
      id,
      from: full?.From?.Address ?? '',
      to: (full?.To ?? []).map((entry) => entry.Address ?? ''),
      subject: full?.Subject ?? '',
      created: full?.Created ?? '',
      text,
      code: this.extractCode(text),
    };
  }

  private extractCode(text: string): string | null {
    const match = text.match(/(?<!\d)(\d{6})(?!\d)/);
    return match ? match[1] : null;
  }

  private async request<T>(path: string): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      throw new Error(`sem conexão com ${this.baseUrl} (${(err as Error).message})`);
    }

    if (!response.ok) {
      throw new Error(`Mailpit respondeu ${response.status}`);
    }

    return (await response.json()) as T;
  }
}