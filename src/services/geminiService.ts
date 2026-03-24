import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function convertToEditableScript(rawText: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: `Convert the following story or script into a structured, editable script format with clear scene headings and dialogue: \n\n${rawText}`,
  });
  return response.text;
}

export async function extractCharacters(script: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: `Extract a list of characters from the following script. For each character, provide a name and a brief description. Return the result as a JSON array of objects with "name" and "description" properties. \n\n${script}`,
    config: {
      responseMimeType: "application/json",
    }
  });
  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse characters", e);
    return [];
  }
}

export async function breakIntoChapters(script: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: `Break the following script into logical chapters. For each chapter, provide a title and a list of scenes. Each scene should have a title and a brief description. Return the result as a JSON array of objects with "title" and "scenes" (array of {title, description}) properties. \n\n${script}`,
    config: {
      responseMimeType: "application/json",
    }
  });
  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse chapters", e);
    return [];
  }
}

export async function generateCharacterScript(script: string, characterName: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: `Generate a character-specific script for "${characterName}" from the following full script. Include only their lines and relevant stage directions. \n\n${script}`,
  });
  return response.text;
}
