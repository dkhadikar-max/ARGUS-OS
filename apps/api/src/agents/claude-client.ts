import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export const CLAUDE_MODEL = env.ANTHROPIC_MODEL;
