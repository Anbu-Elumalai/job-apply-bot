import { MatchingEngineService } from "../services/matchingEngine.service";
import { UserProfile } from "../entity/UserProfile";
import { JobPost } from "../entity/JobPost";
import { ObjectId } from "mongodb";

describe("MatchingEngineService - Scoring Accuracy Tests", () => {
  let mockProfile: UserProfile;

  beforeEach(() => {
    mockProfile = new UserProfile();
    mockProfile.id = new ObjectId();
    mockProfile.name = "John Doe";
    mockProfile.email = "john@example.com";
    mockProfile.phoneNumber = "+123456789";
    mockProfile.currentTitle = "Senior Backend Engineer";
    mockProfile.skills = ["Node.js", "TypeScript", "MongoDB", "Express", "Docker"];
    mockProfile.totalExperienceYears = 5;
    mockProfile.preferences = {
      jobTitles: ["Senior Backend Engineer", "Node.js Developer"],
      locations: ["Bangalore", "Remote"],
      jobTypes: ["Remote", "Hybrid"],
      salaryExpectationMin: 1500000,
      salaryExpectationCurrency: "INR",
      matchingThresholdScore: 70,
      autoApply: true
    };
  });

  it("should yield a high score for a perfect candidate-to-job match", async () => {
    const job = new JobPost();
    job.platform = "linkedin";
    job.platformJobId = "perfect_101";
    job.title = "Senior Backend Engineer";
    job.companyName = "TechCorp";
    job.location = "Remote";
    job.description = "We are seeking a Senior Backend Engineer. " +
                      "Must have 5 years experience with Node.js, TypeScript, MongoDB, and Express. " +
                      "We use Docker extensively.";

    const result = await MatchingEngineService.calculateMatch(mockProfile, job);

    // Expect maximum/high score close to 100 since all criteria are met
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.isLocationFit).toBe(true);
    expect(result.isExperienceFit).toBe(true);
    expect(result.matchedSkills).toContain("Node.js");
    expect(result.matchedSkills).toContain("TypeScript");
    expect(result.missingSkills.length).toBe(0);
  });

  it("should penalize score heavily if location is an onsite mismatch", async () => {
    const job = new JobPost();
    job.platform = "indeed";
    job.platformJobId = "onsite_202";
    job.title = "Senior Backend Engineer";
    job.companyName = "OnsiteCorp";
    job.location = "New York City (On-Site)"; // Not in Bangalore/Remote and is On-Site
    job.description = "Required 5 years experience with Node.js, TypeScript, and MongoDB.";

    const result = await MatchingEngineService.calculateMatch(mockProfile, job);

    expect(result.isLocationFit).toBe(false);
    // Score should be heavily penalized (below 70 threshold)
    expect(result.score).toBeLessThan(70);
  });

  it("should penalize score and flag experience misfit if required experience is higher than total experience", async () => {
    const job = new JobPost();
    job.platform = "naukri";
    job.platformJobId = "senior_303";
    job.title = "Senior Backend Engineer";
    job.companyName = "ScaleCorp";
    job.location = "Remote";
    job.description = "Looking for a seasoned architect with 8 years of experience in Node.js and TypeScript.";

    const result = await MatchingEngineService.calculateMatch(mockProfile, job);

    expect(result.isExperienceFit).toBe(false);
    // Score should be reduced due to experience gap (8 years required vs 5 years total)
    expect(result.score).toBeLessThan(90);
  });

  it("should calculate correct skills intersection metrics for partial matching", async () => {
    const job = new JobPost();
    job.platform = "linkedin";
    job.platformJobId = "partial_404";
    job.title = "Node.js Developer";
    job.companyName = "NodeShop";
    job.location = "Remote";
    // Only has Node.js and Express in the description
    job.description = "Seeking a Node.js Developer. Requires strong Express skills. We use Postgres.";

    const result = await MatchingEngineService.calculateMatch(mockProfile, job);

    expect(result.matchedSkills).toContain("Node.js");
    expect(result.matchedSkills).toContain("Express");
    expect(result.missingSkills).toContain("TypeScript");
    expect(result.missingSkills).toContain("MongoDB");
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(90);
  });
});
