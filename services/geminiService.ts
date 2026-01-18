
import { GoogleGenAI } from "@google/genai";
import { GroundingLink } from "../types";

export const searchPlaceInfo = async (
  query: string,
  lat?: number,
  lng?: number
): Promise<{ text: string; links: GroundingLink[] }> => {
  // Use process.env.API_KEY directly as required. Initialize GoogleGenAI right before use.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const config: any = {
    tools: [{ googleMaps: {} }],
  };

  if (lat !== undefined && lng !== undefined) {
    config.toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: lat,
          longitude: lng,
        },
      },
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Find information about this place: ${query}. Provide a short description and relevant links.`,
      config: config,
    });

    const text = response.text || "No information found.";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    const links: GroundingLink[] = chunks
      .filter((chunk: any) => chunk.maps)
      .map((chunk: any) => ({
        uri: chunk.maps.uri,
        title: chunk.maps.title,
      }));

    return { text, links };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "Error fetching place information.", links: [] };
  }
};
