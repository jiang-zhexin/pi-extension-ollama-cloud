export interface SearchResponse {
  results: Array<{
    title: string;
    url: string;
    content: string;
  }>;
}

export interface FetchResponse {
  title: string;
  content: string;
  links: string[];
}

export interface ListResponse {
  models: Array<{
    name: string;
    modified_at: string;
    model: string;
    size: number;
    digest: string;
    details: ModelDetails;
    expires_at: string;
    size_vram: number;
  }>;
}

export interface ShowResponse {
  capabilities: (
    | "completion"
    | "thinking"
    | "tools"
    | "vision"
  )[];
  details: ModelDetails;
  model_info: {
    "general.architecture": string;
    "general.parameter_count": number;
    [key: string]: string | number;
  };
  modified_at: string;
}

interface ModelDetails {
  parent_model: string;
  format: string;
  family: string;
  families: string[] | null;
  parameter_size: string;
  quantization_level: string;
}
