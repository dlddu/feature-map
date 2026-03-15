"use client";

import { useEffect, useState, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface APIKeyInfo {
  id: string;
  provider: string;
  maskedKey: string;
  label: string | null;
  isActive: boolean;
}

interface LLMConfig {
  featureType: string;
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

type Provider = "openai" | "anthropic";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
];

const FEATURE_TYPES = [
  { id: "layer-extraction", label: "F1: Layer Extraction", selectId: "f1" },
  { id: "strategy-planning", label: "F2: Strategy Planning", selectId: "f2" },
  { id: "feature-extraction", label: "F3: Feature Extraction", selectId: "f3" },
  { id: "acceptance-tests", label: "F4: Acceptance Tests", selectId: "f4" },
  { id: "dependency-mapping", label: "F5: Dependency Mapping", selectId: "f5" },
  { id: "report-generation", label: "F6: Report Generation", selectId: "f6" },
];

const OPENAI_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
];

const ANTHROPIC_MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-3-5",
];

// ---------------------------------------------------------------------------
// APIKeyCard Component
// ---------------------------------------------------------------------------

interface APIKeyCardProps {
  provider: Provider;
  providerLabel: string;
  apiKeyInfo: APIKeyInfo | null;
  onRegister: (provider: Provider) => void;
  onUpdate: (provider: Provider, keyId: string) => void;
}

function APIKeyCard({
  provider,
  providerLabel,
  apiKeyInfo,
  onRegister,
  onUpdate,
}: APIKeyCardProps) {
  return (
    <div
      data-testid={`provider-row-${provider}`}
      className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-4"
    >
      <div className="flex items-center gap-4">
        <span className="font-semibold text-white">{providerLabel}</span>
        {apiKeyInfo ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              등록됨
            </span>
            <span className="font-mono text-sm text-zinc-400">
              {apiKeyInfo.maskedKey}
            </span>
          </div>
        ) : (
          <span className="text-sm text-zinc-500">미등록</span>
        )}
      </div>

      <button
        type="button"
        onClick={() =>
          apiKeyInfo
            ? onUpdate(provider, apiKeyInfo.id)
            : onRegister(provider)
        }
        className="min-h-[36px] rounded-lg bg-zinc-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500"
      >
        {apiKeyInfo ? "변경" : "등록"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// APIKeyBottomSheet Component
// ---------------------------------------------------------------------------

interface APIKeyBottomSheetProps {
  isOpen: boolean;
  provider: Provider | null;
  keyId: string | null;
  onClose: () => void;
  onSaved: (provider: Provider, info: APIKeyInfo) => void;
}

function APIKeyBottomSheet({
  isOpen,
  provider,
  keyId,
  onClose,
  onSaved,
}: APIKeyBottomSheetProps) {
  const [keyValue, setKeyValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setKeyValue("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  async function handleSave() {
    if (!provider) return;
    if (!keyValue.trim()) {
      setError("API 키를 입력해 주세요");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let res: Response;
      if (keyId) {
        res = await fetch(`/api/settings/api-keys/${keyId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: keyValue }),
        });
      } else {
        res = await fetch("/api/settings/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, key: keyValue }),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "저장에 실패했습니다");
        return;
      }

      const data = await res.json();
      onSaved(provider, data);
      onClose();
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="API Key 입력"
      data-testid="api-key-bottom-sheet"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-2xl border border-zinc-700 bg-zinc-900 p-6 pb-10">
        <h2 className="mb-4 text-lg font-semibold text-white">
          {provider === "openai" ? "OpenAI" : "Anthropic"} API Key{" "}
          {keyId ? "변경" : "등록"}
        </h2>

        <label className="mb-2 block text-sm font-medium text-zinc-300">
          API Key
          <input
            ref={inputRef}
            type="password"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            placeholder="sk-..."
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        {error && (
          <p className="mt-2 text-sm text-red-400">{error}</p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-600 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="flex-1 rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {loading ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModelMappingCard Component
// ---------------------------------------------------------------------------

interface ModelMappingCardProps {
  configs: LLMConfig[];
  apiKeys: Map<string, APIKeyInfo>;
  onConfigUpdated: (config: LLMConfig) => void;
  onToast: (message: string) => void;
}

function ModelMappingCard({
  configs,
  apiKeys,
  onConfigUpdated,
  onToast,
}: ModelMappingCardProps) {
  const configMap = new Map(configs.map((c) => [c.featureType, c]));

  async function handleModelChange(
    featureType: string,
    provider: string,
    model: string
  ) {
    try {
      const res = await fetch(`/api/settings/llm-configs/${featureType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });

      if (!res.ok) return;

      const data: LLMConfig = await res.json();
      onConfigUpdated(data);
      onToast("저장됨");
    } catch {
      // ignore
    }
  }

  function getProviderForFeature(featureType: string): string {
    const cfg = configMap.get(featureType);
    if (cfg) return cfg.provider;
    // Default to first available provider
    if (apiKeys.has("openai")) return "openai";
    if (apiKeys.has("anthropic")) return "anthropic";
    return "openai";
  }

  function getModelForFeature(featureType: string): string {
    const cfg = configMap.get(featureType);
    return cfg?.model ?? "";
  }

  function getModelsForProvider(provider: string): string[] {
    if (provider === "anthropic") return ANTHROPIC_MODELS;
    return OPENAI_MODELS;
  }

  return (
    <div
      data-testid="model-mapping-card"
      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
    >
      <h2 className="mb-5 text-xl font-semibold text-white">기능별 모델 설정</h2>

      <div className="space-y-4">
        {FEATURE_TYPES.map(({ id: featureType, label, selectId }) => {
          const provider = getProviderForFeature(featureType);
          const model = getModelForFeature(featureType);
          const models = getModelsForProvider(provider);

          return (
            <div key={featureType} className="flex items-center gap-4">
              <span className="w-52 shrink-0 text-sm text-zinc-300">{label}</span>
              <select
                data-testid={`model-select-${selectId}`}
                name={selectId}
                aria-label={label}
                value={model}
                onChange={(e) =>
                  handleModelChange(featureType, provider, e.target.value)
                }
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="">모델 선택</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function SettingsLLMPage() {
  const [apiKeys, setApiKeys] = useState<Map<string, APIKeyInfo>>(new Map());
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetProvider, setSheetProvider] = useState<Provider | null>(null);
  const [sheetKeyId, setSheetKeyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch API keys on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [keysRes, configsRes] = await Promise.all([
          fetch("/api/settings/api-keys"),
          fetch("/api/settings/llm-configs"),
        ]);

        if (keysRes.ok) {
          const data = await keysRes.json();
          const map = new Map<string, APIKeyInfo>();
          (data.apiKeys ?? []).forEach((k: APIKeyInfo) => {
            map.set(k.provider, k);
          });
          setApiKeys(map);
        }

        if (configsRes.ok) {
          const data = await configsRes.json();
          setConfigs(data.configs ?? []);
        }
      } catch {
        // ignore
      }
    }
    fetchData();
  }, []);

  function handleRegister(provider: Provider) {
    setSheetProvider(provider);
    setSheetKeyId(null);
    setSheetOpen(true);
  }

  function handleUpdate(provider: Provider, keyId: string) {
    setSheetProvider(provider);
    setSheetKeyId(keyId);
    setSheetOpen(true);
  }

  function handleKeySaved(provider: Provider, info: APIKeyInfo) {
    setApiKeys((prev) => {
      const next = new Map(prev);
      next.set(provider, info);
      return next;
    });
  }

  function handleConfigUpdated(config: LLMConfig) {
    setConfigs((prev) => {
      const next = prev.filter((c) => c.featureType !== config.featureType);
      return [...next, config];
    });
  }

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 2500);
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-3xl font-bold text-white">설정 - LLM</h1>

        {/* API Key 관리 카드 */}
        <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-5 text-xl font-semibold text-white">API Key 관리</h2>
          <div className="space-y-3">
            {PROVIDERS.map(({ id, label }) => (
              <APIKeyCard
                key={id}
                provider={id}
                providerLabel={label}
                apiKeyInfo={apiKeys.get(id) ?? null}
                onRegister={handleRegister}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        </div>

        {/* 기능별 모델 매핑 카드 */}
        <ModelMappingCard
          configs={configs}
          apiKeys={apiKeys}
          onConfigUpdated={handleConfigUpdated}
          onToast={showToast}
        />
      </div>

      {/* API Key 입력 바텀시트 */}
      <APIKeyBottomSheet
        isOpen={sheetOpen}
        provider={sheetProvider}
        keyId={sheetKeyId}
        onClose={() => setSheetOpen(false)}
        onSaved={handleKeySaved}
      />

      {/* 토스트 메시지 */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </main>
  );
}
