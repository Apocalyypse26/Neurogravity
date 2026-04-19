import "dotenv/config";
import { openai } from "../src/services/openai.js";

async function testOpenAI() {
  console.log("Testing OpenAI connection...");
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello, are you operational?" }],
      max_tokens: 10,
    });
    console.log("Successfully connected to OpenAI!");
    console.log("Response:", response.choices[0].message.content);
  } catch (error) {
    console.error("OpenAI Connection Failed:");
    console.error(error.message);
    process.exit(1);
  }
}

testOpenAI();
