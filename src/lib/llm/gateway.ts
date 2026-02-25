export type LLMProvider = "openai" | "anthropic";

export interface LLMMessage {
  role: string;
  content: string;
}

export interface LLMRequest {
  provider: LLMProvider;
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface FormattedRequest {
  provider: LLMProvider;
  endpoint: string;
  body: Record<string, unknown>;
}

const SUPPORTED_PROVIDERS: LLMProvider[] = ["openai", "anthropic"];

export class LLMGateway {
  validateRequest(request: LLMRequest): void {
    if (!SUPPORTED_PROVIDERS.includes(request.provider)) {
      throw new Error(`Unsupported provider: ${request.provider}`);
    }

    if (!request.model) {
      throw new Error("Model is required");
    }

    if (!request.messages || request.messages.length === 0) {
      throw new Error("Messages cannot be empty");
    }
  }

  formatRequest(request: LLMRequest): FormattedRequest {
    if (request.provider === "openai") {
      return this.formatOpenAIRequest(request);
    }
    return this.formatAnthropicRequest(request);
  }

  normalizeResponse(
    provider: LLMProvider | string,
    rawResponse: Record<string, unknown>
  ): LLMResponse {
    if (provider === "openai") {
      return this.normalizeOpenAIResponse(rawResponse);
    }
    return this.normalizeAnthropicResponse(rawResponse);
  }

  private formatOpenAIRequest(request: LLMRequest): FormattedRequest {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }

    return {
      provider: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      body,
    };
  }

  private formatAnthropicRequest(request: LLMRequest): FormattedRequest {
    const systemMessage = request.messages.find((m) => m.role === "system");
    const nonSystemMessages = request.messages.filter(
      (m) => m.role !== "system"
    );

    const body: Record<string, unknown> = {
      model: request.model,
      messages: nonSystemMessages,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }

    return {
      provider: "anthropic",
      endpoint: "https://api.anthropic.com/v1/messages",
      body,
    };
  }

  private normalizeOpenAIResponse(
    rawResponse: Record<string, unknown>
  ): LLMResponse {
    const choices = rawResponse.choices as Array<{
      message: { content: string };
    }>;
    const usage = rawResponse.usage as {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };

    return {
      content: choices[0].message.content,
      provider: "openai",
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
    };
  }

  private normalizeAnthropicResponse(
    rawResponse: Record<string, unknown>
  ): LLMResponse {
    const content = rawResponse.content as Array<{ type: string; text: string }>;
    const usage = rawResponse.usage as {
      input_tokens: number;
      output_tokens: number;
    };

    return {
      content: content[0].text,
      provider: "anthropic",
      usage: {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
      },
    };
  }
}
