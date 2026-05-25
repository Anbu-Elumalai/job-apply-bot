import {
  JsonController,
  Get,
  Put,
  Post,
  Param,
  Body,
  QueryParam,
  UseBefore,
  HttpCode,
  Res,
  NotFoundError
} from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { JobApplication } from "../../entity/JobApplication";
import { JobPost } from "../../entity/JobPost";
import { UserProfile } from "../../entity/UserProfile";
import { SystemTelemetry } from "../../entity/SystemTelemetry";
import { ApplierService } from "../../services/applier.service";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { UpdateApplicationStatusDto, CreateManualApplicationDto } from "../../dto/admin/JobApplication.dto";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import handleErrorResponse from "../../utils/commonFunction";

@JsonController("/job-applications")
@UseBefore(AuthMiddleware)
export class JobApplicationController {

  @Get("/")
  @HttpCode(StatusCodes.OK)
  async listApplications(
    @QueryParam("status") status: string,
    @Res() res: any
  ) {
    try {
      const appRepo = AppDataSource.getMongoRepository(JobApplication);
      const jobRepo = AppDataSource.getMongoRepository(JobPost);

      const filter: any = {};
      if (status) {
        filter.status = status;
      }

      const applications = await appRepo.find({
        where: filter,
        order: { updatedAt: "DESC" }
      });

      // Join job details manually since standard MongoDB TypeORM relations are sparse
      const populated = [];
      for (const app of applications) {
        const job = await jobRepo.findOne({
          where: { _id: app.jobId }
        });
        populated.push({
          ...app,
          jobDetails: job || null
        });
      }

      return res.status(StatusCodes.OK).json({
        success: true,
        count: populated.length,
        data: populated
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }

  @Put("/:id/status")
  @HttpCode(StatusCodes.OK)
  async updateStatus(
    @Param("id") id: string,
    @Body() body: UpdateApplicationStatusDto,
    @Res() res: any
  ) {
    try {
      const appRepo = AppDataSource.getMongoRepository(JobApplication);
      const app = await appRepo.findOne({
        where: { _id: new ObjectId(id) }
      });

      if (!app) {
        throw new NotFoundError("Application not found");
      }

      const oldStatus = app.status;
      app.status = body.status;
      app.auditLogs.push({
        timestamp: new Date(),
        status: body.status,
        message: `Status manually updated from ${oldStatus} to ${body.status} via CRM dashboard.`
      });

      if (body.status === "APPLIED") {
        app.appliedAt = new Date();
      }

      await appRepo.save(app);

      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Status updated successfully",
        data: app
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }

  @Post("/:id/apply")
  @HttpCode(StatusCodes.OK)
  async triggerAutoApply(
    @Param("id") id: string,
    @Res() res: any
  ) {
    try {
      // Async trigger to background task so endpoint returns fast and handles telemetry asynchronously
      // Let's execute synchronously for instant feedback in API tests, or call asynchronously
      ApplierService.executeApplication(id).catch(err => {
        console.error(`Async automation error: ${err.message}`);
      });

      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Platform application auto-submission job triggered in background."
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }

  @Post("/manual")
  @HttpCode(StatusCodes.CREATED)
  async createManualApplication(
    @Body() body: CreateManualApplicationDto,
    @Res() res: any
  ) {
    try {
      const jobRepo = AppDataSource.getMongoRepository(JobPost);
      const profileRepo = AppDataSource.getMongoRepository(UserProfile);
      const appRepo = AppDataSource.getMongoRepository(JobApplication);

      const profile = await profileRepo.findOne({});
      if (!profile) {
        throw new NotFoundError("UserProfile must be configured before logging manually.");
      }

      // 1. Save manual job posting cache
      let job = await jobRepo.findOne({
        where: { platform: body.platform, platformJobId: body.platformJobId }
      });

      if (!job) {
        job = jobRepo.create({
          platform: body.platform,
          platformJobId: body.platformJobId,
          title: body.title,
          companyName: body.companyName,
          location: body.location,
          salaryText: body.salaryText,
          jobUrl: body.jobUrl,
          description: body.description,
          matchScore: 100, // Explicitly manually mapped
          isProcessed: true
        });
        job = await jobRepo.save(job);
      }

      // 2. Log active application pipeline record
      const application = appRepo.create({
        jobId: job.id,
        userProfileId: profile.id,
        status: "APPLIED",
        appliedAt: new Date(),
        auditLogs: [
          {
            timestamp: new Date(),
            status: "APPLIED",
            message: "Manually recorded application under CRM tracker."
          }
        ]
      });

      await appRepo.save(application);

      return res.status(StatusCodes.CREATED).json({
        success: true,
        message: "Manually submitted application successfully logged under pipeline.",
        data: application
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }

  @Get("/dashboard")
  @HttpCode(StatusCodes.OK)
  async getDashboardData(@Res() res: any) {
    try {
      const appRepo = AppDataSource.getMongoRepository(JobApplication);
      const apps = await appRepo.find();

      // Aggregate stage distribution
      const pipelineDistribution = {
        MATCHED: 0,
        APPLYING: 0,
        APPLIED: 0,
        MANUAL_REVIEW: 0,
        INTERVIEW_INVITED: 0,
        REJECTED: 0,
        OFFERED: 0
      };

      apps.forEach(app => {
        if (pipelineDistribution[app.status] !== undefined) {
          pipelineDistribution[app.status]++;
        }
      });

      // Calculate automation statistics
      const totalAutomations = apps.filter(a =>
        a.auditLogs.some(log => log.message.toLowerCase().includes("automation"))
      ).length;

      const successfulAutomations = apps.filter(a =>
        a.status === "APPLIED" && a.auditLogs.some(log => log.message.toLowerCase().includes("successfully submitted"))
      ).length;

      const successRate = totalAutomations > 0
        ? Math.round((successfulAutomations / totalAutomations) * 100)
        : 0;

      return res.status(StatusCodes.OK).json({
        success: true,
        data: {
          pipelineStats: pipelineDistribution,
          automationPerformance: {
            totalAttempts: totalAutomations,
            successfulRuns: successfulAutomations,
            successPercentage: successRate
          }
        }
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }

  @Get("/telemetry")
  @HttpCode(StatusCodes.OK)
  async getTelemetry(@Res() res: any) {
    try {
      const telemetryRepo = AppDataSource.getMongoRepository(SystemTelemetry);
      const logs = await telemetryRepo.find({
        order: { timestamp: "DESC" },
        take: 30
      });

      return res.status(StatusCodes.OK).json({
        success: true,
        data: logs
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }
}
