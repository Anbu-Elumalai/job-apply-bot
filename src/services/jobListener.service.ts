import { AppDataSource } from "../data-source";
import { JobPost } from "../entity/JobPost";
import { UserProfile } from "../entity/UserProfile";
import { JobApplication } from "../entity/JobApplication";
import { SystemTelemetry } from "../entity/SystemTelemetry";
import { MatchingEngineService } from "./matchingEngine.service";
import { emitNotification } from "../utils/socket";
import axios from "axios";
import { ApplierService } from "./applier.service";

export class JobListenerService {
  /**
   * Triggers the job harvesting workflow.
   * Fetches jobs from LinkedIn, Indeed, etc., matches them, and initiates applications.
   * @param simulate If true, populates the DB with highly realistic mock entries for safety/demonstration.
   */
  static async runScraper(simulate = true): Promise<{ scraped: number; matched: number }> {
    console.log("🚀 Starting Job Scraper Pipeline...");

    // Log telemetry start
    await this.logTelemetry("SCRAPING", "INFO", "Started job scraping pipeline execution.");

    const jobRepo = AppDataSource.getMongoRepository(JobPost);
    const profileRepo = AppDataSource.getMongoRepository(UserProfile);
    const applicationRepo = AppDataSource.getMongoRepository(JobApplication);

    // Get active user profiles
    const profiles = await profileRepo.find();
    if (profiles.length === 0) {
      const msg = "No user profiles found. Scraper execution aborted.";
      await this.logTelemetry("SCRAPING", "WARN", msg);
      return { scraped: 0, matched: 0 };
    }

    const defaultProfile = profiles[0];
    let rawJobs: Partial<JobPost>[] = [];

    if (simulate) {
      // Simulate/harvest realistic job posts matching target titles
      rawJobs = this.generateMockJobs(defaultProfile.preferences.jobTitles, defaultProfile.preferences.locations);
    } else {
      // Production live scraping trigger
      rawJobs = await this.scrapeLivePlatforms(defaultProfile.preferences.jobTitles, defaultProfile.preferences.locations);
    }

    let scrapedCount = 0;
    let matchedCount = 0;

    for (const rawJob of rawJobs) {
      try {
        // 1. Check if job already exists (Deduplication)
        let job = await jobRepo.findOne({
          where: { platform: rawJob.platform, platformJobId: rawJob.platformJobId }
        });

        if (!job) {
          job = jobRepo.create(rawJob);
          job = await jobRepo.save(job);
          scrapedCount++;
        }

        // 2. Skip if already processed for this user profile
        const existingApp = await applicationRepo.findOne({
          where: { jobId: job.id, userProfileId: defaultProfile.id }
        });

        if (existingApp) continue;

        // --- OPTIMIZED PIPELINE WORKFLOW ---

        // A. Pre-filter Candidate: Skip immediately to save CPU / API resources
        const passedPreFilter = MatchingEngineService.preFilterUser(defaultProfile, job);
        if (!passedPreFilter) {
          console.log(`⏩ Pre-filtered: Skipped unrelated job "${job.title}" at ${job.companyName}`);
          continue;
        }

        // B. Calculate Score (NLP/Keyword Hybrid Engine)
        const matchResult = await MatchingEngineService.calculateMatch(defaultProfile, job);

        job.matchScore = matchResult.score;
        job.isProcessed = true;
        await jobRepo.save(job);

        // C. Send Telemetry Log Notification
        emitNotification("telemetry-log", {
          message: `Evaluated job "${job.title}" at ${job.companyName}: Score ${matchResult.score}%`,
          timestamp: new Date()
        });

        // D. Score > Threshold check
        if (matchResult.score >= defaultProfile.preferences.matchingThresholdScore) {

          // E. Store Recommendation (Save MATCHED JobApplication)
          const application = applicationRepo.create({
            jobId: job.id,
            userProfileId: defaultProfile.id,
            status: "MATCHED",
            auditLogs: [
              {
                timestamp: new Date(),
                status: "MATCHED",
                message: `Auto-matched by Matching Engine. Relevancy score: ${matchResult.score}%. ${matchResult.reason}`
              }
            ],
            submissionDetails: {
              coverLetterUsed: this.generateCoverLetter(defaultProfile, job),
              resumeVersionUsed: defaultProfile.resumeUrl
            }
          });

          const savedApp = await applicationRepo.save(application);
          matchedCount++;

          // F. Send Live Match Notification to Dashboard UI
          emitNotification("job-matched", {
            jobId: job.id.toString(),
            title: job.title,
            company: job.companyName,
            score: matchResult.score,
            status: "MATCHED"
          });

          // G. Auto Apply (Optional)
          if (defaultProfile.preferences.autoApply) {
            console.log(`🤖 Auto Apply active: Submitting application ${savedApp.id} in background...`);
            ApplierService.executeApplication(savedApp.id.toString()).catch(e => {
              console.error(`❌ Background auto-apply error: ${e.message}`);
            });
          }
        }
      } catch (err: any) {
        console.error(`Error processing job post: ${err.message}`);
      }
    }

    const summary = `Scraper run completed. Scraped ${scrapedCount} new postings. Matched ${matchedCount} jobs for profile ${defaultProfile.name}.`;
    await this.logTelemetry("SCRAPING", "INFO", summary);
    console.log(`✅ ${summary}`);

    return { scraped: scrapedCount, matched: matchedCount };
  }

  /**
   * Generates extremely realistic mock postings to verify pipeline operations securely
   */
  private static generateMockJobs(titles: string[], locations: string[]): Partial<JobPost>[] {
    const platforms = ["linkedin", "indeed", "naukri"];
    const companies = ["Google Inc.", "Stripe", "Netflix", "Atlassian", "Uber Technologies", "Razorpay", "Cred", "Canva"];

    const skillsList = [
      ["Node.js", "TypeScript", "Express", "MongoDB", "TypeORM"],
      ["Node.js", "JavaScript", "Docker", "REST API", "AWS"],
      ["TypeScript", "React", "Node.js", "GraphQL", "PostgreSQL"],
      ["Python", "Django", "PostgreSQL", "REST API"],
      ["Go", "Docker", "Kubernetes", "gRPC"]
    ];

    const jobs: Partial<JobPost>[] = [];

    titles.forEach((title, tIdx) => {
      locations.forEach((location, lIdx) => {
        platforms.forEach((platform, pIdx) => {
          const comp = companies[(tIdx + lIdx + pIdx) % companies.length];
          const skills = skillsList[(tIdx + lIdx) % skillsList.length];
          const expReq = 3 + ((tIdx + pIdx) % 5); // 3 to 7 years

          const jobId = `job_${platform}_${Math.floor(100000 + Math.random() * 900000)}`;

          jobs.push({
            platform,
            platformJobId: jobId,
            title: `${title}`,
            companyName: comp,
            location: `${location}`,
            salaryText: "₹18,000,000 - ₹3,000,000 per annum",
            jobUrl: `https://www.${platform}.com/jobs/view/${jobId}`,
            description: `We are looking for a highly skilled ${title} to join our growing product team at ${comp}.\n\n` +
                         "Key Requirements:\n" +
                         `- Deep expertise in ${skills.join(", ")}.\n` +
                         "- Solid experience in building scalable REST APIs and secure servers.\n" +
                         `- Minimum ${expReq}+ years of professional software engineering experience.\n` +
                         "- Strong communication and microservice orchestration skills.\n\n" +
                         "What we offer: Remote setups, health insurance, and premium devices. Apply today!",
            scrapedAt: new Date(),
            isProcessed: false
          });
        });
      });
    });

    return jobs;
  }

  /**
   * Invokes real-world live scraping to discover active job opportunities on LinkedIn guest listings
   */
  private static async scrapeLivePlatforms(titles: string[], locations: string[]): Promise<Partial<JobPost>[]> {
    const scrapedJobs: Partial<JobPost>[] = [];
    const axiosInstance = axios.create({
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      },
      timeout: 15000
    });

    for (const title of titles) {
      for (const location of locations) {
        try {
          console.log(`🔍 Live Scraping LinkedIn guest search for "${title}" in "${location}"...`);

          // Request LinkedIn Guest Job Search API
          const searchUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(title)}&location=${encodeURIComponent(location)}&start=0`;
          const response = await axiosInstance.get(searchUrl);
          const html = response.data;

          if (!html || typeof html !== "string") {
            continue;
          }

          // Parse job card elements
          const cards = html.split("<li");

          for (let i = 1; i < cards.length; i++) {
            const cardHtml = cards[i];

            // Extract Job URL
            const urlMatch = cardHtml.match(/href="([^"]+jobs\/view\/[^"]+)"/);
            if (!urlMatch) continue;
            let jobUrl = urlMatch[1].split("?")[0]; // Clean search tags

            // Extract platform job ID
            const idMatch = jobUrl.match(/view\/([a-zA-Z0-9-]+)/) || jobUrl.match(/jobs\/view\/([a-zA-Z0-9-]+)/);
            if (!idMatch) continue;
            const platformJobId = idMatch[1];

            // Extract Title
            const titleMatch = cardHtml.match(/<h3 class="base-search-card__title"[^>]*>\s*([\s\S]*?)\s*<\/h3>/) ||
                               cardHtml.match(/<h3[^>]*>\s*([\s\S]*?)\s*<\/h3>/);
            if (!titleMatch) continue;
            const jobTitle = titleMatch[1].replace(/<[^>]*>/g, "").trim();

            // Extract Company Name
            const companyMatch = cardHtml.match(/<h4 class="base-search-card__subtitle"[^>]*>\s*([\s\S]*?)\s*<\/h4>/) ||
                                 cardHtml.match(/<a class="hidden-nested-link"[^>]*>\s*([\s\S]*?)\s*<\/a>/) ||
                                 cardHtml.match(/<h4[^>]*>\s*([\s\S]*?)\s*<\/h4>/);
            const companyName = companyMatch ? companyMatch[1].replace(/<[^>]*>/g, "").trim() : "Unknown Company";

            // Extract Location
            const locationMatch = cardHtml.match(/<span class="job-search-card__location"[^>]*>\s*([\s\S]*?)\s*<\/span>/) ||
                                  cardHtml.match(/<span class="job-result-card__location"[^>]*>\s*([\s\S]*?)\s*<\/span>/);
            const jobLocation = locationMatch ? locationMatch[1].replace(/<[^>]*>/g, "").trim() : location;

            // Fetch actual full text descriptions dynamically
            let description = `Full description details are available at: ${jobUrl}`;
            try {
              // Wait 1.5 seconds to bypass active LinkedIn DDOS/security rate-limits
              await new Promise(resolve => setTimeout(resolve, 1500));

              const descUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${platformJobId}`;
              const descResponse = await axiosInstance.get(descUrl);
              const descHtml = descResponse.data;

              // Parse body container
              const bodyMatch = descHtml.match(/<div class="description__text description__text--rich"[^>]*>([\s\S]*?)<\/div>/);
              if (bodyMatch) {
                // Clean HTML nodes to return natural plain job requirements
                description = bodyMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
              }
            } catch (descErr: any) {
              console.log(`⚠️ Rich description harvest skipped for ${platformJobId}: ${descErr.message}`);
            }

            scrapedJobs.push({
              platform: "linkedin",
              platformJobId,
              title: jobTitle,
              companyName,
              location: jobLocation,
              salaryText: "Negotiable",
              jobUrl,
              description,
              scrapedAt: new Date(),
              isProcessed: false
            });

            // Keep scrape volume polite
            if (scrapedJobs.length >= 10) break;
          }
        } catch (err: any) {
          console.error(`❌ Live scraping error for "${title}" in "${location}": ${err.message}`);
        }
      }
    }

    console.log(`✅ Live Scraping completed. Discovered ${scrapedJobs.length} active job listings.`);
    return scrapedJobs;
  }

  /**
   * Helper to write telemetry log records into MongoDB
   */
  private static async logTelemetry(action: "SCRAPING" | "APPLYING" | "SYSTEM_MAINTENANCE", level: "INFO" | "WARN" | "ERROR", message: string) {
    try {
      const telemetryRepo = AppDataSource.getMongoRepository(SystemTelemetry);
      const log = telemetryRepo.create({ action, level, message, timestamp: new Date() });
      await telemetryRepo.save(log);
    } catch (e) {
      console.error("Failed to write telemetry:", e);
    }
  }

  /**
   * Dynamic parser replacing template variables in cover letters
   */
  private static generateCoverLetter(profile: UserProfile, job: JobPost): string {
    if (!profile.coverLetterTemplate) return "";

    return profile.coverLetterTemplate
      .replace(/{{name}}/g, profile.name)
      .replace(/{{companyName}}/g, job.companyName)
      .replace(/{{jobTitle}}/g, job.title)
      .replace(/{{totalExperienceYears}}/g, profile.totalExperienceYears.toString())
      .replace(/{{skills}}/g, profile.skills.slice(0, 4).join(", "));
  }
}
