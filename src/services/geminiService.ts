import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface PromptAnalysis {
  rewrittenPrompt: string;
  whatWasWrong: string[];
  whatChangedAndWhy: string[];
  promptingLesson: {
    title: string;
    content: string;
    technique: string;
  };
  aiInterpretation: string;
  ratings: {
    clarity: number;
    specificity: number;
    structure: number;
  };
}

export const analyzePrompt = async (prompt: string, useCase: string): Promise<PromptAnalysis> => {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Analyze and enhance this prompt for the use case: ${useCase}. 
    User Prompt: "${prompt}"`,
    config: {
      systemInstruction: `You are Prompt Enhancer, an elite AI literacy coach. Your goal is to help users write better prompts by teaching them the "why" behind prompt engineering.
      
      When a user provides a prompt, you must:
      1. Rewrite it to be highly effective for a Large Language Model.
      2. Identify specific flaws (vagueness, lack of context, etc.).
      3. Explain exactly what you changed and the reasoning behind it.
      4. Provide a "Prompting Lesson" that introduces a specific technique (e.g., Role Prompting, Few-Shot, Chain-of-Thought) and explains it simply.
      5. Explain how an AI "thinks" about the original prompt (tokens, attention, instruction-following). 
         **Crucially, include insights into how LLMs are trained (e.g., next-token prediction, RLHF) and what they CANNOT do freely (e.g., real-time web access unless specified, private data, or perfect logic without step-by-step guidance).**
      6. Rate the original prompt from 1-10 on Clarity, Specificity, and Structure.
      
      Maintain an encouraging, professional, and educational tone. Avoid jargon where possible, or explain it if necessary.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          rewrittenPrompt: { type: Type.STRING },
          whatWasWrong: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          whatChangedAndWhy: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          promptingLesson: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              technique: { type: Type.STRING }
            },
            required: ["title", "content", "technique"]
          },
          aiInterpretation: { type: Type.STRING },
          ratings: {
            type: Type.OBJECT,
            properties: {
              clarity: { type: Type.NUMBER },
              specificity: { type: Type.NUMBER },
              structure: { type: Type.NUMBER }
            },
            required: ["clarity", "specificity", "structure"]
          }
        },
        required: ["rewrittenPrompt", "whatWasWrong", "whatChangedAndWhy", "promptingLesson", "aiInterpretation", "ratings"]
      }
    }
  });

  return JSON.parse(response.text);
};
