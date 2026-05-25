import {
  JsonController,
  Get,
  Post,
  QueryParam,
  UseBefore,
  HttpCode,
  Res
} from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { JobPost } from "../../entity/JobPost";
import { JobListenerService } from "../../services/jobListener.service";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { StatusCodes } from "http-status-codes";
import handleErrorResponse from "../../utils/commonFunction";

@JsonController("/job-posts")
@UseBefore(AuthMiddleware)
export class JobPostController {

  @Get("/")
  @HttpCode(StatusCodes.OK)
  async listJobs(
    @QueryParam("platform") platform: string,
    @QueryParam("minScore") minScore: number,
    @QueryParam("company") company: string,
    @Res() res: any
  ) {
    try {
      const jobRepo = AppDataSource.getMongoRepository(JobPost);

      const filter: any = {};
      if (platform) {
        filter.platform = platform;
      }
      if (minScore) {
        filter.matchScore = { $gte: Number(minScore) };
      }
      if (company) {
        filter.companyName = { $regex: company, $options: "i" };
      }

      // MongoDB custom find query
      const jobs = await jobRepo.find({
        where: filter,
        order: { matchScore: "DESC", scrapedAt: "DESC" }
      });

      return res.status(StatusCodes.OK).json({
        success: true,
        count: jobs.length,
        data: jobs
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }

  @Post("/scrape")
  @HttpCode(StatusCodes.OK)
  async runScraper(
    @QueryParam("simulate") simulate: string,
    @Res() res: any
  ) {
    try {
      const isSimulate = simulate !== "false"; // Default to true
      const result = await JobListenerService.runScraper(isSimulate);

      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Scraping cycle executed successfully.",
        scrapedCount: result.scraped,
        matchedCount: result.matched
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }

  @Get("/stats")
  @HttpCode(StatusCodes.OK)
  async getStats(@Res() res: any) {
    try {
      const jobRepo = AppDataSource.getMongoRepository(JobPost);
      const allJobs = await jobRepo.find();

      const totalScraped = allJobs.length;
      const matchedJobs = allJobs.filter(j => (j.matchScore || 0) >= 70);
      const avgScore = totalScraped > 0
        ? Math.round(allJobs.reduce((sum, j) => sum + (j.matchScore || 0), 0) / totalScraped)
        : 0;

      return res.status(StatusCodes.OK).json({
        success: true,
        data: {
          totalScraped,
          totalMatched: matchedJobs.length,
          averageMatchScore: avgScore
        }
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }
}
