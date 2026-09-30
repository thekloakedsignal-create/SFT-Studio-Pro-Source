import { Client } from "@digitalocean/dots/inference";

export interface GradientOptions {
  modelAccessKey?: string;
  model_access_key?: string;
  apiKey?: string;
  baseURL?: string;
}

export class Gradient {
  public chat: {
    completions: {
      create: (params: {
        model?: string;
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        max_tokens?: number;
        [key: string]: any;
      }) => Promise<any>;
    };
  };

  private client: InstanceType<typeof Client>;

  constructor(options?: GradientOptions) {
    const key = options?.modelAccessKey || 
                options?.model_access_key || 
                options?.apiKey || 
                process.env.GRADIENT_MODEL_ACCESS_KEY ||
                process.env.DIGITALOCEAN_TOKEN ||
                process.env.MODEL_ACCESS_KEY || 
                process.env.DIGITALOCEAN_API_KEY || 
                process.env.DO_INFERENCE_KEY || 
                "";

    if (!key.trim()) {
      throw new Error(
        "DigitalOcean inference credentials are not configured. Set DIGITALOCEAN_TOKEN or GRADIENT_MODEL_ACCESS_KEY."
      );
    }

    this.client = new Client({ apiKey: key.trim() });

    this.chat = {
      completions: {
        create: async (params) => {
          const model = params.model || process.env.DO_MODEL || "glm-5.3-flash";
          const maxTokens = Math.min(params.max_tokens ?? 4096, 4096);

          return await this.client.chat.completions.create({
            ...params,
            messages: params.messages as any,
            model,
            max_tokens: maxTokens
          } as any);
        }
      }
    };
  }
}
