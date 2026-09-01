export type SearchResponse = {
  results: Array<{
    title: string;
    url: string;
    content: string;
  }>;
};

export type FetchResponse = {
  title: string;
  content: string;
  links: string[];
};

export type ListResponse = {
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
};

export type ShowResponse = {
  capabilities: ("completion" | "thinking" | "tools" | "vision")[];
  details: ModelDetails;
  model_info: {
    "general.architecture": string;
    "general.parameter_count": number;
    [key: string]: string | number;
  };
  modified_at: string;
  thinking?: {
    values: thinkLevel[];
    default: thinkLevel;
  };
};

export type SystemOneResponse = {
  model: string;
  answers: Record<string, choice | noul | score>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

type choice = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

type noul = {
  type: "noul";
  noul: number;
};

type score = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};

type thinkLevel = false | true | "low" | "medium" | "high" | "max";

type ModelDetails = {
  parent_model: string;
  format: string;
  family: string;
  families: string[] | null;
  parameter_size: string;
  quantization_level: string;
};
