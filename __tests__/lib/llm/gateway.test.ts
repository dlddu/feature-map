import { LLMGateway } from "@/lib/llm/gateway";
import type { LLMRequest, LLMResponse, LLMProvider } from "@/lib/llm/gateway";

describe("LLMGateway", () => {
  let gateway: LLMGateway;

  beforeEach(() => {
    gateway = new LLMGateway();
  });

  describe("constructor", () => {
    it("should create an LLMGateway instance", () => {
      // Assert
      expect(gateway).toBeInstanceOf(LLMGateway);
    });
  });

  describe("provider routing", () => {
    it("should accept 'openai' as a valid provider", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "openai",
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
      };

      // Act & Assert - should not throw for valid provider
      expect(() => gateway.validateRequest(request)).not.toThrow();
    });

    it("should accept 'anthropic' as a valid provider", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
      };

      // Act & Assert - should not throw for valid provider
      expect(() => gateway.validateRequest(request)).not.toThrow();
    });

    it("should throw an error for unsupported provider", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "unsupported-provider" as LLMProvider,
        model: "some-model",
        messages: [{ role: "user", content: "Hello" }],
      };

      // Act & Assert
      expect(() => gateway.validateRequest(request)).toThrow(
        /unsupported provider/i
      );
    });

    it("should route OpenAI requests to the OpenAI handler", async () => {
      // Arrange
      const request: LLMRequest = {
        provider: "openai",
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
      };

      // Act
      const formattedRequest = gateway.formatRequest(request);

      // Assert
      expect(formattedRequest.provider).toBe("openai");
      expect(formattedRequest.endpoint).toContain("openai");
    });

    it("should route Anthropic requests to the Anthropic handler", async () => {
      // Arrange
      const request: LLMRequest = {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
      };

      // Act
      const formattedRequest = gateway.formatRequest(request);

      // Assert
      expect(formattedRequest.provider).toBe("anthropic");
      expect(formattedRequest.endpoint).toContain("anthropic");
    });
  });

  describe("OpenAI request format", () => {
    it("should format messages into OpenAI chat completion format", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello" },
        ],
      };

      // Act
      const formatted = gateway.formatRequest(request);

      // Assert
      expect(formatted.body).toHaveProperty("model", "gpt-4");
      expect(formatted.body).toHaveProperty("messages");
      expect(formatted.body.messages).toEqual([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ]);
    });

    it("should include optional parameters like temperature and max_tokens for OpenAI", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "openai",
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        maxTokens: 1000,
      };

      // Act
      const formatted = gateway.formatRequest(request);

      // Assert
      expect(formatted.body).toHaveProperty("temperature", 0.7);
      expect(formatted.body).toHaveProperty("max_tokens", 1000);
    });

    it("should set the correct OpenAI API endpoint", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "openai",
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
      };

      // Act
      const formatted = gateway.formatRequest(request);

      // Assert
      expect(formatted.endpoint).toBe(
        "https://api.openai.com/v1/chat/completions"
      );
    });
  });

  describe("Anthropic request format", () => {
    it("should format messages into Anthropic messages API format", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
      };

      // Act
      const formatted = gateway.formatRequest(request);

      // Assert
      expect(formatted.body).toHaveProperty("model", "claude-sonnet-4-20250514");
      expect(formatted.body).toHaveProperty("messages");
      expect(formatted.body.messages).toEqual([
        { role: "user", content: "Hello" },
      ]);
    });

    it("should extract system message from messages array for Anthropic format", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello" },
        ],
      };

      // Act
      const formatted = gateway.formatRequest(request);

      // Assert
      // Anthropic uses a top-level 'system' field instead of a system message in the array
      expect(formatted.body).toHaveProperty(
        "system",
        "You are a helpful assistant."
      );
      expect(formatted.body.messages).toEqual([
        { role: "user", content: "Hello" },
      ]);
    });

    it("should include optional parameters like temperature and max_tokens for Anthropic", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.5,
        maxTokens: 2048,
      };

      // Act
      const formatted = gateway.formatRequest(request);

      // Assert
      expect(formatted.body).toHaveProperty("temperature", 0.5);
      expect(formatted.body).toHaveProperty("max_tokens", 2048);
    });

    it("should set the correct Anthropic API endpoint", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
      };

      // Act
      const formatted = gateway.formatRequest(request);

      // Assert
      expect(formatted.endpoint).toBe(
        "https://api.anthropic.com/v1/messages"
      );
    });
  });

  describe("request validation", () => {
    it("should throw when messages array is empty", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "openai",
        model: "gpt-4",
        messages: [],
      };

      // Act & Assert
      expect(() => gateway.validateRequest(request)).toThrow(
        /messages.*empty/i
      );
    });

    it("should throw when model is not provided", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "openai",
        model: "",
        messages: [{ role: "user", content: "Hello" }],
      };

      // Act & Assert
      expect(() => gateway.validateRequest(request)).toThrow(/model.*required/i);
    });

    it("should pass validation for a well-formed request", () => {
      // Arrange
      const request: LLMRequest = {
        provider: "openai",
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
      };

      // Act & Assert
      expect(() => gateway.validateRequest(request)).not.toThrow();
    });
  });

  describe("response normalization", () => {
    it("should normalize OpenAI response to a common LLMResponse format", () => {
      // Arrange
      const openAIRawResponse = {
        id: "chatcmpl-abc123",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello! How can I help?" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
      };

      // Act
      const normalized: LLMResponse = gateway.normalizeResponse(
        "openai",
        openAIRawResponse
      );

      // Assert
      expect(normalized.content).toBe("Hello! How can I help?");
      expect(normalized.provider).toBe("openai");
      expect(normalized.usage.promptTokens).toBe(10);
      expect(normalized.usage.completionTokens).toBe(8);
      expect(normalized.usage.totalTokens).toBe(18);
    });

    it("should normalize Anthropic response to a common LLMResponse format", () => {
      // Arrange
      const anthropicRawResponse = {
        id: "msg_abc123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Hello! How can I help?" }],
        usage: { input_tokens: 10, output_tokens: 8 },
      };

      // Act
      const normalized: LLMResponse = gateway.normalizeResponse(
        "anthropic",
        anthropicRawResponse
      );

      // Assert
      expect(normalized.content).toBe("Hello! How can I help?");
      expect(normalized.provider).toBe("anthropic");
      expect(normalized.usage.promptTokens).toBe(10);
      expect(normalized.usage.completionTokens).toBe(8);
      expect(normalized.usage.totalTokens).toBe(18);
    });
  });
});
