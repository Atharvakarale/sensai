// import { db } from "@/lib/prisma";
// import { inngest } from "./client";
// import { GoogleGenerativeAI } from "@google/generative-ai";

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// export const generateIndustryInsights = inngest.createFunction(
//   { name: "Generate Industry Insights" },
//   { cron: "0 0 * * 0" }, // Run every Sunday at midnight
//   async ({ event, step }) => {
//     const industries = await step.run("Fetch industries", async () => {
//       return await db.industryInsight.findMany({
//         select: { industry: true },
//       });
//     });

//     for (const { industry } of industries) {
//       const prompt = `
//           Analyze the current state of the ${industry} industry and provide insights in ONLY the following JSON format without any additional notes or explanations:
//           {
//             "salaryRanges": [
//               { "role": "string", "min": number, "max": number, "median": number, "location": "string" }
//             ],
//             "growthRate": number,
//             "demandLevel": "High" | "Medium" | "Low",
//             "topSkills": ["skill1", "skill2"],
//             "marketOutlook": "Positive" | "Neutral" | "Negative",
//             "keyTrends": ["trend1", "trend2"],
//             "recommendedSkills": ["skill1", "skill2"]
//           }
          
//           IMPORTANT: Return ONLY the JSON. No additional text, notes, or markdown formatting.
//           Include at least 5 common roles for salary ranges.
//           Growth rate should be a percentage.
//           Include at least 5 skills and trends.
//         `;

//       const res = await step.ai.wrap(
//         "gemini",
//         async (p) => {
//           return await model.generateContent(p);
//         },
//         prompt
//       );

//       const text = res.response.candidates[0].content.parts[0].text || "";
//       const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();

//       const insights = JSON.parse(cleanedText);

//       await step.run(`Update ${industry} insights`, async () => {
//         await db.industryInsight.update({
//           where: { industry },
//           data: {
//             ...insights,
//             lastUpdated: new Date(),
//             nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
//           },
//         });
//       });
//     }
//   }
// );

import { db } from "@/lib/prisma";
import { inngest } from "./client";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Define the mapping for demandLevel and marketOutlook
const demandLevelMapping = {
  High: "HIGH",
  Medium: "MEDIUM",
  Low: "LOW",
};

const marketOutlookMapping = {
  Positive: "POSITIVE",
  Neutral: "NEUTRAL",
  Negative: "NEGATIVE",
};

export const generateIndustryInsights = inngest.createFunction(
  { name: "Generate Industry Insights" },
  { cron: "0 0 * * 0" }, // Run every Sunday at midnight
  async ({ event, step }) => {
    try {
      // Log the event data to debug
      console.log("Event Data Received:", JSON.stringify(event, null, 2));

      // If the event payload is missing, use a default payload
      const payload = event?.data || { industry: "tech-software-development" };
      console.log("Using Payload:", JSON.stringify(payload, null, 2));

      // Fetch industries from the database
      const industries = await step.run("Fetch industries", async () => {
        try {
          const industries = await db.industryInsight.findMany({
            select: { industry: true },
          });

          if (!industries || industries.length === 0) {
            console.warn("No industries found in the database.");
            return []; // Return an empty array to avoid errors
          }

          console.log("Fetched Industries:", JSON.stringify(industries, null, 2));
          return industries;
        } catch (error) {
          console.error("Error fetching industries from the database:", error ? error.message : "Unknown error");
          throw error;
        }
      });

      // If no industries are found, log a warning and exit
      if (industries.length === 0) {
        console.warn("No industries to process. Exiting function.");
        return;
      }

      // Process each industry
      for (const { industry } of industries) {
        try {
          console.log(`Processing industry: ${industry}`);

          const prompt = `
            Analyze the current state of the ${industry} industry and provide insights in ONLY the following JSON format without any additional notes or explanations:
            {
              "salaryRanges": [
                { "role": "string", "min": number, "max": number, "median": number, "location": "string" }
              ],
              "growthRate": number,
              "demandLevel": "High" | "Medium" | "Low",
              "topSkills": ["skill1", "skill2"],
              "marketOutlook": "Positive" | "Neutral" | "Negative",
              "keyTrends": ["trend1", "trend2"],
              "recommendedSkills": ["skill1", "skill2"]
            }
            
            IMPORTANT: Return ONLY the JSON. No additional text, notes, or markdown formatting.
            Include at least 5 common roles for salary ranges.
            Growth rate should be a percentage.
            Include at least 5 skills and trends.
          `;

          // Generate insights using Gemini AI
          const res = await step.ai.wrap(
            "gemini",
            async (p) => {
              try {
                return await model.generateContent(p);
              } catch (error) {
                console.error("Error generating content with Gemini AI:", error ? error.message : "Unknown error");
                throw error;
              }
            },
            prompt
          );

          // Extract and clean the response text
          const text = res.response.candidates[0].content.parts[0].text || "";
          const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();
          console.log("Gemini AI Response:", cleanedText);

          // Parse the JSON response
          let insights;
          try {
            insights = JSON.parse(cleanedText);
          } catch (error) {
            console.error("Error parsing JSON response from Gemini AI:", error ? error.message : "Unknown error");
            console.error("Response Text:", cleanedText);
            throw error;
          }

          // Validate the insights object
          if (!insights || typeof insights !== "object") {
            throw new Error("Invalid insights format received from Gemini AI: " + cleanedText);
          }

          // Map demandLevel and marketOutlook to the correct enum values
          if (insights.demandLevel && demandLevelMapping[insights.demandLevel]) {
            insights.demandLevel = demandLevelMapping[insights.demandLevel];
          } else {
            throw new Error(`Invalid demandLevel value: ${insights.demandLevel}`);
          }

          if (insights.marketOutlook && marketOutlookMapping[insights.marketOutlook]) {
            insights.marketOutlook = marketOutlookMapping[insights.marketOutlook];
          } else {
            throw new Error(`Invalid marketOutlook value: ${insights.marketOutlook}`);
          }

          // Update the database with new insights
          await step.run(`Update ${industry} insights`, async () => {
            try {
              await db.industryInsight.update({
                where: { industry },
                data: {
                  ...insights,
                  lastUpdated: new Date(),
                  nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                },
              });
              console.log(`Successfully updated insights for industry: ${industry}`);
            } catch (error) {
              console.error(`Error updating insights for industry ${industry}:`, error ? error.message : "Unknown error");
              throw error;
            }
          });
        } catch (error) {
          console.error(`Error processing industry ${industry}:`, error ? error.message : "Unknown error");
          // Continue processing other industries even if one fails
        }
      }
    } catch (error) {
      console.error("Error in generateIndustryInsights function:", error ? error.message : "Unknown error");
      throw error; // Re-throw the error to ensure it's logged by Inngest
    }
  }
);