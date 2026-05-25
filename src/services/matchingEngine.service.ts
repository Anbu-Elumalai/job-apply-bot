import { UserProfile } from "../entity/UserProfile";
import { JobPost } from "../entity/JobPost";

export interface MatchingResult {
  score: number; // 0 to 100
  matchedSkills: string[];
  missingSkills: string[];
  isLocationFit: boolean;
  isExperienceFit: boolean;
  reason: string;
}

export class MatchingEngineService {
  /**
   * Evaluates how well a Job matches a candidate User Profile.
   * Uses keyword intersection, experience evaluation, and title scoring.
   */
  static async calculateMatch(
    profile: UserProfile,
    job: JobPost
  ): Promise<MatchingResult> {
    const jobTitleLower = job.title.toLowerCase();
    const jobDescLower = job.description.toLowerCase();
    const jobLocationLower = job.location.toLowerCase();

    // 1. Location Fit Evaluation
    let isLocationFit = true;
    const preferredTypes = profile.preferences.jobTypes.map(t => t.toLowerCase());

    const isJobRemote = jobLocationLower.includes("remote") || jobDescLower.includes("work from home");
    const isJobHybrid = jobLocationLower.includes("hybrid");
    const isJobOnsite = !isJobRemote && !isJobHybrid;

    if (isJobRemote && !preferredTypes.includes("remote")) {
      isLocationFit = false;
    } else if (isJobHybrid && !preferredTypes.includes("hybrid")) {
      isLocationFit = false;
    } else if (isJobOnsite && !preferredTypes.includes("on-site")) {
      // Check if location matches specific city names from preferences
      const matchesCity = profile.preferences.locations.some(city =>
        jobLocationLower.includes(city.toLowerCase())
      );
      if (!matchesCity) {
        isLocationFit = false;
      }
    }

    // 2. Title Relevance Match (Weighted: 25% of total score)
    let titleScore = 0;
    const preferredTitles = profile.preferences.jobTitles;
    const matchingTitle = preferredTitles.find(title =>
      jobTitleLower.includes(title.toLowerCase()) || title.toLowerCase().includes(jobTitleLower)
    );
    if (matchingTitle) {
      titleScore = 25;
    } else {
      // Partial title overlaps
      const overlaps = preferredTitles.filter(title => {
        const words = title.toLowerCase().split(" ");
        return words.some(word => word.length > 3 && jobTitleLower.includes(word));
      });
      if (overlaps.length > 0) {
        titleScore = 15;
      }
    }

    // 3. Skills Intersection Match (Weighted: 55% of total score)
    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];

    profile.skills.forEach(skill => {
      const skillLower = skill.toLowerCase();
      // Safe boundary check to avoid substring issues (e.g. "Java" matching "JavaScript")
      const regex = new RegExp(`\\b${this.escapeRegExp(skillLower)}\\b`, "i");

      if (regex.test(jobDescLower) || jobDescLower.includes(` ${skillLower} `)) {
        matchedSkills.push(skill);
      } else {
        missingSkills.push(skill);
      }
    });

    const skillsScore = profile.skills.length > 0
      ? Math.round((matchedSkills.length / profile.skills.length) * 55)
      : 0;

    // 4. Experience Threshold Check (Weighted: 20% of total score)
    let isExperienceFit = true;
    let experienceScore = 20;

    // Parse years of experience required from job description via RegExp
    const expRegexes = [
      /(\d+)\+?\s*years?/i,
      /(\d+)\s*to\s*(\d+)\s*years?/i,
      /experience\s*of\s*(\d+)\s*years?/i
    ];

    let requiredExperience = 0;
    for (const regex of expRegexes) {
      const match = job.description.match(regex);
      if (match) {
        requiredExperience = parseInt(match[1], 10);
        break;
      }
    }

    if (requiredExperience > profile.totalExperienceYears) {
      isExperienceFit = false;
      const gap = requiredExperience - profile.totalExperienceYears;
      experienceScore = Math.max(0, 20 - gap * 5); // Deduct 5 points per deficit year
    }

    // Combine standard keyword scoring
    let finalScore = titleScore + skillsScore + experienceScore;

    // Hard exclusion filter modifications
    if (!isLocationFit) {
      finalScore = Math.max(0, finalScore - 30); // Heavy location penalty
    }

    // Caps score between 0 and 100
    finalScore = Math.min(100, Math.max(0, finalScore));

    // Optional: Semantic LLM Hook integration
    if (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) {
      try {
        const aiScore = await this.evaluateWithLLM(profile, job);
        if (aiScore !== null) {
          // Weighted blend: 40% keyword, 60% AI evaluation
          finalScore = Math.round(finalScore * 0.4 + aiScore * 0.6);
        }
      } catch (err: any) {
        console.error("AI Semantic matching evaluation error:", err.message);
      }
    }

    // Build human readable reason breakdown
    let reason = `Score breakdown: Title Relevance (${titleScore}/25), Skills Match (${skillsScore}/55, matched ${matchedSkills.length}/${profile.skills.length}), Experience Fit (${experienceScore}/20).`;
    if (!isLocationFit) {
      reason += " Location did not perfectly align with candidate hybrid/remote preferences.";
    }

    return {
      score: finalScore,
      matchedSkills,
      missingSkills,
      isLocationFit,
      isExperienceFit,
      reason
    };
  }

  /**
   * Helper to safely escape regex characters
   */
  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Normalize Role: Standardizes abbreviations, spacing, and casing
   */
  static normalizeRole(title: string): string {
    return title
      .toLowerCase()
      .replace(/\bsr\.?\b/gi, "senior")
      .replace(/\bjr\.?\b/gi, "junior")
      .replace(/\bdev\b/gi, "developer")
      .replace(/\bnode\s*js\b/gi, "node.js")
      .replace(/\bfull\s*stack\b/gi, "full stack")
      .replace(/\bbackend\b/gi, "backend")
      .replace(/\bengineer\b/gi, "developer")
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Pre-filter Users: Check if job matches a candidate's basic structural requirements
   * (e.g. Remote/On-site alignment) before executing expensive heavy calculations
   */
  static preFilterUser(profile: UserProfile, job: JobPost): boolean {
    const jobTitleNormalized = this.normalizeRole(job.title);
    const preferredTitlesNormalized = profile.preferences.jobTitles.map(t => this.normalizeRole(t));

    // A. Role Title Filtering: Check if there's at least some word overlap in roles
    const titleMatch = preferredTitlesNormalized.some(prefTitle => {
      const prefWords = prefTitle.split(" ");
      return prefWords.some(word => word.length > 3 && jobTitleNormalized.includes(word));
    });

    if (!titleMatch) {
      return false; // Skip immediately if the job role is completely unrelated
    }

    // B. Basic Location type match
    const jobLocationLower = job.location.toLowerCase();
    const jobDescLower = job.description.toLowerCase();
    const preferredTypes = profile.preferences.jobTypes.map(t => t.toLowerCase());

    const isJobRemote = jobLocationLower.includes("remote") || jobDescLower.includes("work from home");

    if (isJobRemote && !preferredTypes.includes("remote")) {
      return false; // Skip if job is remote but candidate only wants hybrid/onsite
    }

    return true; // Passed pre-filtering check!
  }

  /**
   * Placeholder hook to connect to a live LLM API for advanced semantic evaluation
   */
  private static async evaluateWithLLM(profile: UserProfile, job: JobPost): Promise<number | null> {
    // If the developer integrates Gemini/OpenAI API:
    // Pushes job text & candidate profile resume JSON and asks for a structured score.
    return null;
  }
}
